#!/usr/bin/env python3
"""
OAuth Token (Key) 自动刷新和热读取管理模块

职责：
- 管理 OAuth accessToken 和 refreshToken（统称为 key）
- 自动刷新临期的 key
- 热读取外部更新的 key
- 线程安全的内存缓存

用法：
    from key_manager import KeyManager, OAuthConfig, refresh_loop, file_watcher_loop

    # 初始化
    key_manager = KeyManager()
    oauth_config = OAuthConfig()

    # 加载初始 key
    try:
        initial_key = key_manager.load_from_file()
        key_manager.set_if_newer(initial_key)
    except Exception as e:
        print(f"Failed to load initial key: {e}")

    # 启动后台线程
    threading.Thread(target=refresh_loop, args=(key_manager, oauth_config), daemon=True).start()
    threading.Thread(target=file_watcher_loop, args=(key_manager,), daemon=True).start()

    # 使用
    key = key_manager.get()
    access_token = key.get("accessToken")
"""

import json
import os
import sys
import time
import random
import threading
import logging
import subprocess
import shutil
from typing import Optional, Dict, Any

# 尝试导入 requests
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error
    import urllib.parse


class RefreshError(Exception):
    """OAuth Key 刷新失败异常"""
    pass


class OAuthConfig:
    """
    OAuth 配置

    从实际 shell 脚本确认的参数：
    - 刷新接口: https://copilot.code.woa.com/api/v2/auth/oauth_token/refresh
    - client_id: 从 claude-internal 二进制文件中动态提取（32 位十六进制）

    支持环境变量覆盖：
    - OAUTH_REFRESH_URL: 刷新接口 URL
    - CLAUDE_INTERNAL_BIN: claude-internal 二进制路径
    - OAUTH_CLIENT_ID: 直接指定 client_id（跳过提取）
    """

    # 刷新接口 URL（已确认）
    DEFAULT_REFRESH_URL = "https://copilot.code.woa.com/api/v2/auth/oauth_token/refresh"

    def __init__(self, refresh_url: str = None, claude_internal_bin: str = None):
        """
        初始化 OAuth 配置

        Args:
            refresh_url: 刷新接口 URL，默认从环境变量或 DEFAULT_REFRESH_URL
            claude_internal_bin: claude-internal 二进制路径，默认使用 which 查找
        """
        # 刷新接口 URL（优先级：参数 > 环境变量 > 默认值）
        self.refresh_url = (
            refresh_url
            or os.environ.get("OAUTH_REFRESH_URL")
            or self.DEFAULT_REFRESH_URL
        )

        # claude-internal 路径（优先级：参数 > 环境变量 > which 查找 > 常见路径）
        if claude_internal_bin:
            self.claude_internal_bin = claude_internal_bin
        elif os.environ.get("CLAUDE_INTERNAL_BIN"):
            self.claude_internal_bin = os.environ.get("CLAUDE_INTERNAL_BIN")
        else:
            # 使用 which 查找（类似 shell 的 $(which claude-internal)）
            self.claude_internal_bin = shutil.which("claude-internal")

            # 如果 which 找不到，尝试常见路径
            if not self.claude_internal_bin:
                common_paths = [
                    "/usr/local/bin/claude-internal",
                    "/usr/bin/claude-internal",
                    os.path.expanduser("~/bin/claude-internal"),
                    os.path.expanduser("~/.local/bin/claude-internal"),
                ]
                for path in common_paths:
                    if os.path.exists(path):
                        self.claude_internal_bin = path
                        logging.debug(f"[OAuthConfig] Found claude-internal at: {path}")
                        break

        self._client_id_cache = None

    def get_client_id(self) -> str:
        """
        从 claude-internal 二进制文件中提取 client_id

        提取命令（基于实际 shell 脚本）：
        grep -o 'clientId:"[0-9a-f]{32}"' "$(which claude-internal)" | head -n 1

        Returns:
            32 位十六进制 client_id

        Raises:
            RefreshError: 无法提取 client_id
        """
        # 使用缓存
        if self._client_id_cache:
            return self._client_id_cache

        # 优先使用环境变量（最高优先级）
        env_client_id = os.environ.get("OAUTH_CLIENT_ID")
        if env_client_id:
            self._client_id_cache = env_client_id
            logging.info(f"[OAuthConfig] Using client_id from env: {env_client_id[:8]}***")
            return env_client_id

        # 尝试从二进制文件中提取
        if self.claude_internal_bin:
            try:
                # 检查二进制文件是否存在
                if not os.path.exists(self.claude_internal_bin):
                    logging.warning(f"[OAuthConfig] claude-internal not found at: {self.claude_internal_bin}")
                else:
                    # 尝试从二进制文件中提取
                    result = subprocess.run(
                        ["grep", "-o", r'clientId:"[0-9a-f]\{32\}"', self.claude_internal_bin],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )

                    if result.returncode == 0 and result.stdout:
                        # 提取第一个匹配
                        match = result.stdout.split('\n')[0].strip()
                        if match:
                            # 解析 clientId:"xxx" -> xxx
                            # 格式：clientId:"a1b2c3d4..."
                            client_id = match.split(':"')[1].rstrip('"').strip()

                            if len(client_id) == 32 and all(c in '0123456789abcdef' for c in client_id):
                                self._client_id_cache = client_id
                                logging.info(f"[OAuthConfig] Extracted client_id from binary: {client_id[:8]}***")
                                logging.info(f"[OAuthConfig] Binary path: {self.claude_internal_bin}")
                                return client_id

            except subprocess.TimeoutExpired:
                logging.warning("[OAuthConfig] grep command timeout")
            except Exception as e:
                logging.warning(f"[OAuthConfig] Failed to extract client_id from binary: {e}")

        # 最终降级：使用默认值（可能不准确）
        client_id = "claude-code-internal"
        logging.warning(f"[OAuthConfig] claude-internal binary not found, using fallback client_id: {client_id}")
        logging.warning(f"[OAuthConfig] Please set OAUTH_CLIENT_ID env var or ensure claude-internal is in PATH")
        return client_id


