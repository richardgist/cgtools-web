# Anthropic API 兼容代理服务器

将标准的 Anthropic Messages API 请求转发到 CodeBuddy API，使得支持 Anthropic SDK 的工具（如 Claude Code）可以通过 CodeBuddy 后端使用。

## 文件说明

- `anthropic_server.py` - 代理服务器主程序
- `codebuddy_api.py` - CodeBuddy API 客户端库
- `codebuddy_native_api.py` - Native API 客户端库 (Anthropic 原生格式)
- `key_manager.py` - OAuth Token 管理器（自动刷新、热读取）
- `quota_manager.py` - 额度管理器（Hybrid 模式）
- `start.sh` - 一键启动脚本

## Provider 模式

服务器支持三种后端 Provider：

| Provider | 认证方式 | 适用场景 |
|----------|----------|----------|
| `native` (推荐) | OAuth Token (~/.git-credentials) | IOA 登录后使用，原生 Anthropic 格式，无需协议转换 |
| `codebuddy` (默认) | 本地认证文件 | 已安装 CodeBuddy CLI 并登录 |
| `hybrid` | 两种认证都需要 | 优先使用 Native API，额度用完自动切换到 CodeBuddy |

## 前置条件

### Native Provider (推荐)

1. 安装 Claude Code Internal：

   ```bash
   npm install -g --registry=https://mirrors.tencent.com/npm @tencent/claude-code-internal
   ```

   详细安装说明请参考：https://iwiki.woa.com/p/4015845000

2. 运行 `claude-internal` 完成 IOA OAuth 认证：

   ```bash
   claude-internal
   ```

   - 有浏览器环境：自动唤起浏览器完成验证
   - 无浏览器环境（devcloud、远程机器）：按提示使用设备码方式验证

   认证成功后，Token 会保存在 `~/.git-credentials` 或 `~/.claude-internal/config.json` 中。

3. 启动代理服务器：

   ```bash
   python anthropic_server.py --provider native
   ```

**优势**：

- 使用 Anthropic 原生 Messages API 格式，无需协议转换
- 完全透传请求和响应，兼容性最好
- 支持所有 Anthropic API 特性（工具调用、流式响应、Extended Thinking 等）
- **自动 Token 管理**：后台自动刷新临期 Token，支持配置文件热读取

### CodeBuddy Provider (默认)

1. 安装 CodeBuddy CLI 工具：

   ```bash
   npm install -g @tencent-ai/codebuddy-code
   ```

2. 使用 IOA 账号登录

3. 登录成功后，认证信息会保存在 `~/.local/share/CodeBuddyExtension/` 目录下

### Hybrid Provider

需要同时满足 Native 和 CodeBuddy 的前置条件：

1. 安装 Claude Code Internal 并使用 IOA 登录（同 Native Provider）
2. 安装并登录 CodeBuddy CLI（同 CodeBuddy Provider）

## 快速开始

### 一键启动（推荐）

```bash
# 使用启动脚本（默认 Hybrid 模式，监听 127.0.0.1:8080）
./start.sh

# 指定端口
./start.sh --port 9000

# 后台运行
nohup ./start.sh > /dev/null 2>&1 &
```

### 手动启动

```bash
# 使用 Native API (推荐，需要 IOA 登录)
python anthropic_server.py --provider native

# 使用 CodeBuddy API (默认)
python anthropic_server.py

# 使用 Hybrid API (优先 Native，额度用完自动切换到 CodeBuddy)
python anthropic_server.py --provider hybrid

# 指定端口和主机
python anthropic_server.py --host 127.0.0.1 --port 8080
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/messages` | POST | Anthropic Messages API |
| `/v1/models` | GET | 列出可用模型 |
| `/health` | GET | 健康检查 |
| `/v1/quota` | GET | 查看额度状态 (仅 hybrid 模式) |
| `/v1/quota/reset` | POST | 手动重置额度 (仅 hybrid 模式) |

## 模型映射

### Native Provider (推荐)

| 请求模型 | 实际调用 |
|----------|----------|
| `opus`, `claude-3-opus-*`, `claude-opus-*` | `claude-4.5-opus` |
| `sonnet`, `claude-3-sonnet-*`, `claude-*-sonnet-*` | `claude-4.5-sonnet` |
| `haiku`, `claude-3-haiku-*`, `claude-*-haiku-*` | `claude-4.5-sonnet` (Native 暂无 haiku) |

### CodeBuddy Provider (默认)

| 请求模型 | 实际调用 |
|----------|----------|
| `opus`, `claude-3-opus-*`, `claude-opus-*` | `claude-opus-4.5` |
| `sonnet`, `claude-3-sonnet-*`, `claude-*-sonnet-*` | `claude-4.5` |
| `haiku`, `claude-3-haiku-*`, `claude-*-haiku-*` | `claude-haiku-4.5` |

### Hybrid Provider

优先使用 Native API 的模型映射，额度用完后自动切换到 CodeBuddy API 的模型映射。

## 测试

```bash
# 健康检查
curl http://localhost:8080/health

# 列出模型
curl http://localhost:8080/v1/models

# 发送消息
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# 流式响应
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "写一首诗"}]
  }'
```

## 与 Claude Code 配合使用

设置环境变量后启动 Claude Code：

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy  # 任意值，代理不验证

claude
```

### 常见问题：配置环境变量后仍提示登录

如果已配置环境变量但 Claude Code 仍然提示登录，可以尝试以下方法：

**方法一：使用 ANTHROPIC_AUTH_TOKEN 替代 ANTHROPIC_API_KEY**

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_AUTH_TOKEN=dummy  # 使用 AUTH_TOKEN 替代 API_KEY

claude
```

