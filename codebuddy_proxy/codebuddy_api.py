#!/usr/bin/env python3
"""
CodeBuddy API 调用封装库

用法:
    # 作为命令行工具
    python codebuddy_api.py "你的问题"
    python codebuddy_api.py -m claude-sonnet-4.5 "解释递归"
    python codebuddy_api.py --list-models          # 从服务器获取可用模型列表
    
    # 作为库导入
    from codebuddy_api import CodeBuddyClient
    
    client = CodeBuddyClient()
    
    # 获取可用模型
    models = client.get_models()
    for m in models:
        print(f"{m['id']}: {m['name']}")
    
    # 聊天
    response = client.chat("你好")
    print(response)
"""

import json
import os
import sys
import argparse
import platform
from pathlib import Path
from typing import Optional, Iterator, List, Dict, Any
import urllib.request
import urllib.error

# 尝试导入 requests，如果没有则使用 urllib
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class CodeBuddyClient:
    """CodeBuddy API 客户端"""
    
    # API 端点
    CHAT_ENDPOINT = "https://copilot.tencent.com/v2/chat/completions"
    CONFIG_ENDPOINT = "https://copilot.tencent.com/v3/config"
    ENTERPRISE_MODELS_ENDPOINT = "https://copilot.tencent.com/console/enterprises/{enterprise_id}/config/models"
    
    # 默认配置
    DEFAULT_MODEL = "claude-opus-4.5"
    DEFAULT_TEMPERATURE = 0.7
    PRODUCT_VERSION = "2.36.3"
    PRODUCT_NAME = "CodeBuddy"
    PLATFORM = "CLI"
    
    # 默认模型列表 (当无法从服务器获取时使用)
    DEFAULT_MODELS = [
        {"id": "claude-opus-4.5", "name": "Claude-Opus-4.5", "description": "Claude Opus 4.5"},
        {"id": "claude-4.5", "name": "Claude-4.5", "description": "Claude 4.5 (Sonnet)"},
        {"id": "claude-haiku-4.5", "name": "Claude-Haiku-4.5", "description": "Claude Haiku 4.5 (快速)"},
        {"id": "gpt-5.2", "name": "GPT-5.2", "description": "GPT 5.2"},
        {"id": "gpt-5.1", "name": "GPT-5.1", "description": "GPT 5.1"},
        {"id": "gpt-5", "name": "GPT-5", "description": "GPT 5"},
        {"id": "gpt-5-mini", "name": "GPT-5-Mini", "description": "GPT 5 Mini"},
        {"id": "o4-mini", "name": "GPT-4o-Mini", "description": "GPT 4o Mini"},
        {"id": "gemini-2.5-pro", "name": "Gemini-2.5-Pro", "description": "Gemini 2.5 Pro"},
        {"id": "gemini-2.5-flash", "name": "Gemini-2.5-Flash", "description": "Gemini 2.5 Flash"},
        {"id": "deepseek-v3", "name": "DeepSeek-V3", "description": "DeepSeek V3"},
        {"id": "auto-chat", "name": "GLM-4.6", "description": "GLM 4.6"},
    ]
    
    def __init__(
        self,
        auth_file: Optional[Path] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ):
        """
        初始化客户端
        
        Args:
            auth_file: 认证文件路径
            model: 默认模型
            temperature: 默认温度
        """
        self.auth_file = auth_file or self._find_auth_file()
        self.default_model = model or self.DEFAULT_MODEL
        self.default_temperature = temperature or self.DEFAULT_TEMPERATURE
        
        # 加载认证信息
        self._load_auth()
        
        # 缓存模型列表
        self._models_cache = None
    
    @staticmethod
    def _find_auth_file() -> Path:
        """查找认证文件

        按优先级查找以下路径:
            1. 环境变量 CODEBUDDY_AUTH_FILE 指定的路径
            2. ~/.local/share/CodeBuddyExtension/... (Linux)
            3. ~/Library/Application Support/CodeBuddyExtension/... (macOS)
            4. %APPDATA%/Code/... (Windows VS Code 扩展目录)
            5. /data/mm64/$USER/... (特殊环境)
        """
        # 首先检查环境变量
        env_auth_file = os.environ.get("CODEBUDDY_AUTH_FILE")
        if env_auth_file:
            return Path(env_auth_file)

        possible_paths = [
            # Linux 标准路径
            Path.home() / ".local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.copilot.info",
            # macOS 标准路径
            Path.home() / "Library/Application Support/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.copilot.info",
            # Windows 路径 - VS Code 扩展 globalStorage
            Path(os.environ.get("APPDATA", "")) / "Code/User/globalStorage/tencent-cloud.coding-copilot/Data/Public/auth/Tencent-Cloud.copilot.info",
            # Windows 路径 - 工蜂 Copilot
            Path(os.environ.get("APPDATA", "")) / "Code/User/globalStorage/gongfeng.gongfeng-copilot/Data/Public/auth/Tencent-Cloud.copilot.info",
            # Windows 备选路径
            Path(os.environ.get("LOCALAPPDATA", "")) / "CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.copilot.info",
            # 特殊环境路径
            Path("/data/mm64") / os.environ.get("USER", "") / ".local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.copilot.info",
        ]

        for path in possible_paths:
            if path.exists():
                return path

        # Windows 上可能不存在认证文件，返回第一个路径让后续报错
        return possible_paths[0]
    
    def _load_auth(self):
        """加载认证信息"""
        if not self.auth_file.exists():
            error_msg = (
                f"找不到认证文件: {self.auth_file}\n\n"
                "解决方案:\n"
                "1. 在 VS Code 中登录 CodeBuddy 插件\n"
                "2. 或者手动指定认证文件路径:\n"
                "   设置环境变量 CODEBUDDY_AUTH_FILE=<认证文件完整路径>\n\n"
                "注意: Windows 版本的 CodeBuddy 扩展可能使用不同的认证存储机制，"
                "如果无法找到认证文件，可能需要使用 Native API 模式（优先模式）"
            )
            raise FileNotFoundError(error_msg)
        
        with open(self.auth_file, 'r', encoding='utf-8') as f:
            auth_data = json.load(f)
        
        self.access_token = auth_data['auth']['accessToken']
        self.user_id = auth_data['account']['uid']
        self.enterprise_id = auth_data['account']['enterpriseId']
        
        # domain 可能在 auth 或 account.sso 中
        self.domain = auth_data['auth'].get('domain') or auth_data['account'].get('sso', {}).get('domain', '')
    
    def _get_user_agent(self) -> str:
        """构建 User-Agent"""
        platform_version = platform.release()
        return f"{self.PLATFORM}/{platform_version} {self.PRODUCT_NAME}/{self.PRODUCT_VERSION}"
    
    def _get_headers(self, include_user_agent: bool = False) -> Dict[str, str]:
        """获取请求头"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
            "X-User-Id": self.user_id,
            "X-Enterprise-Id": self.enterprise_id,
            "X-Tenant-Id": self.enterprise_id,
            "X-Domain": self.domain,
        }
        
        if include_user_agent:
            headers["User-Agent"] = self._get_user_agent()
        
        return headers
    
    def get_models(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        获取可用模型列表
        
        Args:
            force_refresh: 是否强制刷新缓存
            
        Returns:
            模型列表，每个模型包含 id, name, description 等字段
        """
        if self._models_cache and not force_refresh:
            return self._models_cache
        
        models = []
        
        # 方法1: 尝试从企业配置获取
        try:
            enterprise_models = self._fetch_enterprise_models()
            if enterprise_models:
                models.extend(enterprise_models)
        except Exception as e:
            pass  # 忽略错误，尝试下一个方法
        
        # 方法2: 尝试从 v3/config 获取
        try:
            config_models = self._fetch_config_models()
            if config_models:
                # 合并，避免重复
                existing_ids = {m['id'] for m in models}
                for m in config_models:
                    if m['id'] not in existing_ids:
                        models.append(m)
        except Exception as e:
            pass  # 忽略错误
        
        # 如果都没获取到，使用默认列表
        if not models:
            models = self.DEFAULT_MODELS.copy()
        
        self._models_cache = models
        return models
    
    def _fetch_enterprise_models(self) -> List[Dict[str, Any]]:
        """从企业配置获取模型列表"""
        url = self.ENTERPRISE_MODELS_ENDPOINT.format(enterprise_id=self.enterprise_id)
        headers = self._get_headers()
        
        req = urllib.request.Request(url, method='GET')
        for k, v in headers.items():
            req.add_header(k, v)
        
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
        
        if result.get('code') != 0:
            return []
        
        data = result.get('data', [])
        models = []
        for item in data:
            models.append({
                'id': item.get('id') or item.get('modelId'),
                'name': item.get('name') or item.get('modelName'),
                'description': item.get('description', ''),
            })
        
        return models
    
    def _fetch_config_models(self) -> List[Dict[str, Any]]:
        """从 v3/config 获取模型列表"""
        url = self.CONFIG_ENDPOINT
        headers = self._get_headers(include_user_agent=True)
        
        req = urllib.request.Request(url, method='GET')
        for k, v in headers.items():
            req.add_header(k, v)
        
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
        
        if result.get('code') != 0:
            return []
        
        data = result.get('data', {})
        models_data = data.get('models', [])
        
        models = []
        for item in models_data:
            models.append({
                'id': item.get('id'),
                'name': item.get('name') or item.get('id'),
                'description': item.get('description', ''),
                'maxInputTokens': item.get('maxInputTokens'),
                'maxOutputTokens': item.get('maxOutputTokens'),
                'supportsImages': item.get('supportsImages', False),
            })
        
        return models
    
    def _build_messages(
        self,
        user_message: str,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        """构建消息列表"""
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        if history:
            messages.extend(history)
        
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    def chat_stream(
        self,
        message: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        history: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
    ) -> Iterator[str]:
        """
        流式聊天
        
        Args:
            message: 用户消息
            model: 模型名称
            system_prompt: 系统提示词
            temperature: 温度参数
            history: 历史消息
            max_tokens: 最大输出 token 数
            
        Yields:
            生成的文本块
        """
        model = model or self.default_model
        temperature = temperature if temperature is not None else self.default_temperature
        
        messages = self._build_messages(message, system_prompt, history)
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        if HAS_REQUESTS:
            yield from self._chat_stream_requests(payload)
        else:
            yield from self._chat_stream_urllib(payload)
    
    def _chat_stream_requests(self, payload: Dict) -> Iterator[str]:
        """使用 requests 库进行流式请求"""
        response = requests.post(
            self.CHAT_ENDPOINT,
            headers=self._get_headers(),
            json=payload,
            stream=True,
        )
        
        response.raise_for_status()
        
        for line in response.iter_lines():
            if not line:
                continue
            
            line = line.decode('utf-8')
            
            if not line.startswith('data: '):
                continue
            
            data = line[6:]  # 移除 "data: " 前缀
            
            if data == '[DONE]':
                break
            
            try:
                chunk = json.loads(data)
                content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                if content:
                    yield content
            except json.JSONDecodeError:
                continue
    
    def _chat_stream_urllib(self, payload: Dict) -> Iterator[str]:
        """使用 urllib 进行流式请求"""
        data = json.dumps(payload).encode('utf-8')
        
        req = urllib.request.Request(
            self.CHAT_ENDPOINT,
            data=data,
            method='POST'
        )
        
        for k, v in self._get_headers().items():
            req.add_header(k, v)
        
        with urllib.request.urlopen(req, timeout=120) as response:
            buffer = b''
            while True:
                chunk = response.read(1024)
                if not chunk:
                    break
                
                buffer += chunk
                lines = buffer.split(b'\n')
                buffer = lines[-1]  # 保留最后一行（可能不完整）
                
                for line in lines[:-1]:
                    line = line.decode('utf-8').strip()
                    
                    if not line.startswith('data: '):
                        continue
                    
                    data = line[6:]
                    
                    if data == '[DONE]':
                        return
                    
                    try:
                        chunk_data = json.loads(data)
                        content = chunk_data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
    
    def chat(
        self,
        message: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        history: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        聊天 (非流式，返回完整响应)
        
        Args:
            message: 用户消息
            model: 模型名称
            system_prompt: 系统提示词
            temperature: 温度参数
            history: 历史消息
            max_tokens: 最大输出 token 数
            
        Returns:
            完整的响应文本
        """
        chunks = list(self.chat_stream(
            message=message,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            history=history,
            max_tokens=max_tokens,
        ))
        return ''.join(chunks)
    
    def chat_with_print(
        self,
        message: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        history: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        流式聊天并实时打印
        
        Args:
            message: 用户消息
            model: 模型名称
            system_prompt: 系统提示词
            temperature: 温度参数
            history: 历史消息
            max_tokens: 最大输出 token 数
            
        Returns:
            完整的响应文本
        """
        full_response = []
        
        for chunk in self.chat_stream(
            message=message,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            history=history,
            max_tokens=max_tokens,
        ):
            print(chunk, end='', flush=True)
            full_response.append(chunk)
        
        print()  # 换行
        return ''.join(full_response)


class ConversationSession:
    """会话管理器，支持多轮对话"""
    
    def __init__(
        self,
        client: Optional[CodeBuddyClient] = None,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ):
        """
        初始化会话
        
        Args:
            client: CodeBuddy 客户端
            system_prompt: 系统提示词
            model: 模型名称
        """
        self.client = client or CodeBuddyClient()
        self.system_prompt = system_prompt
        self.model = model
        self.history: List[Dict[str, str]] = []
    
    def chat(self, message: str, stream: bool = True) -> str:
        """
        发送消息
        
        Args:
            message: 用户消息
            stream: 是否流式输出
            
        Returns:
            助手响应
        """
        if stream:
            response = self.client.chat_with_print(
                message=message,
                model=self.model,
                system_prompt=self.system_prompt if not self.history else None,
                history=self.history,
            )
        else:
            response = self.client.chat(
                message=message,
                model=self.model,
                system_prompt=self.system_prompt if not self.history else None,
                history=self.history,
            )
        
        # 更新历史
        self.history.append({"role": "user", "content": message})
        self.history.append({"role": "assistant", "content": response})
        
        return response
    
    def clear(self):
        """清空历史"""
        self.history = []


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(
        description='CodeBuddy API 调用工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  %(prog)s "什么是递归？"
  %(prog)s -m claude-sonnet-4.5 "解释快速排序算法"
  %(prog)s -s "你是一个Python专家" "如何使用装饰器？"
  %(prog)s -t 0.3 "写一个严谨的代码审查"
  %(prog)s --list-models              # 从服务器获取可用模型
  %(prog)s -i                         # 进入交互模式

API 端点:
  聊天:     https://copilot.tencent.com/v2/chat/completions
  配置:     https://copilot.tencent.com/v3/config
  企业模型: https://copilot.tencent.com/console/enterprises/{id}/config/models
'''
    )
    
    parser.add_argument('message', nargs='?', help='要发送的消息')
    parser.add_argument('-m', '--model', default=CodeBuddyClient.DEFAULT_MODEL,
                        help=f'指定模型 (默认: {CodeBuddyClient.DEFAULT_MODEL})')
    parser.add_argument('-s', '--system', help='系统提示词')
    parser.add_argument('-t', '--temperature', type=float, 
                        default=CodeBuddyClient.DEFAULT_TEMPERATURE,
                        help=f'温度参数 (默认: {CodeBuddyClient.DEFAULT_TEMPERATURE})')
    parser.add_argument('--max-tokens', type=int, help='最大输出 token 数')
    parser.add_argument('-i', '--interactive', action='store_true',
                        help='进入交互模式')
    parser.add_argument('--list-models', action='store_true',
                        help='从服务器获取可用模型列表')
    parser.add_argument('--no-stream', action='store_true',
                        help='禁用流式输出')
    parser.add_argument('--show-auth', action='store_true',
                        help='显示认证信息（用于调试）')
    
    args = parser.parse_args()
    
    try:
        client = CodeBuddyClient(
            model=args.model,
            temperature=args.temperature,
        )
    except FileNotFoundError as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)
    
    # 显示认证信息
    if args.show_auth:
        print("认证信息:")
        print(f"  认证文件: {client.auth_file}")
        print(f"  User ID: {client.user_id}")
        print(f"  Enterprise ID: {client.enterprise_id}")
        print(f"  Domain: {client.domain}")
        print(f"  User-Agent: {client._get_user_agent()}")
        return
    
    # 列出模型
    if args.list_models:
        print("正在获取可用模型列表...")
        print("-" * 60)
        
        try:
            models = client.get_models()
            print(f"找到 {len(models)} 个可用模型:\n")
            
            for m in models:
                model_id = m.get('id', 'unknown')
                model_name = m.get('name', model_id)
                desc = m.get('description', '')
                
                print(f"  {model_id}")
                if model_name != model_id:
                    print(f"    名称: {model_name}")
                if desc:
                    print(f"    描述: {desc}")
                
                # 显示额外信息
                if m.get('maxInputTokens'):
                    print(f"    最大输入: {m['maxInputTokens']} tokens")
                if m.get('maxOutputTokens'):
                    print(f"    最大输出: {m['maxOutputTokens']} tokens")
                if m.get('supportsImages'):
                    print(f"    支持图片: 是")
                print()
                
        except Exception as e:
            print(f"获取模型列表失败: {e}", file=sys.stderr)
            print("\n使用默认模型列表:")
            for m in CodeBuddyClient.DEFAULT_MODELS:
                print(f"  {m['id']}: {m['name']}")
        
        return
    
    # 交互模式
    if args.interactive:
        session = ConversationSession(
            client=client,
            system_prompt=args.system,
            model=args.model,
        )
        
        print(f"CodeBuddy 交互模式 (模型: {args.model})")
        print("命令: 'quit'/'exit' 退出, 'clear' 清空历史, 'models' 查看模型")
        print("-" * 40)
        
        while True:
            try:
                user_input = input("\n你: ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ('quit', 'exit'):
                    print("再见!")
                    break
                
                if user_input.lower() == 'clear':
                    session.clear()
                    print("历史已清空")
                    continue
                
                if user_input.lower() == 'models':
                    models = client.get_models()
                    print("可用模型:")
                    for m in models:
                        print(f"  - {m['id']}: {m.get('name', '')}")
                    continue
                
                if user_input.lower().startswith('model '):
                    new_model = user_input[6:].strip()
                    session.model = new_model
                    print(f"已切换到模型: {new_model}")
                    continue
                
                print("\n助手: ", end='')
                session.chat(user_input, stream=not args.no_stream)
                
            except KeyboardInterrupt:
                print("\n再见!")
                break
            except Exception as e:
                print(f"\n错误: {e}", file=sys.stderr)
        
        return
    
    # 单次调用
    if not args.message:
        parser.print_help()
        sys.exit(1)
    
    print(f"模型: {args.model}", file=sys.stderr)
    print("-" * 40, file=sys.stderr)
    
    try:
        if args.no_stream:
            response = client.chat(
                message=args.message,
                system_prompt=args.system,
                max_tokens=args.max_tokens,
            )
            print(response)
        else:
            client.chat_with_print(
                message=args.message,
                system_prompt=args.system,
                max_tokens=args.max_tokens,
            )
    except urllib.error.HTTPError as e:
        print(f"API 错误: {e.code} - {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)
    
    print("-" * 40, file=sys.stderr)


if __name__ == '__main__':
    main()
