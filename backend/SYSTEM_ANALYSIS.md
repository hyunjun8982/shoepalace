# 입출고관리시스템 - 전체 시스템 분석

**분석 일시**: 2026-07-03  
**분석 범위**: Backend (FastAPI) + Frontend (React)

---

## 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [Backend 상세 분석](#backend-상세-분석)
4. [Frontend 상세 분석](#frontend-상세-분석)
5. [데이터베이스 스키마](#데이터베이스-스키마)
6. [API 엔드포인트](#api-엔드포인트)
7. [기술 스택](#기술-스택)
8. [배포 구조](#배포-구조)
9. [주요 기능 정리](#주요-기능-정리)
10. [파일 경로 맵](#파일-경로-맵)

---

## 프로젝트 개요

**프로젝트명**: 입출고관리시스템 (Inventory Management System)  
**용도**: 신발 & 명품 구매/판매 재고 관리  
**운영 서버**: 133.186.221.84  
**주요 관리 대상**: 구매 기록, 판매 기록, 재고 추적, 손익 정산

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│           (TypeScript + Ant Design + Axios)                │
│   Port: 3000 | Node.js 개발 서버                           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST API
                         │
┌─────────────────────────────────────────────────────────────┐
│                   Nginx Reverse Proxy                       │
│   (Port 80/443 → Backend Port 8000 라우팅)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│                Backend (FastAPI)                            │
│   (Python + SQLAlchemy + Alembic)                          │
│   Port: 8000 | 비동기 처리                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ SQLAlchemy ORM
                         │
┌─────────────────────────────────────────────────────────────┐
│            PostgreSQL Database                              │
│   Host: 129.212.227.252:5433                               │
│   Database: shoepalace                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend 상세 분석

### 디렉토리 구조

```
backend/
├── main.py                          # FastAPI 애플리케이션 엔트리포인트
├── requirements.txt                 # Python 의존성
├── Dockerfile                       # Docker 이미지 빌드
├── docker-compose.yml              # 로컬 개발 환경
├── alembic/                        # 데이터베이스 마이그레이션
├── app/
│   ├── api/
│   │   ├── api_v1/
│   │   │   ├── api.py              # 모든 라우터 통합
│   │   │   └── endpoints/          # 각 엔드포인트 정의
│   │   │       ├── purchases.py    # 구매 관련 API
│   │   │       ├── sales.py        # 판매 관련 API
│   │   │       ├── inventory.py    # 재고 관련 API
│   │   │       ├── products.py     # 상품 관련 API
│   │   │       ├── settlements.py  # 정산 관련 API
│   │   │       ├── auth.py         # 인증 관련 API
│   │   │       ├── users.py        # 사용자 관리 API
│   │   │       ├── uploads.py      # 파일 업로드 API
│   │   │       └── (기타 엔드포인트)
│   ├── models/                     # SQLAlchemy ORM 모델
│   │   ├── product.py              # Product 테이블
│   │   ├── inventory.py            # Inventory 테이블
│   │   ├── purchase.py             # Purchase, PurchaseItem
│   │   ├── sale.py                 # Sale, SaleItem
│   │   ├── user.py                 # User 테이블
│   │   ├── warehouse.py            # Warehouse 테이블
│   │   └── (기타 모델)
│   ├── schemas/                    # Pydantic 요청/응답 스키마
│   │   ├── purchase.py             # PurchaseCreate, PurchaseResponse
│   │   ├── sale.py                 # SaleCreate, SaleResponse
│   │   ├── inventory.py            # InventoryResponse 등
│   │   └── (기타 스키마)
│   ├── crud/                       # CRUD 데이터 접근 레이어
│   │   ├── purchase.py             # 구매 CRUD
│   │   ├── sale.py                 # 판매 CRUD
│   │   ├── inventory.py            # 재고 CRUD
│   │   └── (기타 CRUD)
│   ├── services/                   # 비즈니스 로직
│   │   ├── purchase_service.py     # 구매 비즈니스 로직
│   │   ├── inventory_service.py    # 재고 조정 로직
│   │   └── (기타 서비스)
│   ├── core/
│   │   ├── config.py               # 환경 설정, JWT, CORS
│   │   ├── security.py             # JWT 토큰 생성/검증
│   │   └── constants.py            # 상수 정의
│   ├── db/
│   │   ├── database.py             # PostgreSQL 연결 설정
│   │   └── session.py              # DB 세션 관리
│   └── utils/                      # 유틸리티 함수
│       ├── file_upload.py          # 파일 업로드 처리
│       ├── number_generator.py     # 구매/판매 번호 생성
│       └── (기타 유틸)
├── scripts/                        # 관리 스크립트
│   ├── init_db.py                  # DB 초기화
│   └── (기타 스크립트)
└── NIKE_SCRAPING_GUIDE.md         # 나이키 크롤러 가이드
```

### 핵심 파일 설명

| 파일 | 경로 | 역할 |
|------|------|------|
| **main.py** | `backend/main.py` | FastAPI 앱 생성, 라우터 등록, CORS 설정, PORT 8000에서 실행 |
| **config.py** | `backend/app/core/config.py` | DB URL, JWT 시크릿, CORS 화이트리스트, 파일 업로드 경로 설정 |
| **database.py** | `backend/app/db/database.py` | SQLAlchemy 엔진, 세션 팩토리, Base 모델 정의 |
| **security.py** | `backend/app/core/security.py` | JWT 토큰 생성/검증, 비밀번호 해싱 |
| **api.py** | `backend/app/api/api_v1/api.py` | 모든 라우터 통합 (구매, 판매, 재고 등) |

### Python 주요 의존성

```
FastAPI==0.104.1              # 웹 프레임워크
SQLAlchemy==2.0.23            # ORM
psycopg2-binary==2.9.9        # PostgreSQL 드라이버
alembic==1.12.1               # 데이터베이스 마이그레이션
pydantic==2.5.0               # 데이터 검증
python-jose==3.3.0            # JWT 토큰
passlib==1.7.4                # 비밀번호 해싱
python-multipart==0.0.6       # 파일 업로드
pandas==2.1.3                 # 데이터 분석
playwright==1.40.0            # 웹 자동화 (크롤링)
aiohttp==3.9.1                # 비동기 HTTP 클라이언트
requests==2.31.0              # HTTP 클라이언트
python-dotenv==1.0.0          # 환경변수 로드
```

---

## Frontend 상세 분석

### 디렉토리 구조

```
frontend/
├── public/                         # 정적 파일
│   └── index.html                 # HTML 엔트리포인트
├── src/
│   ├── App.tsx                    # 라우팅 및 레이아웃
│   ├── index.tsx                  # React 렌더링 엔트리
│   ├── pages/                     # 페이지 컴포넌트 (라우트별)
│   │   ├── Dashboard/             # 대시보드 (/)
│   │   ├── Purchase/              # 구매 관리 (/purchases)
│   │   ├── Sale/                  # 판매 관리 (/sales)
│   │   ├── Inventory/             # 재고 관리 (/inventory)
│   │   ├── Product/               # 상품 관리 (/products)
│   │   ├── Settlement/            # 정산 (/settlements)
│   │   ├── User/                  # 사용자 관리 (/users)
│   │   ├── Warehouse/             # 창고 관리 (/warehouses)
│   │   ├── Chat/                  # 채팅 (/chat)
│   │   ├── CardTransaction/       # 카드 거래내역
│   │   ├── BankTransaction/       # 은행 거래내역
│   │   ├── Adidas/                # 아디다스 관리
│   │   ├── Poizon/                # Poizon 가격비교
│   │   ├── Mobile/                # 모바일 QR 기반 업로드
│   │   ├── Login/                 # 로그인 페이지 (/login)
│   │   └── NotFound/              # 404 페이지
│   ├── components/                # 재사용 컴포넌트
│   │   ├── Layout/                # 레이아웃 컴포넌트
│   │   ├── Table/                 # 테이블 컴포넌트
│   │   ├── Form/                  # 폼 컴포넌트
│   │   └── (기타 컴포넌트)
│   ├── services/                  # API 서비스 레이어
│   │   ├── api.ts                 # Axios 설정, 인터셉터
│   │   ├── auth.ts                # 인증 API
│   │   ├── purchase.ts            # 구매 API
│   │   ├── sale.ts                # 판매 API
│   │   ├── inventory.ts           # 재고 API
│   │   ├── product.ts             # 상품 API
│   │   └── (기타 서비스)
│   ├── contexts/                  # React Context
│   │   ├── AuthContext.tsx        # 인증 상태 관리
│   │   └── (기타 Context)
│   ├── types/                     # TypeScript 타입 정의
│   │   ├── index.ts               # 공통 타입
│   │   ├── purchase.ts            # 구매 관련 타입
│   │   ├── sale.ts                # 판매 관련 타입
│   │   ├── inventory.ts           # 재고 관련 타입
│   │   ├── product.ts             # 상품 타입
│   │   ├── user.ts                # 사용자 타입
│   │   └── (기타 타입)
│   ├── utils/                     # 유틸리티 함수
│   │   ├── format.ts              # 포맷 함수 (숫자, 날짜)
│   │   ├── validation.ts          # 유효성 검사
│   │   └── (기타 유틸)
│   ├── styles/                    # 전역 스타일
│   │   └── index.css              # 전역 CSS
│   └── constants/                 # 상수 정의
│       ├── api.ts                 # API 엔드포인트 경로
│       ├── roles.ts               # 사용자 역할 정의
│       └── (기타 상수)
├── package.json                    # NPM 의존성
├── tsconfig.json                   # TypeScript 설정
└── .env.example                    # 환경변수 템플릿
```

### 핵심 파일 설명

| 파일 | 경로 | 역할 |
|------|------|------|
| **App.tsx** | `frontend/src/App.tsx` | 라우트 정의, 레이아웃 구성 |
| **api.ts** | `frontend/src/services/api.ts` | Axios 인스턴스, 인터셉터 (토큰 자동 추가) |
| **AuthContext.tsx** | `frontend/src/contexts/AuthContext.tsx` | 전역 인증 상태 관리 (로그인, 로그아웃, 토큰) |
| **index.tsx** | `frontend/src/index.tsx` | React 렌더링 엔트리포인트 |
| **package.json** | `frontend/package.json` | NPM 의존성 정의 |

### TypeScript/JavaScript 주요 의존성

```
React==18.2.0                 # UI 라이브러리
TypeScript==4.9.5             # 타입 언어
Ant Design==5.12.8            # UI 컴포넌트 라이브러리
Axios==1.6.2                  # HTTP 클라이언트
React Router==6.20.1          # 라우팅
Recharts==2.10.3              # 차트 라이브러리
DayJS==1.11.10                # 날짜 라이브러리
```

---

## 데이터베이스 스키마

### 핵심 테이블 구조

#### 1. **Product** (상품)
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,      -- 상품 코드 (예: "AB-12345-1")
    product_name VARCHAR(200),            -- 상품명
    brand_id INTEGER FOREIGN KEY,         -- 브랜드 ID
    category_id INTEGER FOREIGN KEY,      -- 카테고리 ID
    size VARCHAR(50),                     -- 사이즈 (예: "M", "Large")
    retail_price DECIMAL,                 -- 소매가
    purchase_price DECIMAL,               -- 구매가
    is_active BOOLEAN DEFAULT TRUE,       -- 활성 여부
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 2. **Purchase** (구매 기록)
```sql
CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    purchase_number VARCHAR(50) UNIQUE,   -- 구매번호 (예: "P20260703001")
    purchase_date DATE,                   -- 구매 날짜
    total_amount DECIMAL,                 -- 총 구매액
    payment_method VARCHAR(50),           -- 결제 방식 (현금/카드/이체)
    receipt_image_url VARCHAR(500),       -- 영수증 이미지
    status VARCHAR(50),                   -- 상태 (대기/입고확인/취소)
    user_id INTEGER FOREIGN KEY,          -- 구매자 사용자 ID
    warehouse_id INTEGER FOREIGN KEY,     -- 창고 ID
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER FOREIGN KEY,      -- 구매 ID
    product_id INTEGER FOREIGN KEY,       -- 상품 ID
    quantity INTEGER,                     -- 구매 수량
    unit_price DECIMAL,                   -- 단가
    total_price DECIMAL,                  -- 소계 (quantity * unit_price)
    created_at TIMESTAMP
);
```

#### 3. **Sale** (판매 기록)
```sql
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    sale_number VARCHAR(50) UNIQUE,       -- 판매번호 (예: "S20260703001")
    sale_date DATE,                       -- 판매 날짜
    customer_name VARCHAR(100),           -- 고객명
    customer_contact VARCHAR(50),         -- 고객연락처
    total_sale_price DECIMAL,             -- 총 판매액
    status VARCHAR(50),                   -- 상태 (대기/판매완료/취소)
    user_id INTEGER FOREIGN KEY,          -- 판매자 사용자 ID
    warehouse_id INTEGER FOREIGN KEY,     -- 창고 ID
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER FOREIGN KEY,          -- 판매 ID
    product_id INTEGER FOREIGN KEY,       -- 상품 ID
    quantity INTEGER,                     -- 판매 수량
    sale_price DECIMAL,                   -- 판매가
    total_sale_price DECIMAL,             -- 소계
    created_at TIMESTAMP
);
```

#### 4. **Inventory** (재고)
```sql
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER FOREIGN KEY UNIQUE, -- 상품 ID
    warehouse_id INTEGER FOREIGN KEY,      -- 창고 ID
    available_qty INTEGER DEFAULT 0,       -- 가용 수량
    reserved_qty INTEGER DEFAULT 0,        -- 예약 수량
    defective_qty INTEGER DEFAULT 0,       -- 결함품 수량
    lacking_qty INTEGER DEFAULT 0,         -- 부족품 수량
    total_qty INTEGER GENERATED AS (
        available_qty + reserved_qty + defective_qty + lacking_qty
    ) STORED,                              -- 총 수량
    min_stock_level INTEGER DEFAULT 5,     -- 최소 재고 레벨
    last_updated TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 5. **InventoryAdjustment** (재고 조정 기록)
```sql
CREATE TABLE inventory_adjustments (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER FOREIGN KEY,      -- 재고 ID
    adjustment_type VARCHAR(50),           -- 조정 유형 (증가/감소/반품/결함)
    quantity_before INTEGER,               -- 조정 전 수량
    quantity_after INTEGER,                -- 조정 후 수량
    change_quantity INTEGER,               -- 변경 수량
    reason VARCHAR(255),                   -- 사유
    created_by INTEGER FOREIGN KEY,        -- 조정자 ID
    created_at TIMESTAMP
);
```

#### 6. **User** (사용자)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE,           -- 사용자명
    email VARCHAR(100) UNIQUE,             -- 이메일
    hashed_password VARCHAR(255),          -- 해시된 비밀번호
    full_name VARCHAR(100),                -- 이름
    role VARCHAR(50),                      -- 역할 (admin/buyer/seller)
    is_active BOOLEAN DEFAULT TRUE,        -- 활성 여부
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 7. **Settlement** (정산)
```sql
CREATE TABLE settlements (
    id SERIAL PRIMARY KEY,
    settlement_number VARCHAR(50) UNIQUE,  -- 정산번호
    start_date DATE,                       -- 정산 시작일
    end_date DATE,                         -- 정산 종료일
    total_sales DECIMAL,                   -- 총 판매액
    total_fees DECIMAL,                    -- 총 수수료
    settlement_amount DECIMAL,             -- 정산액
    user_id INTEGER FOREIGN KEY,           -- 정산 대상 사용자
    status VARCHAR(50),                    -- 상태 (진행중/완료/취소)
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## API 엔드포인트

### 인증 API (`/api/v1/auth/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/login` | 로그인 (username, password) → JWT 토큰 반환 |
| POST | `/logout` | 로그아웃 |
| POST | `/refresh` | 토큰 갱신 |
| POST | `/token` | 토큰 검증 |

### 구매 API (`/api/v1/purchases/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 구매 목록 조회 (페이지네이션, 필터) |
| POST | `/` | 신규 구매 등록 |
| GET | `/{id}` | 구매 상세 조회 |
| PUT | `/{id}` | 구매 수정 |
| DELETE | `/{id}` | 구매 삭제 |
| POST | `/{id}/confirm` | 입고 확인 |
| GET | `/{id}/items` | 구매 상품 목록 |

### 판매 API (`/api/v1/sales/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 판매 목록 조회 |
| POST | `/` | 신규 판매 등록 |
| GET | `/{id}` | 판매 상세 조회 |
| PUT | `/{id}` | 판매 수정 |
| DELETE | `/{id}` | 판매 삭제 |
| GET | `/{id}/items` | 판매 상품 목록 |

### 재고 API (`/api/v1/inventory/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 재고 현황 조회 |
| GET | `/{id}` | 상품별 재고 상세 |
| POST | `/{id}/adjust` | 재고 조정 (증가/감소/반품) |
| POST | `/{id}/mark-defective` | 결함품 마킹 |
| GET | `/adjustments/history` | 재고 조정 이력 |
| POST | `/check-min-stock` | 최소 재고 체크 |

### 상품 API (`/api/v1/products/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 상품 목록 조회 |
| POST | `/` | 신규 상품 등록 |
| GET | `/{id}` | 상품 상세 조회 |
| PUT | `/{id}` | 상품 수정 |
| DELETE | `/{id}` | 상품 삭제 |
| GET | `/by-code/{code}` | 상품 코드로 조회 |

### 정산 API (`/api/v1/settlements/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 정산 목록 조회 |
| POST | `/` | 신규 정산 생성 |
| GET | `/{id}` | 정산 상세 조회 |
| PUT | `/{id}` | 정산 수정 |
| POST | `/{id}/complete` | 정산 완료 |

### 사용자 API (`/api/v1/users/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 사용자 목록 (관리자만) |
| POST | `/` | 사용자 등록 |
| GET | `/me` | 현재 사용자 정보 |
| PUT | `/me` | 현재 사용자 정보 수정 |
| GET | `/{id}` | 사용자 상세 조회 |
| PUT | `/{id}` | 사용자 정보 수정 (관리자) |
| DELETE | `/{id}` | 사용자 삭제 (관리자) |

### 파일 업로드 API (`/api/v1/uploads/`)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/` | 파일 업로드 (영수증, 상품 이미지) |
| POST | `/mobile` | 모바일에서 파일 업로드 (QR 토큰 인증) |
| GET | `/{filename}` | 파일 다운로드 |
| DELETE | `/{filename}` | 파일 삭제 |

### 기타 API

| 엔드포인트 | 설명 |
|-----------|------|
| `/api/v1/warehouses/` | 창고 관리 |
| `/api/v1/brands/` | 브랜드 관리 |
| `/api/v1/categories/` | 카테고리 관리 |
| `/api/v1/chat/` | 실시간 채팅 |
| `/api/v1/kream-scraper/` | KREAM 상품 크롤러 |
| `/api/v1/poizon/` | Poizon API 연동 |
| `/api/v1/adidas-accounts/` | 아디다스 계정 관리 |
| `/api/v1/card-transactions/` | 카드 거래내역 (CODEF) |
| `/api/v1/bank-transactions/` | 은행 거래내역 (CODEF) |

---

## 기술 스택

### Backend

| 계층 | 기술 | 버전 |
|------|------|------|
| **Web Framework** | FastAPI | 0.104.1 |
| **ORM** | SQLAlchemy | 2.0.23 |
| **Database** | PostgreSQL | 14+ |
| **Driver** | psycopg2-binary | 2.9.9 |
| **Validation** | Pydantic | 2.5.0 |
| **Auth** | JWT (python-jose) | 3.3.0 |
| **Password** | Passlib + bcrypt | 1.7.4 |
| **Migration** | Alembic | 1.12.1 |
| **File Upload** | python-multipart | 0.0.6 |
| **Data Processing** | Pandas | 2.1.3 |
| **Web Scraping** | Playwright | 1.40.0 |
| **HTTP Client** | Aiohttp / Requests | 3.9.1 / 2.31.0 |
| **Runtime** | Python | 3.10+ |

### Frontend

| 계층 | 기술 | 버전 |
|------|------|------|
| **Framework** | React | 18.2.0 |
| **Language** | TypeScript | 4.9.5 |
| **UI Framework** | Ant Design | 5.12.8 |
| **HTTP Client** | Axios | 1.6.2 |
| **Routing** | React Router | 6.20.1 |
| **Charts** | Recharts | 2.10.3 |
| **Dates** | DayJS | 1.11.10 |
| **Build Tool** | Vite 또는 Create React App | - |
| **Runtime** | Node.js | 18+ |

### DevOps

| 항목 | 기술 |
|------|------|
| **Containerization** | Docker & Docker Compose |
| **Reverse Proxy** | Nginx |
| **Database Host** | 129.212.227.252:5433 |
| **Production Server** | 133.186.221.84 |

---

## 배포 구조

### 개발 환경 (Docker Compose)

```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/shoepalace
      - JWT_SECRET_KEY=your-secret-key
    depends_on:
      - db
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=shoepalace
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  nginx:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
```

### 운영 환경 배포

- **Backend**: 운영 서버 (133.186.221.84)의 Docker 컨테이너
- **Database**: 별도 DB 서버 (129.212.227.252:5433)
- **Reverse Proxy**: Nginx가 Port 80/443에서 백엔드 (Port 8000)으로 라우팅

---

## 주요 기능 정리

### 1. 구매(입고) 관리
- ✅ 구매 등록 (구매번호 자동 생성: P+날짜+순번)
- ✅ 결제 방식 관리 (현금/카드/이체)
- ✅ 영수증 이미지 업로드
- ✅ 입고 확인 (재고에 반영)
- ✅ 구매 수정/삭제/취소
- ✅ 다중 상품 한 번에 구매 가능

### 2. 판매(출고) 관리
- ✅ 판매 등록 (판매번호 자동 생성: S+날짜+순번)
- ✅ 고객 정보 관리 (이름, 연락처)
- ✅ 판매가 추적 및 마진율 계산
- ✅ 판매 수정/삭제/취소
- ✅ 다중 상품 한 번에 판매 가능

### 3. 재고 관리
- ✅ 실시간 재고 조회
- ✅ 수량 분류 (가용/예약/결함/부족)
- ✅ 최소 재고 레벨 설정 및 알림
- ✅ 재고 조정 (증가/감소/반품)
- ✅ 결함품 마킹 및 사유 기록
- ✅ 재고 조정 이력 추적

### 4. 상품 관리
- ✅ 상품 등록 (상품 코드, 사이즈, 가격)
- ✅ 브랜드/카테고리 분류
- ✅ 상품 이미지 업로드
- ✅ 상품 활성화/비활성화
- ✅ 상품 검색 (코드/이름)

### 5. 정산 관리
- ✅ 정산 기간 설정
- ✅ 판매액 집계
- ✅ 수수료 계산
- ✅ 정산액 조회
- ✅ 정산 완료 처리

### 6. 사용자 관리
- ✅ 로그인/로그아웃 (JWT)
- ✅ Role 기반 접근 제어 (Admin/Buyer/Seller)
- ✅ 사용자 등록/수정/삭제
- ✅ 비밀번호 변경

### 7. 파일 관리
- ✅ 영수증 이미지 업로드
- ✅ 상품 이미지 업로드
- ✅ 모바일 QR 코드 기반 원격 업로드
- ✅ 파일 다운로드/삭제

### 8. 실시간 알림
- ✅ 재고 부족 알림
- ✅ 정산 완료 알림
- ✅ 신규 구매/판매 알림

### 9. 채팅
- ✅ 실시간 메시지 송수신
- ✅ 사용자 간 채팅

### 10. 외부 연동
- ✅ **KREAM** 상품 크롤러 (상품명, 가격 조회)
- ✅ **Poizon** API (스니커즈 시세 조회)
- ✅ **아디다스** 자동화 (쿠폰, 계정 관리)
- ✅ **CODEF** API (카드/은행 거래내역)
- ✅ **네이버 쇼핑** 검색

---

## 파일 경로 맵

### Backend 핵심 파일
```
C:\개인\01_shoepalace\01_입출고관리시스템\소스코드\backend\
├── main.py                                  # FastAPI 엔트리포인트
├── requirements.txt                        # Python 의존성
├── Dockerfile                              # Docker 이미지
├── docker-compose.yml                      # 로컬 개발 환경
├── app/core/config.py                      # 설정
├── app/core/security.py                    # JWT/보안
├── app/db/database.py                      # DB 연결
├── app/api/api_v1/api.py                   # 라우터 통합
├── app/models/
│   ├── product.py
│   ├── purchase.py
│   ├── sale.py
│   ├── inventory.py
│   ├── user.py
│   └── (기타)
├── app/crud/
│   ├── purchase.py
│   ├── sale.py
│   └── (기타)
├── app/schemas/
│   ├── purchase.py
│   ├── sale.py
│   └── (기타)
└── app/api/api_v1/endpoints/
    ├── purchases.py
    ├── sales.py
    ├── inventory.py
    ├── products.py
    ├── settlements.py
    └── (기타)
```

### Frontend 핵심 파일
```
C:\개인\01_shoepalace\01_입출고관리시스템\소스코드\frontend\
├── package.json                            # NPM 의존성
├── tsconfig.json                           # TypeScript 설정
├── src/
│   ├── App.tsx                             # 라우트/레이아웃
│   ├── index.tsx                           # 렌더링 엔트리
│   ├── services/
│   │   ├── api.ts                          # Axios 설정
│   │   ├── auth.ts
│   │   ├── purchase.ts
│   │   ├── sale.ts
│   │   └── (기타)
│   ├── contexts/
│   │   └── AuthContext.tsx                 # 인증 상태
│   ├── pages/
│   │   ├── Dashboard/
│   │   ├── Purchase/
│   │   ├── Sale/
│   │   ├── Inventory/
│   │   └── (기타)
│   ├── types/
│   │   ├── index.ts
│   │   ├── purchase.ts
│   │   ├── sale.ts
│   │   └── (기타)
│   └── components/
└── public/
    └── index.html
```

### 기타 주요 파일
```
C:\개인\01_shoepalace\01_입출고관리시스템\소스코드\
├── docker-compose.yml                      # 개발 환경
├── docker-compose.prod.yml                 # 운영 환경
├── nginx/                                  # Nginx 설정
│   └── nginx.conf
├── docs/                                   # 문서
│   └── DEPLOY_SETUP.md
└── scripts/                                # 관리 스크립트
```

---

## 요약

**입출고관리시스템**은 신발 및 명품 구매/판매 재고 관리를 위한 **Full-Stack 웹 애플리케이션**입니다.

### 핵심 특징
1. **실시간 재고 관리**: 가용/예약/결함/부족 수량 분류
2. **구매/판매 이력 추적**: 자동 번호 생성, 거래 기록
3. **다중 역할 지원**: Admin/Buyer/Seller 권한 관리
4. **외부 연동**: KREAM, Poizon, 아디다스, CODEF 등
5. **모바일 지원**: QR 코드 기반 이미지 업로드
6. **실시간 알림**: 재고/정산 상태 변화 알림

### 기술 우수성
- **FastAPI**: 빠른 성능, 자동 API 문서 생성
- **SQLAlchemy ORM**: 타입 안전 데이터 접근
- **React + TypeScript**: 정적 타입 안전성
- **Docker**: 일관된 배포 환경
- **PostgreSQL**: 강력한 데이터 무결성

---

**작성일**: 2026-07-03  
**분석자**: Claude Code  
**상태**: 완료
