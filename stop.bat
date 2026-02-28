@echo off
chcp 65001 >nul
echo ============================================
echo   CGTools Docker - 停止服务
echo ============================================
echo.

cd /d "%~dp0"

docker compose down

echo.
echo ✅ 所有服务已停止。
echo.

pause
