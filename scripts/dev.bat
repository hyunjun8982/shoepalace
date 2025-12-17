@echo off
chcp 65001 >nul

cd /d "%~dp0.."

echo ==========================================
echo   Shoepalace 개발 환경
echo ==========================================

set CMD=%1
if "%CMD%"=="" set CMD=start

if "%CMD%"=="start" (
    echo [1/2] 기존 컨테이너 정리...
    docker-compose down 2>nul

    echo [2/2] 컨테이너 빌드 및 시작...
    docker-compose up -d --build

    echo.
    echo ==========================================
    echo   개발 환경 시작 완료!
    echo ==========================================
    echo   Frontend: http://localhost:3000
    echo   Backend:  http://localhost:8001
    echo   DB:       localhost:5433
    echo ==========================================
    goto :eof
)

if "%CMD%"=="stop" (
    echo 컨테이너 중지 중...
    docker-compose down
    echo 완료!
    goto :eof
)

if "%CMD%"=="restart" (
    echo 컨테이너 재시작 중...
    docker-compose down 2>nul
    docker-compose up -d --build
    echo 완료!
    goto :eof
)

if "%CMD%"=="logs" (
    docker-compose logs -f %2
    goto :eof
)

if "%CMD%"=="status" (
    docker-compose ps
    goto :eof
)

if "%CMD%"=="build" (
    echo Docker 이미지 재빌드 중...
    docker-compose build
    echo 빌드 완료!
    goto :eof
)

echo 사용법: %~nx0 [start, stop, restart, logs, status, build]
echo.
echo   start   - 개발 환경 시작 (기본값)
echo   stop    - 개발 환경 중지
echo   restart - 재시작
echo   logs    - 로그 보기 (logs backend 등)
echo   status  - 컨테이너 상태 확인
echo   build   - 이미지만 재빌드
