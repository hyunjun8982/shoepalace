import sys
import os

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.database import SessionLocal
from app.models.brand import Brand

def update_brand_icons():
    db = SessionLocal()

    # 브랜드별 이미지 파일명 매핑
    brand_icon_mapping = {
        'Nike': '/uploads/brands/nike.png',
        'Adidas': '/uploads/brands/adidas.png',
        'New Balance': '/uploads/brands/newbalance.png',
        'The North Face': '/uploads/brands/northface.png',
        'Puma': '/uploads/brands/puma.png',
        'Supreme': '/uploads/brands/supreme.png',
        'Stussy': '/uploads/brands/sttussy.png',
    }

    try:
        brands = db.query(Brand).all()
        print(f"총 {len(brands)}개의 브랜드를 찾았습니다.")

        for brand in brands:
            if brand.name in brand_icon_mapping:
                old_url = brand.icon_url
                brand.icon_url = brand_icon_mapping[brand.name]
                print(f"{brand.name}: {old_url} -> {brand.icon_url}")

        db.commit()
        print("\n브랜드 아이콘 URL이 업데이트되었습니다.")

    except Exception as e:
        db.rollback()
        print(f"에러 발생: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_brand_icons()