class KeyManager:
    """
    OAuth Key 管理器 - 自动刷新和热读取

    职责：
    - 内存缓存当前 key（accessToken, refreshToken, expiresAt）
    - 线程安全的读写接口
    - 临期判定：expiresAt <= now + buffer_ms
    - 自动刷新和文件持久化

    支持环境变量覆盖：
    - CLAUDE_INTERNAL_CONFIG: config.json 路径
    - KEY_REFRESH_BUFFER_MS: 临期缓冲时间（毫秒）
    """

    # 默认配置路径
    DEFAULT_CONFIG_PATH = "~/.claude-internal/config.json"
    # 默认临期缓冲时间（5分钟）
    DEFAULT_BUFFER_MS = 5 * 60 * 1000

    def __init__(self, config_path: str = None, buffer_ms: int = None):
        """
        初始化 Key 管理器

        Args:
            config_path: OAuth key 配置文件路径，默认从环境变量或 ~/.claude-internal/config.json
            buffer_ms: 临期缓冲时间（毫秒），默认从环境变量或 5 分钟
        """
        # config.json 路径（优先级：参数 > 环境变量 > 默认值）
        self.config_path = (
            config_path
            or os.environ.get("CLAUDE_INTERNAL_CONFIG")
            or os.path.expanduser(self.DEFAULT_CONFIG_PATH)
        )

        # 临期缓冲时间（优先级：参数 > 环境变量 > 默认值）
        if buffer_ms is not None:
            self.buffer_ms = buffer_ms
        elif os.environ.get("KEY_REFRESH_BUFFER_MS"):
            self.buffer_ms = int(os.environ.get("KEY_REFRESH_BUFFER_MS"))
        else:
            self.buffer_ms = self.DEFAULT_BUFFER_MS

        self._lock = threading.RLock()  # 递归锁（线程安全）
        self._key: Optional[Dict[str, Any]] = None  # 内存缓存
        self._refreshing = False  # 刷新中标记（防并发）

    def load_from_file(self) -> Dict[str, Any]:
        """
        从文件加载 OAuth key，带字段校验

        Returns:
            key 字典：{accessToken, refreshToken, expiresAt}

        Raises:
            FileNotFoundError: 文件不存在
            ValueError: 缺少必需字段或格式错误
        """
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, "r", encoding="utf-8") as f:
            key = json.load(f)

        # 字段校验
        required_fields = ["accessToken", "refreshToken", "expiresAt"]
        for field in required_fields:
            if not key.get(field):
                raise ValueError(f"Missing required field: {field}")

        # 确保 expiresAt 是整数（毫秒时间戳）
        key["expiresAt"] = int(key["expiresAt"])

        return key

    def save_to_file(self, key: Dict[str, Any]):
        """
        原子性保存 OAuth key 到文件

        使用临时文件 + os.replace() 保证原子性，避免半写状态

        Args:
            key: OAuth key 字典
        """
        # 确保目录存在
        config_dir = os.path.dirname(self.config_path)
        if config_dir:
            os.makedirs(config_dir, exist_ok=True)

        # 使用临时文件 + rename 保证原子性
        tmp_path = self.config_path + ".tmp"

        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(key, f, indent=2, ensure_ascii=False)

        # 原子性替换（操作系统保证）
        os.replace(tmp_path, self.config_path)

        # 设置文件权限为 0600 (仅所有者可读写)
        try:
            os.chmod(self.config_path, 0o600)
        except Exception:
            # Windows 不支持，忽略
            pass

    def get(self) -> Optional[Dict[str, Any]]:
        """
        获取当前有效的 OAuth key（线程安全）

        Returns:
            key 字典副本，或 None（如果未加载）
        """
        with self._lock:
            if self._key is None:
                return None
            return dict(self._key)  # 返回副本，防止外部修改

    def set_if_newer(self, key: Dict[str, Any]) -> bool:
        """
        仅当新 key 更新时才设置（热读策略）

        比较 expiresAt，选择过期时间更远的 key
        特殊情况：expiresAt = 0 表示无过期时间，视为"永不过期"

        Args:
            key: 新的 OAuth key

        Returns:
            True 如果已更新，False 如果未更新
        """
        with self._lock:
            if self._key is None:
                self._key = key
                expires_at = key.get('expiresAt')
                if expires_at == 0:
                    logging.info("[KeyManager] Key initialized (no expiration, managed by IOA)")
                else:
                    logging.info(f"[KeyManager] Key initialized, expires at: {expires_at}")
                return True

            new_expires = key.get("expiresAt", 0)
            old_expires = self._key.get("expiresAt", 0)

            # expiresAt = 0 表示无过期时间，视为最优先
            # 如果当前 key 已经是无过期时间的，不替换
            if old_expires == 0:
                return False

            # 如果新 key 是无过期时间的，或者过期时间更远，则更新
            if new_expires == 0 or new_expires > old_expires:
                self._key = key
                if new_expires == 0:
                    logging.info(f"[KeyManager] Key updated to no-expiration mode (was: {old_expires})")
                else:
                    logging.info(f"[KeyManager] Key updated, old expires: {old_expires}, new expires: {new_expires}")
                return True

            return False

    def needs_refresh(self, key: Optional[Dict[str, Any]] = None) -> bool:
        """
        判断是否需要刷新

        临期判定：expiresAt <= now + buffer_ms
        特殊情况：expiresAt = 0 表示无过期时间（如 ~/.git-credentials），不需要刷新

        Args:
            key: 要检查的 key，None 则使用内存中的 key

        Returns:
            True 如果需要刷新
        """
        if key is None:
            key = self.get()

        if key is None:
            return True

        expires_at = key.get("expiresAt", 0)

        # expiresAt = 0 表示无过期时间（如从 ~/.git-credentials 读取），不需要刷新
        if expires_at == 0:
            return False

        now_ms = int(time.time() * 1000)

        # 临期判定：expiresAt <= now + buffer
        return expires_at <= (now_ms + self.buffer_ms)

    def refresh(self, config: OAuthConfig) -> bool:
        """
        执行刷新（保证单次执行，线程安全）

        使用双重检查 + 刷新标记位防止并发刷新

        Args:
            config: OAuth 配置

        Returns:
            True 如果刷新成功，False 如果无需刷新或失败
        """
        with self._lock:
            # 检查是否已有线程在刷新
            if self._refreshing:
                logging.debug("[KeyManager] Refresh already in progress, skipping")
                return False

            # 再次检查是否真的需要刷新（双重检查）
            if not self.needs_refresh():
                logging.debug("[KeyManager] Key still valid, no refresh needed")
                return False

            self._refreshing = True

        try:
            # 释放锁后执行 HTTP 请求（避免长时间持锁）
            current_key = self.get()
            if not current_key:
                logging.warning("[KeyManager] No key to refresh")
                return False

            logging.info("[KeyManager] Key needs refresh, refreshing...")
            new_key = refresh_key_via_http(current_key, config)

            # 保存到文件
            self.save_to_file(new_key)

            # 更新内存
            with self._lock:
                self._key = new_key

            logging.info(f"[KeyManager] Key refreshed successfully, new expires at: {new_key.get('expiresAt')}")
            return True

        except RefreshError as e:
            logging.error(f"[KeyManager] Refresh failed: {e}")
            # 如果是 401 错误，清空内存 key
            if "401" in str(e):
                logging.error("[KeyManager] Auth failed (401), clearing key")
                with self._lock:
                    self._key = None
            return False

        except Exception as e:
            logging.error(f"[KeyManager] Unexpected error during refresh: {e}")
            import traceback
            traceback.print_exc()
            return False

        finally:
            with self._lock:
                self._refreshing = False


