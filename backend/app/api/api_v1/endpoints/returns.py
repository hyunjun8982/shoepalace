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
    ReturnBatchCreate,
    ReturnBatchResult,
    ReturnBatchCreatedLine,
    ReturnRegistrationUpdate,
    ReturnShipRequest,
    ReturnItemResponse,
    ReturnItemList,
)

router = APIRouter()


def _normalize_registration(status: str, platforms):
    """등록처는 '등록완료'일 때만 의미가 있으므로 그 외 상태에서는 비운다"""
    return status, (platforms if status == "registered" else None)


def _receive_one(
    db: Session,
    current_user: User,
    product_id: str,
    size: str,
    reason: Optional[str],
    registration_status: str,
    registration_platforms,
    inventory_cache: dict,
) -> ReturnItem:
    """반품 1건 입고 처리 (반품 재고 +1, 조정 이력 기록). commit 은 호출자가 수행."""
    registration_status, registration_platforms = _normalize_registration(
        registration_status, registration_platforms
    )

    item = ReturnItem(
        id=uuid.uuid4(),
        product_id=product_id,
        size=size,
        quantity=1,
        reason=reason,
        status=ReturnItemStatus.in_stock,
        registration_status=registration_status,
        registration_platforms=registration_platforms,
        received_by=current_user.id,
    )
    db.add(item)

    # 재고 수량 동기화 (반품 재고 +1)
    # autoflush=False 이므로 같은 요청 내에서 새로 만든 재고 행은 캐시로 재사용
    key = (str(product_id), size)
    inventory = inventory_cache.get(key)
    if inventory is None:
        inventory = db.query(Inventory).filter(
            Inventory.product_id == product_id,
            Inventory.size == size
        ).first()
        if not inventory:
            inventory = Inventory(
                id=uuid.uuid4(),
                product_id=product_id,
                size=size,
                quantity=0,
                reserved_quantity=0,
                defect_quantity=0,
            )
            db.add(inventory)
        inventory_cache[key] = inventory
    inventory.defect_quantity = (inventory.defect_quantity or 0) + 1

    # 조정 이력 기록
    adjustment = InventoryAdjustment(
        id=uuid.uuid4(),
        product_id=product_id,
        adjustment_type=AdjustmentType.return_,
        quantity=1,
        reference_id=str(item.id),
        notes=f"반품 입고 (구매금액 0원) - 사이즈: {size}" + (f", 사유: {reason}" if reason else ""),
        adjusted_by=current_user.id,
    )
    db.add(adjustment)

    return item


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
    registration_status: Optional[str] = None,  # registered | unregistered | hold
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

    if registration_status:
        query = query.filter(ReturnItem.registration_status == registration_status)

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

    item = _receive_one(
        db, current_user, data.product_id, data.size, data.reason,
        data.registration_status, data.registration_platforms, {},
    )

    db.commit()
    db.refresh(item)

    return _build_response(item)


@router.post("/batch", response_model=ReturnBatchResult)
def create_return_items_batch(
    data: ReturnBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """일괄 반품 입고 - 여러 상품을 한 번에 등록 (수량만큼 개별 건 생성, 한 트랜잭션)"""
    product_ids = {line.product_id for line in data.items}
    found_ids = {
        str(pid) for (pid,) in db.query(Product.id).filter(Product.id.in_(product_ids)).all()
    }
    missing = product_ids - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"상품을 찾을 수 없습니다 ({len(missing)}건)")

    inventory_cache: dict = {}
    lines = []
    for line in data.items:
        created = [
            _receive_one(
                db, current_user, line.product_id, line.size, line.reason,
                line.registration_status, line.registration_platforms, inventory_cache,
            )
            for _ in range(line.quantity)
        ]
        lines.append(ReturnBatchCreatedLine(ids=[str(i.id) for i in created]))

    db.commit()

    return ReturnBatchResult(
        total_created=sum(len(l.ids) for l in lines),
        lines=lines,
    )


@router.patch("/{return_id}/registration", response_model=ReturnItemResponse)
def update_return_registration(
    return_id: str,
    data: ReturnRegistrationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """판매처 등록 여부 수정 (등록완료/미등록/보류 + 등록처)"""
    item = db.query(ReturnItem).options(
        joinedload(ReturnItem.product).joinedload(Product.brand),
        joinedload(ReturnItem.receiver),
        joinedload(ReturnItem.shipper),
    ).filter(ReturnItem.id == return_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="반품 건을 찾을 수 없습니다")

    item.registration_status, item.registration_platforms = _normalize_registration(
        data.registration_status, data.registration_platforms
    )
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
