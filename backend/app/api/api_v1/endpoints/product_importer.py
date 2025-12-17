"""
Product Importer API Endpoints
브랜드별 상품 정보 자동 수집 API
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.services.importers import get_importer, IMPORTERS
from app.api.deps import get_current_active_user, get_current_admin_user
from app.models.user import User

router = APIRouter()


# Request/Response Models
class ImportRequest(BaseModel):
    """상품 Import 요청"""
    brand: str
    limit: Optional[int] = None
    category: Optional[str] = None
    update_existing: bool = False


class ImportResponse(BaseModel):
    """상품 Import 응답"""
    success: bool
    brand: str
    stats: dict
    message: str


class BrandInfo(BaseModel):
    """브랜드 정보"""
    key: str
    name: str
    description: str


# Endpoints
@router.get("/brands", response_model=list[BrandInfo])
def get_available_brands(
    current_user: User = Depends(get_current_admin_user)
):
    """
    지원하는 브랜드 목록 조회 (관리자 전용)
    """
    brands = []
    for key in IMPORTERS.keys():
        # brands_config.json에서 브랜드 정보 읽기
        import json
        from pathlib import Path

        config_path = Path(__file__).parent.parent.parent.parent / "services" / "importers" / "brands_config.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            brands_config = json.load(f)

        if key in brands_config:
            brands.append(BrandInfo(
                key=key,
                name=brands_config[key]['name'],
                description=brands_config[key]['description']
            ))

    return brands


@router.post("/import", response_model=ImportResponse)
async def import_brand_products(
    request: ImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    브랜드 상품 가져오기 (관리자 전용)

    - **brand**: 브랜드 키 (newbalance, nike, adidas)
    - **limit**: 최대 상품 수 (선택)
    - **category**: 카테고리 필터 (선택)
    - **update_existing**: 기존 상품 업데이트 여부
    """
    if request.brand not in IMPORTERS:
        available = ', '.join(IMPORTERS.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported brand: {request.brand}. Available: {available}"
        )

    try:
        # Importer 인스턴스 생성
        importer = get_importer(request.brand, db)

        # 상품 가져오기 실행
        stats = importer.import_products(
            limit=request.limit,
            update_existing=request.update_existing,
            category=request.category
        )

        return ImportResponse(
            success=True,
            brand=request.brand,
            stats=stats,
            message=f"Successfully imported {stats['created']} products, "
                   f"updated {stats['updated']}, skipped {stats['skipped']}, "
                   f"failed {stats['failed']}"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(e)}"
        )


@router.get("/summary/{brand}")
def get_brand_summary(
    brand: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    브랜드별 상품 통계 (관리자 전용)
    """
    if brand not in IMPORTERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported brand: {brand}"
        )

    try:
        importer = get_importer(brand, db)
        summary = importer.get_import_summary()
        return summary

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get summary: {str(e)}"
        )
