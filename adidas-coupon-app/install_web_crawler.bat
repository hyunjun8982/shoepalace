@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Adidas Coupon Manager - Web Crawler Setup

echo ============================================================
echo   Adidas Coupon Manager - 웹 크롤러 설치
echo ============================================================
echo.

:: ============================================================
:: 1. Python 설치 확인 및 자동 설치
:: ============================================================
echo [1/4] Python 설치 확인...

set PYTHON_PATH=
for /f "tokens=*" %%i in ('where python 2^>nul') do (
    if not defined PYTHON_PATH (
        echo %%i | findstr /i "WindowsApps" >nul
        if errorlevel 1 (
            set "PYTHON_PATH=%%i"
        )
    )
)

if not defined PYTHON_PATH (
    echo.
    echo     [!] Python이 설치되어 있지 않습니다.
    echo     Python 3.12를 자동으로 설치합니다...
    echo.

    :: Python 설치 파일 다운로드
    set "PYTHON_INSTALLER=%TEMP%\python-3.12.0-amd64.exe"
    set "PYTHON_URL=https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe"

    echo     다운로드 중: Python 3.12.0
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'}" 2>nul

    if not exist "%PYTHON_INSTALLER%" (
        echo.
        echo     [ERROR] Python 다운로드 실패
        echo     수동으로 설치해주세요: https://www.python.org/downloads/
        echo.
        pause
        exit /b 1
    )

    echo     설치 중... (잠시 기다려주세요)
    "%PYTHON_INSTALLER%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0

    if %ERRORLEVEL% neq 0 (
        echo.
        echo     [!] 자동 설치 실패. 수동 설치를 진행합니다...
        start "" "%PYTHON_INSTALLER%"
        echo.
        echo     설치 시 반드시 "Add Python to PATH" 체크!
        echo     설치 완료 후 아무 키나 눌러주세요...
        pause >nul
    )

    :: 환경 변수 새로고침
    set "PATH=C:\Program Files\Python312;C:\Program Files\Python312\Scripts;%PATH%"

    :: Python 재확인
    for /f "tokens=*" %%i in ('where python 2^>nul') do (
        if not defined PYTHON_PATH (
            echo %%i | findstr /i "WindowsApps" >nul
            if errorlevel 1 (
                set "PYTHON_PATH=%%i"
            )
        )
    )

    if not defined PYTHON_PATH (
        :: 기본 경로 직접 확인
        if exist "C:\Program Files\Python312\python.exe" (
            set "PYTHON_PATH=C:\Program Files\Python312\python.exe"
        ) else if exist "C:\Program Files\Python311\python.exe" (
            set "PYTHON_PATH=C:\Program Files\Python311\python.exe"
        ) else if exist "C:\Python312\python.exe" (
            set "PYTHON_PATH=C:\Python312\python.exe"
        )
    )

    if not defined PYTHON_PATH (
        echo.
        echo     [ERROR] Python 설치 확인 실패
        echo     컴퓨터를 재시작한 후 다시 실행해주세요.
        echo.
        pause
        exit /b 1
    )

    echo     [OK] Python 설치 완료
)

echo     Python 경로: %PYTHON_PATH%

for /f "tokens=2" %%i in ('"%PYTHON_PATH%" --version 2^>^&1') do set PYTHON_VERSION=%%i
echo     Python %PYTHON_VERSION% - OK
echo.

:: ============================================================
:: 2. Chrome 브라우저 확인
:: ============================================================
echo [2/4] Chrome 브라우저 확인...

set CHROME_FOUND=0

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if %CHROME_FOUND%==0 (
    echo.
    echo     [ERROR] Chrome 브라우저가 설치되어 있지 않습니다.
    echo.
    echo     Chrome을 설치해주세요: https://www.google.com/chrome/
    echo.
    start https://www.google.com/chrome/
    echo     Chrome 설치 후 아무 키나 눌러주세요...
    pause >nul
)

echo     Chrome 확인 - OK
echo.

:: ============================================================
:: 3. Python 패키지 설치
:: ============================================================
echo [3/4] Python 패키지 설치...
echo.

"%PYTHON_PATH%" -m pip install --upgrade pip -q 2>nul

echo     setuptools 설치 중...
"%PYTHON_PATH%" -m pip install setuptools -q
if %errorlevel% neq 0 (
    "%PYTHON_PATH%" -m pip install setuptools --user -q
)

echo     selenium 설치 중...
"%PYTHON_PATH%" -m pip install selenium -q
if %errorlevel% neq 0 (
    "%PYTHON_PATH%" -m pip install selenium --user -q
)

echo     undetected-chromedriver 설치 중...
"%PYTHON_PATH%" -m pip install undetected-chromedriver -q
if %errorlevel% neq 0 (
    "%PYTHON_PATH%" -m pip install undetected-chromedriver --user -q
)

echo     requests 설치 중...
"%PYTHON_PATH%" -m pip install requests -q
if %errorlevel% neq 0 (
    "%PYTHON_PATH%" -m pip install requests --user -q
)

echo.
echo     [OK] 패키지 설치 완료
echo.

:: ============================================================
:: 4. 설정 저장
:: ============================================================
echo [4/4] 설정 저장...

set "CONFIG_DIR=%LOCALAPPDATA%\adidas-coupon-manager"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
echo %PYTHON_PATH%> "%CONFIG_DIR%\python_path.txt"
echo     저장 위치: %CONFIG_DIR%\python_path.txt

echo.
echo ============================================================
echo   설치 완료!
echo ============================================================
echo.
echo   Python: %PYTHON_PATH%
echo   웹 크롤링 기능을 사용할 수 있습니다.
echo.
pause
