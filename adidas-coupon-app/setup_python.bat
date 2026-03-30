@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   Python Environment Setup v2.1.0
echo ============================================
echo.

set "INSTALL_DIR=%~dp0python"
set "PYTHON_EXE=%INSTALL_DIR%\python.exe"
set "PYTHON_VERSION=3.11.9"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"
set "GET_PIP_URL=https://bootstrap.pypa.io/get-pip.py"
set "VC_REDIST_URL=https://aka.ms/vs/17/release/vc_redist.x64.exe"

:: ===== Visual C++ Redistributable =====
echo [0/4] Checking Visual C++ Redistributable ...
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" /v Version >nul 2>&1
if not errorlevel 1 goto :vc_ok

echo   - VC++ Redistributable not found. Installing ...
curl -L -o "%TEMP%\vc_redist.x64.exe" "%VC_REDIST_URL%"
if errorlevel 1 goto :vc_warn
"%TEMP%\vc_redist.x64.exe" /install /quiet /norestart
echo [OK] VC++ Redistributable installed
del "%TEMP%\vc_redist.x64.exe" 2>nul
goto :vc_done

:vc_warn
echo [WARNING] VC++ Redistributable download failed. Playwright may not work.
goto :vc_done

:vc_ok
echo [OK] VC++ Redistributable already installed

:vc_done
echo.

:: ===== Python =====
if exist "%PYTHON_EXE%" (
    echo [OK] Python already installed
    goto :install_packages
)

echo [1/4] Downloading Python %PYTHON_VERSION% ...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set "ZIP_FILE=%INSTALL_DIR%\python_embed.zip"
curl -L -o "%ZIP_FILE%" "%PYTHON_URL%"
if errorlevel 1 goto :err_download

echo [2/4] Extracting ...
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%INSTALL_DIR%' -Force"
if errorlevel 1 goto :err_extract
del "%ZIP_FILE%" 2>nul

echo [3/4] Installing pip ...
set "PTH_FILE=%INSTALL_DIR%\python311._pth"
if exist "%PTH_FILE%" (
    powershell -Command "(Get-Content '%PTH_FILE%') -replace '#import site','import site' | Set-Content '%PTH_FILE%'"
)

curl -L -o "%INSTALL_DIR%\get-pip.py" "%GET_PIP_URL%"
if errorlevel 1 goto :err_pip
"%PYTHON_EXE%" "%INSTALL_DIR%\get-pip.py" --no-warn-script-location
if errorlevel 1 goto :err_pip
del "%INSTALL_DIR%\get-pip.py" 2>nul
echo [OK] pip installed

:install_packages
echo.
echo [4/4] Installing packages ...

echo   - Installing playwright ...
"%PYTHON_EXE%" -m pip install playwright --no-warn-script-location -q
if errorlevel 1 echo [WARNING] playwright install failed

echo   - Installing playwright chromium ...
"%PYTHON_EXE%" -m playwright install chromium
if errorlevel 1 echo [WARNING] playwright chromium install failed

echo   - Installing requests ...
"%PYTHON_EXE%" -m pip install requests --no-warn-script-location -q

echo   - Installing selenium ...
"%PYTHON_EXE%" -m pip install selenium undetected-chromedriver --no-warn-script-location -q

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
pause
exit /b 0

:err_download
echo [ERROR] Download failed. Check internet connection.
pause
exit /b 1

:err_extract
echo [ERROR] Extract failed.
pause
exit /b 1

:err_pip
echo [ERROR] pip install failed.
pause
exit /b 1
