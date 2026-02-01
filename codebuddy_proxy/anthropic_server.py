#!/usr/bin/env python3
"""
Anthropic API 兼容服务器

提供标准的 Anthropic Messages API 接口，支持三种后端 Provider：
  - Native API:    使用 OAuth Token (IOA 登录)，原生 Anthropic 格式，无需协议转换 (推荐)
  - Hybrid API:    优先使用 Native API (透传)，额度用完时自动切换到 CodeBuddy API
  - CodeBuddy API: 使用本地认证文件，需要协议转换

模型映射 (Native/Hybrid):
  - claude-3-opus-* / opus -> claude-4.5-opus
  - claude-3-sonnet-* / sonnet -> claude-4.5-sonnet
  - claude-3-haiku-* / haiku -> claude-4.5-sonnet

模型映射 (CodeBuddy):
  - claude-3-opus-* / opus -> claude-opus-4.5
  - claude-3-sonnet-* / sonnet -> claude-4.5
  - claude-3-haiku-* / haiku -> claude-haiku-4.5

用法:
    # 使用 Native API (推荐，需要 IOA 登录)
    python anthropic_server.py --provider native

    # 使用 Hybrid API (优先 Native 透传，自动降级到 CodeBuddy)
    python anthropic_server.py --provider hybrid

    # 使用 CodeBuddy API (默认)
    python anthropic_server.py

    # 指定端口
    python anthropic_server.py --port 9000

API 端点:
    POST /v1/messages     - Anthropic Messages API
    GET  /v1/models       - 列出可用模型
    GET  /health          - 健康检查
    GET  /v1/quota        - 查看额度状态 (hybrid 模式)
    POST /v1/quota/reset  - 手动重置额度 (hybrid 模式)
"""

import json
import argparse
import uuid
import traceback
import time
import re
import requests
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Dict, Any, List, Union
import threading
import sys
import logging
import os
from logging.handlers import RotatingFileHandler

# 导入 CodeBuddy 客户端
from codebuddy_api import CodeBuddyClient
from codebuddy_native_api import CodeBuddyNativeClient, AuthenticationError
from quota_manager import QuotaManager, is_quota_exhausted_error
from key_manager import KeyManager, OAuthConfig, refresh_loop, file_watcher_loop


# 配置日志
def setup_logging(log_file: str = None, log_level: str = "INFO"):
    """配置日志系统，同时输出到控制台和文件

    Args:
        log_file: 日志文件路径，默认为脚本同目录下的 anthropic_server.log
        log_level: 日志级别，默认 INFO
    """
    if log_file is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        log_file = os.path.join(script_dir, "anthropic_server.log")

    # 创建 logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # 清理已有 handler，避免重复调用时产生重复日志
    for handler in logger.handlers[:]:
        handler.close()
        logger.removeHandler(handler)

    # 日志格式
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # 控制台 handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 文件 handler (带轮转，最大 10MB，保留 5 个备份)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return log_file


# 模型映射表 (CodeBuddy API)
MODEL_MAPPING = {
    # Opus 系列
    "claude-3-opus-20240229": "claude-opus-4.5",
    "claude-3-opus": "claude-opus-4.5",
    "claude-opus": "claude-opus-4.5",
    "claude-opus-4-5-20251101": "claude-opus-4.5",
    "opus": "claude-opus-4.5",

    # Sonnet 系列 -> claude-4.5
    "claude-3-sonnet-20240229": "claude-4.5",
    "claude-3-5-sonnet-20240620": "claude-4.5",
    "claude-3-5-sonnet-20241022": "claude-4.5",
    "claude-sonnet-4-5-20251101": "claude-4.5",
    "claude-3-sonnet": "claude-4.5",
    "claude-sonnet": "claude-4.5",
    "sonnet": "claude-4.5",

    # Haiku 系列
    "claude-3-haiku-20240307": "claude-haiku-4.5",
    "claude-3-5-haiku-20241022": "claude-haiku-4.5",
    "claude-haiku-4-5-20251001": "claude-haiku-4.5",
    "claude-3-haiku": "claude-haiku-4.5",
    "claude-haiku": "claude-haiku-4.5",
    "haiku": "claude-haiku-4.5",
}

# 模型映射表 (Native API)
NATIVE_MODEL_MAPPING = {
    # Opus 系列
    "claude-3-opus-20240229": "claude-4.5-opus",
    "claude-3-opus": "claude-4.5-opus",
    "claude-opus": "claude-4.5-opus",
    "claude-opus-4-5-20251101": "claude-4.5-opus",
    "opus": "claude-4.5-opus",

    # Sonnet 系列 -> claude-4.5-sonnet
    "claude-3-sonnet-20240229": "claude-4.5-sonnet",
    "claude-3-5-sonnet-20240620": "claude-4.5-sonnet",
    "claude-3-5-sonnet-20241022": "claude-4.5-sonnet",
    "claude-sonnet-4-5-20251101": "claude-4.5-sonnet",
    "claude-3-sonnet": "claude-4.5-sonnet",
    "claude-sonnet": "claude-4.5-sonnet",
    "sonnet": "claude-4.5-sonnet",

    # Haiku 系列 (Native API 暂无 haiku，映射到 sonnet)
    "claude-3-haiku-20240307": "claude-4.5-sonnet",
    "claude-3-5-haiku-20241022": "claude-4.5-sonnet",
    "claude-haiku-4-5-20251001": "claude-4.5-sonnet",
    "claude-3-haiku": "claude-4.5-sonnet",
    "claude-haiku": "claude-4.5-sonnet",
    "haiku": "claude-4.5-sonnet",

    # Native API 原生模型（直接透传）
    "claude-4.5-opus": "claude-4.5-opus",
    "claude-4.5-sonnet": "claude-4.5-sonnet",
}
# 模型上下文长度限制（tokens）
# CodeBuddy 后端可能有自己的限制，这里设置一个合理的默认值
MODEL_MAX_CONTEXT = {
    "claude-opus-4.5": 200000,
    "claude-4.5": 200000,
    "claude-haiku-4.5": 200000,
}
DEFAULT_MAX_CONTEXT = 200000  # 默认最大上下文长度

# max_tokens 输出限制
# 设置为 None 表示不限制，让后端 API 自己处理
# 如果 CodeBuddy 有具体限制，可以设置具体值
MAX_OUTPUT_TOKENS = None  # 不限制输出 token 数

# Anthropic 模型列表（供 /v1/models 返回）
ANTHROPIC_MODELS = [
    {
        "id": "claude-3-opus-20240229",
        "object": "model",
        "created": 1709251200,
        "owned_by": "anthropic",
        "display_name": "Claude 3 Opus",
    },
    {
        "id": "claude-3-5-sonnet-20241022",
        "object": "model",
        "created": 1729555200,
        "owned_by": "anthropic",
        "display_name": "Claude 3.5 Sonnet",
    },
    {
        "id": "claude-3-5-haiku-20241022",
        "object": "model",
        "created": 1729555200,
        "owned_by": "anthropic",
        "display_name": "Claude 3.5 Haiku",
    },
]


# 当前使用的 provider 类型
current_provider = "codebuddy"  # 默认值，在 main() 中会被设置

# Hybrid 模式相关全局变量
quota_manager: QuotaManager = None
codebuddy_client = None
native_client = None  # Native API 客户端

# KeyManager 相关全局变量（用于 native/hybrid 模式的自动刷新和热读取）
key_manager: Optional[KeyManager] = None
oauth_config: Optional[OAuthConfig] = None


def map_model(model: str, provider: str = None) -> str:
    """将 Anthropic 模型名映射到后端模型名

    Args:
        model: 原始模型名
        provider: 指定 provider，None 则使用 current_provider
    """
    # 确定使用哪个 provider
    effective_provider = provider if provider is not None else current_provider
    # hybrid 和 native 模式使用 NATIVE_MODEL_MAPPING
    if effective_provider in ["hybrid", "native"]:
        mapping = NATIVE_MODEL_MAPPING
    else:
        mapping = MODEL_MAPPING

    # 先尝试精确匹配
    if model in mapping:
        return mapping[model]

    # 模糊匹配
    model_lower = model.lower()

    if effective_provider in ["hybrid", "native"]:
        if "opus" in model_lower:
            return "claude-4.5-opus"
        elif "sonnet" in model_lower:
            return "claude-4.5-sonnet"
        elif "haiku" in model_lower:
            return "claude-4.5-sonnet"
    else:
        if "opus" in model_lower:
            return "claude-opus-4.5"
        elif "sonnet" in model_lower:
            return "claude-4.5"
        elif "haiku" in model_lower:
            return "claude-haiku-4.5"

    # 默认返回原模型名
    return model


def get_active_client_and_provider():
    """
    获取当前活跃的客户端和 provider（hybrid 模式根据额度状态选择）

    Returns:
        tuple: (client, provider_name)
    """
    global quota_manager, codebuddy_client, native_client

    if current_provider == "hybrid":
        # Hybrid 模式：优先使用 Native API（透传），额度用完时降级到 CodeBuddy API
        if quota_manager and quota_manager.is_native_available():
            return native_client, "native"
        else:
            logging.info("[Hybrid] Native API 额度已用完，使用 CodeBuddy API")
            return codebuddy_client, "codebuddy"
    elif current_provider == "native":
        return native_client, "native"
    else:
        # 非 hybrid 模式，直接返回配置的客户端
        return AnthropicHandler.client, current_provider


def convert_content_block(block: Dict) -> Dict:
    """
    将 Anthropic 格式的 content block 转换为 OpenAI/CodeBuddy 格式
    
    Anthropic 图片格式:
      {
        "type": "image",
        "source": {
          "type": "base64",
          "media_type": "image/png",
          "data": "..."
        }
      }
    
    OpenAI/CodeBuddy 图片格式:
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/png;base64,..."
        }
      }
    """
    block_type = block.get("type")
    
    if block_type == "text":
        return {
            "type": "text",
            "text": block.get("text", ""),
        }
    
    elif block_type == "image":
        source = block.get("source", {})
        source_type = source.get("type")
        
        if source_type == "base64":
            media_type = source.get("media_type", "image/png")
            data = source.get("data", "")
            return {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{data}"
                }
            }
        elif source_type == "url":
            return {
                "type": "image_url",
                "image_url": {
                    "url": source.get("url", "")
                }
            }
    
    # 未知类型，返回空文本
    return {"type": "text", "text": ""}


