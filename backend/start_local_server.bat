@echo off
title Shoepalace Local Web Server (Port 8002)

cd /d "%~dp0"

:: Python check
python --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    pause
    exit /b 1
)

:: Install required packages
echo [1/2] Checking required packages...
pip show pystray > nul 2>&1
if errorlevel 1 (
    echo Installing pystray...
    pip install pystray pillow -q
)

pip show undetected-chromedriver > nul 2>&1
if errorlevel 1 (
    echo Installing undetected-chromedriver...
    pip install undetected-chromedriver selenium -q
)

pip show fastapi > nul 2>&1
if errorlevel 1 (
    echo Installing fastapi...
    pip install fastapi uvicorn -q
)

echo [2/2] Starting server...
echo.
echo ========================================
echo   Shoepalace Local Web Server
echo   http://localhost:8002
echo ========================================
echo.
echo Press Ctrl+C to stop the server.
echo (You can minimize this window)
echo.

:: Run in console mode (more reliable)
python local_tray_app.py --console
