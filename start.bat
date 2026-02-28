@echo off
chcp 65001 >nul
echo ============================================
echo   CGTools Docker - 启动服务
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] 构建镜像（如有变化）...
docker compose build

echo.
echo [2/2] 启动服务...
docker compose up -d

echo.
echo ============================================
echo   ✅ 服务已启动！
echo.
echo   访问地址:  http://localhost:18432
echo ============================================
echo.

docker compose ps

pause
