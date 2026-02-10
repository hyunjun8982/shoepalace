"""아디다스 구매/판매 비교 API (임시)"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from uuid import UUID

from app.db.database import get_db
from app.models.adidas_comparison import AdidasComparisonPurchase, AdidasComparisonSale, AdidasComparisonInventory
from app.schemas.adidas_comparison import (
    AdidasComparisonPurchaseCreate,
    AdidasComparisonPurchaseInDB,
    AdidasComparisonSaleInDB,
    AdidasComparisonInventoryUpsert,
    AdidasComparisonInventoryInDB,
    AdidasComparisonSummary,
    AdidasComparisonSummaryResponse,
    AdidasComparisonStatsResponse,
)

router = APIRouter()


@router.get("/summary", response_model=AdidasComparisonSummaryResponse)
def get_comparison_summary(
    search: Optional[str] = Query(None, description="품번 검색"),
    db: Session = Depends(get_db),
):
    """품번별 구매·판매 수량 비교"""
    # 구매 합계
    purchase_agg = (
        db.query(
            AdidasComparisonPurchase.product_code,
            func.sum(AdidasComparisonPurchase.quantity).label("total_qty"),
        )
        .group_by(AdidasComparisonPurchase.product_code)
    )
    if search:
        purchase_agg = purchase_agg.filter(
            AdidasComparisonPurchase.product_code.ilike(f"%{search}%")
        )
    purchase_map = {row.product_code: row.total_qty for row in purchase_agg.all()}

    # 판매 합계
    sale_agg = (
        db.query(
            AdidasComparisonSale.product_code,
            func.sum(AdidasComparisonSale.quantity).label("total_qty"),
        )
        .group_by(AdidasComparisonSale.product_code)
    )
    if search:
        sale_agg = sale_agg.filter(
            AdidasComparisonSale.product_code.ilike(f"%{search}%")
        )
    sale_map = {row.product_code: row.total_qty for row in sale_agg.all()}

    # 재고 조회
    inventory_rows = db.query(
        AdidasComparisonInventory.product_code,
        AdidasComparisonInventory.quantity,
    ).all()
    inventory_map = {row.product_code: row.quantity for row in inventory_rows}

    # 합치기
    all_codes = sorted(set(
        list(purchase_map.keys()) + list(sale_map.keys()) + list(inventory_map.keys())
    ))
    items = []
    total_purchased = 0
    total_sold = 0

    for code in all_codes:
        p_qty = purchase_map.get(code, 0)
        s_qty = sale_map.get(code, 0)
        total_purchased += p_qty
        total_sold += s_qty
        inv_qty = inventory_map.get(code)
        inv_match = None
        if inv_qty is not None:
            inv_match = (p_qty - s_qty) == inv_qty
        items.append(AdidasComparisonSummary(
            product_code=code,
            total_purchased_qty=p_qty,
            total_sales_qty=s_qty,
            difference=p_qty - s_qty,
            inventory_qty=inv_qty,
            inventory_match=inv_match,
        ))

    return AdidasComparisonSummaryResponse(
        items=items,
        total=len(items),
        total_purchased=total_purchased,
        total_sold=total_sold,
    )


@router.get("/purchases")
def get_purchases(
    skip: int = 0,
    limit: int = 500,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """구매내역 목록"""
    query = db.query(AdidasComparisonPurchase)
    if search:
        query = query.filter(AdidasComparisonPurchase.product_code.ilike(f"%{search}%"))
    query = query.order_by(AdidasComparisonPurchase.product_code)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {
        "items": [AdidasComparisonPurchaseInDB.model_validate(i) for i in items],
        "total": total,
    }


@router.get("/sales")
def get_sales(
    skip: int = 0,
    limit: int = 500,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """판매내역 목록"""
    query = db.query(AdidasComparisonSale)
    if search:
        query = query.filter(AdidasComparisonSale.product_code.ilike(f"%{search}%"))
    query = query.order_by(AdidasComparisonSale.product_code)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {
        "items": [AdidasComparisonSaleInDB.model_validate(i) for i in items],
        "total": total,
    }


@router.get("/stats", response_model=AdidasComparisonStatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """통계"""
    purchase_count = db.query(func.sum(AdidasComparisonPurchase.quantity)).scalar() or 0
    sale_count = db.query(func.sum(AdidasComparisonSale.quantity)).scalar() or 0
    purchase_codes = db.query(func.count(func.distinct(AdidasComparisonPurchase.product_code))).scalar() or 0
    sale_codes = db.query(func.count(func.distinct(AdidasComparisonSale.product_code))).scalar() or 0
    return AdidasComparisonStatsResponse(
        purchase_count=purchase_count,
        sale_count=sale_count,
        purchase_product_codes=purchase_codes,
        sale_product_codes=sale_codes,
    )


@router.post("/purchases", response_model=AdidasComparisonPurchaseInDB)
def add_purchase(
    data: AdidasComparisonPurchaseCreate,
    db: Session = Depends(get_db),
):
    """구매내역 수동 추가"""
    record = AdidasComparisonPurchase(
        product_code=data.product_code.strip().upper(),
        size=data.size,
        quantity=data.quantity,
        unit_price=data.unit_price,
        buyer_name="수동",
        source="수동입력",
        note=data.note,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return AdidasComparisonPurchaseInDB.model_validate(record)


@router.delete("/purchases/{purchase_id}")
def delete_purchase(purchase_id: UUID, db: Session = Depends(get_db)):
    """구매내역 삭제"""
    record = db.query(AdidasComparisonPurchase).filter(
        AdidasComparisonPurchase.id == purchase_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="구매내역을 찾을 수 없습니다")
    db.delete(record)
    db.commit()
    return {"message": "삭제 완료"}


@router.post("/inventory", response_model=AdidasComparisonInventoryInDB)
def upsert_inventory(
    data: AdidasComparisonInventoryUpsert,
    db: Session = Depends(get_db),
):
    """재고 입력/수정 (품번 기준 upsert)"""
    code = data.product_code.strip().upper()
    record = db.query(AdidasComparisonInventory).filter(
        AdidasComparisonInventory.product_code == code
    ).first()
    if record:
        record.quantity = data.quantity
        record.note = data.note
    else:
        record = AdidasComparisonInventory(
            product_code=code,
            quantity=data.quantity,
            note=data.note,
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return AdidasComparisonInventoryInDB.model_validate(record)


@router.delete("/inventory/{product_code}")
def delete_inventory(product_code: str, db: Session = Depends(get_db)):
    """재고 삭제"""
    record = db.query(AdidasComparisonInventory).filter(
        AdidasComparisonInventory.product_code == product_code.upper()
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="재고 정보를 찾을 수 없습니다")
    db.delete(record)
    db.commit()
    return {"message": "삭제 완료"}


@router.delete("/all")
def delete_all(db: Session = Depends(get_db)):
    """전체 데이터 초기화"""
    p_count = db.query(AdidasComparisonPurchase).delete()
    s_count = db.query(AdidasComparisonSale).delete()
    i_count = db.query(AdidasComparisonInventory).delete()
    db.commit()
    return {"message": f"구매 {p_count}건, 판매 {s_count}건, 재고 {i_count}건 삭제 완료"}