def normalize_system_prompt(system) -> Optional[str]:
    """
    将 system prompt 标准化为字符串

    Anthropic API 的 system 参数可能是：
    - 字符串: "You are a helpful assistant"
    - content blocks 数组: [{"type": "text", "text": "You are..."}, ...]

    Args:
        system: system prompt（字符串或数组）

    Returns:
        字符串形式的 system prompt，或 None
    """
    if system is None:
        return None
    if isinstance(system, str):
        return system
    if isinstance(system, list):
        text_parts = [
            c.get("text", "") for c in system
            if isinstance(c, dict) and c.get("type") == "text"
        ]
        return "\n".join(text_parts) if text_parts else None
    return None


# CodeBuddy 敏感词过滤规则
# 这些短语会触发 CodeBuddy 的内容审核，需要替换或删除
CODEBUDDY_SENSITIVE_PATTERNS = [
    # 格式: (原文, 替换文)
    ("You are Claude Code, Anthropic's official CLI for Claude.", "You are an AI coding assistant."),
    ("You are Claude Code, Anthropic's official CLI.", "You are an AI coding assistant."),
    ("Main branch (you will usually use this for PRs)", "Default branch for pull requests"),
    ("To give feedback, users should report the issue at", "To provide feedback, users can report issues at"),
]


def sanitize_for_codebuddy(text: str) -> str:
    """
    清理文本中可能触发 CodeBuddy 敏感词检测的内容
    
    CodeBuddy 的内容审核系统会对某些特定短语（如 AI 角色声明）进行检测，
    导致返回"敏感内容"错误。此函数替换这些短语以避免误触发。
    
    Args:
        text: 原始文本
        
    Returns:
        清理后的文本
    """
    if not text:
        return text

    result = text
    for pattern, replacement in CODEBUDDY_SENSITIVE_PATTERNS:
        if pattern in result:
            result = result.replace(pattern, replacement)
            logging.debug(f"[Sanitize] Replaced sensitive pattern: '{pattern[:50]}...'")

    return result


# Anthropic 保留关键字正则表达式
# 这些关键字是 Anthropic 计费系统内部使用的，不应出现在系统提示词中
# 参考: https://github.com/ericc-ch/copilot-api/issues/174
ANTHROPIC_RESERVED_HEADER_PATTERN = re.compile(
    r"^x-anthropic-billing(?:-header)?:[^\n]*\n*",
    re.MULTILINE
)


def filter_anthropic_reserved_headers(text: str) -> str:
    """
    过滤系统提示词中的 Anthropic 保留关键字

    Claude Code v2.1.15+ 会在系统提示词开头注入计费头，格式如:
        x-anthropic-billing-header: ?cc_version=2.1.15; ?cc_entrypoint=...

    这些关键字会导致 API 返回 400 错误:
        "x-anthropic-billing-header is a reserved keyword and may not be used in the system prompt"

    Args:
        text: 原始系统提示词文本

    Returns:
        过滤后的文本
    """
    if not text:
        return text

    filtered = ANTHROPIC_RESERVED_HEADER_PATTERN.sub("", text)

    if len(filtered) != len(text):
        logging.info(f"[Filter] Removed Anthropic reserved headers: {len(text)} -> {len(filtered)} chars")

    return filtered


def filter_system_prompt(system: Union[str, List[Dict[str, Any]], None]) -> Union[str, List[Dict[str, Any]], None]:
    """
    过滤系统提示词中的 Anthropic 保留关键字

    支持两种格式:
    1. 字符串格式: "x-anthropic-billing-header: ...\n\n实际内容"
    2. 数组格式: [{"type": "text", "text": "x-anthropic-billing-header: ..."}]

    Args:
        system: 系统提示词 (字符串或数组)

    Returns:
        过滤后的系统提示词
    """
    if system is None:
        return None

    if isinstance(system, str):
        return filter_anthropic_reserved_headers(system)

    if isinstance(system, list):
        filtered_blocks = []
        for block in system:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text", "")
                filtered_text = filter_anthropic_reserved_headers(text)
                if filtered_text:  # 只保留非空内容
                    filtered_blocks.append({**block, "text": filtered_text})
            else:
                filtered_blocks.append(block)
        return filtered_blocks

    return system


def convert_anthropic_messages(messages: List[Dict], provider: str = None) -> tuple:
    """
    将 Anthropic 格式的消息转换为 CodeBuddy/OpenAI 格式

    Anthropic 格式特点:
      - system 作为单独参数传入
      - assistant 消息的 content 可能包含 tool_use blocks
      - user 消息的 content 可能包含 tool_result blocks

    OpenAI 格式特点:
      - assistant 消息有 tool_calls 字段
      - tool 结果用 role: "tool" 的独立消息

    Args:
        messages: Anthropic 格式的消息列表
        provider: 当前使用的 provider，用于转换 tool_call_id 格式

    返回: (system_prompt, messages_list, has_images)
    """
    system_prompt = None
    converted_messages = []
    has_images = False
    
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "")
        
        if role == "system":
            if isinstance(content, str):
                system_prompt = content
            elif isinstance(content, list):
                text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
                system_prompt = "\n".join(text_parts)
            continue
        
        # 处理 assistant 消息
        if role == "assistant":
            text_parts = []
            tool_calls = []
            thinking_parts = []  # 收集 thinking 内容

            if isinstance(content, str):
                text_parts.append(content)
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_type = block.get("type")

                    if block_type == "text":
                        text_parts.append(block.get("text", ""))
                    elif block_type == "thinking":
                        # 收集 thinking 内容
                        thinking_text = block.get("thinking", "")
                        if thinking_text:
                            thinking_parts.append(thinking_text)
                    elif block_type == "redacted_thinking":
                        # redacted_thinking 包含 data 字段（加密的思考内容），跳过
                        pass
                    elif block_type == "tool_use":
                        # 转换为 OpenAI tool_calls 格式
                        # 需要将 tool_use id 转换为后端期望的格式
                        original_id = block.get("id")
                        converted_id = denormalize_tool_call_id(original_id, provider) if provider else original_id
                        tool_calls.append({
                            "id": converted_id,
                            "type": "function",
                            "function": {
                                "name": block.get("name"),
                                "arguments": json.dumps(block.get("input", {})),
                            }
                        })
            
            assistant_msg = {"role": "assistant"}
            # 将 thinking 和 text 合并（thinking 作为前缀，用特殊标记包裹）
            all_content_parts = []
            if thinking_parts:
                # 将 thinking 内容用 <thinking> 标签包裹，便于后端理解
                thinking_content = "\n".join(thinking_parts)
                all_content_parts.append(f"<thinking>\n{thinking_content}\n</thinking>")
            if text_parts:
                all_content_parts.extend(text_parts)

            if all_content_parts:
                assistant_msg["content"] = "\n".join(all_content_parts)
            else:
                assistant_msg["content"] = ""
            
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            
            converted_messages.append(assistant_msg)
            continue
        
        # 处理 user 消息（可能包含 tool_result）
        if role == "user":
            if isinstance(content, str):
                converted_messages.append({"role": "user", "content": content})
            elif isinstance(content, list):
                # 按原始顺序处理 content blocks，保持 tool 消息和 user 消息的交错顺序
                # 收集连续的 user 内容（text/image），遇到 tool_result 时先输出累积的 user 内容
                pending_user_content = []

                def flush_user_content():
                    """将累积的 user 内容输出为 user 消息"""
                    nonlocal pending_user_content, has_images
                    if not pending_user_content:
                        return
                    if len(pending_user_content) == 1 and pending_user_content[0].get("type") == "text":
                        converted_messages.append({"role": "user", "content": pending_user_content[0]["text"]})
                    else:
                        converted_messages.append({"role": "user", "content": pending_user_content})
                    pending_user_content = []

                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_type = block.get("type")

                    if block_type == "text":
                        pending_user_content.append({"type": "text", "text": block.get("text", "")})
                    elif block_type == "image":
                        converted_block = convert_content_block(block)
                        pending_user_content.append(converted_block)
                        if converted_block.get("type") == "image_url":
                            has_images = True
                    elif block_type == "document":
                        # 处理文档类型（PDF 等）
                        # Anthropic 格式: {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": "..."}}
                        source = block.get("source", {})
                        if source.get("type") == "base64":
                            # 将文档转换为文本描述（CodeBuddy 可能不支持直接处理 PDF）
                            media_type = source.get("media_type", "application/octet-stream")
                            pending_user_content.append({"type": "text", "text": f"[Document: {media_type}]"})
                            logging.info(f"[Info] Document block detected: {media_type}")
                    elif block_type == "tool_result":
                        # 遇到 tool_result，先输出之前累积的 user 内容，保持顺序
                        flush_user_content()

                        # 将 tool_use_id 转换为后端期望的格式
                        original_id = block.get("tool_use_id")
                        converted_id = denormalize_tool_call_id(original_id, provider) if provider else original_id
                        tool_content = block.get("content", "")
                        # tool_result 的 content 可能是字符串或数组
                        if isinstance(tool_content, list):
                            # 提取文本部分
                            text_items = [c.get("text", "") for c in tool_content if isinstance(c, dict) and c.get("type") == "text"]
                            tool_content = "\n".join(text_items) if text_items else str(tool_content)
                        converted_messages.append({
                            "role": "tool",
                            "tool_call_id": converted_id,
                            "content": str(tool_content),
                        })

                # 输出剩余的 user 内容
                flush_user_content()
            continue
    
    return system_prompt, converted_messages, has_images


def recursively_clean_schema(schema: Any) -> Any:
    """
    递归清理 JSON Schema，使其兼容各种 API（如 Google Gemini）

    - 删除 '$schema' 和 'additionalProperties' 字段
    - 对于 string 类型，删除不支持的 format 字段（保留 date-time 和 enum）
    """
    if schema is None or not isinstance(schema, (dict, list)):
        return schema

    if isinstance(schema, list):
        return [recursively_clean_schema(item) for item in schema]

    # 处理 dict
    new_schema = {}
    for key, value in schema.items():
        # 跳过这些字段
        if key in ('$schema', 'additionalProperties'):
            continue
        new_schema[key] = recursively_clean_schema(value)

    # 清理不支持的 format
    if new_schema.get('type') == 'string' and 'format' in new_schema:
        supported_formats = ['date-time', 'enum']
        if new_schema['format'] not in supported_formats:
            del new_schema['format']

    return new_schema


def convert_anthropic_tools(tools: List[Dict]) -> List[Dict]:
    """
    将 Anthropic 格式的 tools 转换为 OpenAI 格式

    Anthropic 格式:
      {
        "name": "get_weather",
        "description": "Get weather",
        "input_schema": {...}
      }

    OpenAI 格式:
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get weather",
          "parameters": {...}
        }
      }
    """
    if not tools:
        return None

    converted = []
    for tool in tools:
        # 清理 schema 以兼容各种 API
        cleaned_parameters = recursively_clean_schema(tool.get("input_schema", {}))
        converted.append({
            "type": "function",
            "function": {
                "name": tool.get("name"),
                "description": tool.get("description", ""),
                "parameters": cleaned_parameters,
            }
        })
    return converted


