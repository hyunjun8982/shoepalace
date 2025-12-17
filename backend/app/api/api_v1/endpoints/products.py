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

router = APIRouter()


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 목록 조회 (브랜드명 및 재고 정보 포함)"""
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

    if search:
        query = query.filter(
            Product.product_name.ilike(f"%{search}%") |
            Product.product_code.ilike(f"%{search}%")
        )

    total = query.count()
    products = query.offset(skip).limit(limit).all()

    # 브랜드명 및 아이콘 추가
    for product in products:
        if product.brand:
            product.brand_name = product.brand.name
            product.brand_icon_url = product.brand.icon_url

    return ProductList(total=total, items=products)

@router.get("/{product_id}", response_model=ProductSchema)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상품 상세 조회"""
    product = db.query(Product).options(
        joinedload(Product.brand)
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
    for field, value in update_data.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)

    return product

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