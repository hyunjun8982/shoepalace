from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import SessionLocal, engine
from app.models import User, Brand, Product, NaverShoppingFilter, CodefSetting
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

        # poizon_products 테이블에 spu_id 컬럼 추가
        try:
            conn.execute(text("ALTER TABLE poizon_products ADD COLUMN IF NOT EXISTS spu_id BIGINT"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_poizon_products_spu_id ON poizon_products(spu_id)"))
            conn.commit()
            print("Migration: poizon_products.spu_id column added")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # poizon_product_prices 테이블 생성
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS poizon_product_prices (
                    id BIGSERIAL PRIMARY KEY,
                    spu_id BIGINT NOT NULL,
                    sku_id VARCHAR(50) NOT NULL UNIQUE,
                    size_kr VARCHAR(10) NOT NULL,
                    size_us VARCHAR(10),
                    average_price INTEGER,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_poizon_product_prices_spu_id ON poizon_product_prices(spu_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_poizon_product_prices_sku_id ON poizon_product_prices(sku_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_spu_id_size ON poizon_product_prices(spu_id, size_kr)"))
            conn.commit()
            print("Migration: poizon_product_prices table created")
        except Exception as e:
            # 이미 컬럼이 있거나 오류 발생 시 무시
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # poizon_products 테이블에 평균가 컬럼 추가 (페이지 로드 성능 향상)
        try:
            conn.execute(text("ALTER TABLE poizon_products ADD COLUMN IF NOT EXISTS avg_price_small INTEGER"))
            conn.execute(text("ALTER TABLE poizon_products ADD COLUMN IF NOT EXISTS avg_price_large INTEGER"))
            conn.execute(text("ALTER TABLE poizon_products ADD COLUMN IF NOT EXISTS avg_price_apparel INTEGER"))
            conn.commit()
            print("Migration: poizon_products average price columns added")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # poizon_product_prices.size_kr 컬럼 크기 증가 (10 -> 20)
        try:
            conn.execute(text("ALTER TABLE poizon_product_prices ALTER COLUMN size_kr TYPE VARCHAR(20)"))
            conn.commit()
            print("Migration: poizon_product_prices.size_kr column size increased to 20")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # codef_accounts 테이블 생성 (없으면 생성, user_id 포함)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS codef_accounts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    organization VARCHAR(10) NOT NULL,
                    login_id VARCHAR(200),
                    card_no VARCHAR(200),
                    connected_id VARCHAR(200),
                    owner_name VARCHAR(100),
                    is_connected BOOLEAN DEFAULT FALSE,
                    connected_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, organization)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_codef_accounts_user_id ON codef_accounts(user_id)"))
            conn.commit()
            print("Migration: codef_accounts table ensured")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # codef_accounts에 client_type 컬럼 추가 + unique constraint 변경
        try:
            conn.execute(text("ALTER TABLE codef_accounts ADD COLUMN IF NOT EXISTS client_type VARCHAR(1) NOT NULL DEFAULT 'P'"))
            # 기존 (user_id, organization) constraint 삭제, (user_id, organization, client_type)로 변경
            conn.execute(text("""
                DO $$ BEGIN
                    ALTER TABLE codef_accounts DROP CONSTRAINT IF EXISTS uix_codef_account_user_org;
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;
            """))
            conn.execute(text("""
                DO $$ BEGIN
                    ALTER TABLE codef_accounts ADD CONSTRAINT uix_codef_account_user_org_type
                        UNIQUE (user_id, organization, client_type);
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$;
            """))
            conn.commit()
            print("Migration: codef_accounts.client_type column + unique constraint updated")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # codef_accounts에 account_no 컬럼 추가 (은행 계좌번호)
        try:
            conn.execute(text("ALTER TABLE codef_accounts ADD COLUMN IF NOT EXISTS account_no VARCHAR(100)"))
            conn.commit()
            print("Migration: codef_accounts.account_no column added")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # card_transactions에 user_id, owner_name 컬럼 추가
        try:
            conn.execute(text("ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)"))
            conn.execute(text("ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_card_transactions_user_id ON card_transactions(user_id)"))
            conn.commit()
            print("Migration: card_transactions.user_id, owner_name columns added")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # bank_transactions 테이블 생성
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_transactions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID REFERENCES users(id),
                    owner_name VARCHAR(100),
                    organization VARCHAR(10) NOT NULL,
                    account_no VARCHAR(50),
                    account_name VARCHAR(100),
                    account_holder VARCHAR(100),
                    tr_date DATE NOT NULL,
                    tr_time VARCHAR(10),
                    description1 VARCHAR(200),
                    description2 VARCHAR(200),
                    description3 VARCHAR(200),
                    description4 VARCHAR(200),
                    tr_amount_out NUMERIC(15,2) NOT NULL DEFAULT 0,
                    tr_amount_in NUMERIC(15,2) NOT NULL DEFAULT 0,
                    balance NUMERIC(15,2) NOT NULL DEFAULT 0,
                    currency VARCHAR(10) DEFAULT 'KRW',
                    synced_at TIMESTAMP,
                    raw_data TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    CONSTRAINT uix_bank_transaction_unique UNIQUE (
                        organization, account_no, tr_date, tr_time,
                        tr_amount_out, tr_amount_in, balance
                    )
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_id ON bank_transactions(user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bank_transactions_organization ON bank_transactions(organization)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bank_transactions_tr_date ON bank_transactions(tr_date)"))
            conn.commit()
            print("Migration: bank_transactions table created")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # card_transactions에 client_type 컬럼 추가
        try:
            conn.execute(text("ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS client_type VARCHAR(1) DEFAULT 'P'"))
            conn.commit()
            print("Migration: card_transactions.client_type column added")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # 기존 card_transactions의 client_type을 codef_accounts 기준으로 업데이트
        try:
            result = conn.execute(text("""
                UPDATE card_transactions ct
                SET client_type = ca.client_type
                FROM codef_accounts ca
                WHERE ct.user_id = ca.user_id
                AND ct.organization = ca.organization
                AND (ct.client_type IS NULL OR ct.client_type = 'P')
                AND ca.client_type = 'B'
            """))
            conn.commit()
            updated = result.rowcount
            if updated > 0:
                print(f"Migration: card_transactions.client_type updated {updated} rows from codef_accounts")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # codef_api_logs 테이블 생성 (API 호출 제한 추적)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS codef_api_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    endpoint VARCHAR(300) NOT NULL,
                    user_id UUID,
                    status_code INTEGER,
                    res_code VARCHAR(20),
                    error_message TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_codef_api_logs_created_at ON codef_api_logs(created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_codef_api_logs_user_id ON codef_api_logs(user_id)"))
            conn.commit()
            print("Migration: codef_api_logs table created")
        except Exception as e:
            conn.rollback()
            print(f"Migration skipped or failed: {e}")

        # products 테이블에서 category 컬럼 제거
        try:
            conn.execute(text("ALTER TABLE products DROP COLUMN IF EXISTS category"))
            conn.commit()
            print("Migration: products.category column removed")
        except Exception as e:
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

        # 기본 네이버쇼핑 필터 생성
        default_filters = ["4910", "KREAM"]
        for filter_name in default_filters:
            existing_filter = db.query(NaverShoppingFilter).filter(
                NaverShoppingFilter.mall_name == filter_name
            ).first()
            if not existing_filter:
                new_filter = NaverShoppingFilter(mall_name=filter_name)
                db.add(new_filter)

        # CODEF API 기본 설정 생성
        codef_defaults = [
            {"setting_key": "client_id", "setting_value": "", "description": "CODEF Client ID", "is_encrypted": False},
            {"setting_key": "client_secret", "setting_value": "", "description": "CODEF Client Secret", "is_encrypted": True},
            {"setting_key": "public_key", "setting_value": "", "description": "CODEF RSA Public Key", "is_encrypted": False},
            {"setting_key": "connected_id", "setting_value": "", "description": "CODEF Connected ID", "is_encrypted": False},
            {"setting_key": "use_demo", "setting_value": "true", "description": "DEMO 서버 사용 여부 (true/false)", "is_encrypted": False},
        ]
        for setting_data in codef_defaults:
            existing = db.query(CodefSetting).filter(
                CodefSetting.setting_key == setting_data["setting_key"]
            ).first()
            if not existing:
                new_setting = CodefSetting(**setting_data)
                db.add(new_setting)

        db.commit()
    finally:
        db.close()