**方法二：修改配置文件跳过登录流程**

1. 打开终端或命令行工具

2. 使用文本编辑器打开配置文件：

   ```bash
   nano ~/.claude.json
   ```

   或者使用你喜欢的其他文本编辑器，如 Vim、VS Code 等。

3. 在配置文件中添加或修改以下字段：

   ```json
   {
     "hasCompletedOnboarding": true
   }
   ```

4. 保存文件后重新启动 Claude Code

### VSCode Claude 插件配置

如果使用 VSCode 的 Claude 插件，需要在配置文件中进行设置：

配置文件位置：`~/.claude/config.json`

> 如果该文件不存在，请手动创建。

```json
{
  "primaryApiKey": "crs"
}
```

## 支持的功能

- 文本消息
- 图片消息（base64 和 URL）
- 流式响应
- Tool Use（工具调用）
- System Prompt

## 注意事项

1. 服务器使用多线程处理请求，支持并发
2. API Key 不做验证，可以传任意值
3. Token 计数为估算值
4. Hybrid 模式的额度状态保存在 `quota_state.json` 文件中，可通过 `--quota-file` 参数指定路径

## Hybrid 模式额度管理

Hybrid 模式会自动管理 Native API 的额度：

- 当 Native API 返回额度错误时，自动标记为"额度用完"并切换到 CodeBuddy
- 每周一零点自动重置额度状态（自然周）
- 可通过 `/v1/quota` 接口查看当前状态
- 可通过 `/v1/quota/reset` 接口手动重置
- **Token 自动管理**：Native API 的 OAuth Token 会在后台持续刷新和热读取，即使降级到 CodeBuddy 后也会保持更新，确保额度恢复时可立即切回

```bash
# 查看额度状态
curl http://localhost:8080/v1/quota

# 手动重置额度
curl -X POST http://localhost:8080/v1/quota/reset
```

## 后台服务部署

为了避免每次手动启动服务器，可以将代理服务作为后台服务运行。

### 方法一：使用 nohup（简单）

```bash
cd /your_directory/anthropic_proxy

# 启动后台服务（监听本地 8080 端口）
nohup python anthropic_server.py --host 127.0.0.1 --port 8080 > /dev/null 2>&1 &

# 查看是否运行
ps aux | grep anthropic_server

# 停止服务
pkill -f "python anthropic_server.py"
```

### 方法二：使用 systemd 用户服务（推荐）

1. 创建 systemd 用户服务目录：

```bash
mkdir -p ~/.config/systemd/user/
```

1. 创建服务文件 `~/.config/systemd/user/anthropic-proxy.service`：

```ini
[Unit]
Description=Anthropic API Proxy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/your_directory/anthropic_proxy
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 /your_directory/anthropic_proxy/anthropic_server.py --host 127.0.0.1 --port 8080 --provider hybrid
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

1. 启用并启动服务：

```bash
# 重新加载 systemd 配置
systemctl --user daemon-reload

# 启动服务
systemctl --user start anthropic-proxy

# 设置开机自启（可选）
systemctl --user enable anthropic-proxy

# 查看服务状态
systemctl --user status anthropic-proxy

# 查看日志
journalctl --user -u anthropic-proxy -f

# 停止服务
systemctl --user stop anthropic-proxy
```

### 方法三：使用启动脚本

在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
# 自动启动 Anthropic 代理服务
_start_anthropic_proxy() {
    if ! pgrep -f "python.*anthropic_server.py" > /dev/null; then
        cd /data/mmtenpay/QQMail/anthropic_proxy
        nohup python anthropic_server.py --host 127.0.0.1 --port 8080 > /dev/null 2>&1 &
        cd - > /dev/null
    fi
}
_start_anthropic_proxy

# 便捷命令
alias proxy-status='ps aux | grep anthropic_server | grep -v grep'
alias proxy-stop='pkill -f "python anthropic_server.py"'
alias proxy-restart='proxy-stop; sleep 1; _start_anthropic_proxy'
alias proxy-log='tail -f /data/mmtenpay/QQMail/anthropic_proxy/anthropic_server.log'
```

然后执行 `source ~/.bashrc` 使配置生效。

### 验证服务运行

```bash
# 健康检查
curl http://127.0.0.1:8080/health

# 应返回
# {"status": "healthy", ...}
```

## 日志

服务器日志默认保存在脚本目录下的 `anthropic_server.log` 文件中，支持自动轮转（最大 10MB，保留 5 个备份）。

```bash
# 指定日志文件路径和级别
python anthropic_server.py --log-file /path/to/server.log --log-level DEBUG

# 查看实时日志
tail -f /data/mmtenpay/QQMail/anthropic_proxy/anthropic_server.log
```

## 已知问题与修复

### CodeBuddy 多 JSON 拼接问题

**问题描述**：CodeBuddy API 在流式返回工具调用参数时，可能会间歇性地将多个完整的 JSON 对象拼接在同一个 tool_call 的 arguments 中（如 `{"path":"a.txt"}{"path":"b.txt"}`），导致客户端解析失败，报 "Invalid tool parameters" 错误。

**修复方案**：在流式响应处理中增加检测逻辑，当检测到当前参数以 `}` 结尾、新参数以 `{` 开头时，标记该工具调用为已完成，只保留第一个有效的 JSON 对象。

**影响**：此问题为 CodeBuddy 后端的间歇性 bug，修复后可正常使用工具调用功能。
