"""
Nike 상품 데이터를 데이터베이스에 추가하는 스크립트
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.brand import Brand
from app.models.product import Product
from app.core.config import settings
import random

# 데이터베이스 연결
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def clear_existing_data():
    """기존 데이터 정리 - 기존 상품은 비활성화만"""
    try:
        # 모든 기존 상품을 비활성화
        updated_count = db.query(Product).update({"is_active": False}, synchronize_session=False)
        db.commit()
        print(f"{updated_count}개 기존 상품 비활성화")
    except Exception as e:
        print(f"데이터 정리 중 오류: {e}")
        db.rollback()

def create_or_get_brands():
    """브랜드 생성 또는 기존 브랜드 조회"""
    brands_data = [
        {"name": "Nike", "description": "Just Do It"},
        {"name": "Adidas", "description": "Impossible is Nothing"},
        {"name": "Puma", "description": "Forever Faster"},
        {"name": "New Balance", "description": "Worn by superhumans"},
        {"name": "UVU", "description": "Urban Value United"},
        {"name": "Supreme", "description": "Supreme NYC"},
        {"name": "Stussy", "description": "International Stussy Tribe"},
        {"name": "The North Face", "description": "Never Stop Exploring"},
    ]

    created_brands = {}
    created_count = 0
    for brand_data in brands_data:
        # 기존 브랜드가 있는지 확인
        existing_brand = db.query(Brand).filter(Brand.name == brand_data["name"]).first()
        if existing_brand:
            created_brands[brand_data["name"]] = existing_brand.id
            # 설명 업데이트
            existing_brand.description = brand_data["description"]
            existing_brand.is_active = True
        else:
            brand = Brand(**brand_data)
            db.add(brand)
            db.flush()
            created_brands[brand_data["name"]] = brand.id
            created_count += 1

    db.commit()
    print(f"신규 {created_count}개, 기존 {len(brands_data) - created_count}개 브랜드 처리 완료")
    return created_brands

def create_nike_products(brand_id):
    """Nike 상품 생성"""
    nike_products = [
        # 러닝화
        {
            "brand_id": brand_id,
            "product_code": "NK-PEG40-270-BW",
            "product_name": "에어 줌 페가수스 40",
            "category": "shoes",
            "size": "270",
            "color": "Black/White",
            "description": "뛰어난 쿠셔닝과 반응성을 제공하는 데일리 러닝화",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-PEG40-275-BW",
            "product_name": "에어 줌 페가수스 40",
            "category": "shoes",
            "size": "275",
            "color": "Black/White",
            "description": "뛰어난 쿠셔닝과 반응성을 제공하는 데일리 러닝화",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-RIF4-270-PP",
            "product_name": "리액트 인피니티 런 4",
            "category": "shoes",
            "size": "270",
            "color": "Pure Platinum",
            "description": "부상 방지에 도움을 주는 안정적인 러닝화",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-VPF3-265-VB",
            "product_name": "베이퍼플라이 3",
            "category": "shoes",
            "size": "265",
            "color": "Volt/Black",
            "description": "카본 플레이트 탑재 레이싱 러닝화",
            "is_active": True
        },

        # 농구화
        {
            "brand_id": brand_id,
            "product_code": "NK-LB21-275-PG",
            "product_name": "르브론 21",
            "category": "shoes",
            "size": "275",
            "color": "Purple/Gold",
            "description": "르브론 제임스 시그니처 농구화",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-JD38-280-BR",
            "product_name": "조던 38",
            "category": "shoes",
            "size": "280",
            "color": "Black/Red",
            "description": "최신 조던 시그니처 농구화",
            "is_active": True
        },

        # 라이프스타일
        {
            "brand_id": brand_id,
            "product_code": "NK-AM90-270-WB",
            "product_name": "에어맥스 90",
            "category": "shoes",
            "size": "270",
            "color": "White/Black",
            "description": "클래식 에어맥스 스니커즈",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-AM90-275-WB",
            "product_name": "에어맥스 90",
            "category": "shoes",
            "size": "275",
            "color": "White/Black",
            "description": "클래식 에어맥스 스니커즈",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-AF1-270-TW",
            "product_name": "에어포스 1 '07",
            "category": "shoes",
            "size": "270",
            "color": "Triple White",
            "description": "영원한 클래식 농구화 스타일",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-DKL-265-PD",
            "product_name": "덩크 로우 레트로",
            "category": "shoes",
            "size": "265",
            "color": "Panda",
            "description": "80년대 농구 아이콘의 재해석",
            "is_active": True
        },

        # 의류
        {
            "brand_id": brand_id,
            "product_code": "NK-DFT-L-BK",
            "product_name": "드라이핏 런닝 티셔츠",
            "category": "clothing",
            "size": "L",
            "color": "Black",
            "description": "통기성이 뛰어난 러닝 티셔츠",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-TFH-M-GR",
            "product_name": "테크 플리스 후디",
            "category": "clothing",
            "size": "M",
            "color": "Gray",
            "description": "가볍고 따뜻한 테크 플리스 후디",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-SJP-L-BK",
            "product_name": "스우시 조거 팬츠",
            "category": "clothing",
            "size": "L",
            "color": "Black",
            "description": "편안한 핏의 조거 팬츠",
            "is_active": True
        },

        # 액세서리
        {
            "brand_id": brand_id,
            "product_code": "NK-HHP-F-BK",
            "product_name": "헤리티지 힙팩",
            "category": "bags",
            "size": "Free",
            "color": "Black",
            "description": "실용적인 힙색/크로스백",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-EBS-L-WB",
            "product_name": "엘리트 농구 양말",
            "category": "socks",
            "size": "L",
            "color": "White/Black",
            "description": "쿠셔닝이 강화된 농구 양말",
            "is_active": True
        },
        {
            "brand_id": brand_id,
            "product_code": "NK-ABC-F-BK",
            "product_name": "에어로빌 캡",
            "category": "hats",
            "size": "Free",
            "color": "Black",
            "description": "드라이핏 소재의 스포츠 캡",
            "is_active": True
        },
    ]

    for product_data in nike_products:
        product = Product(**product_data)
        db.add(product)

    print(f"Nike 상품 {len(nike_products)}개 추가 완료")

def create_other_brand_products(brands):
    """다른 브랜드 상품들 생성"""

    # Adidas 상품
    adidas_products = [
        {
            "brand_id": brands["Adidas"],
            "product_code": "AD-UB22-270-CB",
            "product_name": "울트라부스트 22",
            "category": "shoes",
            "size": "270",
            "color": "Core Black",
            "description": "부스트 쿠셔닝 러닝화",
            "is_active": True
        },
        {
            "brand_id": brands["Adidas"],
            "product_code": "AD-SS-275-WG",
            "product_name": "스탠스미스",
            "category": "shoes",
            "size": "275",
            "color": "White/Green",
            "description": "클래식 테니스화",
            "is_active": True
        },
        {
            "brand_id": brands["Adidas"],
            "product_code": "AD-TFH-M-BK",
            "product_name": "트레포일 후디",
            "category": "clothing",
            "size": "M",
            "color": "Black",
            "description": "아디다스 오리지널스 후디",
            "is_active": True
        },
    ]

    # Puma 상품
    puma_products = [
        {
            "brand_id": brands["Puma"],
            "product_code": "PM-SC-270-BW",
            "product_name": "스웨이드 클래식",
            "category": "shoes",
            "size": "270",
            "color": "Black/White",
            "description": "푸마 클래식 스니커즈",
            "is_active": True
        },
        {
            "brand_id": brands["Puma"],
            "product_code": "PM-RSX-265-MT",
            "product_name": "RS-X",
            "category": "shoes",
            "size": "265",
            "color": "Multi",
            "description": "복고풍 러닝 스니커즈",
            "is_active": True
        },
    ]

    # New Balance 상품
    nb_products = [
        {
            "brand_id": brands["New Balance"],
            "product_code": "NB-990-275-GR",
            "product_name": "990v6",
            "category": "shoes",
            "size": "275",
            "color": "Gray",
            "description": "프리미엄 메이드 인 USA",
            "is_active": True
        },
        {
            "brand_id": brands["New Balance"],
            "product_code": "NB-574-270-NV",
            "product_name": "574",
            "category": "shoes",
            "size": "270",
            "color": "Navy",
            "description": "뉴발란스 아이코닉 모델",
            "is_active": True
        },
    ]

    # Supreme 상품
    supreme_products = [
        {
            "brand_id": brands["Supreme"],
            "product_code": "SP-BLH-L-BK",
            "product_name": "박스 로고 후디",
            "category": "clothing",
            "size": "L",
            "color": "Black",
            "description": "슈프림 박스 로고 후디",
            "is_active": True
        },
        {
            "brand_id": brands["Supreme"],
            "product_code": "SP-SB-F-RD",
            "product_name": "숄더백",
            "category": "bags",
            "size": "Free",
            "color": "Red",
            "description": "슈프림 로고 숄더백",
            "is_active": True
        },
    ]

    # Stussy 상품
    stussy_products = [
        {
            "brand_id": brands["Stussy"],
            "product_code": "ST-BST-M-WH",
            "product_name": "베이직 스투시 티",
            "category": "clothing",
            "size": "M",
            "color": "White",
            "description": "스투시 로고 티셔츠",
            "is_active": True
        },
        {
            "brand_id": brands["Stussy"],
            "product_code": "ST-BH-F-BK",
            "product_name": "버킷햇",
            "category": "hats",
            "size": "Free",
            "color": "Black",
            "description": "스투시 버킷햇",
            "is_active": True
        },
    ]

    # The North Face 상품
    tnf_products = [
        {
            "brand_id": brands["The North Face"],
            "product_code": "TNF-NJ-L-BK",
            "product_name": "눕시 자켓",
            "category": "clothing",
            "size": "L",
            "color": "Black",
            "description": "구스다운 패딩 자켓",
            "is_active": True
        },
        {
            "brand_id": brands["The North Face"],
            "product_code": "TNF-BD-L-YL",
            "product_name": "베이스캠프 더플백",
            "category": "bags",
            "size": "L",
            "color": "Yellow",
            "description": "대용량 여행용 더플백",
            "is_active": True
        },
    ]

    all_products = (adidas_products + puma_products + nb_products +
                   supreme_products + stussy_products + tnf_products)

    for product_data in all_products:
        product = Product(**product_data)
        db.add(product)

    print(f"기타 브랜드 상품 {len(all_products)}개 추가 완료")

def main():
    print("상품 데이터 초기화 시작...")

    # 1. 기존 데이터 정리
    clear_existing_data()

    # 2. 브랜드 생성 또는 조회
    brands = create_or_get_brands()

    # 3. Nike 상품 생성
    create_nike_products(brands["Nike"])

    # 4. 다른 브랜드 상품 생성
    create_other_brand_products(brands)

    # 5. 커밋
    db.commit()

    # 6. 통계 출력
    total_products = db.query(Product).count()
    total_brands = db.query(Brand).count()

    print("\n=== 데이터 생성 완료 ===")
    print(f"총 브랜드 수: {total_brands}")
    print(f"총 상품 수: {total_products}")

    # 브랜드별 상품 수
    for brand_name, brand_id in brands.items():
        count = db.query(Product).filter(Product.brand_id == brand_id).count()
        if count > 0:
            print(f"  - {brand_name}: {count}개")

    db.close()

if __name__ == "__main__":
    main()