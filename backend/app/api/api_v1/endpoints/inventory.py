from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.inventory import Inventory
from app.models.inventory_adjustment import InventoryAdjustment, AdjustmentType
from app.models.product import Product
from app.models.brand import Brand
from app.models.notification import Notification, NotificationType
from app.schemas.inventory import (
    InventoryList,
    InventoryDetail,
    InventoryDetailList,
    InventoryDetailWithHistory,
    InventoryUpdate,
    InventoryAdjustmentCreate,
    InventoryAdjustment as InventoryAdjustmentSchema,
    InventoryAdjustmentList,
    PurchaseHistoryItem,
    SaleHistoryItem
)
import uuid

router = APIRouter()

@router.get("/", response_model=InventoryDetailList)
def get_inventory_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    search: Optional[str] = None,
    category: Optional[str] = None,
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 목록 조회"""
    query = db.query(Inventory).join(Product).options(
        joinedload(Inventory.product).joinedload(Product.brand)
    )

    # 검색 필터
    if search:
        query = query.filter(
            or_(
                Product.product_name.ilike(f"%{search}%"),
                Product.product_code.ilike(f"%{search}%")
            )
        )

    # 카테고리 필터
    if category:
        query = query.filter(Product.category == category)

    # 재고 부족 필터
    if low_stock_only:
        query = query.filter(
            Inventory.quantity - Inventory.reserved_quantity <= Inventory.min_stock_level
        )

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    # 상품 정보 포함한 재고 정보 생성
    inventory_details = []
    for inv in items:
        # 최근 구매 내역에서 창고 정보 가져오기
        from app.models.purchase import PurchaseItem
        from app.models.warehouse import Warehouse
        recent_purchase_item = db.query(PurchaseItem).filter(
            PurchaseItem.product_id == inv.product_id,
            PurchaseItem.size == inv.size
        ).order_by(PurchaseItem.created_at.desc()).first()

        warehouse_name = None
        warehouse_location = None
        warehouse_image_url = None
        if recent_purchase_item and recent_purchase_item.warehouse_id:
            warehouse = db.query(Warehouse).filter(Warehouse.id == recent_purchase_item.warehouse_id).first()
            if warehouse:
                warehouse_name = warehouse.name
                warehouse_location = warehouse.location
                warehouse_image_url = warehouse.image_url

        detail = InventoryDetail(
            id=str(inv.id),
            product_id=str(inv.product_id),
            quantity=inv.quantity,
            reserved_quantity=inv.reserved_quantity,
            available_quantity=inv.available_quantity,
            location=inv.location,
            min_stock_level=inv.min_stock_level,
            is_low_stock=inv.is_low_stock,
            last_updated=inv.last_updated,
            created_at=inv.created_at,
            updated_at=inv.updated_at,
            product_name=inv.product.product_name,
            brand=inv.product.brand.name if inv.product.brand else '',
            category=inv.product.category or '',
            size=inv.size,
            color=None,
            sku_code=inv.product.product_code,
            warehouse_name=warehouse_name,
            warehouse_location=warehouse_location,
            warehouse_image_url=warehouse_image_url,
        )
        inventory_details.append(detail)

    return InventoryDetailList(total=total, items=inventory_details)

@router.get("/{product_id}", response_model=InventoryDetail)
def get_inventory(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """특정 상품 재고 조회"""
    inventory = db.query(Inventory).filter(
        Inventory.product_id == product_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory not found")

    product = inventory.product

    return InventoryDetail(
        id=str(inventory.id),
        product_id=str(inventory.product_id),
        quantity=inventory.quantity,
        reserved_quantity=inventory.reserved_quantity,
        available_quantity=inventory.available_quantity,
        location=inventory.location,
        min_stock_level=inventory.min_stock_level,
        is_low_stock=inventory.is_low_stock,
        last_updated=inventory.last_updated,
        created_at=inventory.created_at,
        updated_at=inventory.updated_at,
        product_name=product.product_name,
        brand='',
        category=product.category,
        size=product.size,
        color=product.color,
        sku_code=product.product_code
    )

@router.put("/{product_id}", response_model=InventoryDetail)
def update_inventory(
    product_id: str,
    inventory_update: InventoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 정보 수정 (관리자만)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    inventory = db.query(Inventory).filter(
        Inventory.product_id == product_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory not found")

    update_data = inventory_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(inventory, field, value)

    db.commit()
    db.refresh(inventory)

    product = inventory.product

    return InventoryDetail(
        id=str(inventory.id),
        product_id=str(inventory.product_id),
        quantity=inventory.quantity,
        reserved_quantity=inventory.reserved_quantity,
        available_quantity=inventory.available_quantity,
        location=inventory.location,
        min_stock_level=inventory.min_stock_level,
        is_low_stock=inventory.is_low_stock,
        last_updated=inventory.last_updated,
        created_at=inventory.created_at,
        updated_at=inventory.updated_at,
        product_name=product.product_name,
        brand='',
        category=product.category,
        size=product.size,
        color=product.color,
        sku_code=product.product_code
    )

@router.post("/adjust", response_model=InventoryAdjustmentSchema)
def create_inventory_adjustment(
    adjustment: InventoryAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 조정"""
    # 권한 체크 (관리자 또는 buyer)
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 재고 확인
    inventory = db.query(Inventory).filter(
        Inventory.product_id == adjustment.product_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory not found")

    # 재고 조정 기록 생성
    db_adjustment = InventoryAdjustment(
        id=uuid.uuid4(),
        product_id=adjustment.product_id,
        adjustment_type=adjustment.adjustment_type,
        quantity=adjustment.quantity,
        reference_id=adjustment.reference_id,
        notes=adjustment.notes,
        adjusted_by=current_user.id
    )

    # 재고 수량 업데이트
    inventory.quantity += adjustment.quantity

    db.add(db_adjustment)
    db.commit()
    db.refresh(db_adjustment)

    return db_adjustment

@router.get("/adjustments/history", response_model=InventoryAdjustmentList)
def get_adjustment_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    product_id: Optional[str] = None,
    adjustment_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 조정 이력 조회"""
    query = db.query(InventoryAdjustment)

    if product_id:
        query = query.filter(InventoryAdjustment.product_id == product_id)

    if adjustment_type:
        query = query.filter(InventoryAdjustment.adjustment_type == adjustment_type)

    # 최신순 정렬
    query = query.order_by(InventoryAdjustment.created_at.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return InventoryAdjustmentList(total=total, items=items)

@router.get("/low-stock/alert", response_model=InventoryDetailList)
def get_low_stock_alert(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 부족 알림 목록"""
    items = db.query(Inventory).filter(
        Inventory.quantity - Inventory.reserved_quantity <= Inventory.min_stock_level
    ).all()

    inventory_details = []
    for inv in items:
        detail = InventoryDetail(
            id=str(inv.id),
            product_id=str(inv.product_id),
            quantity=inv.quantity,
            reserved_quantity=inv.reserved_quantity,
            available_quantity=inv.available_quantity,
            location=inv.location,
            min_stock_level=inv.min_stock_level,
            is_low_stock=inv.is_low_stock,
            last_updated=inv.last_updated,
            created_at=inv.created_at,
            updated_at=inv.updated_at,
            product_name=inv.product.product_name,
            brand='',
            category=inv.product.category,
            size=inv.product.size,
            color=inv.product.color,
            sku_code=inv.product.product_code
        )
        inventory_details.append(detail)

    return InventoryDetailList(total=len(items), items=inventory_details)
@router.get("/product/{product_id}/detail", response_model=InventoryDetailWithHistory)
def get_inventory_detail_with_history(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 재고 상세 조회 (모든 사이즈, 구매/판매 이력 포함)"""
    from app.models.purchase import Purchase, PurchaseItem
    from app.models.sale import Sale, SaleItem
    from app.schemas.inventory import SizeInventory

    # 상품 조회
    product = db.query(Product).options(
        joinedload(Product.brand)
    ).filter(Product.id == product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 해당 상품의 모든 사이즈 재고 조회
    inventories = db.query(Inventory).filter(
        Inventory.product_id == product_id
    ).all()

    if not inventories:
        raise HTTPException(status_code=404, detail="Inventory not found")

    # 사이즈별 재고 정보 생성
    size_inventories = []
    total_quantity = 0
    first_inventory = inventories[0]  # 기본 정보용

    for inv in inventories:
        # 해당 사이즈의 최근 구매 이력에서 창고 정보 가져오기
        from app.models.warehouse import Warehouse
        recent_purchase = db.query(PurchaseItem).filter(
            PurchaseItem.product_id == inv.product_id,
            PurchaseItem.size == inv.size
        ).order_by(PurchaseItem.created_at.desc()).first()

        warehouse_name = None
        warehouse_location = None
        warehouse_image_url = None
        if recent_purchase and recent_purchase.warehouse_id:
            warehouse = db.query(Warehouse).filter(Warehouse.id == recent_purchase.warehouse_id).first()
            if warehouse:
                warehouse_name = warehouse.name
                warehouse_location = warehouse.location
                warehouse_image_url = warehouse.image_url

        size_inventories.append(SizeInventory(
            id=str(inv.id),
            size=inv.size or '',
            quantity=inv.quantity,
            location=inv.location,
            warehouse_name=warehouse_name,
            warehouse_location=warehouse_location,
            warehouse_image_url=warehouse_image_url
        ))
        total_quantity += inv.quantity

    # 구매 이력 조회 (해당 상품의 모든 사이즈)
    purchase_items = db.query(PurchaseItem).join(Purchase).filter(
        PurchaseItem.product_id == product_id
    ).order_by(Purchase.purchase_date.desc()).all()

    purchase_history = []
    for item in purchase_items:
        purchase = item.purchase
        buyer_name = purchase.buyer.full_name if purchase.buyer else None
        purchase_history.append(PurchaseHistoryItem(
            purchase_date=purchase.purchase_date,
            transaction_no=purchase.transaction_no,
            size=item.size,
            quantity=item.quantity,
            purchase_price=float(item.purchase_price),
            supplier=purchase.supplier,
            buyer_name=buyer_name
        ))

    # 판매 이력 조회 (해당 상품의 모든 사이즈)
    sale_items = db.query(SaleItem).join(Sale).filter(
        SaleItem.product_id == product_id
    ).order_by(Sale.sale_date.desc()).all()

    sale_history = []
    for item in sale_items:
        sale = item.sale
        seller_name = sale.seller.full_name if sale.seller else None
        sale_history.append(SaleHistoryItem(
            sale_date=sale.sale_date,
            sale_number=sale.sale_number,
            size=item.size,
            quantity=item.quantity,
            sale_price=float(item.company_sale_price or 0),
            customer_name=sale.customer_name,
            seller_name=seller_name
        ))

    # 재고 상세 정보 생성
    detail = InventoryDetailWithHistory(
        id=str(first_inventory.id),
        product_id=str(product_id),
        quantity=total_quantity,  # 전체 재고 합계
        reserved_quantity=first_inventory.reserved_quantity,
        available_quantity=first_inventory.available_quantity,
        location=first_inventory.location,
        min_stock_level=first_inventory.min_stock_level,
        is_low_stock=first_inventory.is_low_stock,
        last_updated=first_inventory.last_updated,
        created_at=first_inventory.created_at,
        updated_at=first_inventory.updated_at,
        product_name=product.product_name,
        brand=product.brand.name if product.brand else '',
        category=product.category or '',
        size=None,  # 사이즈 필드는 사용하지 않음
        color=None,
        sku_code=product.product_code,
        size_inventories=size_inventories,  # 사이즈별 재고 정보
        purchase_history=purchase_history,
        sale_history=sale_history
    )

    return detail

@router.delete("/{inventory_id}")
def delete_inventory(
    inventory_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 삭제 (관리자만)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    inventory = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    
    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory not found")

    db.delete(inventory)
    db.commit()

    return {"message": "Inventory deleted successfully"}

@router.post("/{inventory_id}/adjust")
def adjust_inventory_quantity(
    inventory_id: str,
    quantity_change: int,
    reason: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """재고 수량 조정 (관리자만)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    inventory = db.query(Inventory).filter(Inventory.id == inventory_id).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory not found")

    # 이전 수량 저장
    previous_quantity = inventory.quantity

    # 수량 조정
    new_quantity = inventory.quantity + quantity_change
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="재고 수량은 0 미만이 될 수 없습니다")

    inventory.quantity = new_quantity

    # 알림 생성 로직
    product = db.query(Product).filter(Product.id == inventory.product_id).first()

    # 이미지 URL 생성 (product.image_url이 있으면 사용, 없으면 브랜드/상품코드로 생성)
    image_url = product.image_url if hasattr(product, 'image_url') and product.image_url else None
    if not image_url and product.brand:
        image_url = f"/uploads/products/{product.brand.name}/{product.product_code}.png"

    # 품절 알림: 이전 재고가 1개 이상이었다가 0개가 됨
    if previous_quantity >= 1 and new_quantity == 0:
        notification = Notification(
            id=str(uuid.uuid4()),
            type=NotificationType.STOCK_OUT,
            title="품절 알림",
            message=f"{product.product_name} ({product.product_code}) - {inventory.size} 사이즈가 품절되었습니다.",
            product_id=str(inventory.product_id),
            product_name=product.product_name,
            product_code=product.product_code,
            product_image_url=image_url,
            size=inventory.size,
            previous_quantity=str(previous_quantity),
            current_quantity=str(new_quantity)
        )
        db.add(notification)

    # 재고 부족 알림: 이전 재고가 6개 이상이었다가 5개 이하로 떨어짐
    elif previous_quantity >= 6 and new_quantity <= 5 and new_quantity > 0:
        notification = Notification(
            id=str(uuid.uuid4()),
            type=NotificationType.STOCK_LOW,
            title="재고 부족 알림",
            message=f"{product.product_name} ({product.product_code}) - {inventory.size} 사이즈의 재고가 {new_quantity}개로 부족합니다.",
            product_id=str(inventory.product_id),
            product_name=product.product_name,
            product_code=product.product_code,
            product_image_url=image_url,
            size=inventory.size,
            previous_quantity=str(previous_quantity),
            current_quantity=str(new_quantity)
        )
        db.add(notification)

    db.commit()
    db.refresh(inventory)

    return {
        "message": "Inventory adjusted successfully",
        "new_quantity": new_quantity,
        "change": quantity_change
    }

@router.post("/product/{product_id}/size")
def create_inventory_for_size(
    product_id: str,
    size: str,
    quantity: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """특정 상품의 새로운 사이즈 재고 생성 (관리자만)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    # 상품 확인
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 이미 해당 사이즈 재고가 있는지 확인
    existing = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.size == size
    ).first()

    if existing:
        # 이미 존재하면 수량만 업데이트
        existing.quantity = quantity
        db.commit()
        db.refresh(existing)
        return {
            "id": str(existing.id),
            "message": "Inventory updated",
            "quantity": existing.quantity
        }

    # 새로운 재고 생성
    new_inventory = Inventory(
        product_id=product_id,
        size=size,
        quantity=quantity,
        reserved_quantity=0,
        min_stock_level=0
    )
    db.add(new_inventory)
    db.commit()
    db.refresh(new_inventory)

    return {
        "id": str(new_inventory.id),
        "message": "Inventory created",
        "quantity": new_inventory.quantity
    }

@router.delete("/product/{product_id}")
def delete_product_inventory(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품의 모든 재고 삭제 (관리자만, 구매/판매 이력이 없는 경우만)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    # 상품 확인
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 구매 이력 확인
    from app.models.purchase import PurchaseItem
    purchase_count = db.query(PurchaseItem).filter(
        PurchaseItem.product_id == product_id
    ).count()

    if purchase_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"이 상품은 {purchase_count}건의 구매 이력이 있어 삭제할 수 없습니다."
        )

    # 판매 이력 확인
    from app.models.sale import SaleItem
    sale_count = db.query(SaleItem).filter(
        SaleItem.product_id == product_id
    ).count()

    if sale_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"이 상품은 {sale_count}건의 판매 이력이 있어 삭제할 수 없습니다."
        )

    # 재고 삭제
    deleted_count = db.query(Inventory).filter(
        Inventory.product_id == product_id
    ).delete()

    db.commit()

    return {
        "message": "재고가 삭제되었습니다.",
        "deleted_count": deleted_count
    }
