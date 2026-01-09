@echo off
title Appium Server (Port 4723)

echo Setting ANDROID_HOME...
set ANDROID_HOME=C:\platform-tools
set PATH=%ANDROID_HOME%;%PATH%

echo.
echo ========================================
echo   Appium Server
echo   ANDROID_HOME = %ANDROID_HOME%
echo   http://localhost:4723
echo   Chromedriver auto-download enabled
echo ========================================
echo.

appium --allow-insecure=uiautomator2:chromedriver_autodownload
