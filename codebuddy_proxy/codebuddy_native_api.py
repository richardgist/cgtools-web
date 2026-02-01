#!/usr/bin/env python3
"""
CodeBuddy Native API 调用封装库

使用 Anthropic 原生 Messages API 格式，无需协议转换。

认证方式 (按优先级):
    1. 环境变量 CODEBUDDY_OAUTH_TOKEN
    2. ~/.git-credentials (IOA 登录后自动生成)
    3. ~/.claude-internal/config.json (claude-internal 认证后生成)

用法:
    # 作为命令行工具
    python codebuddy_native_api.py "你的问题"
    python codebuddy_native_api.py -m claude-4.5-sonnet "解释递归"
    python codebuddy_native_api.py --stream "写一首诗"

    # 作为库导入
    from codebuddy_native_api import CodeBuddyNativeClient

    client = CodeBuddyNativeClient()

    # 非流式调用
    response = client.messages_create(
        model="claude-4.5-sonnet",
        max_tokens=1024,
        messages=[{"role": "user", "content": "你好"}]
    )
    print(response["content"][0]["text"])

    # 流式调用
    for event in client.messages_create_stream(
        model="claude-4.5-sonnet",
        max_tokens=1024,
        messages=[{"role": "user", "content": "写一首诗"}]
    ):
        if event.get("type") == "content_block_delta":
            print(event["delta"].get("text", ""), end="", flush=True)
"""

import json
import os
import sys
import argparse
from typing import Optional, Iterator, List, Dict, Any, Generator
from urllib.parse import urlparse

# 尝试导入 requests
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error


class AuthenticationError(Exception):
    """OAuth Token 认证失败异常"""
    pass


