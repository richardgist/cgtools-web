#!/bin/bash
echo "============================================"
echo "  CGTools Docker - 更新服务"
echo "============================================"
echo

cd "$(dirname "$0")"

echo "[1/4] 拉取最新代码..."
git pull

if [ $? -ne 0 ]; then
    echo
    echo "❌ git pull 失败，请检查网络或手动解决冲突。"
    exit 1
fi

echo
echo "[2/4] 停止旧服务..."
docker compose down

echo
echo "[3/4] 重新构建镜像..."
docker compose build --no-cache

echo
echo "[4/4] 启动新服务..."
docker compose up -d

echo
echo "============================================"
echo "  ✅ 更新完成！"
echo
echo "  Web UI:  http://localhost:18432"
echo "  Proxy:   http://localhost:8082/health"
echo "============================================"
echo

docker compose ps
