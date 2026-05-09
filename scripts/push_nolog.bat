@echo off
echo ====================================
echo   Push NoLogToMemory.txt to Phone
echo ====================================
echo.

REM Local file path
set LOCAL_FILE=%~dp0NoLogToMemory.txt

REM Android target path
set ANDROID_PATH=/sdcard/Android/data/com.tencent.tmgp.pubgmhd/files/UE4Game/ShadowTrackerExtra/ShadowTrackerExtra/Saved/

REM Check if local file exists
if not exist "%LOCAL_FILE%" (
    echo [ERROR] File not found: %LOCAL_FILE%
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
    exit /b 1
)
echo Found local file: %LOCAL_FILE%

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

REM Push file to phone (two-step due to Android storage restrictions)
echo Pushing file to phone...
echo Step 1: Push to temp location...

set TEMP_PATH=/sdcard/Download/NoLogToMemory.txt
adb push "%LOCAL_FILE%" "%TEMP_PATH%"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to push file to temp location
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
    exit /b 1
)

echo Step 2: Move to target location...
echo Target: %ANDROID_PATH%

adb shell "mv %TEMP_PATH% %ANDROID_PATH%NoLogToMemory.txt"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to move file. Trying alternative method...
    adb shell "cp %TEMP_PATH% %ANDROID_PATH%NoLogToMemory.txt && rm %TEMP_PATH%"
    if errorlevel 1 (
        echo [ERROR] Failed to copy file. Please check:
        echo   1. Target directory exists
        echo   2. You have write permission
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
        exit /b 1
    )
)

echo.
echo ====================================
echo   File pushed successfully!
echo ====================================
echo Target location: %ANDROID_PATH%NoLogToMemory.txt
echo.
if not "%CGTOOLS_WEB_RUNNER%"=="1" pause