class CodeBuddyNativeClient:
    """CodeBuddy Native API 客户端 (Anthropic 原生格式)"""

    # API 端点 - 使用 codebuddy-code 的 /v1/messages 端点
    BASE_URL = "https://copilot.code.woa.com/server/chat/codebuddy-gateway/codebuddy-code"
    MESSAGES_ENDPOINT = f"{BASE_URL}/v1/messages"

    # 默认配置
    DEFAULT_MODEL = "claude-4.5-sonnet"
    DEFAULT_MAX_TOKENS = 8192

    # 支持的模型
    SUPPORTED_MODELS = [
        {"id": "claude-4.5-sonnet", "name": "Claude 4.5 Sonnet", "description": "Claude 顶级模型"},
        {"id": "claude-4.5-opus", "name": "Claude 4.5 Opus", "description": "Claude 最强模型"},
    ]

    # 模型别名映射
    MODEL_ALIASES = {
        # Sonnet 别名
        "sonnet": "claude-4.5-sonnet",
        "claude-sonnet": "claude-4.5-sonnet",
        "claude-3-sonnet": "claude-4.5-sonnet",
        "claude-3-5-sonnet": "claude-4.5-sonnet",
        "claude-3-5-sonnet-20240620": "claude-4.5-sonnet",
        "claude-3-5-sonnet-20241022": "claude-4.5-sonnet",
        "claude-3-5-sonnet-latest": "claude-4.5-sonnet",
        "claude-3-7-sonnet": "claude-4.5-sonnet",
        "claude-3-7-sonnet-20250219": "claude-4.5-sonnet",
        "claude-3-7-sonnet-latest": "claude-4.5-sonnet",
        "claude-sonnet-4-20250514": "claude-4.5-sonnet",
        # Opus 别名
        "opus": "claude-4.5-opus",
        "claude-opus": "claude-4.5-opus",
        "claude-3-opus": "claude-4.5-opus",
        "claude-3-opus-20240229": "claude-4.5-opus",
        "claude-3-opus-latest": "claude-4.5-opus",
        "claude-opus-4-20250514": "claude-4.5-opus",
        # Haiku 映射到 Sonnet (不支持 Haiku)
        "haiku": "claude-4.5-sonnet",
        "claude-haiku": "claude-4.5-sonnet",
        "claude-3-haiku": "claude-4.5-sonnet",
        "claude-3-5-haiku": "claude-4.5-sonnet",
        "claude-3-5-haiku-20241022": "claude-4.5-sonnet",
        "claude-3-5-haiku-latest": "claude-4.5-sonnet",
    }

    def __init__(
        self,
        oauth_token: Optional[str] = None,
        key_manager: Optional['KeyManager'] = None,
        model: Optional[str] = None,
    ):
        """
        初始化客户端

        Args:
            oauth_token: OAuth Token (可选，默认从 ~/.git-credentials 或环境变量读取)
            key_manager: KeyManager 实例（推荐，支持自动刷新和热读取）
            model: 默认模型
        """
        self.key_manager = key_manager

        if oauth_token:
            # 静态 token 模式（向后兼容）
            self.oauth_token = oauth_token
        elif key_manager:
            # 动态 key 模式（推荐）
            self.oauth_token = None  # 标记为动态模式
        else:
            # 自动读取模式（原有逻辑）
            self.oauth_token = self._get_oauth_token()

            if not self.oauth_token:
                raise AuthenticationError(
                    "未找到 OAuth Token。请确保已通过 IOA 登录 (检查 ~/.git-credentials)，"
                    "或设置环境变量: export CODEBUDDY_OAUTH_TOKEN='your-token'"
                )

        self.default_model = model or self.DEFAULT_MODEL

    def _get_oauth_token(self) -> Optional[str]:
        """获取 OAuth Token (仅用于独立脚本模式)
        
        注意: 当通过 anthropic_server.py 使用时，此方法不会被调用。
        anthropic_server.py 使用 key_manager 模式（__init__ 传入 key_manager 参数），
        token 由 KeyManager 统一管理，通过 _get_current_token() 动态获取。
        
        此方法仅在以下场景被调用:
            - 直接运行 python codebuddy_native_api.py "你好"
            - 代码中直接 CodeBuddyNativeClient() 不传任何参数
        
        优先级:
            1. 环境变量 CODEBUDDY_OAUTH_TOKEN
            2. ~/.git-credentials (IOA 登录后自动生成)
            3. ~/.claude-internal/config.json (claude-internal 认证后生成)
        """
        # 优先从环境变量读取
        token = os.environ.get("CODEBUDDY_OAUTH_TOKEN")
        if token:
            return token.strip()

        # 从 ~/.git-credentials 读取
        git_credentials_path = os.path.join(os.path.expanduser("~"), ".git-credentials")
        if os.path.exists(git_credentials_path):
            try:
                with open(git_credentials_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            parsed = urlparse(line)
                            if parsed.hostname == "git.woa.com" and parsed.username == "oauth2" and parsed.password:
                                return parsed.password
                        except Exception:
                            continue
            except Exception:
                pass

        # 从 ~/.claude-internal/config.json 读取 (claude-internal 认证)
        claude_config_path = os.path.join(os.path.expanduser("~"), ".claude-internal", "config.json")
        if os.path.exists(claude_config_path):
            try:
                with open(claude_config_path, "r") as f:
                    config = json.load(f)
                    access_token = config.get("accessToken")
                    if access_token:
                        # 可选: 检查 token 是否过期
                        expires_at = config.get("expiresAt")
                        if expires_at:
                            import time
                            # expiresAt 是毫秒时间戳
                            if time.time() * 1000 < expires_at:
                                return access_token.strip()
                            # token 已过期，但仍尝试使用（服务端可能会刷新）
                        return access_token.strip()
            except Exception:
                pass

        return None

    def _get_current_token(self) -> str:
        """动态获取当前有效的 OAuth Token"""
        if self.oauth_token:
            # 静态模式
            return self.oauth_token

        if self.key_manager:
            # 动态模式
            key = self.key_manager.get()
            if key:
                return key.get("accessToken", "")

        raise AuthenticationError("No valid token available")

    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            "Content-Type": "application/json",
            "x-api-key": self._get_current_token(),
            "anthropic-version": "2023-06-01",
            "x-request-platform": "codebuddy-code",
            "x-app-name": "codebuddy-code",
            "x-scene-name": "common_chat",
            "x-request-platform-v2": "Claude-Code-Internal",
            "x-app-name-v2": "claude-code-internal",
            "x-claude-code-internal": "true",
        }

    def _normalize_model(self, model: str) -> str:
        """标准化模型名称"""
        model_lower = model.lower()
        return self.MODEL_ALIASES.get(model_lower, model)

    def _extract_response(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        """从响应中提取标准 Anthropic 格式"""
        # 服务端返回格式: {"type": "success", "data": {...}}
        if response_data.get("type") == "success" and "data" in response_data:
            return response_data["data"]
        # 如果已经是标准格式，直接返回
        if "content" in response_data and "role" in response_data:
            return response_data
        return response_data

    def messages_create(
        self,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        max_tokens: int = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        stop_sequences: Optional[List[str]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        创建消息 (非流式)

        Args:
            messages: 消息列表
            model: 模型名称
            max_tokens: 最大 token 数
            system: 系统提示
            temperature: 温度
            top_p: Top-p 采样
            stop_sequences: 停止序列
            tools: 工具定义
            tool_choice: 工具选择

        Returns:
            Anthropic 标准响应格式
        """
        model = self._normalize_model(model or self.default_model)
        max_tokens = max_tokens or self.DEFAULT_MAX_TOKENS

        # 构建请求体
        request_body = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }

        if system:
            request_body["system"] = system
        if temperature is not None:
            request_body["temperature"] = temperature
        if top_p is not None:
            request_body["top_p"] = top_p
        if stop_sequences:
            request_body["stop_sequences"] = stop_sequences
        if tools:
            request_body["tools"] = tools
        if tool_choice:
            request_body["tool_choice"] = tool_choice

        # 添加额外参数
        for key, value in kwargs.items():
            if value is not None and key not in request_body:
                request_body[key] = value

        headers = self._get_headers()

        if HAS_REQUESTS:
            response = requests.post(
                self.MESSAGES_ENDPOINT,
                headers=headers,
                json=request_body,
                timeout=300
            )
            response.raise_for_status()
            return self._extract_response(response.json())
        else:
            req = urllib.request.Request(
                self.MESSAGES_ENDPOINT,
                data=json.dumps(request_body).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=300) as resp:
                return self._extract_response(json.loads(resp.read().decode("utf-8")))

    def messages_create_stream(
        self,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        max_tokens: int = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        stop_sequences: Optional[List[str]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Generator[Dict[str, Any], None, None]:
        """
        创建消息 (流式)

        Args:
            与 messages_create 相同

        Yields:
            SSE 事件字典
        """
        model = self._normalize_model(model or self.default_model)
        max_tokens = max_tokens or self.DEFAULT_MAX_TOKENS

        # 构建请求体
        request_body = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "stream": True,
        }

        if system:
            request_body["system"] = system
        if temperature is not None:
            request_body["temperature"] = temperature
        if top_p is not None:
            request_body["top_p"] = top_p
        if stop_sequences:
            request_body["stop_sequences"] = stop_sequences
        if tools:
            request_body["tools"] = tools
        if tool_choice:
            request_body["tool_choice"] = tool_choice

        for key, value in kwargs.items():
            if value is not None and key not in request_body:
                request_body[key] = value

        headers = self._get_headers()

        if HAS_REQUESTS:
            response = requests.post(
                self.MESSAGES_ENDPOINT,
                headers=headers,
                json=request_body,
                stream=True,
                timeout=300
            )
            response.raise_for_status()

            for line in response.iter_lines():
                if line:
                    line_str = line.decode("utf-8")
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            yield json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
        else:
            req = urllib.request.Request(
                self.MESSAGES_ENDPOINT,
                data=json.dumps(request_body).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=300) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            yield json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

    def chat(
        self,
        message: str,
        model: Optional[str] = None,
        system: Optional[str] = None,
        stream: bool = False,
    ) -> str:
        """
        简单聊天接口

        Args:
            message: 用户消息
            model: 模型名称
            system: 系统提示
            stream: 是否流式输出

        Returns:
            助手回复文本
        """
        messages = [{"role": "user", "content": message}]

        if stream:
            result = []
            for event in self.messages_create_stream(
                messages=messages,
                model=model,
                system=system,
            ):
                if event.get("type") == "content_block_delta":
                    delta = event.get("delta", {})
                    text = delta.get("text", "")
                    result.append(text)
                    print(text, end="", flush=True)
            print()  # 换行
            return "".join(result)
        else:
            response = self.messages_create(
                messages=messages,
                model=model,
                system=system,
            )
            content = response.get("content", [])
            if content and content[0].get("type") == "text":
                return content[0].get("text", "")
            return ""

    def get_models(self) -> List[Dict[str, Any]]:
        """获取支持的模型列表"""
        return self.SUPPORTED_MODELS.copy()


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(
        description="CodeBuddy Native API 客户端 (Anthropic 原生格式)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s "你好"
  %(prog)s -m claude-4.5-opus "解释量子计算"
  %(prog)s --stream "写一首关于编程的诗"
  %(prog)s --system "你是一个Python专家" "如何实现快速排序"

认证 (按优先级):
  1. 环境变量: export CODEBUDDY_OAUTH_TOKEN='your-token'
  2. ~/.git-credentials (IOA 登录后自动生成)
  3. ~/.claude-internal/config.json (claude-internal 认证后生成)
        """
    )
    parser.add_argument("prompt", nargs="?", help="提示词")
    parser.add_argument("-m", "--model", default="claude-4.5-sonnet",
                        help="模型名称 (默认: claude-4.5-sonnet)")
    parser.add_argument("-s", "--system", help="系统提示")
    parser.add_argument("--stream", action="store_true", help="流式输出")
    parser.add_argument("--list-models", action="store_true", help="列出支持的模型")

    args = parser.parse_args()

    try:
        client = CodeBuddyNativeClient()
    except AuthenticationError as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

    if args.list_models:
        print("支持的模型:")
        for m in client.get_models():
            print(f"  {m['id']}: {m['description']}")
        return

    if not args.prompt:
        parser.print_help()
        return

    response = client.chat(
        message=args.prompt,
        model=args.model,
        system=args.system,
        stream=args.stream,
    )

    if not args.stream:
        print(response)


if __name__ == "__main__":
    main()
