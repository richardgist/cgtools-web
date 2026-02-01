#!/bin/bash

# Anthropic API 代理服务启动脚本
# 使用 Hybrid 模式：优先 Native API，自动降级到 CodeBuddy API

cd "$(dirname "$0")"

python3 anthropic_server.py --provider hybrid --host 127.0.0.1 "$@"
