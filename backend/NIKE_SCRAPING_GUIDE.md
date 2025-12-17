# Nike 상품 크롤링 및 DB Import 가이드

## 📋 개요
Nike 온라인 스토어에서 상품 정보를 크롤링하여 DB에 import하는 방법

## ⚠️ 주의사항
- **일회성 사용 목적**입니다
- Nike robots.txt는 제품 페이지 크롤링을 금지하고 있습니다
- 과도한 요청은 IP 차단을 초래할 수 있습니다
- **개인적/교육적 목적으로만 사용하세요**

## 🔧 사전 준비

### 1. Selenium 설치
```bash
pip install selenium webdriver-manager
```

또는 requirements.txt에 추가:
```
selenium==4.15.2
webdriver-manager==4.0.1
```

### 2. Chrome 드라이버 설치 (자동)
webdriver-manager를 사용하면 자동으로 드라이버를 다운로드합니다.

수동 설치가 필요한 경우:
- https://chromedriver.chromium.org/downloads
- Chrome 버전과 일치하는 드라이버 다운로드
- PATH에 추가

## 📝 실행 방법

### Step 1: 패키지 설치
```bash
cd backend
pip install selenium webdriver-manager
```

### Step 2: 크롤링 실행
```bash
python scrape_nike.py
```

실행 결과:
- `nike_products.json` 파일 생성 (상품 데이터)
- 콘솔에 진행 상황 출력

### Step 3: DB에 Import
```bash
python import_nike_products.py
```

실행 결과:
- Nike 브랜드 생성 (없는 경우)
- 상품 데이터 DB에 삽입
- 재고 데이터 초기화 (수량 0)

## 🐳 Docker 환경에서 실행

### 1. 백엔드 컨테이너 접속
```bash
docker exec -it shoepalace_backend bash
```

### 2. Selenium 설치 (컨테이너 내부)
```bash
pip install selenium webdriver-manager

# Chrome 설치 (Debian/Ubuntu)
apt-get update
apt-get install -y wget gnupg
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list
apt-get update
apt-get install -y google-chrome-stable
```

### 3. 스크립트 실행
```bash
python scrape_nike.py
python import_nike_products.py
```

## 📊 데이터 구조

### 크롤링되는 데이터 (nike_products.json)
```json
[
  {
    "name": "상품명",
    "subtitle": "부제목/모델명",
    "price": "가격",
    "color": "색상",
    "image_url": "이미지 URL",
    "product_url": "상품 URL",
    "product_code": "상품 코드"
  }
]
```

### DB 삽입 데이터
- **products 테이블**
  - brand_id: Nike 브랜드 UUID
  - product_code: 상품 코드 (중복 체크)
  - product_name: 상품명
  - category: "Men Shoes" (고정)
  - color: 색상
  - description: 가격, URL 등 추가 정보

- **inventory 테이블**
  - product_id: 상품 UUID
  - quantity: 0 (초기값)
  - location: "온라인"

## 🔍 트러블슈팅

### 문제: ChromeDriver 버전 불일치
```bash
# webdriver-manager 사용
pip install webdriver-manager

# scrape_nike.py 수정:
from webdriver_manager.chrome import ChromeDriverManager
driver = webdriver.Chrome(ChromeDriverManager().install(), options=options)
```

### 문제: 상품이 추출되지 않음
1. `nike_page_source.html` 파일 확인
2. CSS 선택자를 페이지 구조에 맞게 수정
3. `time.sleep()` 시간 증가 (렌더링 대기)

### 문제: DB 연결 실패
```bash
# .env 파일 확인
DATABASE_URL=postgresql://shoepalace_user:shoepalace_pass@localhost:5433/shoepalace

# 또는 환경변수 설정
export DATABASE_URL="postgresql://shoepalace_user:shoepalace_pass@localhost:5433/shoepalace"
```

### 문제: Docker에서 Chrome 설치 불가
headless Chrome 대신 Playwright 사용:
```bash
pip install playwright
playwright install chromium
```

## 📈 결과 확인

### DB에서 확인
```bash
# DB 접속
docker exec -it shoepalace_db psql -U shoepalace_user -d shoepalace

# 상품 확인
SELECT product_code, product_name, category, color
FROM products
WHERE brand_id = (SELECT id FROM brands WHERE name = 'Nike')
LIMIT 10;

# 재고 확인
SELECT p.product_name, i.quantity, i.location
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE p.brand_id = (SELECT id FROM brands WHERE name = 'Nike')
LIMIT 10;
```

### 프론트엔드에서 확인
1. http://localhost:3001 접속
2. 상품 관리 메뉴
3. 브랜드 필터: Nike 선택

## 🚀 다음 단계

1. **가격 필드 추가** (현재 products 테이블에 가격 필드 없음)
2. **사이즈별 데이터 생성** (같은 상품의 다른 사이즈)
3. **이미지 다운로드 및 로컬 저장**
4. **정기 업데이트 스케줄러** (선택사항)

## 📝 라이선스 & 면책
- 이 스크립트는 교육 목적으로 제공됩니다
- Nike의 이용약관 및 robots.txt를 준수하세요
- 상업적 사용 금지
- 데이터 사용에 대한 책임은 사용자에게 있습니다
