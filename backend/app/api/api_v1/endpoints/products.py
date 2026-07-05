from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.product import Product
from app.models.brand import Brand
from app.models.inventory import Inventory
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    Product as ProductSchema,
    ProductList
)
import uuid
import os
import shutil
from pathlib import Path
import requests
from io import BytesIO

router = APIRouter()


def save_image_from_url(image_url: str, brand_name: str, product_code: str) -> bool:
    """포이즌 이미지 URL에서 이미지를 다운로드해서 저장"""
    if not image_url or not brand_name or not product_code:
        return False

    try:
        # 업로드 디렉토리 생성
        upload_dir = Path(f"uploads/products/{brand_name}")
        upload_dir.mkdir(parents=True, exist_ok=True)

        # 이미지 다운로드
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()

        # 파일로 저장
        file_path = upload_dir / f"{product_code}.png"
        with open(file_path, 'wb') as f:
            f.write(response.content)

        return True
    except Exception as e:
        print(f"[Image Download Error] {image_url}: {str(e)}")
        return False


class CheckProductCodesRequest(BaseModel):
    product_codes: List[str]


class CheckProductCodesResponse(BaseModel):
    existing_codes: List[str]


@router.post("/check-codes", response_model=CheckProductCodesResponse)
def check_product_codes(
    request: CheckProductCodesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    상품 코드 일괄 중복 체크
    KREAM 크롤러에서 수집한 상품들이 이미 DB에 존재하는지 확인
    """
    if not request.product_codes:
        return CheckProductCodesResponse(existing_codes=[])

    # DB에서 이미 존재하는 상품 코드들 조회
    existing = db.query(Product.product_code).filter(
        Product.product_code.in_(request.product_codes)
    ).all()

    existing_codes = [code[0] for code in existing]

    return CheckProductCodesResponse(existing_codes=existing_codes)


@router.get("/", response_model=ProductList)
def get_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    brand_ids: Optional[str] = None,  # 쉼표로 구분된 brand_id 목록
    categories: Optional[str] = None,  # 쉼표로 구분된 category 목록
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    only_valid: Optional[bool] = None,  # 브랜드, 상품코드, 카테고리가 모두 있는 상품만
    order_by: Optional[str] = None,  # 정렬 기준: inventory_desc (재고량 내림차순)
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 목록 조회 (브랜드명 및 재고 정보 포함)"""
    print(f"[PRODUCTS] GET request - user: {current_user.username}, limit: {limit}, skip: {skip}, only_valid: {only_valid}")
    query = db.query(Product).options(
        joinedload(Product.brand),
        joinedload(Product.inventory)
    )

    # 필터링
    if brand_ids:
        brand_id_list = [bid.strip() for bid in brand_ids.split(',') if bid.strip()]
        if brand_id_list:
            query = query.filter(Product.brand_id.in_(brand_id_list))

    if categories:
        category_list = [cat.strip() for cat in categories.split(',') if cat.strip()]
        if category_list:
            query = query.filter(Product.category.in_(category_list))

    if is_active is not None:
        query = query.filter(Product.is_active == is_active)

    # 유효한 상품만 필터링 (브랜드, 상품코드, 카테고리가 모두 있는 상품)
    if only_valid:
        query = query.filter(
            Product.brand_id.isnot(None),
            Product.product_code.isnot(None),
            Product.category.isnot(None)
        )

    if search:
        query = query.filter(
            Product.product_name.ilike(f"%{search}%") |
            Product.product_code.ilike(f"%{search}%")
        )

    total = query.count()
    # 최신순 정렬 (created_at 기준 내림차순)
    products = query.order_by(Product.created_at.desc()).offset(skip).limit(limit).all()

    # 브랜드명 및 아이콘 추가
    for product in products:
        if product.brand:
            product.brand_name = product.brand.name
            product.brand_icon_url = product.brand.icon_url

    # 재고량 기준 정렬
    if order_by == "inventory_desc":
        # 각 상품의 총 재고량 계산
        products_with_inventory = []
        for product in products:
            total_inventory = sum(inv.quantity for inv in product.inventory) if product.inventory else 0
            products_with_inventory.append((product, total_inventory))

        # 재고량 내림차순으로 정렬
        products_with_inventory.sort(key=lambda x: x[1], reverse=True)
        products = [p[0] for p in products_with_inventory]

    return ProductList(total=total, items=products)

@router.get("/by-code/{product_code}", response_model=ProductSchema)
def get_product_by_code(
    product_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품코드로 상품 조회"""
    product = db.query(Product).options(
        joinedload(Product.brand),
        joinedload(Product.barcode)
    ).filter(Product.product_code == product_code).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 브랜드명 추가
    if product.brand:
        product.brand_name = product.brand.name
        product.brand_icon_url = product.brand.icon_url

    return product

@router.get("/{product_id}", response_model=ProductSchema)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 상세 조회"""
    product = db.query(Product).options(
        joinedload(Product.brand),
        joinedload(Product.barcode)
    ).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 브랜드명 추가
    if product.brand:
        product.brand_name = product.brand.name
        product.brand_icon_url = product.brand.icon_url

    return product

@router.post("/", response_model=ProductSchema)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 등록"""
    # admin이나 buyer만 상품 등록 가능
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 브랜드 확인
    brand = db.query(Brand).filter(Brand.id == product_data.brand_id).first()
    if not brand:
        raise HTTPException(status_code=400, detail="Brand not found")

    # 중복 상품코드 체크
    existing = db.query(Product).filter(
        Product.product_code == product_data.product_code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product code already exists")

    product = Product(
        id=uuid.uuid4(),
        brand_id=product_data.brand_id,
        product_code=product_data.product_code,
        product_name=product_data.product_name,
        category=product_data.category,
        description=product_data.description
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    # 포이즌 이미지 저장 (비동기 아님, 실패해도 무시)
    if product_data.image_url and product.brand_id:
        brand = db.query(Brand).filter(Brand.id == product.brand_id).first()
        if brand:
            save_image_from_url(product_data.image_url, brand.name, product_data.product_code)

    return product

@router.put("/{product_id}", response_model=ProductSchema)
def update_product(
    product_id: str,
    product_update: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 정보 수정"""
    # admin이나 buyer만 상품 수정 가능
    if current_user.role.value not in ["admin", "buyer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 업데이트
    update_data = product_update.dict(exclude_unset=True)
    image_url = update_data.pop('image_url', None)  # image_url은 따로 처리

    for field, value in update_data.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)

    # 포이즌 이미지 저장 (새로운 image_url이 있으면)
    if image_url and product.brand_id:
        brand = db.query(Brand).filter(Brand.id == product.brand_id).first()
        if brand:
            save_image_from_url(image_url, brand.name, product.product_code)

    return product

@router.get("/{product_id}/related-items")
def get_product_related_items(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 삭제 전 연관 항목 조회"""
    from app.models.barcode import Barcode
    from app.models.inventory import Inventory
    from app.models.purchase import PurchaseItem
    from app.models.sale import SaleItem

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 연관 항목 조회
    barcodes = db.query(Barcode).filter(Barcode.product_id == product_id).all()
    inventories = db.query(Inventory).filter(Inventory.product_id == product_id).all()
    purchase_items = db.query(PurchaseItem).filter(PurchaseItem.product_id == product_id).all()
    sale_items = db.query(SaleItem).filter(SaleItem.product_id == product_id).all()

    return {
        "product": {
            "id": str(product.id),
            "product_code": product.product_code,
            "product_name": product.product_name,
        },
        "barcodes": [{"id": str(b.id), "barcode_value": b.barcode_value, "size": b.size} for b in barcodes],
        "inventories": [{"id": str(inv.id), "size": inv.size, "quantity": inv.quantity} for inv in inventories],
        "purchase_items": [{"id": str(pi.id), "quantity": pi.quantity} for pi in purchase_items],
        "sale_items": [{"id": str(si.id), "quantity": si.quantity} for si in sale_items],
    }


@router.post("/{product_id}/delete-with-items")
def delete_product_with_items(
    product_id: str,
    delete_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 및 선택된 연관 항목 삭제"""
    from app.models.barcode import Barcode
    from app.models.inventory import Inventory
    from app.models.purchase import PurchaseItem
    from app.models.sale import SaleItem

    # admin만 삭제 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 선택된 항목 삭제
    delete_all = delete_data.get("delete_all", False)
    barcode_ids = delete_data.get("barcode_ids", [])
    inventory_ids = delete_data.get("inventory_ids", [])
    purchase_item_ids = delete_data.get("purchase_item_ids", [])
    sale_item_ids = delete_data.get("sale_item_ids", [])

    if delete_all:
        # 전체 삭제
        db.query(Barcode).filter(Barcode.product_id == product_id).delete()
        db.query(Inventory).filter(Inventory.product_id == product_id).delete()
        db.query(PurchaseItem).filter(PurchaseItem.product_id == product_id).delete()
        db.query(SaleItem).filter(SaleItem.product_id == product_id).delete()
        db.delete(product)
    else:
        # 선택된 항목만 삭제
        if barcode_ids:
            db.query(Barcode).filter(Barcode.id.in_(barcode_ids)).delete()
        if inventory_ids:
            db.query(Inventory).filter(Inventory.id.in_(inventory_ids)).delete()
        if purchase_item_ids:
            db.query(PurchaseItem).filter(PurchaseItem.id.in_(purchase_item_ids)).delete()
        if sale_item_ids:
            db.query(SaleItem).filter(SaleItem.id.in_(sale_item_ids)).delete()

        # 상품에 연관 항목이 없으면 상품 삭제
        barcode_count = db.query(Barcode).filter(Barcode.product_id == product_id).count()
        inventory_count = db.query(Inventory).filter(Inventory.product_id == product_id).count()
        purchase_count = db.query(PurchaseItem).filter(PurchaseItem.product_id == product_id).count()
        sale_count = db.query(SaleItem).filter(SaleItem.product_id == product_id).count()

        if barcode_count + inventory_count + purchase_count + sale_count == 0:
            db.delete(product)

    db.commit()
    return {"message": "항목이 삭제되었습니다."}

@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 삭제"""
    # admin만 삭제 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.delete(product)
    db.commit()

    return {"message": "Product deleted successfully"}


@router.get("/check-code/{product_code}")
def check_product_code(
    product_code: str,
    exclude_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품코드 중복 체크"""
    query = db.query(Product).filter(Product.product_code == product_code)

    # 수정 시 본인의 ID는 제외
    if exclude_id:
        query = query.filter(Product.id != exclude_id)

    exists = query.first() is not None
    return {"exists": exists}


@router.post("/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    brand_name: str = Form(...),
    product_code: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 이미지 업로드 - uploads/products/{브랜드명}/{상품코드}.png로 저장"""

    print(f"[IMAGE UPLOAD] Received upload request for brand: {brand_name}, product: {product_code}")
    print(f"[IMAGE UPLOAD] File info: {file.filename}, content_type: {file.content_type}")

    # 파일 확장자 검증
    allowed_extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ".png"
    if file_ext not in allowed_extensions:
        print(f"[IMAGE UPLOAD ERROR] Invalid file extension: {file_ext}")
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # 업로드 디렉토리 생성
    upload_dir = Path("uploads/products") / brand_name
    print(f"[IMAGE UPLOAD] Upload directory: {upload_dir.absolute()}")
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 파일명: {상품코드}.png
    file_path = upload_dir / f"{product_code}.png"
    print(f"[IMAGE UPLOAD] File path: {file_path.absolute()}")

    # 파일 저장
    try:
        with file_path.open("wb") as buffer:
            content = await file.read()
            buffer.write(content)
            print(f"[IMAGE UPLOAD SUCCESS] File saved: {file_path}, size: {len(content)} bytes")

        # 상품의 image_url 업데이트
        image_url = f"/uploads/products/{brand_name}/{product_code}.png"
        product = db.query(Product).filter(Product.product_code == product_code).first()
        if product:
            product.image_url = image_url
            db.commit()
            print(f"[IMAGE UPLOAD] Updated product image_url: {image_url}")

        return {
            "message": "Image uploaded successfully",
            "file_path": str(file_path),
            "image_url": image_url,
            "size": len(content)
        }
    except Exception as e:
        print(f"[IMAGE UPLOAD ERROR] Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


@router.get("/by-barcode/{barcode_value}")
def get_product_by_barcode(
    barcode_value: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """바코드로 상품 검색"""
    from app.models.barcode import Barcode

    normalized_barcode = barcode_value.strip().upper()

    # 바코드로 상품 검색
    barcode = db.query(Barcode).filter(
        Barcode.barcode_value == normalized_barcode,
        Barcode.is_active == True
    ).first()

    if not barcode:
        raise HTTPException(status_code=404, detail="Barcode not found")

    # 상품 정보 조회
    product = db.query(Product).options(
        joinedload(Product.brand),
        joinedload(Product.inventory)
    ).filter(Product.id == barcode.product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 브랜드명 추가
    if product.brand:
        product.brand_name = product.brand.name
        product.brand_icon_url = product.brand.icon_url

    return product