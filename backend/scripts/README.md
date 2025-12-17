# Backend Scripts

이 디렉토리는 백엔드 관련 유틸리티 스크립트를 포함합니다.

## 디렉토리 구조

```
scripts/
├── archive/              # 사용 완료된 스크립트 보관
│   ├── delete_dummy_data.py
│   ├── populate_nike_products.py
│   ├── scrape_nike_products.py
│   ├── test_nike_scraper.py
│   └── update_brand_icons.py
└── README.md
```

## Archive 디렉토리

`archive/` 디렉토리에는 개발 초기에 사용되었거나 1회성으로 실행된 스크립트들이 보관되어 있습니다.

### 보관된 스크립트 목록

- **delete_dummy_data.py**: 테스트용 더미 데이터 삭제 스크립트
- **populate_nike_products.py**: Nike 상품 초기 데이터 입력 스크립트
- **scrape_nike_products.py**: Nike 웹사이트 크롤링 스크립트
- **test_nike_scraper.py**: 스크래퍼 테스트 스크립트
- **update_brand_icons.py**: 브랜드 아이콘 업데이트 스크립트 (1회성)

### 주의사항

- 보관된 스크립트는 참고용으로만 사용하세요
- 프로덕션 환경에서 실행하지 마세요
- 필요시 현재 데이터베이스 스키마에 맞게 수정 후 사용하세요
