from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.warehouse import Warehouse
from app.schemas.warehouse import (
    WarehouseCreate,
    WarehouseUpdate,
    Warehouse as WarehouseSchema,
    WarehouseList
)
import uuid
import os
from pathlib import Path

router = APIRouter()
def generate_warehouse_code(db: Session) -> str:
    """창고 코드 자동 생성 (WH001, WH002, ...)"""
    # 마지막 창고 코드 조회
    last_warehouse = db.query(Warehouse).order_by(Warehouse.created_at.desc()).first()
    
    if not last_warehouse or not last_warehouse.warehouse_code.startswith('WH'):
        return 'WH001'
    
    try:
        # WH001 -> 1 추출
        last_num = int(last_warehouse.warehouse_code[2:])
        new_num = last_num + 1
        return f'WH{new_num:03d}'
    except:
        return 'WH001'



@router.get("/", response_model=WarehouseList)
def get_warehouses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 목록 조회"""
    query = db.query(Warehouse)

    # 필터링
    if is_active is not None:
        query = query.filter(Warehouse.is_active == is_active)

    if search:
        query = query.filter(
            Warehouse.name.ilike(f"%{search}%") |
            Warehouse.warehouse_code.ilike(f"%{search}%") |
            Warehouse.location.ilike(f"%{search}%")
        )

    total = query.count()
    warehouses = query.offset(skip).limit(limit).all()

    return WarehouseList(total=total, items=warehouses)

@router.get("/next-code")
def get_next_warehouse_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """다음 창고 코드 조회"""
    return {"warehouse_code": generate_warehouse_code(db)}

@router.get("/{warehouse_id}", response_model=WarehouseSchema)
def get_warehouse(
    warehouse_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 상세 조회"""
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    return warehouse

@router.post("/", response_model=WarehouseSchema)
def create_warehouse(
    warehouse_data: WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 등록"""
    # admin이나 buyer만 창고 등록 가능
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 중복 창고 코드 체크
    existing = db.query(Warehouse).filter(
        Warehouse.warehouse_code == warehouse_data.warehouse_code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Warehouse code already exists")

    warehouse = Warehouse(
        id=uuid.uuid4(),
        **warehouse_data.model_dump()
    )

    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)

    return warehouse

@router.put("/{warehouse_id}", response_model=WarehouseSchema)
def update_warehouse(
    warehouse_id: str,
    warehouse_data: WarehouseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 수정"""
    # admin이나 buyer만 창고 수정 가능
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # 창고 코드 중복 체크 (변경하는 경우)
    if warehouse_data.warehouse_code and warehouse_data.warehouse_code != warehouse.warehouse_code:
        existing = db.query(Warehouse).filter(
            Warehouse.warehouse_code == warehouse_data.warehouse_code
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Warehouse code already exists")

    update_data = warehouse_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(warehouse, field, value)

    db.commit()
    db.refresh(warehouse)

    return warehouse

@router.delete("/{warehouse_id}")
def delete_warehouse(
    warehouse_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 삭제"""
    # admin만 삭제 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    db.delete(warehouse)
    db.commit()

    return {"message": "Warehouse deleted successfully"}

@router.post("/{warehouse_id}/upload-image")
async def upload_warehouse_image(
    warehouse_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고 이미지 업로드"""
    # admin이나 buyer만 이미지 업로드 가능
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # 이미지 저장 경로
    upload_dir = Path("/app/uploads/warehouses")
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 파일 확장자 확인
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.jpg', '.jpeg', '.png', '.gif']:
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")

    # 파일명: warehouse_code.ext
    filename = f"{warehouse.warehouse_code}{file_ext}"
    file_path = upload_dir / filename

    # 파일 저장
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    # DB 업데이트
    warehouse.image_url = f"/uploads/warehouses/{filename}"
    db.commit()

    return {"image_url": warehouse.image_url}
@router.get("/{warehouse_id}/inventory")
def get_warehouse_inventory(
    warehouse_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """창고별 재고 조회"""
    from app.models.inventory import Inventory
    from app.models.product import Product
    from app.models.purchase import PurchaseItem
    from sqlalchemy.orm import joinedload
    from sqlalchemy import and_

    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    print(f"[DEBUG] Querying inventory for warehouse: {warehouse.warehouse_code} (ID: {warehouse_id})")

    # 해당 창고에서 구매된 상품의 재고 조회
    purchase_items = db.query(PurchaseItem.product_id, PurchaseItem.size).filter(
        PurchaseItem.warehouse_id == warehouse_id
    ).distinct().all()

    print(f"[DEBUG] Found {len(purchase_items)} purchase items for this warehouse")

    if not purchase_items:
        return {
            'warehouse': {
                'id': str(warehouse.id),
                'warehouse_code': warehouse.warehouse_code,
                'name': warehouse.name,
                'location': warehouse.location
            },
            'inventory': []
        }

    # 재고 조회
    inventory_dict = {}
    for product_id, size in purchase_items:
        inv = db.query(Inventory).options(
            joinedload(Inventory.product)
        ).filter(
            and_(
                Inventory.product_id == product_id,
                Inventory.size == size
            )
        ).first()

        if inv and inv.product and inv.quantity > 0:
            product_key = str(inv.product_id)
            if product_key not in inventory_dict:
                inventory_dict[product_key] = {
                    'product_id': str(inv.product_id),
                    'product_name': inv.product.product_name,
                    'product_code': inv.product.product_code,
                    'category': inv.product.category,
                    'brand': inv.product.brand.name if inv.product.brand else None,
                    'sizes': []
                }
            inventory_dict[product_key]['sizes'].append({
                'size': inv.size,
                'quantity': inv.quantity,
                'location': inv.location
            })

    result = {
        'warehouse': {
            'id': str(warehouse.id),
            'warehouse_code': warehouse.warehouse_code,
            'name': warehouse.name,
            'location': warehouse.location
        },
        'inventory': list(inventory_dict.values())
    }
    print(f"[DEBUG] Returning {len(result['inventory'])} inventory items")
    return result