def convert_tool_choice(tool_choice) -> Any:
    """
    转换 tool_choice 参数

    Anthropic -> OpenAI 映射:
      - "auto" -> "auto"
      - "any" -> "auto" (OpenAI 的 "required" 兼容性不好，用 "auto" 更安全)
      - "none" -> "none"
      - {"type": "tool", "name": "xxx"} -> {"type": "function", "function": {"name": "xxx"}}
      - {"type": "auto"} -> "auto"
      - {"type": "any"} -> "auto"
    """
    if tool_choice is None:
        return None

    if isinstance(tool_choice, str):
        # "auto", "any", "none" 等
        if tool_choice == "any":
            return "auto"  # 用 auto 更兼容
        return tool_choice

    if isinstance(tool_choice, dict):
        choice_type = tool_choice.get("type")
        # {"type": "tool", "name": "xxx"} -> {"type": "function", "function": {"name": "xxx"}}
        if choice_type == "tool":
            return {
                "type": "function",
                "function": {"name": tool_choice.get("name")}
            }
        # {"type": "auto"} 或 {"type": "any"}
        if choice_type == "any":
            return "auto"
        if choice_type == "auto":
            return "auto"
        if choice_type == "none":
            return "none"

    return tool_choice


def create_message_response(
    content: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    stop_reason: str = "end_turn",
) -> Dict[str, Any]:
    """创建 Anthropic Messages API 响应"""
    return {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": content,
            }
        ],
        "model": model,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


def create_stream_event(event_type: str, data: Dict[str, Any]) -> str:
    """创建 SSE 事件"""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def normalize_tool_call_id(tool_id: str) -> str:
    """
    将 tool_call id 转换为 Anthropic 格式

    Anthropic 期望的格式: toolu_xxx
    """
    if not tool_id:
        return f"toolu_{uuid.uuid4().hex[:24]}"

    # 如果已经是 toolu_ 格式，直接返回
    if tool_id.startswith("toolu_"):
        return tool_id

    # 其他格式，添加 toolu_ 前缀
    return f"toolu_{tool_id}"


def denormalize_tool_call_id(tool_id: str, provider: str) -> str:
    """
    将 Anthropic 格式的 tool_call id 转换回后端 API 格式

    Anthropic 格式: toolu_xxx
    CodeBuddy API 期望的格式: toolu_xxx (不变)
    Native API 期望的格式: toolu_xxx (不变)

    Args:
        tool_id: Anthropic 格式的 tool_call id
        provider: 当前使用的 provider (codebuddy/hybrid/native)

    Returns:
        转换后的 tool_call id
    """
    if not tool_id:
        return tool_id

    # 所有 provider 都使用 toolu_ 格式，不需要转换
    return tool_id


