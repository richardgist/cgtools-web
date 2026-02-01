#!/usr/bin/env python3
"""
额度管理模块

负责追踪 Native API 的额度状态，支持：
- 额度用完检测
- 自然周重置（每周一零点自动重置）
- 手动重置
- 持久化存储
"""

import json
import os
import threading
from datetime import datetime, timedelta
from typing import Optional, Dict, Any


class QuotaManager:
    """Native API 额度管理器"""

    def __init__(self, quota_file: str = "quota_state.json"):
        """
        初始化额度管理器

        Args:
            quota_file: 额度状态持久化文件路径
        """
        self.quota_file = quota_file
        self._lock = threading.Lock()
        self._state = self._load_state()

        # 检查是否需要自动重置
        self._check_auto_reset()

    def _get_default_state(self) -> Dict[str, Any]:
        """获取默认状态"""
        return {
            "native_api": {
                "quota_exhausted": False,
                "exhausted_at": None,
                "reset_at": None,
                "last_error": None,
                "request_count": 0,
                "last_request_at": None,
            },
            "version": 2,
        }

    def _load_state(self) -> Dict[str, Any]:
        """从文件加载状态"""
        if not os.path.exists(self.quota_file):
            return self._get_default_state()

        try:
            with open(self.quota_file, "r", encoding="utf-8") as f:
                state = json.load(f)

                # 确保有所有必需的字段
                default = self._get_default_state()
                if "native_api" not in state:
                    state["native_api"] = default["native_api"]
                else:
                    for key in default["native_api"]:
                        if key not in state["native_api"]:
                            state["native_api"][key] = default["native_api"][key]
                return state
        except (json.JSONDecodeError, IOError) as e:
            print(f"[QuotaManager] 加载状态文件失败: {e}，使用默认状态")
            return self._get_default_state()

    def _save_state(self):
        """保存状态到文件"""
        try:
            with open(self.quota_file, "w", encoding="utf-8") as f:
                json.dump(self._state, f, ensure_ascii=False, indent=2)
        except IOError as e:
            print(f"[QuotaManager] 保存状态文件失败: {e}")

    def _get_next_monday_midnight(self) -> datetime:
        """获取下一个周一零点的时间"""
        now = datetime.now()
        # 计算距离下周一的天数 (weekday: 0=周一, 6=周日)
        days_until_monday = (7 - now.weekday()) % 7
        if days_until_monday == 0:
            # 如果今天是周一，重置到下周一
            days_until_monday = 7

        next_monday = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days_until_monday)
        return next_monday

    def _check_auto_reset(self):
        """检查是否需要自动重置"""
        with self._lock:
            native = self._state["native_api"]
            if not native["quota_exhausted"]:
                return

            reset_at = native.get("reset_at")
            if not reset_at:
                return

            try:
                reset_time = datetime.fromisoformat(reset_at)
                if datetime.now() >= reset_time:
                    print(f"[QuotaManager] 自动重置 Native API 额度（重置时间: {reset_at}）")
                    self._reset_native()
            except ValueError:
                pass

    def _reset_native(self):
        """重置 Native API 状态（内部方法，不加锁）"""
        self._state["native_api"] = {
            "quota_exhausted": False,
            "exhausted_at": None,
            "reset_at": None,
            "last_error": None,
            "request_count": 0,
            "last_request_at": None,
        }
        self._save_state()

    def is_native_available(self) -> bool:
        """
        检查 Native API 是否可用

        Returns:
            True 如果可用，False 如果额度用完
        """
        # 先检查自动重置
        self._check_auto_reset()

        with self._lock:
            return not self._state["native_api"]["quota_exhausted"]

    def mark_native_exhausted(self, error_message: str = None):
        """
        标记 Native API 额度用完

        Args:
            error_message: 错误信息
        """
        with self._lock:
            now = datetime.now()
            reset_at = self._get_next_monday_midnight()

            self._state["native_api"]["quota_exhausted"] = True
            self._state["native_api"]["exhausted_at"] = now.isoformat()
            self._state["native_api"]["reset_at"] = reset_at.isoformat()
            self._state["native_api"]["last_error"] = error_message

            self._save_state()

            print(f"[QuotaManager] Native API 额度已用完")
            print(f"[QuotaManager] 将在 {reset_at.strftime('%Y-%m-%d %H:%M:%S')} (下周一零点) 自动重置")

    def record_request(self):
        """记录一次请求"""
        with self._lock:
            self._state["native_api"]["request_count"] += 1
            self._state["native_api"]["last_request_at"] = datetime.now().isoformat()
            self._save_state()

    def reset_native(self):
        """手动重置 Native API 额度"""
        with self._lock:
            self._reset_native()
            print("[QuotaManager] Native API 额度已手动重置")

    def get_status(self) -> Dict[str, Any]:
        """
        获取当前额度状态

        Returns:
            状态字典
        """
        # 先检查自动重置
        self._check_auto_reset()

        with self._lock:
            native = self._state["native_api"]

            # 计算剩余重置时间
            time_until_reset = None
            if native["reset_at"]:
                try:
                    reset_time = datetime.fromisoformat(native["reset_at"])
                    remaining = reset_time - datetime.now()
                    if remaining.total_seconds() > 0:
                        days = remaining.days
                        hours = remaining.seconds // 3600
                        minutes = (remaining.seconds % 3600) // 60
                        time_until_reset = f"{days}d {hours}h {minutes}m"
                except ValueError:
                    pass

            return {
                "native_api": {
                    "available": not native["quota_exhausted"],
                    "quota_exhausted": native["quota_exhausted"],
                    "exhausted_at": native["exhausted_at"],
                    "reset_at": native["reset_at"],
                    "time_until_reset": time_until_reset,
                    "last_error": native["last_error"],
                    "request_count": native["request_count"],
                    "last_request_at": native["last_request_at"],
                },
                "reset_policy": "每周一零点自动重置",
            }


def is_quota_exhausted_error(status_code: int, error_body: str) -> bool:
    """
    检测是否是额度用完的错误

    Args:
        status_code: HTTP 状态码
        error_body: 错误响应体

    Returns:
        True 如果是额度错误
    """
    # HTTP 429 Too Many Requests
    if status_code == 429:
        return True

    # 检查错误消息中的关键词（英文，需要小写匹配）
    error_lower = error_body.lower()
    english_keywords = [
        "rate limit",
        "rate_limit",
        "ratelimit",
        "quota exceeded",
        "quota_exceeded",
        "too many requests",
        "request limit",
        "usage limit",
        "daily limit",
        "monthly limit",
        "weekly limit",
    ]

    for keyword in english_keywords:
        if keyword in error_lower:
            return True

    # 检查中文关键词（CodeBuddy 返回的中文错误消息）
    chinese_keywords = [
        "额度已用尽",
        "额度用尽",
        "本周额度",
        "本日额度",
        "本月额度",
        "额度不足",
        "额度耗尽",
        "临时提额",
        "使用详情",
    ]

    for keyword in chinese_keywords:
        if keyword in error_body:
            return True

    return False
