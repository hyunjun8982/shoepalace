# 멀티 스테이지 빌드
FROM node:24-alpine AS builder

WORKDIR /app

# 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm cache clean --force && \
    rm -rf node_modules && \
    npm install --legacy-peer-deps || npm install --legacy-peer-deps || npm install --legacy-peer-deps

# 소스 코드 복사 및 빌드
COPY . .
RUN SKIP_PREFLIGHT_CHECK=true CI=false npm run build

# 프로덕션 서버
FROM nginx:alpine

# nginx 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 빌드된 정적 파일 복사
COPY --from=builder /app/build /usr/share/nginx/html

# 포트 노출
EXPOSE 80

# nginx 실행
CMD ["nginx", "-g", "daemon off;"]