def refresh_key_via_http(
    key: Dict[str, Any],
    config: OAuthConfig,
    timeout: int = 30
) -> Dict[str, Any]:
    """
    调用 OAuth 刷新接口

    基于实际 shell 脚本的实现：
    curl -X POST 'https://copilot.code.woa.com/api/v2/auth/oauth_token/refresh' \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      -H 'OAUTH-TOKEN: <accessToken>' \
      --data-urlencode 'refresh_token=<refreshToken>' \
      --data-urlencode 'client_id=<clientId>' \
      --data-urlencode 'grant_type=refresh_token'

    响应格式：
    {
      "access_token": "...",
      "refresh_token": "...",  # 可能为空，需要使用旧的
      "expires_in": 3600       # 秒数
    }

    Args:
        key: 当前 OAuth key (包含 refreshToken)
        config: OAuth 配置
        timeout: 请求超时时间（秒）

    Returns:
        新 key: {accessToken, refreshToken, expiresAt}

    Raises:
        RefreshError: 刷新失败
    """
    refresh_token_val = key.get("refreshToken")
    access_token = key.get("accessToken")

    if not refresh_token_val:
        raise RefreshError("Missing refreshToken")

    # 获取 client_id
    try:
        client_id = config.get_client_id()
    except Exception as e:
        raise RefreshError(f"Failed to get client_id: {e}")

    # 构建请求
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "OAUTH-TOKEN": access_token,
    }

    # 使用 application/x-www-form-urlencoded 格式
    if HAS_REQUESTS:
        import urllib.parse
        body = urllib.parse.urlencode({
            "refresh_token": refresh_token_val,
            "client_id": client_id,
            "grant_type": "refresh_token",
        })
    else:
        import urllib.parse
        body = urllib.parse.urlencode({
            "refresh_token": refresh_token_val,
            "client_id": client_id,
            "grant_type": "refresh_token",
        }).encode("utf-8")

    try:
        if HAS_REQUESTS:
            response = requests.post(
                config.refresh_url,
                headers=headers,
                data=body,
                timeout=timeout
            )

            # 检查 HTTP 错误
            if response.status_code == 401:
                raise RefreshError(f"401 Unauthorized: {response.text}")
            elif response.status_code >= 400:
                raise RefreshError(f"HTTP {response.status_code}: {response.text}")

            response.raise_for_status()
            data = response.json()

        else:
            # 使用 urllib（无 requests 时降级）
            req = urllib.request.Request(
                config.refresh_url,
                data=body,
                headers=headers,
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))

        # 提取返回字段
        new_access = data.get("access_token")
        new_refresh = data.get("refresh_token")  # 可能为空
        expires_in = data.get("expires_in")  # 秒数

        if not new_access or not expires_in:
            raise RefreshError(f"Invalid response: missing access_token or expires_in: {data}")

        # 如果响应中 refresh_token 为空，则继续使用旧的（重要！）
        if not new_refresh:
            new_refresh = refresh_token_val
            logging.debug("[RefreshKey] Response has no refresh_token, using old one")

        # 计算 expiresAt（毫秒时间戳）
        # 与 shell 脚本一致：(now*1000|floor) + (expires_in*1000)
        now_ms = int(time.time() * 1000)
        expires_at = now_ms + int(expires_in) * 1000

        return {
            "accessToken": new_access,
            "refreshToken": new_refresh,
            "expiresAt": expires_at,
        }

    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        if hasattr(e, 'code') and e.code == 401:
            raise RefreshError(f"401 Unauthorized: {e}")
        raise RefreshError(f"HTTP request failed: {e}")
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        raise RefreshError(f"Invalid response format: {e}")
    except Exception as e:
        raise RefreshError(f"Unexpected error: {e}")


