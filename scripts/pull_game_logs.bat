@echo off
setlocal

REM Local save directory
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
set "LOCAL_DIR=%REPO_ROOT%\PerformanceData\Logs"

REM Keep the legacy .bat entrypoint, but delegate to PowerShell for permission-aware fallbacks.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pull_game_logs.ps1" -LocalDir "%LOCAL_DIR%"
set "PULL_EXIT=%ERRORLEVEL%"

if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
exit /b %PULL_EXIT%