class AnthropicHandler(BaseHTTPRequestHandler):
    """处理 Anthropic API 请求"""

    # 使用 HTTP/1.0 协议，避免 keep-alive 导致的请求混乱问题
    protocol_version = "HTTP/1.0"

    # 类变量，存储 CodeBuddy 客户端
    client: CodeBuddyClient = None

    def log_message(self, format, *args):
        """自定义日志格式"""
        logging.debug(f"[HTTP] {args[0]}")
    
    def send_json_response(self, data: Dict, status_code: int = 200):
        """发送 JSON 响应"""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        
        self.wfile.write(body)
    
    def send_error_response(self, error_type: str, message: str, status_code: int = 400):
        """发送错误响应"""
        error_data = {
            "type": "error",
            "error": {
                "type": error_type,
                "message": message,
            },
        }
        self.send_json_response(error_data, status_code)
    
    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key, anthropic-version")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()
    
    def do_GET(self):
        """处理 GET 请求"""
        # 解析路径，忽略查询参数
        path = self.path.split("?")[0]

        if path == "/health":
            self.send_json_response({"status": "ok"})

        elif path == "/v1/models" or path == "/models":
            self.send_json_response({
                "object": "list",
                "data": ANTHROPIC_MODELS,
            })

        elif path == "/v1/quota":
            self.handle_quota_status()

        else:
            logging.warning(f"[GET] Unknown endpoint requested: {path}, full path: {self.path}")
            self.send_error_response("not_found", f"Unknown endpoint: {self.path}", 404)

    def do_POST(self):
        """处理 POST 请求"""
        # 解析路径，忽略查询参数
        path = self.path.split("?")[0]

        if path == "/v1/messages" or path == "/messages":
            self.handle_messages()
        elif path == "/v1/messages/count_tokens":
            self.handle_count_tokens()
        elif path == "/v1/quota/reset":
            self.handle_quota_reset()
        elif path == "/api/event_logging/batch":
            # Claude Code 的遥测接口，静默忽略
            self.send_json_response({"success": True})
        else:
            logging.warning(f"[POST] Unknown endpoint requested: {path}, full path: {self.path}")
            self.send_error_response("not_found", f"Unknown endpoint: {self.path}", 404)

    def handle_quota_status(self):
        """处理 GET /v1/quota - 查看额度状态"""
        global quota_manager

        if current_provider != "hybrid":
            self.send_json_response({
                "provider": current_provider,
                "message": "Quota management is only available in hybrid mode",
            })
            return

        if quota_manager is None:
            self.send_error_response("internal_error", "Quota manager not initialized", 500)
            return

        status = quota_manager.get_status()
        status["provider"] = "hybrid"
        self.send_json_response(status)

    def handle_quota_reset(self):
        """处理 POST /v1/quota/reset - 手动重置额度"""
        global quota_manager

        if current_provider != "hybrid":
            self.send_json_response({
                "provider": current_provider,
                "message": "Quota management is only available in hybrid mode",
                "success": False,
            })
            return

        if quota_manager is None:
            self.send_error_response("internal_error", "Quota manager not initialized", 500)
            return

        quota_manager.reset_native()
        self.send_json_response({
            "success": True,
            "message": "Native API quota has been reset",
            "status": quota_manager.get_status(),
        })

    def handle_count_tokens(self):
        """处理 POST /v1/messages/count_tokens - Token 计数 API

        Anthropic count_tokens API 用于预计算消息的 token 数量，
        Claude Code 用它来跟踪 context window 使用情况。

        请求格式 (与 messages API 类似):
        {
            "model": "claude-...",
            "messages": [...],
            "system": "...",  # 可选
            "tools": [...]    # 可选
        }

        响应格式:
        {
            "input_tokens": 123
        }
        """
        logging.info("[CountTokens] Received count_tokens request")
        logging.info(f"[CountTokens] Request path: {self.path}")
        logging.info(f"[CountTokens] Request headers: {dict(self.headers)}")

        # 读取请求体
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self.send_error_response("invalid_request_error", "Request body is empty")
            return

        try:
            body = self.rfile.read(content_length)
            request_data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            self.send_error_response("invalid_request_error", f"Invalid JSON: {e}")
            return

        # 打印请求参数（截断过长的内容）
        request_summary = {
            "model": request_data.get("model"),
            "messages_count": len(request_data.get("messages", [])),
            "has_system": "system" in request_data,
            "has_tools": "tools" in request_data,
            "tools_count": len(request_data.get("tools", [])) if request_data.get("tools") else 0,
        }
        logging.info(f"[CountTokens] Request summary: {request_summary}")

        # 打印完整请求（限制大小）
        request_str = json.dumps(request_data, ensure_ascii=False)
        if len(request_str) > 2000:
            logging.debug(f"[CountTokens] Request body (truncated): {request_str[:2000]}...")
        else:
            logging.debug(f"[CountTokens] Request body: {request_str}")

        # 优先使用 Native API（如果可用）
        # Native API 支持精确的 token 计数，而 CodeBuddy API 不支持此端点
        global native_client
        if native_client is not None:
            self.handle_count_tokens_native(request_data, native_client)
            return

        # 没有 Native 客户端时，使用本地估算
        input_tokens = self._estimate_count_tokens(request_data)

        logging.info(f"[CountTokens] Estimated {input_tokens} tokens (local estimation)")

        self.send_json_response({
            "input_tokens": input_tokens
        })

    def handle_count_tokens_native(self, request_data: Dict, client):
        """透传 count_tokens 请求到 Native API

        Args:
            request_data: 原始请求数据
            client: Native API 客户端
        """
        # 模型名映射
        if "model" in request_data:
            original_model = request_data["model"]
            mapped_model = map_model(original_model, "native")
            request_data["model"] = mapped_model
            logging.info(f"[CountTokens Native] Model: {original_model} -> {mapped_model}")

        headers = client._get_headers()
        # 添加 beta 头（count_tokens 是 beta 功能）
        headers["anthropic-beta"] = "token-counting-2024-11-01"

        count_tokens_url = f"{client.BASE_URL}/v1/messages/count_tokens"
        logging.info(f"[CountTokens Native] URL: {count_tokens_url}")
        logging.info(f"[CountTokens Native] Request model after mapping: {request_data.get('model')}")

        try:
            response = requests.post(
                count_tokens_url,
                headers=headers,
                json=request_data,
                timeout=30
            )

            # 尝试解析响应
            try:
                response_data = response.json()
            except (json.JSONDecodeError, ValueError):
                # 非 JSON 响应
                logging.warning(f"[CountTokens Native] Non-JSON response: {response.text[:200]}")
                # 降级到本地估算
                input_tokens = self._estimate_count_tokens(request_data)
                self.send_json_response({"input_tokens": input_tokens})
                return

            if response.status_code == 200:
                # 服务端可能包装响应: {"type":"success","data":{...}}
                logging.info(f"[CountTokens Native] Raw response: {response_data}")
                if response_data.get("type") == "success" and "data" in response_data:
                    result = response_data["data"]
                else:
                    result = response_data

                logging.info(f"[CountTokens Native] Final response: {result}")
                self.send_json_response(result)
            else:
                # 错误响应，降级到本地估算
                logging.warning(f"[CountTokens Native] Error {response.status_code}: {response_data}")
                input_tokens = self._estimate_count_tokens(request_data)
                logging.info(f"[CountTokens] Fallback to local estimation: {input_tokens} tokens")
                self.send_json_response({"input_tokens": input_tokens})

        except requests.exceptions.Timeout:
            logging.warning("[CountTokens Native] Timeout, using local estimation")
            input_tokens = self._estimate_count_tokens(request_data)
            self.send_json_response({"input_tokens": input_tokens})
        except requests.exceptions.RequestException as e:
            logging.warning(f"[CountTokens Native] Request error: {e}, using local estimation")
            input_tokens = self._estimate_count_tokens(request_data)
            self.send_json_response({"input_tokens": input_tokens})

    def _estimate_count_tokens(self, request_data: Dict) -> int:
        """本地估算 token 数

        使用简单的字符计数估算：1 token ≈ 4 字符（中英混合）
        这是一个粗略估算，真实值可能有 10-20% 的误差

        Args:
            request_data: count_tokens 请求数据

        Returns:
            估算的 token 数
        """
        total_chars = 0

        # 计算 system prompt
        system = request_data.get("system")
        if system:
            if isinstance(system, str):
                total_chars += len(system)
            elif isinstance(system, list):
                for block in system:
                    if isinstance(block, dict) and block.get("type") == "text":
                        total_chars += len(block.get("text", ""))

        # 计算 messages
        messages = request_data.get("messages", [])
        total_chars += self._estimate_messages_chars(messages)

        # 计算 tools
        tools = request_data.get("tools", [])
        if tools:
            total_chars += len(json.dumps(tools))

        # 转换为 tokens (1 token ≈ 4 chars)
        return total_chars // 4

    def _estimate_messages_chars(self, messages: List[Dict]) -> int:
        """估算消息列表的字符数"""
        total = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total += len(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        block_type = block.get("type")
                        if block_type == "text":
                            total += len(block.get("text", ""))
                        elif block_type == "image":
                            # 图片估算 1000 tokens = 4000 chars
                            total += 4000
                        elif block_type == "tool_use":
                            total += len(json.dumps(block.get("input", {})))
                        elif block_type == "tool_result":
                            result = block.get("content", "")
                            if isinstance(result, str):
                                total += len(result)
                            elif isinstance(result, list):
                                for item in result:
                                    if isinstance(item, dict) and item.get("type") == "text":
                                        total += len(item.get("text", ""))
        return total
    
    def handle_messages(self):
        """处理 Messages API 请求 - 透传方式"""
        request_start_time = time.time()
        logging.info("=" * 60)
        logging.info(f"[Request] New messages request received")

        # 读取请求体
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self.send_error_response("invalid_request_error", "Request body is empty")
            return

        try:
            body = self.rfile.read(content_length)
            request_data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            self.send_error_response("invalid_request_error", f"Invalid JSON: {e}")
            return

        # 验证必需参数
        if "model" not in request_data:
            self.send_error_response("invalid_request_error", "Missing required parameter: model")
            return

        if "messages" not in request_data:
            self.send_error_response("invalid_request_error", "Missing required parameter: messages")
            return

        # 获取活跃的客户端和 provider
        active_client, active_provider = get_active_client_and_provider()

        # 如果是 native provider，使用原生 Anthropic 格式处理
        if active_provider == "native":
            self.handle_messages_native(request_data, active_client)
            return

        # 以下是非 native provider 的处理逻辑（需要协议转换）

        # 映射模型（使用活跃的 provider）
        original_model = request_data["model"]
        mapped_model = map_model(original_model, active_provider)

        # 转换消息格式 (Anthropic -> OpenAI)
        messages = request_data["messages"]

        logging.info(f"[Request] Provider: {active_provider}")
        logging.info(f"[Request] Model: {original_model} -> {mapped_model}")
        logging.info(f"[Request] Messages: {len(messages)} messages")

        # 调试：打印消息角色
        roles = [m.get("role") for m in messages]
        logging.debug(f"[Debug] Message roles: {roles}")

        # 检查消息中是否包含 thinking blocks
        for msg in messages:
            if msg.get("role") == "assistant":
                content = msg.get("content", [])
                if isinstance(content, list):
                    block_types = [b.get("type") for b in content if isinstance(b, dict)]
                    if "thinking" in block_types or "redacted_thinking" in block_types:
                        logging.info(f"[Info] Assistant message contains thinking blocks: {block_types}")

        system_from_messages, converted_messages, has_images = convert_anthropic_messages(messages, active_provider)

        if has_images:
            logging.info("[Info] Request contains images")

        # 构建发送给 CodeBuddy 的 payload
        payload = {
            "model": mapped_model,
            "messages": [],
            "stream": True,  # CodeBuddy 要求流式
        }

        # 处理 system prompt（可能是字符串或 content blocks 数组）
        system = normalize_system_prompt(request_data.get("system"))
        system_prompt = system or system_from_messages
        if system_prompt:
            # 清理 system prompt 中的敏感内容
            system_prompt = sanitize_for_codebuddy(system_prompt)
            payload["messages"].append({"role": "system", "content": system_prompt})

        # 添加转换后的消息
        payload["messages"].extend(converted_messages)
        
        # 清理所有消息中的敏感内容
        for msg in payload["messages"]:
            content = msg.get("content")
            if isinstance(content, str):
                msg["content"] = sanitize_for_codebuddy(content)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        item["text"] = sanitize_for_codebuddy(item.get("text", ""))

        # 透传其他参数，并限制 max_tokens（如果配置了限制）
        if "max_tokens" in request_data:
            requested_max_tokens = request_data["max_tokens"]
            # 如果配置了 MAX_OUTPUT_TOKENS 限制，则应用
            if MAX_OUTPUT_TOKENS is not None and requested_max_tokens > MAX_OUTPUT_TOKENS:
                logging.info(f"[Info] Capping max_tokens from {requested_max_tokens} to {MAX_OUTPUT_TOKENS}")
                payload["max_tokens"] = MAX_OUTPUT_TOKENS
            else:
                payload["max_tokens"] = requested_max_tokens
        if "temperature" in request_data:
            payload["temperature"] = request_data["temperature"]
        if "top_p" in request_data:
            payload["top_p"] = request_data["top_p"]
        if "stop_sequences" in request_data:
            payload["stop"] = request_data["stop_sequences"]

        # 转换并透传 tools（只有非空时才设置，避免发送 null）
        if "tools" in request_data:
            converted_tools = convert_anthropic_tools(request_data["tools"])
            if converted_tools:
                payload["tools"] = converted_tools
                logging.info(f"[Info] Request contains {len(request_data['tools'])} tools")
                # 打印 tools 名称以便调试
                tool_names = [t.get("name", "unknown") for t in converted_tools]
                logging.debug(f"[Request] Tool names: {tool_names}")

        # 转换并透传 tool_choice
        if "tool_choice" in request_data:
            payload["tool_choice"] = convert_tool_choice(request_data["tool_choice"])

        # 处理 thinking 参数（extended thinking 功能）
        # CodeBuddy 使用 reasoning_effort 参数来启用 thinking
        if "thinking" in request_data:
            thinking_config = request_data["thinking"]
            logging.info(f"[Info] Extended thinking requested: {thinking_config}")
            if thinking_config.get("type") == "enabled":
                payload["reasoning_effort"] = "high"
                payload["reasoning_summary"] = "auto"
                logging.info("[Info] Enabled reasoning_effort=high for CodeBuddy thinking")

        stream = request_data.get("stream", False)
        payload_size = len(json.dumps(payload))
        logging.info(f"[Request] Stream: {stream}, Payload size: {payload_size} bytes")
        
        # 保存大请求到文件以便调试敏感内容问题
        if payload_size > 10000:
            import time as _time
            debug_file = f"/tmp/request_debug_{int(_time.time())}.json"
            with open(debug_file, "w") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            logging.info(f"[Debug] Saved large request to {debug_file}")
        
        # 记录请求内容以便调试敏感内容问题
        if payload.get("system"):
            system_preview = payload["system"][:500] + "..." if len(payload["system"]) > 500 else payload["system"]
            logging.debug(f"[Request] System prompt: {system_preview}")
        else:
            logging.debug(f"[Request] No system prompt in request")
        if payload.get("messages"):
            # 记录第一条消息（可能包含 system prompt）
            first_msg = payload["messages"][0]
            first_content = first_msg.get("content", "")
            if isinstance(first_content, str):
                first_preview = first_content[:2000] + "..." if len(first_content) > 2000 else first_content
            else:
                first_preview = str(first_content)[:500] + "..."
            logging.debug(f"[Request] First message ({first_msg.get('role')}): {first_preview}")
            # 只记录最后一条用户消息
            for msg in reversed(payload["messages"]):
                if msg.get("role") == "user":
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        content_preview = content[:2000] + "..." if len(content) > 2000 else content
                    else:
                        content_preview = str(content)[:2000] + "..."
                    logging.debug(f"[Request] Last user message: {content_preview}")
                    break

        # 检查上下文长度
        max_context = MODEL_MAX_CONTEXT.get(mapped_model, DEFAULT_MAX_CONTEXT)
        estimated_input_tokens = self._estimate_tokens(payload.get("messages", []))
        requested_max_tokens = payload.get("max_tokens", 32000)  # 默认 32K，与客户端常用值一致

        # 如果输入 + 输出超过上下文限制，返回错误
        if estimated_input_tokens + requested_max_tokens > max_context:
            available_for_output = max_context - estimated_input_tokens
            if available_for_output < 100:
                # 输入已经太长，无法生成有意义的输出
                logging.error(f"[Error] Context too long: {estimated_input_tokens} input tokens, max context is {max_context}")
                self.send_error_response(
                    "invalid_request_error",
                    f"Input too long: estimated {estimated_input_tokens} tokens, max context is {max_context} tokens. "
                    f"Please reduce the input length.",
                    400
                )
                return
            else:
                # 自动调整 max_tokens
                logging.info(f"[Info] Adjusting max_tokens: input={estimated_input_tokens}, "
                      f"requested_output={requested_max_tokens}, available={available_for_output}")
                payload["max_tokens"] = min(requested_max_tokens, available_for_output)

        logging.info(f"[Request] Estimated input tokens: {estimated_input_tokens}, max_tokens: {payload.get('max_tokens', 'not set')}")

        # 记录请求（hybrid 模式）
        # 注意：native 路径的计数在 handle_messages_native() 中进行，避免重复计数
        # hybrid 模式下使用 codebuddy provider 时记录请求
        if current_provider == "hybrid" and active_provider == "codebuddy" and quota_manager:
            quota_manager.record_request()

        try:
            if stream:
                self.handle_stream_passthrough(payload, original_model, active_client, active_provider)
            else:
                self.handle_non_stream_passthrough(payload, original_model, active_client, active_provider)
        except Exception as e:
            error_str = str(e)
            logging.error(f"[Error] {error_str}")
            traceback.print_exc()

            # 检测是否是额度用尽错误
            if is_quota_exhausted_error(0, error_str):
                logging.error(f"[Error] 检测到额度用尽错误")
                self.send_error_response(
                    "rate_limit_error",
                    "API 额度已用尽。请前往 https://codebuddy.woa.com/dashboard 查看使用详情或申请临时提额。",
                    429
                )
            else:
                self.send_error_response("api_error", error_str, 500)

    def handle_messages_native(self, request_data: Dict, client):
        """处理 Native API 请求 - 透传模式

        Args:
            request_data: 原始请求数据
            client: Native API 客户端 (CodeBuddyNativeClient)
        """
        request_start_time = time.time()
        stream = request_data.get("stream", False)
        original_model = request_data.get("model", "unknown")

        # 只做模型名映射，其他完全透传
        if "model" in request_data:
            request_data["model"] = map_model(original_model, "native")
            if original_model != request_data["model"]:
                logging.info(f"[Native] Model: {original_model} -> {request_data['model']}, Stream: {stream}")
            else:
                logging.info(f"[Native] Model: {original_model}, Stream: {stream}")

        # 过滤系统提示词中的 Anthropic 保留关键字
        # Claude Code v2.1.15+ 会注入 x-anthropic-billing-header，需要移除
        if "system" in request_data:
            request_data["system"] = filter_system_prompt(request_data["system"])

        headers = client._get_headers()
        response_started = False

        # 记录请求（hybrid 模式）
        if current_provider == "hybrid" and quota_manager:
            quota_manager.record_request()

        try:
            response = requests.post(
                client.MESSAGES_ENDPOINT,
                headers=headers,
                json=request_data,
                stream=stream,
                timeout=300
            )

            # 检查是否是额度错误，需要降级 (Hybrid 模式)
            # 使用 is_quota_exhausted_error 检测 429 或响应体中包含额度相关关键词
            if current_provider == "hybrid" and response.status_code != 200:
                error_body = response.text
                if is_quota_exhausted_error(response.status_code, error_body):
                    logging.info(f"[Hybrid] Native API 额度错误 (status={response.status_code})，尝试降级到 CodeBuddy")
                    quota_manager.mark_native_exhausted(error_body)
                    self._fallback_to_codebuddy(request_data, original_model, stream)
                    return

            if stream and response.status_code == 200:
                # 流式成功响应：直接透传
                self.send_response(response.status_code)
                response_started = True
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")  # HTTP/1.0 需要 close 来标识结束
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                # 直接透传原始字节流
                for line in response.iter_lines():
                    if line:
                        self.wfile.write(line + b"\n")
                    else:
                        self.wfile.write(b"\n")
                    self.wfile.flush()
            else:
                # 非流式响应：提取 data 字段返回标准格式
                # 安全解析 JSON，上游可能返回非 JSON 错误页面
                try:
                    response_data = response.json()
                except (json.JSONDecodeError, ValueError):
                    # 上游返回非 JSON，直接透传原始内容
                    error_text = response.text[:500]  # 截断避免日志过长
                    logging.warning(f"[Native] Upstream returned non-JSON (status={response.status_code}): {error_text}")
                    body = response.content
                    self.send_response(response.status_code)
                    response_started = True
                    content_type = response.headers.get("Content-Type", "text/plain")
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", len(body))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
                    self.wfile.flush()
                    return

                # 服务端包装格式: {"type":"success","data":{...},"metadata":{...}}
                # 提取 data 字段作为标准 Anthropic 响应
                if response.status_code == 200 and response_data.get("type") == "success" and "data" in response_data:
                    result = response_data["data"]
                else:
                    # 错误响应或其他格式，直接返回
                    result = response_data

                body = json.dumps(result).encode()
                self.send_response(response.status_code)
                response_started = True
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", len(body))
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()

            total_time = time.time() - request_start_time
            logging.info(f"[Native] Completed in {total_time:.1f}s, status={response.status_code}")

        except requests.exceptions.Timeout:
            logging.error(f"[Native Error] Request timeout")
            if not response_started:
                self.send_error_response("api_error", "Request timeout", 504)
        except requests.exceptions.ConnectionError as e:
            logging.error(f"[Native Error] Connection error: {e}")
            if not response_started:
                self.send_error_response("api_error", f"Connection error: {e}", 502)
        except requests.exceptions.ChunkedEncodingError as e:
            # 流式传输过程中上游连接断开
            logging.warning(f"[Native] Upstream connection closed: {e}")
        except (BrokenPipeError, ConnectionResetError):
            # 客户端断开连接
            logging.info(f"[Native] Client disconnected")
        except Exception as e:
            error_str = str(e)
            logging.error(f"[Native Error] {error_str}")
            traceback.print_exc()
            if not response_started:
                self.send_error_response("api_error", error_str, 500)

    def _fallback_to_codebuddy(self, request_data: Dict, original_model: str, stream: bool):
        """降级到 CodeBuddy API (Hybrid 模式)

        Args:
            request_data: 原始 Anthropic 格式请求数据
            original_model: 原始模型名
            stream: 客户端是否请求流式响应
        """
        try:
            # 重新从原始请求构建 CodeBuddy 格式的 payload
            fallback_model = map_model(original_model, "codebuddy")
            system_from_messages, converted_messages, has_images = convert_anthropic_messages(
                request_data["messages"], "codebuddy"
            )

            # CodeBuddy API 要求流式，无论客户端是否请求流式
            # handle_non_stream_passthrough 内部也是使用流式 API 收集完整响应
            fallback_payload = {
                "model": fallback_model,
                "messages": [],
                "stream": True,  # CodeBuddy 要求流式
            }

            # 处理 system prompt（可能是字符串或 content blocks 数组）
            system = normalize_system_prompt(request_data.get("system"))
            system_prompt = system or system_from_messages
            if system_prompt:
                # 清理敏感内容
                system_prompt = sanitize_for_codebuddy(system_prompt)
                fallback_payload["messages"].append({"role": "system", "content": system_prompt})
            fallback_payload["messages"].extend(converted_messages)
            
            # 清理所有消息中的敏感内容
            for msg in fallback_payload["messages"]:
                content = msg.get("content")
                if isinstance(content, str):
                    msg["content"] = sanitize_for_codebuddy(content)
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            item["text"] = sanitize_for_codebuddy(item.get("text", ""))

            # 透传所有参数（与正常路径保持一致）
            if "max_tokens" in request_data:
                fallback_payload["max_tokens"] = request_data["max_tokens"]
            if "temperature" in request_data:
                fallback_payload["temperature"] = request_data["temperature"]
            if "top_p" in request_data:
                fallback_payload["top_p"] = request_data["top_p"]
            if "stop_sequences" in request_data:
                fallback_payload["stop"] = request_data["stop_sequences"]

            # 转换并透传 tools（只有非空时才设置，避免发送 null）
            if "tools" in request_data:
                converted_tools = convert_anthropic_tools(request_data["tools"])
                if converted_tools:
                    fallback_payload["tools"] = converted_tools

            # 转换并透传 tool_choice
            if "tool_choice" in request_data:
                fallback_payload["tool_choice"] = convert_tool_choice(request_data["tool_choice"])

            # 处理 thinking 参数（extended thinking 功能）
            if "thinking" in request_data:
                thinking_config = request_data["thinking"]
                if thinking_config.get("type") == "enabled":
                    fallback_payload["reasoning_effort"] = "high"
                    fallback_payload["reasoning_summary"] = "auto"

            logging.info(f"[Hybrid] 降级重试: {original_model} -> {fallback_model}, stream={stream}")

            # 根据客户端请求决定响应方式
            if stream:
                self.handle_stream_passthrough(fallback_payload, original_model, codebuddy_client, "codebuddy")
            else:
                self.handle_non_stream_passthrough(fallback_payload, original_model, codebuddy_client, "codebuddy")
        except Exception as fallback_e:
            logging.error(f"[Hybrid] 降级重试失败: {fallback_e}")
            traceback.print_exc()
            self.send_error_response("api_error", str(fallback_e), 500)

    def handle_non_stream_passthrough(self, payload: Dict, original_model: str, client=None, provider: str = None):
        """处理非流式响应 - 透传方式（内部使用流式 API 收集完整响应）

        Args:
            payload: 请求 payload
            original_model: 原始模型名
            client: 使用的客户端，None 则使用 self.client
            provider: 使用的 provider 名称，用于日志
        """
        # 使用传入的客户端或默认客户端
        active_client = client if client is not None else self.client
        provider_name = provider or current_provider

        request_start_time = time.time()
        logging.info(f"[Non-Stream] Starting request to {provider_name}...")

        headers = active_client._get_headers()
        data = json.dumps(payload).encode("utf-8")

        # 调试：打印发送给 CodeBuddy API 的请求
        logging.debug(f"[Debug] Payload size: {len(data)} bytes")

        req = urllib.request.Request(
            active_client.CHAT_ENDPOINT,
            data=data,
            method="POST"
        )
        
        for k, v in headers.items():
            req.add_header(k, v)
        
        full_response = []
        thinking_response = []  # 收集 thinking 内容
        tool_calls = {}  # 使用 dict，key 为 index
        finish_reason = "stop"
        usage_info = {"prompt_tokens": 0, "completion_tokens": 0}  # 从响应中提取的 usage

        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                for line in response:
                    line = line.decode("utf-8").strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choice = chunk.get("choices", [{}])[0]
                            delta = choice.get("delta", {})

                            # 提取 usage 信息（通常在最后一个 chunk）
                            if "usage" in chunk:
                                usage_info = chunk["usage"]

                            # 收集 thinking/reasoning 内容
                            reasoning_content = delta.get("reasoning_content") or delta.get("thinking") or ""
                            if reasoning_content:
                                thinking_response.append(reasoning_content)

                            # 收集文本内容
                            content = delta.get("content", "")
                            if content:
                                full_response.append(content)
                            
                            # 收集 tool_calls（CodeBuddy 返回的是数组，可能为空）
                            delta_tool_calls = delta.get("tool_calls", [])
                            for tc in delta_tool_calls:
                                idx = tc.get("index", 0)
                                if idx not in tool_calls:
                                    tool_calls[idx] = {"id": "", "name": "", "arguments": ""}
                                
                                # 收集 id（只在首次出现）
                                if tc.get("id"):
                                    tool_calls[idx]["id"] = normalize_tool_call_id(tc["id"])
                                
                                # 收集 function 信息
                                func = tc.get("function", {})
                                if func.get("name"):
                                    tool_calls[idx]["name"] = func["name"]
                                if func.get("arguments"):
                                    tool_calls[idx]["arguments"] += func["arguments"]
                            
                            # 获取 finish_reason
                            if choice.get("finish_reason"):
                                finish_reason = choice["finish_reason"]
                        except json.JSONDecodeError:
                            continue
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            logging.error(f"[Error] CodeBuddy API Error: {e.code} {e.reason}")
            logging.error(f"[Error] Error body: {error_body}")

            # 检测是否是额度用尽错误，提供更友好的错误消息
            if is_quota_exhausted_error(e.code, error_body):
                raise Exception(f"API 额度已用尽 (HTTP {e.code}): {error_body}")
            else:
                raise Exception(f"CodeBuddy API error {e.code}: {error_body}")
        
        # 构建 Anthropic 格式的响应
        content_blocks = []

        # 添加 thinking 内容（如果有）
        thinking_text = "".join(thinking_response)
        if thinking_text:
            content_blocks.append({
                "type": "thinking",
                "thinking": thinking_text,
            })

        # 添加文本内容
        text_content = "".join(full_response)
        if text_content:
            content_blocks.append({
                "type": "text",
                "text": text_content,
            })
        
        # 添加 tool_use 内容（从 dict 转换）
        for idx in sorted(tool_calls.keys()):
            tc = tool_calls[idx]
            if tc["name"]:
                logging.debug(f"[Debug] Tool call {idx}: name={tc['name']}, raw_arguments={repr(tc['arguments'])}")
                try:
                    arguments = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError as e:
                    logging.error(f"[Error] JSON decode error for tool {tc['name']}: {e}, raw={repr(tc['arguments'])}")
                    # 尝试修复常见的 JSON 问题
                    try:
                        # 有时候 arguments 可能被截断或有额外字符
                        fixed_args = tc["arguments"].strip()
                        if fixed_args and not fixed_args.endswith('}'):
                            fixed_args += '}'
                        arguments = json.loads(fixed_args) if fixed_args else {}
                        logging.info(f"[Info] Fixed JSON for tool {tc['name']}")
                    except json.JSONDecodeError:
                        # 实在无法解析，返回原始字符串作为错误信息
                        arguments = {"_raw_arguments": tc["arguments"], "_parse_error": str(e)}
                        logging.error(f"[Error] Cannot fix JSON for tool {tc['name']}, using raw value")
                logging.debug(f"[Debug] Tool call {idx}: parsed_arguments={arguments}")
                content_blocks.append({
                    "type": "tool_use",
                    "id": normalize_tool_call_id(tc["id"]),
                    "name": tc["name"],
                    "input": arguments,
                })
        
        # 确定 stop_reason
        if tool_calls:
            stop_reason = "tool_use"
        elif finish_reason == "stop":
            stop_reason = "end_turn"
        elif finish_reason == "length":
            stop_reason = "max_tokens"
        else:
            stop_reason = "end_turn"
        
        # 获取 token 数（优先使用响应中的真实值，否则估算）
        if usage_info and usage_info.get("prompt_tokens"):
            input_tokens = usage_info["prompt_tokens"]
        else:
            input_tokens = self._estimate_tokens(payload.get("messages", []))

        if usage_info and usage_info.get("completion_tokens"):
            output_tokens = usage_info["completion_tokens"]
        else:
            output_tokens = len(text_content) // 4
        
        response_data = {
            "id": f"msg_{uuid.uuid4().hex[:24]}",
            "type": "message",
            "role": "assistant",
            "content": content_blocks if content_blocks else [{"type": "text", "text": ""}],
            "model": original_model,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            },
        }

        # 打印完成统计
        total_time = time.time() - request_start_time
        logging.info(f"[Non-Stream] Completed in {total_time:.1f}s")
        logging.info(f"[Non-Stream] Output: {len(text_content)} chars, {len(tool_calls)} tools, stop={stop_reason}")
        # 如果输出很短（可能是敏感内容提示），打印完整内容以便调试
        if len(text_content) < 100:
            logging.info(f"[Non-Stream] Content: {text_content}")
        if thinking_text:
            logging.info(f"[Non-Stream] Thinking: {len(thinking_text)} chars")
        logging.info("=" * 60)

        self.send_json_response(response_data)
    
    def _estimate_tokens(self, content) -> int:
        """估算 token 数"""
        if isinstance(content, str):
            return len(content) // 4
        elif isinstance(content, list):
            total = 0
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        total += len(item.get("text", "")) // 4
                    elif item.get("type") == "image_url":
                        total += 1000  # 图片估算 1000 tokens
                    elif "role" in item:
                        # 这是一条消息
                        total += self._estimate_tokens(item.get("content", ""))
            return total
        return 0
    
    def handle_stream_passthrough(self, payload: Dict, original_model: str, client=None, provider: str = None):
        """处理流式响应 - 透传方式，支持 tool_use

        Args:
            payload: 请求 payload
            original_model: 原始模型名
            client: 使用的客户端，None 则使用 self.client
            provider: 使用的 provider 名称，用于日志
        """
        # 使用传入的客户端或默认客户端
        active_client = client if client is not None else self.client
        provider_name = provider or current_provider

        stream_start_time = time.time()
        logging.info(f"[Stream] Starting stream request to {provider_name}...")

        # 发送响应头
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        message_id = f"msg_{uuid.uuid4().hex[:24]}"

        # 发送 message_start 事件
        message_start = {
            "type": "message_start",
            "message": {
                "id": message_id,
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": original_model,
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {
                    "input_tokens": self._estimate_tokens(payload.get("messages", [])),
                    "output_tokens": 0,
                },
            },
        }
        self.wfile.write(create_stream_event("message_start", message_start).encode())
        self.wfile.flush()

        headers = active_client._get_headers()
        data = json.dumps(payload).encode("utf-8")

        # 调试：打印发送给 CodeBuddy API 的请求
        logging.debug(f"[Debug] Stream payload size: {len(data)} bytes")
        logging.debug(f"[Debug] Calling {provider_name} API...")

        req = urllib.request.Request(
            active_client.CHAT_ENDPOINT,
            data=data,
            method="POST"
        )
        
        for k, v in headers.items():
            req.add_header(k, v)
        
        full_response = []
        thinking_response = []  # 收集 thinking 内容
        # tool_calls 结构: {index: {"id": "", "name": "", "arguments": "", "started": False, "block_index": -1}}
        tool_calls = {}
        content_block_started = False
        thinking_block_started = False  # thinking block 是否已开始
        text_block_index = -1  # text block 的 index，在首次创建时设置
        thinking_block_index = -1  # thinking block 的 index，在首次创建时设置
        finish_reason = "stop"
        usage_info = {"prompt_tokens": 0, "completion_tokens": 0}  # 从响应中提取的 usage
        # 动态计算下一个 content block 的 index
        next_block_index = 0
        stream_done = False  # 标记流是否已结束

        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                buffer = b""
                while True:
                    chunk = response.read(1024)
                    if not chunk:
                        break

                    buffer += chunk
                    lines = buffer.split(b"\n")
                    buffer = lines[-1]

                    for line in lines[:-1]:
                        line = line.decode("utf-8").strip()
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:]
                        if data_str == "[DONE]":
                            stream_done = True
                            break

                        try:
                            chunk_data = json.loads(data_str)
                            choice = chunk_data.get("choices", [{}])[0]
                            delta = choice.get("delta", {})

                            # 提取 usage 信息（通常在最后一个 chunk）
                            if "usage" in chunk_data:
                                usage_info = chunk_data["usage"]

                            # 处理 thinking/reasoning 内容
                            # CodeBuddy 使用 reasoning_content 字段返回思考过程
                            thinking_content = delta.get("reasoning_content") or delta.get("thinking") or ""
                            if thinking_content:
                                # 如果还没开始 thinking_block，先发送 content_block_start
                                if not thinking_block_started:
                                    thinking_block_index = next_block_index
                                    thinking_block_start = {
                                        "type": "content_block_start",
                                        "index": thinking_block_index,
                                        "content_block": {
                                            "type": "thinking",
                                            "thinking": "",
                                        },
                                    }
                                    self.wfile.write(create_stream_event("content_block_start", thinking_block_start).encode())
                                    self.wfile.flush()
                                    thinking_block_started = True
                                    next_block_index += 1
                                    logging.info(f"[Stream] Thinking block started at index {thinking_block_index}")

                                thinking_response.append(thinking_content)
                                # 每收到 10 个 thinking chunks 打印一次进度
                                if len(thinking_response) % 10 == 1:
                                    logging.info(f"[Stream] Thinking progress: {len(thinking_response)} chunks")
                                thinking_delta_event = {
                                    "type": "content_block_delta",
                                    "index": thinking_block_index,
                                    "delta": {
                                        "type": "thinking_delta",
                                        "thinking": thinking_content,
                                    },
                                }
                                self.wfile.write(create_stream_event("content_block_delta", thinking_delta_event).encode())
                                self.wfile.flush()

                            # 处理文本内容
                            content = delta.get("content", "")
                            if content:
                                # 如果还没开始 content_block，先发送 content_block_start
                                if not content_block_started:
                                    text_block_index = next_block_index
                                    content_block_start = {
                                        "type": "content_block_start",
                                        "index": text_block_index,
                                        "content_block": {
                                            "type": "text",
                                            "text": "",
                                        },
                                    }
                                    self.wfile.write(create_stream_event("content_block_start", content_block_start).encode())
                                    self.wfile.flush()
                                    content_block_started = True
                                    next_block_index += 1
                                    logging.info(f"[Stream] Content block started at index {text_block_index}")

                                full_response.append(content)
                                # 每收到 20 个 content chunks 打印一次进度
                                if len(full_response) % 20 == 1:
                                    elapsed = time.time() - stream_start_time
                                    logging.info(f"[Stream] Content progress: {len(full_response)} chunks, {elapsed:.1f}s elapsed")
                                delta_event = {
                                    "type": "content_block_delta",
                                    "index": text_block_index,
                                    "delta": {
                                        "type": "text_delta",
                                        "text": content,
                                    },
                                }
                                self.wfile.write(create_stream_event("content_block_delta", delta_event).encode())
                                self.wfile.flush()
                            
                            # 处理 tool_calls（CodeBuddy 返回的是数组，可能为空）
                            # 实时发送 tool_use content blocks
                            delta_tool_calls = delta.get("tool_calls", [])
                            for tc in delta_tool_calls:
                                idx = tc.get("index", 0)
                                if idx not in tool_calls:
                                    tool_calls[idx] = {
                                        "id": "",
                                        "name": "",
                                        "arguments": "",
                                        "started": False,
                                        "block_index": -1
                                    }

                                # 收集 id（只在首次出现）
                                if tc.get("id"):
                                    tool_calls[idx]["id"] = normalize_tool_call_id(tc["id"])

                                # 收集 function 信息
                                func = tc.get("function", {})
                                if func.get("name"):
                                    tool_calls[idx]["name"] = func["name"]

                                # 先累积 arguments（在发送 block_start 之前可能已经收到部分 arguments）
                                if func.get("arguments"):
                                    new_args = func["arguments"]
                                    current_args = tool_calls[idx]["arguments"]
                                    
                                    # 检测多 JSON 对象拼接（CodeBuddy bug：同一个 tool_call 返回多个完整 JSON）
                                    # 当前参数以 } 结尾，新参数以 { 开头，说明是新的 JSON 对象
                                    if current_args.rstrip().endswith("}") and new_args.lstrip().startswith("{"):
                                        logging.warning(f"[Stream] Detected multiple JSON objects concatenated at tool {idx}, ignoring extra content")
                                        tool_calls[idx]["completed"] = True
                                    elif not tool_calls[idx].get("completed"):
                                        tool_calls[idx]["arguments"] += new_args

                                # 当收到 id 和 name 后，立即发送 content_block_start
                                if (tool_calls[idx]["id"] and tool_calls[idx]["name"]
                                        and not tool_calls[idx]["started"]):
                                    tool_calls[idx]["block_index"] = next_block_index
                                    tool_calls[idx]["started"] = True
                                    next_block_index += 1

                                    tool_block_start = {
                                        "type": "content_block_start",
                                        "index": tool_calls[idx]["block_index"],
                                        "content_block": {
                                            "type": "tool_use",
                                            "id": normalize_tool_call_id(tool_calls[idx]["id"]),
                                            "name": tool_calls[idx]["name"],
                                            "input": {},
                                        },
                                    }
                                    self.wfile.write(create_stream_event("content_block_start", tool_block_start).encode())
                                    self.wfile.flush()
                                    logging.info(f"[Stream] Tool block started: {tool_calls[idx]['name']} at index {tool_calls[idx]['block_index']}")

                                    # 补发之前累积的 arguments（在 block_start 之前到达的部分）
                                    if tool_calls[idx]["arguments"]:
                                        input_delta = {
                                            "type": "content_block_delta",
                                            "index": tool_calls[idx]["block_index"],
                                            "delta": {
                                                "type": "input_json_delta",
                                                "partial_json": tool_calls[idx]["arguments"],
                                            },
                                        }
                                        self.wfile.write(create_stream_event("content_block_delta", input_delta).encode())
                                        self.wfile.flush()

                                # 实时发送新到达的 arguments 片段（只发送本次收到的，之前累积的已在 block_start 后补发）
                                elif func.get("arguments") and tool_calls[idx]["started"] and not tool_calls[idx].get("completed"):
                                    input_delta = {
                                        "type": "content_block_delta",
                                        "index": tool_calls[idx]["block_index"],
                                        "delta": {
                                            "type": "input_json_delta",
                                            "partial_json": func["arguments"],
                                        },
                                    }
                                    self.wfile.write(create_stream_event("content_block_delta", input_delta).encode())
                                    self.wfile.flush()

                            # 获取 finish_reason
                            if choice.get("finish_reason"):
                                finish_reason = choice["finish_reason"]

                        except json.JSONDecodeError:
                            continue

                    # 如果收到 [DONE]，跳出外层循环
                    if stream_done:
                        break

            # 关闭 thinking content_block（如果有）
            if thinking_block_started:
                thinking_block_stop = {
                    "type": "content_block_stop",
                    "index": thinking_block_index,
                }
                self.wfile.write(create_stream_event("content_block_stop", thinking_block_stop).encode())
                self.wfile.flush()

            # 关闭文本 content_block（如果有）
            if content_block_started:
                content_block_stop = {
                    "type": "content_block_stop",
                    "index": text_block_index,
                }
                self.wfile.write(create_stream_event("content_block_stop", content_block_stop).encode())
                self.wfile.flush()

            # 关闭所有 tool_use content blocks
            for idx in sorted(tool_calls.keys()):
                tc = tool_calls[idx]
                if tc["started"]:
                    logging.info(f"[Stream] Tool call {idx} completed: name={tc['name']}, arguments_len={len(tc['arguments'])}")
                    tool_block_stop = {
                        "type": "content_block_stop",
                        "index": tc["block_index"],
                    }
                    self.wfile.write(create_stream_event("content_block_stop", tool_block_stop).encode())
                    self.wfile.flush()
            
        except (BrokenPipeError, ConnectionResetError):
            logging.info(f"[Stream] Client disconnected")
            return
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            logging.error(f"[Stream Error] CodeBuddy API Error: {e.code} {e.reason}")
            logging.error(f"[Stream Error] Error body: {error_body}")

            # 检测是否是额度用尽错误
            if is_quota_exhausted_error(e.code, error_body):
                logging.error(f"[Stream Error] 检测到额度用尽错误")
                error_message = "API 额度已用尽。请前往 https://codebuddy.woa.com/dashboard 查看使用详情或申请临时提额。"
            else:
                error_message = f"CodeBuddy API error {e.code}: {error_body}"

            try:
                error_event = {
                    "type": "error",
                    "error": {
                        "type": "rate_limit_error" if is_quota_exhausted_error(e.code, error_body) else "api_error",
                        "message": error_message,
                    },
                }
                self.wfile.write(create_stream_event("error", error_event).encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                logging.info(f"[Stream] Client disconnected while sending error response")
            return
        except Exception as e:
            logging.error(f"[Stream Error] {e}")
            traceback.print_exc()
            try:
                error_event = {
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": str(e),
                    },
                }
                self.wfile.write(create_stream_event("error", error_event).encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                logging.info(f"[Stream] Client disconnected while sending error response")
            return
        
        # 确定 stop_reason
        if tool_calls and any(tc.get("started") for tc in tool_calls.values()):
            stop_reason = "tool_use"
        elif finish_reason == "stop":
            stop_reason = "end_turn"
        elif finish_reason == "length":
            stop_reason = "max_tokens"
        elif finish_reason == "tool_calls":
            stop_reason = "tool_use"
        else:
            stop_reason = "end_turn"
        
        # 发送 message_delta 事件
        # 优先使用响应中的真实 usage，否则估算
        if usage_info and usage_info.get("completion_tokens"):
            output_tokens = usage_info["completion_tokens"]
        else:
            output_tokens = len("".join(full_response)) // 4
        message_delta = {
            "type": "message_delta",
            "delta": {
                "stop_reason": stop_reason,
                "stop_sequence": None,
            },
            "usage": {
                "output_tokens": output_tokens,
            },
        }
        self.wfile.write(create_stream_event("message_delta", message_delta).encode())
        self.wfile.flush()
        
        # 发送 message_stop 事件
        message_stop = {
            "type": "message_stop",
        }
        self.wfile.write(create_stream_event("message_stop", message_stop).encode())
        self.wfile.flush()

        # 打印完成统计
        total_time = time.time() - stream_start_time
        total_chars = len("".join(full_response))
        thinking_chars = len("".join(thinking_response))
        logging.info(f"[Stream] Completed in {total_time:.1f}s")
        logging.info(f"[Stream] Output: {total_chars} chars, {len(tool_calls)} tools, stop={stop_reason}")
        # 如果输出很短（可能是敏感内容提示），打印完整内容以便调试
        if total_chars < 100:
            logging.info(f"[Stream] Content: {''.join(full_response)}")
        if thinking_chars > 0:
            logging.info(f"[Stream] Thinking: {thinking_chars} chars")
        logging.info("=" * 60)


class ThreadedHTTPServer(HTTPServer):
    """支持多线程的 HTTP 服务器"""
    
    def process_request(self, request, client_address):
        """在新线程中处理请求"""
        thread = threading.Thread(target=self.process_request_thread, args=(request, client_address))
        thread.daemon = True
        thread.start()
    
    def process_request_thread(self, request, client_address):
        """处理请求的线程函数"""
        try:
            self.finish_request(request, client_address)
        except ConnectionResetError:
            # 客户端提前关闭连接（如 fire-and-forget 模式的日志请求），静默忽略
            pass
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def load_token_from_git_credentials() -> Optional[str]:
    """从 ~/.git-credentials 读取 OAuth Token

    Returns:
        OAuth Token 字符串，如果未找到则返回 None
    """
    from urllib.parse import urlparse

    git_credentials_path = os.path.expanduser("~/.git-credentials")
    if not os.path.exists(git_credentials_path):
        return None

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
    except Exception as e:
        logging.debug(f"读取 ~/.git-credentials 失败: {e}")

    return None


def initialize_key_manager() -> bool:
    """初始化 KeyManager 和后台线程（用于 native/hybrid 模式）

    Token 获取优先级（与 codebuddy_native_api._get_oauth_token 对齐）:
        1. 环境变量 CODEBUDDY_OAUTH_TOKEN (静态，不刷新)
        2. ~/.git-credentials (IOA 登录，静态，不刷新)
        3. ~/.claude-internal/config.json (claude-internal，动态，需要刷新)

    前两种为静态 token 模式（expiresAt=0），不启动后台刷新线程。
    只有 config.json 模式才会启动完整的刷新机制。

    Returns:
        True 如果成功加载了有效的 token，False 否则
    """
    global key_manager, oauth_config

    logging.info("正在初始化 Key Manager...")

    # 创建 KeyManager
    key_manager = KeyManager()

    # 创建 OAuth 配置
    oauth_config = OAuthConfig()

    # 标记是否使用静态 token 模式（环境变量或 git-credentials）
    use_static_token = False
    # 标记是否成功加载了 token
    token_loaded = False

    # ==================== 优先级 1: 环境变量 CODEBUDDY_OAUTH_TOKEN ====================
    env_token = os.environ.get("CODEBUDDY_OAUTH_TOKEN")
    if env_token:
        initial_key = {
            "accessToken": env_token.strip(),
            "refreshToken": "",  # 无 refreshToken，无法自动刷新
            "expiresAt": 0,  # 0 表示无过期时间，由外部管理
        }
        key_manager.set_if_newer(initial_key)
        logging.info("  已从环境变量 CODEBUDDY_OAUTH_TOKEN 加载 OAuth Token (静态模式)")
        use_static_token = True
        token_loaded = True

    # ==================== 优先级 2: ~/.git-credentials (IOA 登录) ====================
    if not token_loaded:
        token = load_token_from_git_credentials()
        if token:
            # 构造一个 key 结构（没有 refreshToken，无过期时间）
            # ~/.git-credentials 中的 token 由 IOA 管理，没有过期时间信息
            # expiresAt 设为 0 表示"永不过期"（实际有效性由服务端控制）
            initial_key = {
                "accessToken": token,
                "refreshToken": "",  # 无 refreshToken，无法自动刷新
                "expiresAt": 0,  # 0 表示无过期时间，由 IOA 管理
            }
            key_manager.set_if_newer(initial_key)
            logging.info("  已从 ~/.git-credentials 加载 OAuth Token (IOA 管理，静态模式)")
            use_static_token = True
            token_loaded = True

    # ==================== 优先级 3: ~/.claude-internal/config.json ====================
    if not token_loaded:
        try:
            initial_key = key_manager.load_from_file()
            key_manager.set_if_newer(initial_key)
            token_loaded = True

            # 检查是否临期
            if key_manager.needs_refresh(initial_key):
                logging.warning(f"  Key 即将过期（{initial_key['expiresAt']}），将在后台刷新")
            else:
                logging.info(f"  Key 有效期至: {initial_key['expiresAt']} (动态模式，支持自动刷新)")

        except FileNotFoundError:
            logging.warning("  未找到任何 OAuth Token，请:")
            logging.warning("    - 设置环境变量: export CODEBUDDY_OAUTH_TOKEN='your-token'")
            logging.warning("    - 或通过 IOA 登录 (生成 ~/.git-credentials)")
            logging.warning("    - 或运行 claude-internal 完成认证 (生成 ~/.claude-internal/config.json)")
        except Exception as e:
            logging.warning(f"  加载 config.json 失败: {e}")

    # 只有使用 ~/.claude-internal/config.json 时才启动后台线程
    # 环境变量和 ~/.git-credentials 模式下无需刷新和监控
    if token_loaded and not use_static_token:
        refresh_thread = threading.Thread(
            target=refresh_loop,
            args=(key_manager, oauth_config),
            daemon=True,
            name="KeyRefreshLoop"
        )
        refresh_thread.start()
        logging.info("  后台刷新线程已启动")

        watcher_thread = threading.Thread(
            target=file_watcher_loop,
            args=(key_manager,),
            daemon=True,
            name="KeyFileWatcher"
        )
        watcher_thread.start()
        logging.info("  文件监控线程已启动（5秒轮询）")

    return token_loaded


def main():
    global current_provider, quota_manager, codebuddy_client, native_client, key_manager, oauth_config

    parser = argparse.ArgumentParser(
        description="Anthropic API 兼容服务器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --provider native        # 使用 Native API (推荐，需要 IOA 登录)
  %(prog)s                          # 使用 CodeBuddy API (默认)
  %(prog)s --provider hybrid        # 使用 Hybrid API (优先 Native，自动降级到 CodeBuddy)
  %(prog)s --port 9000              # 监听端口 9000
  %(prog)s --host 127.0.0.1         # 只监听本地

API 端点:
  POST /v1/messages     - Anthropic Messages API
  GET  /v1/models       - 列出可用模型
  GET  /health          - 健康检查
  GET  /v1/quota        - 查看额度状态 (hybrid 模式)
  POST /v1/quota/reset  - 手动重置额度 (hybrid 模式)

Provider:
  native (推荐):      使用 Native API，原生 Anthropic 格式，无需协议转换
                      认证: IOA 登录后自动从 ~/.git-credentials 读取 OAuth Token
  codebuddy (默认):   使用 CodeBuddy API，需要本地认证文件，需要协议转换
  hybrid:             优先使用 Native API，额度用完时自动切换到 CodeBuddy API

模型映射 (native/hybrid):
  opus/claude-3-opus-*     -> claude-4.5-opus
  sonnet/claude-*-sonnet-* -> claude-4.5-sonnet
  haiku/claude-*-haiku-*   -> claude-4.5-sonnet

模型映射 (codebuddy):
  opus/claude-3-opus-*     -> claude-opus-4.5
  sonnet/claude-*-sonnet-* -> claude-4.5
  haiku/claude-*-haiku-*   -> claude-haiku-4.5

测试:
  curl http://localhost:8080/health

  curl -X POST http://localhost:8080/v1/messages \\
    -H "Content-Type: application/json" \\
    -d '{
      "model": "sonnet",
      "max_tokens": 1024,
      "messages": [{"role": "user", "content": "Hello!"}]
    }'
""",
    )

    parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080, help="监听端口 (默认: 8080)")
    parser.add_argument("--provider", choices=["codebuddy", "hybrid", "native"], default="codebuddy",
                        help="API provider: native (推荐), codebuddy (默认), 或 hybrid")
    parser.add_argument("--quota-file", default=None,
                        help="额度状态文件路径 (hybrid 模式使用，默认: 脚本目录下的 quota_state.json)")
    parser.add_argument("--log-file", default=None,
                        help="日志文件路径 (默认: 脚本目录下的 anthropic_server.log)")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        help="日志级别 (默认: INFO)")

    args = parser.parse_args()

    # 初始化日志
    log_file = setup_logging(args.log_file, args.log_level)

    # 处理配额文件默认路径（与日志文件一样，基于脚本目录）
    if args.quota_file is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        args.quota_file = os.path.join(script_dir, "quota_state.json")

    # 设置全局 provider 类型
    current_provider = args.provider

    # 根据 provider 初始化客户端
    try:
        if args.provider == "native":
            logging.info("正在初始化 Native API 模式 (Anthropic 原生格式)...")

            # 初始化 KeyManager（自动刷新和热读取）
            if not initialize_key_manager():
                logging.error("Native 模式初始化失败: 未找到有效的 OAuth Token")
                logging.error("请先通过 IOA 登录或运行 claude-internal 完成认证")
                sys.exit(1)

            # 使用 KeyManager 创建客户端
            native_client = CodeBuddyNativeClient(key_manager=key_manager)
            logging.info(f"  端点: {native_client.MESSAGES_ENDPOINT}")
            logging.info(f"  特性: 无需协议转换，直接透传 Anthropic 格式")
            logging.info(f"  Key 管理: 自动刷新 + 热读取")
            # Native 模式不需要设置 AnthropicHandler.client

        elif args.provider == "hybrid":
            logging.info("正在初始化 Hybrid API 模式 (优先 Native，降级到 CodeBuddy)...")

            # 初始化 KeyManager（自动刷新和热读取）
            native_available = initialize_key_manager()
            if not native_available:
                logging.warning("  Native API 不可用 (未找到 OAuth Token)，将仅使用 CodeBuddy API")

            # 初始化 Native API 客户端（主要使用，使用 KeyManager）
            if native_available:
                logging.info("  初始化 Native API 客户端...")
                native_client = CodeBuddyNativeClient(key_manager=key_manager)
                logging.info(f"    端点: {native_client.MESSAGES_ENDPOINT}")
                logging.info(f"    Key 管理: 自动刷新 + 热读取")

            # 初始化 CodeBuddy 客户端（降级使用）
            logging.info("  初始化 CodeBuddy 客户端 (降级备用)...")
            codebuddy_client = CodeBuddyClient()
            logging.info(f"    用户ID: {codebuddy_client.user_id}")
            logging.info(f"    企业ID: {codebuddy_client.enterprise_id}")

            # 初始化额度管理器
            logging.info(f"  初始化额度管理器 (文件: {args.quota_file})...")
            quota_manager = QuotaManager(args.quota_file)
            status = quota_manager.get_status()
            if status["native_api"]["quota_exhausted"]:
                logging.info(f"    Native API 额度已用完，将使用 CodeBuddy API")
                logging.info(f"    重置时间: {status['native_api']['reset_at']}")
            else:
                logging.info(f"    Native API 额度可用")

        else:
            logging.info("正在初始化 CodeBuddy 客户端...")
            AnthropicHandler.client = CodeBuddyClient()
            logging.info(f"  用户ID: {AnthropicHandler.client.user_id}")
            logging.info(f"  企业ID: {AnthropicHandler.client.enterprise_id}")
            # 尝试初始化 Native 客户端用于 count_tokens
            try:
                native_client = CodeBuddyNativeClient()
                logging.info(f"  Native API (count_tokens): OAuth Token {native_client.oauth_token[:8]}***")
            except (AuthenticationError, Exception) as e:
                logging.info(f"  Native API (count_tokens): 不可用，将使用本地估算 ({e})")
    except FileNotFoundError as e:
        logging.error(f"错误: {e}")
        sys.exit(1)
    except AuthenticationError as e:
        logging.error(f"认证错误: {e}")
        sys.exit(1)
    except SystemExit:
        raise
    except Exception as e:
        logging.error(f"错误: {e}")
        sys.exit(1)

    # 启动服务器
    server = ThreadedHTTPServer((args.host, args.port), AnthropicHandler)

    logging.info(f"Anthropic API 兼容服务器已启动")
    logging.info(f"  Provider: {args.provider}")
    logging.info(f"  地址: http://{args.host}:{args.port}")
    logging.info(f"  日志文件: {log_file}")

    if args.provider == "native":
        logging.info(f"模型映射 (Native API - 原生 Anthropic 格式):")
        logging.info(f"  opus/claude-3-opus-*     -> claude-4.5-opus")
        logging.info(f"  sonnet/claude-*-sonnet-* -> claude-4.5-sonnet")
        logging.info(f"  haiku/claude-*-haiku-*   -> claude-4.5-sonnet")
        logging.info(f"特性: 无需协议转换，直接透传 Anthropic 格式")
    elif args.provider == "hybrid":
        logging.info(f"模型映射 (Hybrid API - 优先 Native 透传，降级到 CodeBuddy):")
        logging.info(f"  opus/claude-3-opus-*     -> claude-4.5-opus (Native) / claude-opus-4.5 (CodeBuddy)")
        logging.info(f"  sonnet/claude-*-sonnet-* -> claude-4.5-sonnet (Native) / claude-4.5 (CodeBuddy)")
        logging.info(f"  haiku/claude-*-haiku-*   -> claude-4.5-sonnet (Native) / claude-haiku-4.5 (CodeBuddy)")
        logging.info(f"特性: Native 模式直接透传 Anthropic 格式，无需协议转换")
        logging.info(f"额度管理:")
        logging.info(f"  GET  /v1/quota       - 查看额度状态")
        logging.info(f"  POST /v1/quota/reset - 手动重置额度")
    else:
        logging.info(f"模型映射 (CodeBuddy API):")
        logging.info(f"  opus/claude-3-opus-*     -> claude-opus-4.5")
        logging.info(f"  sonnet/claude-*-sonnet-* -> claude-4.5")
        logging.info(f"  haiku/claude-*-haiku-*   -> claude-haiku-4.5")

    logging.info(f"按 Ctrl+C 停止服务器")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logging.info("正在关闭服务器...")
        server.shutdown()
        logging.info("服务器已关闭")


if __name__ == "__main__":
    main()