def refresh_loop(manager: KeyManager, config: OAuthConfig):
    """
    后台刷新循环

    策略：
    - 计算刷新时间：refreshAt = expiresAt - bufferMs + jitter
    - 失败时指数退避重试（最多 5 次）
    - 达到最大重试次数后清空 key，等待重新 OAuth

    Args:
        manager: KeyManager 实例
        config: OAuth 配置
    """
    retry_count = 0
    max_retries = 5

    logging.info("[RefreshLoop] Started")

    while True:
        try:
            key = manager.get()

            if key and manager.needs_refresh(key):
                success = manager.refresh(config)

                if success:
                    retry_count = 0  # 成功后重置重试计数
                else:
                    # 刷新失败（可能是并发或网络错误）
                    retry_count += 1
                    logging.warning(f"[RefreshLoop] Refresh failed, retry count: {retry_count}/{max_retries}")

                    if retry_count > max_retries:
                        # 达到最大重试次数，清空 key
                        logging.error("[RefreshLoop] Max retries exceeded, clearing key")
                        with manager._lock:
                            manager._key = None
                        retry_count = 0

            # 计算下次刷新时间
            key = manager.get()
            if key:
                expires_at = key.get("expiresAt", 0)
                now_ms = int(time.time() * 1000)
                refresh_at = expires_at - manager.buffer_ms

                # 添加 jitter（±30秒）防止多实例同时刷新
                jitter = random.randint(-30000, 30000)
                sleep_ms = max(1000, refresh_at - now_ms + jitter)
            else:
                # 无 key，每分钟检查一次
                sleep_ms = 60000

            # 指数退避
            if retry_count > 0:
                backoff = min(60000, 1000 * (2 ** retry_count))
                sleep_ms = min(sleep_ms, backoff)

            time.sleep(sleep_ms / 1000.0)

        except Exception as e:
            logging.error(f"[RefreshLoop] Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(5)  # 异常后短暂休眠


def file_watcher_loop(manager: KeyManager, poll_interval: int = None):
    """
    文件监控循环（热读取外部更新）

    策略：
    - 定期轮询 config.json 的 mtime
    - 文件变化时读取并热更新内存
    - 仅当新 key 的 expiresAt 更远时才替换
    - 文件损坏/解析失败时保留内存 key，不中断服务

    Args:
        manager: KeyManager 实例
        poll_interval: 轮询间隔（秒），默认从环境变量或 5 秒

    支持环境变量：
        FILE_WATCHER_INTERVAL: 轮询间隔（秒）
    """
    # 轮询间隔（优先级：参数 > 环境变量 > 默认值 5 秒）
    if poll_interval is None:
        poll_interval = int(os.environ.get("FILE_WATCHER_INTERVAL", "5"))

    last_mtime = None

    logging.info(f"[FileWatcher] Started (poll interval: {poll_interval}s)")

    while True:
        try:
            if os.path.exists(manager.config_path):
                mtime = os.path.getmtime(manager.config_path)

                # 首次运行或文件有变化
                if last_mtime is None:
                    # 首次运行，仅记录 mtime，不触发加载（避免重复）
                    last_mtime = mtime
                elif mtime != last_mtime:
                    last_mtime = mtime
                    logging.info("[FileWatcher] Config file changed, reloading...")

                    try:
                        key = manager.load_from_file()

                        # 获取当前内存中的 key 以便比较
                        current_key = manager.get()

                        # 显示比较信息
                        if current_key:
                            file_expires = key.get("expiresAt", 0)
                            memory_expires = current_key.get("expiresAt", 0)
                            logging.info(f"[FileWatcher] Comparing keys - File expiresAt: {file_expires}, Memory expiresAt: {memory_expires}")

                        updated = manager.set_if_newer(key)

                        if updated:
                            logging.info("[FileWatcher] Key updated from file (file key is newer)")
                        else:
                            logging.info("[FileWatcher] Key not updated (file key is older or same, keeping memory key)")

                    except Exception as e:
                        logging.warning(f"[FileWatcher] Failed to reload key: {e}, keeping old one")

        except Exception as e:
            logging.error(f"[FileWatcher] Unexpected error: {e}")

        time.sleep(poll_interval)


if __name__ == "__main__":
    # 简单测试
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

    print("=== KeyManager 测试 ===")

    # 测试 OAuthConfig
    print("\n1. 测试 OAuthConfig")
    config = OAuthConfig()
    print(f"  Refresh URL: {config.refresh_url}")

    try:
        client_id = config.get_client_id()
        print(f"  Client ID: {client_id[:8]}***")
    except Exception as e:
        print(f"  Client ID 提取失败: {e}")

    # 测试 KeyManager
    print("\n2. 测试 KeyManager")
    manager = KeyManager()
    print(f"  Config path: {manager.config_path}")

    try:
        key = manager.load_from_file()
        print(f"  Loaded key, expires at: {key.get('expiresAt')}")
        manager.set_if_newer(key)

        needs_refresh = manager.needs_refresh()
        print(f"  Needs refresh: {needs_refresh}")

    except FileNotFoundError:
        print("  Config file not found")
    except Exception as e:
        print(f"  Error: {e}")

    print("\n测试完成")
