# 배포 설정 가이드

## 개요

이 프로젝트는 다음과 같이 CI/CD가 구성되어 있습니다:

- **로컬 개발**: `scripts/dev.bat` (Windows) 또는 `scripts/dev.sh` (Linux/Mac)
- **운영 배포**: GitHub Actions → NHN 클라우드 (main 브랜치 푸시 시 자동 배포)

---

## 1. 로컬 개발 환경

### Windows
```cmd
scripts\dev.bat start    # 시작
scripts\dev.bat stop     # 중지
scripts\dev.bat restart  # 재시작
scripts\dev.bat logs     # 로그 보기
scripts\dev.bat status   # 상태 확인
```

### Linux/Mac
```bash
./scripts/dev.sh start   # 시작
./scripts/dev.sh stop    # 중지
./scripts/dev.sh restart # 재시작
./scripts/dev.sh logs    # 로그 보기
./scripts/dev.sh status  # 상태 확인
```

---

## 2. GitHub Secrets 설정 (필수)

GitHub 저장소에서 운영 배포를 위한 Secrets를 설정해야 합니다.

### 설정 위치
1. GitHub 저장소 → **Settings** 탭
2. 왼쪽 메뉴 → **Secrets and variables** → **Actions**
3. **New repository secret** 클릭

### 필수 Secrets

| Secret 이름 | 설명 | 예시 |
|-------------|------|------|
| `SERVER_HOST` | NHN 클라우드 서버 IP 또는 도메인 | `123.456.789.0` |
| `SERVER_USER` | SSH 접속 사용자명 | `ubuntu` 또는 `centos` |
| `SERVER_SSH_KEY` | PEM 키 내용 (전체 복사) | `-----BEGIN RSA PRIVATE KEY-----...` |
| `DEPLOY_PATH` | 서버 내 프로젝트 경로 | `/home/ubuntu/shoepalace` |

### 선택 Secrets

| Secret 이름 | 설명 | 기본값 |
|-------------|------|--------|
| `SERVER_PORT` | SSH 포트 | `22` |

### PEM 키 설정 방법

1. PEM 파일을 텍스트 에디터로 열기
2. 전체 내용 복사 (-----BEGIN 부터 -----END 까지)
3. GitHub Secret `SERVER_SSH_KEY`에 붙여넣기

```
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
(중간 내용)
...QWert==
-----END RSA PRIVATE KEY-----
```

---

## 3. NHN 클라우드 서버 사전 준비

서버에 다음이 설치되어 있어야 합니다:

### 필수 설치
```bash
# Docker 설치
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Docker 권한 설정
sudo usermod -aG docker $USER

# Git 설치
sudo apt-get install -y git
```

### 프로젝트 초기 클론
```bash
# 최초 1회만 실행
cd ~
git clone https://github.com/[your-username]/[your-repo].git shoepalace
```

---

## 4. 배포 흐름

```
[로컬 개발]
    ↓ git push origin main
[GitHub]
    ↓ GitHub Actions 트리거
[GitHub Actions]
    ↓ SSH로 NHN 클라우드 접속
[NHN 클라우드]
    ↓ git pull → docker build → docker-compose up
[배포 완료]
```

---

## 5. 문제 해결

### 배포 실패 시 확인사항

1. **SSH 접속 테스트**
   ```bash
   ssh -i your-key.pem user@server-ip
   ```

2. **GitHub Actions 로그 확인**
   - GitHub 저장소 → Actions 탭 → 실패한 워크플로우 클릭

3. **서버에서 직접 확인**
   ```bash
   cd ~/shoepalace
   docker-compose -f docker-compose.prod.yml logs
   ```

### 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|------|------|------|
| Permission denied | PEM 키 권한 또는 내용 오류 | Secret 재설정 |
| Connection refused | 포트 또는 방화벽 | 22번 포트 열기 |
| Docker command not found | Docker 미설치 | 서버에 Docker 설치 |

---

## 6. 수동 배포 (긴급 시)

GitHub Actions 없이 서버에서 직접 배포:

```bash
ssh -i your-key.pem user@server-ip
cd ~/shoepalace
git pull origin main
docker build -t shoepalace-backend:latest -f backend/Dockerfile backend/
docker build -t shoepalace-frontend:latest -f frontend/Dockerfile frontend/
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```
