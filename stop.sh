#!/bin/bash
echo "============================================"
echo "  CGTools Docker - 停止服务"
echo "============================================"
echo

cd "$(dirname "$0")"

docker compose down

echo
echo "✅ 所有服务已停止。"
