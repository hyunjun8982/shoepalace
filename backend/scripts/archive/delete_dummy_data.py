"""
더미 데이터 삭제 스크립트
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.brand import Brand
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.purchase import PurchaseItem
from app.models.sale import SaleItem
from app.core.config import settings

# 데이터베이스 연결
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def delete_dummy_products():
    """스크립트로 추가한 더미 상품 삭제"""
    try:
        # 더미 상품 코드 패턴 (NK-, AD-, PM-, NB-, SP-, ST-, TNF-)
        dummy_patterns = ['NK-%', 'AD-%', 'PM-%', 'NB-%', 'SP-%', 'ST-%', 'TNF-%']

        deleted_count = 0
        for pattern in dummy_patterns:
            # 해당 패턴의 상품 찾기
            products = db.query(Product).filter(Product.product_code.like(pattern)).all()

            for product in products:
                # 관련된 재고 삭제
                db.query(Inventory).filter(Inventory.product_id == product.id).delete()

                # 구매/판매 내역이 있는지 확인
                has_purchase = db.query(PurchaseItem).filter(PurchaseItem.product_id == product.id).first()
                has_sale = db.query(SaleItem).filter(SaleItem.product_id == product.id).first()

                if not has_purchase and not has_sale:
                    # 구매/판매 내역이 없으면 삭제
                    db.delete(product)
                    deleted_count += 1
                else:
                    # 구매/판매 내역이 있으면 비활성화만
                    product.is_active = False
                    print(f"상품 '{product.product_name}'은 거래 내역이 있어 비활성화만 처리")

        db.commit()
        print(f"총 {deleted_count}개 더미 상품 삭제 완료")

        # 사용되지 않는 브랜드도 정리
        brands_to_check = ['Nike', 'Adidas', 'Puma', 'New Balance', 'UVU', 'Supreme', 'Stussy', 'The North Face']
        for brand_name in brands_to_check:
            brand = db.query(Brand).filter(Brand.name == brand_name).first()
            if brand:
                # 해당 브랜드의 활성 상품이 있는지 확인
                active_products = db.query(Product).filter(
                    Product.brand_id == brand.id,
                    Product.is_active == True
                ).first()

                if not active_products:
                    brand.is_active = False
                    print(f"브랜드 '{brand_name}' 비활성화")

        db.commit()

    except Exception as e:
        print(f"삭제 중 오류 발생: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("더미 데이터 삭제 시작...")
    delete_dummy_products()
    print("완료!")