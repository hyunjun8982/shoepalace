"""반품 관리 - 건별 개별 관리 (입고/출고/이력)

반품(검수 탈락 등) 상품은 건마다 사유·사진·판매 조건이 다르므로
return_items 테이블에서 개별 행으로 관리한다.
재고 수량 집계는 inventory.defect_quantity 와 동기화한다.
"""
from typing import Optional
from datetime import datetime
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.inventory_adjustment import InventoryAdjustment, AdjustmentType
from app.models.return_item import ReturnItem, ReturnItemStatus
from app.schemas.return_item import (
    ReturnItemCreate,
    ReturnShipRequest,
    ReturnItemResponse,
    ReturnItemList,
)

router = APIRouter()


def _build_response(item: ReturnItem) -> ReturnItemResponse:
    resp = ReturnItemResponse.model_validate(item)
    if item.product:
        resp.product_name = item.product.product_name
        resp.sku_code = item.product.product_code
        if item.product.brand:
            resp.brand_name = item.product.brand.name
    if item.receiver:
        resp.received_by_name = item.receiver.full_name
    if item.shipper:
        resp.shipped_by_name = item.shipper.full_name
    return resp


@router.get("/", response_model=ReturnItemList)
def get_return_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    status: Optional[str] = Query("in_stock"),  # in_stock | shipped | all
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """반품 건 목록 조회 (건별 개별 행)"""
    query = db.query(ReturnItem).options(
        joinedload(ReturnItem.product).joinedload(Product.brand),
        joinedload(ReturnItem.receiver),
        joinedload(ReturnItem.shipper),
    )

    if status and status != "all":
        query = query.filter(ReturnItem.status == ReturnItemStatus(status))

    if search:
        query = query.join(Product, ReturnItem.product_id == Product.id).filter(or_(
            Product.product_name.ilike(f"%{search}%"),
            Product.product_code.ilike(f"%{search}%"),
        ))

    query = query.order_by(ReturnItem.created_at.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return ReturnItemList(total=total, items=[_build_response(i) for i in items])


@router.post("/", response_model=ReturnItemResponse)
def create_return_item(
    data: ReturnItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """반품 입고 - 구매금액 0원, 건별 개별 등록 (구매 기록 미생성 = 이중 구매 방지)"""
    product = db.query(Product).options(joinedload(Product.brand)).filter(
        Product.id == data.product_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

    item = ReturnItem(
        id=uuid.uuid4(),
        product_id=data.product_id,
        size=data.size,
        quantity=1,
        reason=data.reason,
        status=ReturnItemStatus.in_stock,
        received_by=current_user.id,
    )
    db.add(item)

    # 재고 수량 동기화 (반품 재고 +1)
    inventory = db.query(Inventory).filter(
        Inventory.product_id == data.product_id,
        Inventory.size == data.size
    ).first()
    if not inventory:
        inventory = Inventory(
            id=uuid.uuid4(),
            product_id=data.product_id,
            size=data.size,
            quantity=0,
            reserved_quantity=0,
            defect_quantity=0,
        )
        db.add(inventory)
    inventory.defect_quantity = (inventory.defect_quantity or 0) + 1

    # 조정 이력 기록
    adjustment = InventoryAdjustment(
        id=uuid.uuid4(),
        product_id=data.product_id,
        adjustment_type=AdjustmentType.return_,
        quantity=1,
        reference_id=str(item.id),
        notes=f"반품 입고 (구매금액 0원) - 사이즈: {data.size}" + (f", 사유: {data.reason}" if data.reason else ""),
        adjusted_by=current_user.id,
    )
    db.add(adjustment)

    db.commit()
    db.refresh(item)

    return _build_response(item)


@router.post("/{return_id}/image")
async def upload_return_image(
    return_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """반품 건 불량 사진 업로드"""
    item = db.query(ReturnItem).filter(ReturnItem.id == return_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="반품 건을 찾을 수 없습니다")

    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")

    upload_dir = "uploads/returns"
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{return_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    item.image_url = f"/uploads/returns/{filename}"
    db.commit()

    return {"message": "이미지 업로드 완료", "url": item.image_url}


@router.post("/{return_id}/ship", response_model=ReturnItemResponse)
def ship_return_item(
    return_id: str,
    data: ReturnShipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """반품 출고 처리 - 판매 정보(판매일/판매처/판매가) 기록 후 출고"""
    item = db.query(ReturnItem).options(
        joinedload(ReturnItem.product).joinedload(Product.brand),
        joinedload(ReturnItem.receiver),
    ).filter(ReturnItem.id == return_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="반품 건을 찾을 수 없습니다")
    if item.status == ReturnItemStatus.shipped:
        raise HTTPException(status_code=400, detail="이미 출고 처리된 건입니다")

    item.status = ReturnItemStatus.shipped
    item.sale_date = data.sale_date
    item.customer_name = data.customer_name
    item.customer_contact = data.customer_contact
    item.sale_price = data.sale_price
    item.tracking_number = data.tracking_number
    item.ship_notes = data.notes
    item.shipped_by = current_user.id
    item.shipped_at = datetime.utcnow()

    # 재고 수량 동기화 (반품 재고 -1)
    inventory = db.query(Inventory).filter(
        Inventory.product_id == item.product_id,
        Inventory.size == item.size
    ).first()
    if inventory:
        inventory.defect_quantity = max(0, (inventory.defect_quantity or 0) - 1)

    # 조정 이력 기록
    note_parts = [f"반품 출고 - 사이즈: {item.size}", f"판매처: {data.customer_name}"]
    if data.sale_price is not None:
        note_parts.append(f"판매가: ₩{data.sale_price:,.0f}")
    if data.notes:
        note_parts.append(data.notes)

    adjustment = InventoryAdjustment(
        id=uuid.uuid4(),
        product_id=item.product_id,
        adjustment_type=AdjustmentType.return_,
        quantity=-1,
        reference_id=str(item.id),
        notes=", ".join(note_parts),
        adjusted_by=current_user.id,
    )
    db.add(adjustment)

    db.commit()
    db.refresh(item)

    return _build_response(item)


@router.delete("/{return_id}")
def delete_return_item(
    return_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """반품 입고 취소 (잘못 등록한 건 삭제, 보유 중 상태만 가능)"""
    item = db.query(ReturnItem).filter(ReturnItem.id == return_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="반품 건을 찾을 수 없습니다")
    if item.status == ReturnItemStatus.shipped:
        raise HTTPException(status_code=400, detail="출고 처리된 건은 삭제할 수 없습니다")

    # 재고 수량 동기화 (반품 재고 -1)
    inventory = db.query(Inventory).filter(
        Inventory.product_id == item.product_id,
        Inventory.size == item.size
    ).first()
    if inventory:
        inventory.defect_quantity = max(0, (inventory.defect_quantity or 0) - 1)

    # 조정 이력 기록
    adjustment = InventoryAdjustment(
        id=uuid.uuid4(),
        product_id=item.product_id,
        adjustment_type=AdjustmentType.return_,
        quantity=-1,
        reference_id=str(item.id),
        notes=f"반품 입고 취소 - 사이즈: {item.size}",
        adjusted_by=current_user.id,
    )
    db.add(adjustment)

    db.delete(item)
    db.commit()

    return {"message": "반품 입고가 취소되었습니다"}
