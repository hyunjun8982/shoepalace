from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.brand import Brand
from pydantic import BaseModel, field_validator
from datetime import datetime
import shutil
import os
from pathlib import Path

router = APIRouter()

class BrandCreate(BaseModel):
    name: str
    description: Optional[str] = None

class BrandSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    icon_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class BrandListResponse(BaseModel):
    total: int
    items: List[BrandSchema]

@router.get("/", response_model=BrandListResponse)
def get_brands(
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """브랜드 목록 조회"""
    query = db.query(Brand)

    if is_active is not None:
        query = query.filter(Brand.is_active == is_active)

    total = query.count()
    brands = query.offset(skip).limit(limit).all()

    return BrandListResponse(total=total, items=brands)

@router.post("/", response_model=BrandSchema)
async def create_brand(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    icon: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """브랜드 등록"""
    # 브랜드명 중복 확인
    existing_brand = db.query(Brand).filter(Brand.name == name).first()
    if existing_brand:
        raise HTTPException(status_code=400, detail="이미 존재하는 브랜드명입니다.")

    icon_url = None

    # 로고 이미지 업로드 처리
    if icon:
        # uploads/brands 디렉토리 생성
        upload_dir = Path("uploads/brands")
        upload_dir.mkdir(parents=True, exist_ok=True)

        # 파일 확장자 확인
        file_ext = os.path.splitext(icon.filename)[1].lower()
        if file_ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']:
            raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식입니다.")

        # 안전한 파일명 생성 (브랜드명 기반)
        safe_name = name.replace(' ', '_').replace('/', '_')
        file_path = upload_dir / f"{safe_name}{file_ext}"

        # 파일 저장
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(icon.file, buffer)

        icon_url = f"/uploads/brands/{safe_name}{file_ext}"

    # 브랜드 생성
    new_brand = Brand(
        name=name,
        description=description,
        icon_url=icon_url,
        is_active=True
    )

    db.add(new_brand)
    db.commit()
    db.refresh(new_brand)

    return new_brand

@router.put("/{brand_id}", response_model=BrandSchema)
async def update_brand(
    brand_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    icon: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """브랜드 수정"""
    # 브랜드 조회
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="브랜드를 찾을 수 없습니다.")

    # 기존 브랜드명 저장 (이미지 파일명 변경용)
    old_brand_name = brand.name

    # 브랜드명 변경 시 중복 확인
    if name and name != brand.name:
        existing_brand = db.query(Brand).filter(Brand.name == name).first()
        if existing_brand:
            raise HTTPException(status_code=400, detail="이미 존재하는 브랜드명입니다.")
        brand.name = name

    # 설명 수정
    if description is not None:
        brand.description = description

    # 로고 이미지 업로드 처리
    if icon:
        # uploads/brands 디렉토리 생성
        upload_dir = Path("uploads/brands")
        upload_dir.mkdir(parents=True, exist_ok=True)

        # 파일 확장자 확인
        file_ext = os.path.splitext(icon.filename)[1].lower()
        if file_ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']:
            raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식입니다.")

        # 기존 이미지 파일 삭제
        if brand.icon_url:
            old_file_path = Path(brand.icon_url.lstrip('/'))
            if old_file_path.exists():
                old_file_path.unlink()

        # 안전한 파일명 생성 (현재 브랜드명 기반)
        safe_name = brand.name.replace(' ', '_').replace('/', '_')
        file_path = upload_dir / f"{safe_name}{file_ext}"

        # 파일 저장
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(icon.file, buffer)

        brand.icon_url = f"/uploads/brands/{safe_name}{file_ext}"
    elif name and name != old_brand_name and brand.icon_url:
        # 브랜드명만 변경되고 이미지는 변경되지 않은 경우 - 이미지 파일명 변경
        old_file_path = Path(brand.icon_url.lstrip('/'))
        if old_file_path.exists():
            file_ext = old_file_path.suffix
            safe_name = brand.name.replace(' ', '_').replace('/', '_')
            new_file_path = old_file_path.parent / f"{safe_name}{file_ext}"

            # 파일명 변경
            old_file_path.rename(new_file_path)
            brand.icon_url = f"/uploads/brands/{safe_name}{file_ext}"

    db.commit()
    db.refresh(brand)

    return brand

@router.delete("/{brand_id}")
def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """브랜드 삭제"""
    # 브랜드 조회
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="브랜드를 찾을 수 없습니다.")

    # 해당 브랜드를 사용하는 상품이 있는지 확인
    from app.models.product import Product
    product_count = db.query(Product).filter(Product.brand_id == brand_id).count()
    if product_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"이 브랜드를 사용하는 상품이 {product_count}개 있습니다. 먼저 상품을 삭제해주세요."
        )

    # 이미지 파일 삭제
    if brand.icon_url:
        file_path = Path(brand.icon_url.lstrip('/'))
        if file_path.exists():
            file_path.unlink()

    # 브랜드 삭제
    db.delete(brand)
    db.commit()

    return {"message": "브랜드가 삭제되었습니다."}
