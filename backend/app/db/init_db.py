from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import SessionLocal, engine
from app.models import User, Brand, Product
from app.core.security import get_password_hash
from app.models.user import UserRole
import uuid

def run_migrations() -> None:
    """스키마 마이그레이션 실행"""
    with engine.connect() as conn:
        # feature_requests 테이블의 content 컬럼을 nullable로 변경
        try:
            conn.execute(text("ALTER TABLE feature_requests ALTER COLUMN content DROP NOT NULL"))
            conn.commit()
            print("Migration: feature_requests.content set to nullable")
        except Exception as e:
            # 이미 nullable이거나 테이블이 없는 경우 무시
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # sales 테이블에 progress_status 컬럼 추가
        try:
            # Enum 타입 생성
            conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE saleprogressstatus AS ENUM (
                        'partial_shipped', 'shipped', 'deposit',
                        'refund', 'additional_payment', 'out_of_stock'
                    );
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;
            """))

            # 컬럼 추가
            conn.execute(text("ALTER TABLE sales ADD COLUMN IF NOT EXISTS progress_status saleprogressstatus"))
            conn.commit()
            print("Migration: sales.progress_status column added")
        except Exception as e:
            # 이미 컬럼이 있거나 오류 발생 시 무시
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

def init_db() -> None:
    """데이터베이스 초기화"""
    # 테이블 생성 (이미 존재하면 무시)
    from app.db.database import Base
    Base.metadata.create_all(bind=engine)

    # 마이그레이션 실행
    run_migrations()

    db = SessionLocal()
    try:
        # 자동 계정 생성 제거됨 - 필요 시 수동으로 생성

        # 기본 브랜드들 생성
        brands_data = [
            {"name": "Nike", "description": "나이키", "icon_url": "/images/brands/nike.png"},
            {"name": "Adidas", "description": "아디다스", "icon_url": "/images/brands/adidas.png"},
            {"name": "Puma", "description": "퓨마", "icon_url": "/images/brands/puma.png"},
            {"name": "New Balance", "description": "뉴발란스", "icon_url": "/images/brands/newbalance.png"},
            {"name": "Supreme", "description": "슈프림", "icon_url": "/images/brands/supreme.png"},
            {"name": "Stussy", "description": "스투시", "icon_url": "/images/brands/sttussy.png"},
            {"name": "The North Face", "description": "노스페이스", "icon_url": "/images/brands/northface.png"},
            {"name": "Asics", "description": "아식스", "icon_url": None},
            {"name": "Converse", "description": "컨버스", "icon_url": None},
            {"name": "Vans", "description": "반스", "icon_url": None},
        ]

        for brand_data in brands_data:
            existing_brand = db.query(Brand).filter(Brand.name == brand_data["name"]).first()
            if not existing_brand:
                new_brand = Brand(
                    name=brand_data["name"],
                    description=brand_data["description"],
                    icon_url=brand_data.get("icon_url"),
                    is_active=True
                )
                db.add(new_brand)

        # 기본 상품들 생성 (주석 처리 - 필요시 수동으로 생성)
        # nike_brand = db.query(Brand).filter(Brand.name == "Nike").first()
        # adidas_brand = db.query(Brand).filter(Brand.name == "Adidas").first()
        #
        # if nike_brand and adidas_brand:
        #     products_data = [
        #         {"brand_id": nike_brand.id, "code": "AIR-001", "name": "에어맥스 270", "category": "shoes"},
        #         {"brand_id": nike_brand.id, "code": "FORCE-001", "name": "에어포스 1", "category": "shoes"},
        #         {"brand_id": adidas_brand.id, "code": "ULTRA-001", "name": "울트라부스트 22", "category": "shoes"},
        #         {"brand_id": adidas_brand.id, "code": "STAN-001", "name": "스탠스미스", "category": "shoes"},
        #     ]
        #
        #     for product_data in products_data:
        #         existing_product = db.query(Product).filter(Product.product_code == product_data["code"]).first()
        #         if not existing_product:
        #             new_product = Product(
        #                 id=uuid.uuid4(),
        #                 brand_id=product_data["brand_id"],
        #                 product_code=product_data["code"],
        #                 product_name=product_data["name"],
        #                 category=product_data["category"],
        #             )
        #             db.add(new_product)

        db.commit()
    finally:
        db.close()