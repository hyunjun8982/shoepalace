"""
Poizon 상품 CRUD 함수
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.poizon_product import PoizonProduct


def get_products_by_brand(db: Session, brand_key: str, skip: int = 0, limit: int = 10000) -> List[PoizonProduct]:
    """브랜드별 상품 조회 (생성 순서 - 마지막 페이지 상품이 먼저 보임)"""
    return db.query(PoizonProduct).filter(
        PoizonProduct.brand_key == brand_key
    ).order_by(PoizonProduct.created_at.asc()).offset(skip).limit(limit).all()


def get_all_products(db: Session, skip: int = 0, limit: int = 10000) -> List[PoizonProduct]:
    """모든 상품 조회"""
    return db.query(PoizonProduct).offset(skip).limit(limit).all()


def get_product_by_article_number(db: Session, article_number: str) -> Optional[PoizonProduct]:
    """모델번호로 상품 조회"""
    return db.query(PoizonProduct).filter(
        PoizonProduct.article_number == article_number
    ).first()


def create_product(db: Session, product_data: dict) -> PoizonProduct:
    """상품 생성"""
    db_product = PoizonProduct(**product_data)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


def update_product(db: Session, product: PoizonProduct, product_data: dict) -> PoizonProduct:
    """상품 업데이트"""
    for key, value in product_data.items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


def upsert_product(db: Session, product_data: dict) -> PoizonProduct:
    """상품 생성 또는 업데이트 (article_number 기준)"""
    existing = get_product_by_article_number(db, product_data['article_number'])

    if existing:
        return update_product(db, existing, product_data)
    else:
        return create_product(db, product_data)


def delete_products_by_brand(db: Session, brand_key: str) -> int:
    """브랜드의 모든 상품 삭제"""
    count = db.query(PoizonProduct).filter(
        PoizonProduct.brand_key == brand_key
    ).delete()
    db.commit()
    return count


def count_products_by_brand(db: Session, brand_key: str) -> int:
    """브랜드별 상품 개수"""
    return db.query(PoizonProduct).filter(
        PoizonProduct.brand_key == brand_key
    ).count()


def batch_upsert_products(db: Session, products_data: List[dict]) -> int:
    """
    여러 상품을 한 번에 upsert (배치 처리)

    Args:
        db: DB 세션
        products_data: 상품 데이터 리스트

    Returns:
        처리된 상품 개수
    """
    count = 0

    for product_data in products_data:
        existing = get_product_by_article_number(db, product_data['article_number'])

        if existing:
            # 기존 상품 업데이트 (커밋 없이)
            for key, value in product_data.items():
                setattr(existing, key, value)
        else:
            # 새 상품 추가 (커밋 없이)
            db_product = PoizonProduct(**product_data)
            db.add(db_product)

        count += 1

    # 모든 처리가 끝난 후 한 번만 커밋
    db.commit()

    return count


def replace_brand_products(db: Session, brand_key: str, products_data: List[dict]) -> int:
    """
    브랜드 상품을 삭제하고 새로 추가 (페이지 순서는 유지)

    Args:
        db: DB 세션
        brand_key: 브랜드 키
        products_data: 상품 데이터 리스트

    Returns:
        추가된 상품 개수
    """
    # 1. 기존 브랜드 상품 모두 삭제
    db.query(PoizonProduct).filter(PoizonProduct.brand_key == brand_key).delete()
    db.commit()

    # 2. 새 상품 추가 (페이지 순서 그대로)
    count = 0
    for product_data in products_data:
        db_product = PoizonProduct(**product_data)
        db.add(db_product)
        count += 1

    db.commit()

    return count
