from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.api.deps import get_db, get_current_user
from app.models.barcode import Barcode
from app.models.product import Product
from app.models.inventory import Inventory
from app.schemas.barcode import BarcodeCreate, BarcodeUpdate, BarcodeResponse, BarcodeSearchResult
from app.services.poizon_service import get_poizon_service
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

router = APIRouter()


class BarcodeProductInfo(BaseModel):
    """포이즌에서 조회한 상품 정보"""
    title: Optional[str] = None
    logo_url: Optional[str] = None
    sizes: List[dict] = []

    class Config:
        from_attributes = True

@router.post("/", response_model=BarcodeResponse)
def create_barcode(
    barcode_data: BarcodeCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """바코드 등록"""

    # 1. 중복 바코드 확인
    existing = db.query(Barcode).filter(
        and_(
            Barcode.barcode_value == barcode_data.barcode_value.strip().upper(),
            Barcode.is_active == True
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"바코드 '{barcode_data.barcode_value}'는 이미 등록되어 있습니다."
        )

    # 2. 상품 존재 확인
    product = db.query(Product).filter(Product.id == barcode_data.product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="상품을 찾을 수 없습니다."
        )

    # 3. 바코드 생성
    barcode = Barcode(
        product_id=barcode_data.product_id,
        size=barcode_data.size,
        barcode_value=barcode_data.barcode_value.strip().upper(),
        barcode_type=barcode_data.barcode_type,
        is_active=barcode_data.is_active,
        notes=barcode_data.notes,
        created_by=current_user.id if current_user else None
    )

    db.add(barcode)
    db.commit()
    db.refresh(barcode)

    return barcode

@router.get("/search/{barcode_value}")
def search_by_barcode(
    barcode_value: str,
    db: Session = Depends(get_db)
):
    """
    바코드로 상품 검색

    1. DB에서 먼저 검색 (등록된 바코드)
    2. 없으면 포이즌 API에서 실시간 조회
    """

    normalized_barcode = barcode_value.strip().upper()

    # 1단계: DB에서 바코드 검색 (정확한 일치)
    barcode = db.query(Barcode).filter(
        and_(
            Barcode.barcode_value == normalized_barcode,
            Barcode.is_active == True
        )
    ).first()

    if barcode:
        # 상품 정보 조회
        product = db.query(Product).filter(Product.id == barcode.product_id).first()

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="상품 정보를 찾을 수 없습니다."
            )

        # 재고 정보 조회
        inventory = db.query(Inventory).filter(Inventory.product_id == product.id).first()
        available_qty = inventory.available_quantity if inventory else 0

        return BarcodeSearchResult(
            barcode_id=barcode.id,
            product_id=product.id,
            size=barcode.size,
            barcode_value=barcode.barcode_value,
            product_code=product.product_code,
            product_name=product.product_name,
            brand_name=product.brand.name if product.brand else None,
            category=product.category,
            image_url=product.image_url,
            available_qty=available_qty
        )

    # 2단계: DB에 없으면 포이즌 API에서 실시간 조회
    try:
        service = get_poizon_service()
        product_info = service.get_price_data_by_barcode(normalized_barcode)

        if not product_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="포이즌 API에서도 바코드를 찾을 수 없습니다."
            )

        # 포이즌 응답을 포맷팅하여 반환
        return {
            "title": product_info.get("title"),
            "logo_url": product_info.get("logo_url"),
            "article_number": product_info.get("article_number"),
            "brand_name": product_info.get("brand_name"),
            "sizes": product_info.get("sizes", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"포이즌 API 조회 중 오류 발생: {str(e)}"
        )

@router.get("/product/{product_id}", response_model=Optional[BarcodeResponse])
def get_barcode_by_product(
    product_id: UUID,
    db: Session = Depends(get_db)
):
    """상품의 바코드 조회 (첫번째)"""

    barcode = db.query(Barcode).filter(
        Barcode.product_id == product_id
    ).first()

    if not barcode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 상품의 바코드가 없습니다."
        )

    return barcode

@router.get("/product/{product_id}/all", response_model=List[BarcodeResponse])
def get_all_barcodes_by_product(
    product_id: UUID,
    db: Session = Depends(get_db)
):
    """상품의 모든 바코드 조회"""

    barcodes = db.query(Barcode).filter(
        Barcode.product_id == product_id
    ).all()

    return barcodes

@router.put("/{barcode_id}", response_model=BarcodeResponse)
def update_barcode(
    barcode_id: UUID,
    barcode_data: BarcodeUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """바코드 수정"""

    barcode = db.query(Barcode).filter(Barcode.id == barcode_id).first()

    if not barcode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="바코드를 찾을 수 없습니다."
        )

    # 바코드 값 변경 시 중복 확인
    if barcode_data.barcode_value:
        normalized_value = barcode_data.barcode_value.strip().upper()
        existing = db.query(Barcode).filter(
            and_(
                Barcode.barcode_value == normalized_value,
                Barcode.id != barcode_id,
                Barcode.is_active == True
            )
        ).first()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"바코드 '{barcode_data.barcode_value}'는 이미 등록되어 있습니다."
            )

        barcode.barcode_value = normalized_value

    if barcode_data.size:
        barcode.size = barcode_data.size

    if barcode_data.barcode_type:
        barcode.barcode_type = barcode_data.barcode_type

    if barcode_data.is_active is not None:
        barcode.is_active = barcode_data.is_active

    if barcode_data.notes:
        barcode.notes = barcode_data.notes

    db.commit()
    db.refresh(barcode)

    return barcode

@router.delete("/{barcode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_barcode(
    barcode_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """바코드 삭제"""

    barcode = db.query(Barcode).filter(Barcode.id == barcode_id).first()

    if not barcode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="바코드를 찾을 수 없습니다."
        )

    db.delete(barcode)
    db.commit()

    return None

@router.get("/poizon/{barcode_value}")
def lookup_barcode_from_poizon(
    barcode_value: str
):
    """
    포이즌 API에서 바코드로 상품 정보 실시간 조회
    (DB에 등록된 바코드와 상관없이 포이즌에서 직접 조회)
    """
    try:
        normalized_barcode = barcode_value.strip().upper()
        service = get_poizon_service()
        product_info = service.get_price_data_by_barcode(normalized_barcode)

        if not product_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"바코드 '{normalized_barcode}'를 포이즌에서 찾을 수 없습니다."
            )

        return {
            "title": product_info.get("title"),
            "logo_url": product_info.get("logo_url"),
            "article_number": product_info.get("article_number"),
            "brand_name": product_info.get("brand_name"),
            "sizes": product_info.get("sizes", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"포이즌 API 조회 중 오류 발생: {str(e)}"
        )


@router.get("/", response_model=List[BarcodeResponse])
def list_barcodes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """바코드 목록 조회"""

    barcodes = db.query(Barcode).offset(skip).limit(limit).all()
    return barcodes
