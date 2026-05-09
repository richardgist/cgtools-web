@echo off
echo ====================================
echo   Game Log Puller
echo ====================================
echo.

REM Android log file path
set ANDROID_LOG_FILE=/sdcard/Android/data/com.tencent.tmgp.pubgmhd/files/UE4Game/ShadowTrackerExtra/ShadowTrackerExtra/Saved/Logs/ShadowTrackerExtra.log

REM Local save directory
set LOCAL_DIR=%~dp0Logs

REM Create local log directory if not exists
if not exist "%LOCAL_DIR%" (
    mkdir "%LOCAL_DIR%"
    echo Created log directory: %LOCAL_DIR%
)

REM Check if adb is available
adb version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] adb not found. Please install adb and add it to PATH
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
    exit /b 1
)

REM Check device connection
echo Checking device connection...
adb devices | findstr /r "device$" >nul
if errorlevel 1 (
    echo [ERROR] No device detected. Please ensure:
    echo   1. Phone is connected via USB
    echo   2. USB debugging is enabled
    echo   3. Computer is authorized for debugging
    echo.
    adb devices
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
    exit /b 1
)
echo Device connected
echo.

REM Generate timestamp using PowerShell (Format: YYYYMMDD_HHMMSS)
for /f "tokens=*" %%a in ('powershell -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"') do set TIMESTAMP=%%a

REM Pull log file
echo Pulling log file...
echo Source: %ANDROID_LOG_FILE%
echo.

REM Pull log file and rename with timestamp
set OUTPUT_FILE=%LOCAL_DIR%\ShadowTrackerExtra_%TIMESTAMP%.log
adb pull "%ANDROID_LOG_FILE%" "%OUTPUT_FILE%"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to pull logs. Please check:
    echo   1. Path is correct
    echo   2. You have read permission
    echo   3. Game has been run and generated logs
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
    exit /b 1
)

echo.
echo ====================================
echo   Log pull completed!
echo ====================================
echo Saved to: %OUTPUT_FILE%
echo.
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
