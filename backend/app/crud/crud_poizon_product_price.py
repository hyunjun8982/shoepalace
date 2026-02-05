"""
포이즌 상품 가격 정보 CRUD
"""
from typing import List, Dict
from sqlalchemy.orm import Session
from app.models.poizon_product_price import PoizonProductPrice


def get_prices_by_spu_id(db: Session, spu_id: int) -> List[PoizonProductPrice]:
    """
    SPU ID로 가격 정보 조회

    Args:
        db: DB 세션
        spu_id: SPU ID

    Returns:
        가격 정보 목록
    """
    return db.query(PoizonProductPrice).filter(
        PoizonProductPrice.spu_id == spu_id
    ).order_by(
        PoizonProductPrice.size_kr
    ).all()


def upsert_prices(db: Session, spu_id: int, prices_data: List[Dict]) -> int:
    """
    가격 정보 업데이트 (기존 데이터 삭제 후 새로 추가)

    해당 SPU의 기존 가격 정보를 모두 삭제하고 새 데이터로 교체

    Args:
        db: DB 세션
        spu_id: SPU ID
        prices_data: 가격 정보 목록
            [
                {
                    "sku_id": "862515439",
                    "size_kr": "215",
                    "size_us": "3.5",
                    "average_price": 89000
                },
                ...
            ]

    Returns:
        추가된 레코드 수
    """
    # 1. 해당 SPU의 기존 가격 정보 모두 삭제
    db.query(PoizonProductPrice).filter(
        PoizonProductPrice.spu_id == spu_id
    ).delete()

    # 2. 새 데이터 추가
    count = 0
    for price_data in prices_data:
        new_price = PoizonProductPrice(
            spu_id=spu_id,
            sku_id=price_data["sku_id"],
            size_kr=price_data["size_kr"],
            size_us=price_data.get("size_us"),
            average_price=price_data.get("average_price")
        )
        db.add(new_price)
        count += 1

    db.commit()
    return count


def delete_prices_by_spu_id(db: Session, spu_id: int) -> int:
    """
    SPU ID로 가격 정보 삭제

    Args:
        db: DB 세션
        spu_id: SPU ID

    Returns:
        삭제된 레코드 수
    """
    count = db.query(PoizonProductPrice).filter(
        PoizonProductPrice.spu_id == spu_id
    ).delete()
    db.commit()
    return count
