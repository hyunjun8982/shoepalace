#!/bin/bash
# 로컬 개발 환경 실행 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "  Shoepalace 개발 환경 시작"
echo "=========================================="

# 명령어 분기
case "${1:-start}" in
  start)
    echo "[1/3] Docker 이미지 빌드 중..."
    docker build -t shoepalace-backend:latest -f backend/Dockerfile backend/
    docker build -t shoepalace-frontend:latest -f frontend/Dockerfile frontend/

    echo "[2/3] 기존 컨테이너 정리..."
    docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

    echo "[3/3] 컨테이너 시작..."
    docker-compose -f docker-compose.prod.yml up -d

    echo ""
    echo "=========================================="
    echo "  개발 환경 시작 완료!"
    echo "=========================================="
    echo "  Frontend: http://localhost:80"
    echo "  Backend:  http://localhost:8001"
    echo "  DB:       localhost:5433"
    echo "=========================================="
    ;;

  stop)
    echo "컨테이너 중지 중..."
    docker-compose -f docker-compose.prod.yml down
    echo "완료!"
    ;;

  restart)
    $0 stop
    $0 start
    ;;

  logs)
    docker-compose -f docker-compose.prod.yml logs -f ${2:-}
    ;;

  status)
    docker-compose -f docker-compose.prod.yml ps
    ;;

  build)
    echo "Docker 이미지 재빌드 중..."
    docker build -t shoepalace-backend:latest -f backend/Dockerfile backend/
    docker build -t shoepalace-frontend:latest -f frontend/Dockerfile frontend/
    echo "빌드 완료!"
    ;;

  *)
    echo "사용법: $0 {start|stop|restart|logs|status|build}"
    echo ""
    echo "  start   - 개발 환경 시작 (기본값)"
    echo "  stop    - 개발 환경 중지"
    echo "  restart - 재시작"
    echo "  logs    - 로그 보기 (logs backend, logs frontend 등)"
    echo "  status  - 컨테이너 상태 확인"
    echo "  build   - 이미지만 재빌드"
    exit 1
    ;;
esac
