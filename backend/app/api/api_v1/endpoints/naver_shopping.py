"""
네이버쇼핑 검색 API
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.services.naver_shopping_service import get_naver_shopping_service
from app.db.database import get_db
from app.models.naver_shopping_filter import NaverShoppingFilter

logger = logging.getLogger(__name__)

router = APIRouter()


# ========== Pydantic 모델 ==========

class NaverSellerInfo(BaseModel):
    """네이버쇼핑 판매처 정보"""
    title: str
    link: str
    lprice: str
    mallName: str


class NaverShoppingSearchResponse(BaseModel):
    """네이버쇼핑 검색 응답"""
    product_code: str
    total: int
    sellers: List[NaverSellerInfo]


class FilterCreate(BaseModel):
    """필터 생성 요청"""
    mall_name: str


class FilterResponse(BaseModel):
    """필터 응답"""
    id: int
    mall_name: str
    created_at: str

    class Config:
        from_attributes = True


# ========== API 엔드포인트 ==========

@router.get("/search/{product_code}", response_model=NaverShoppingSearchResponse)
async def search_naver_shopping(product_code: str):
    """
    상품코드로 네이버쇼핑 판매처 검색

    Args:
        product_code: 상품코드 (예: JI0496)

    Returns:
        네이버쇼핑 판매처 정보 리스트
    """
    try:
        logger.info(f"[네이버쇼핑 검색] product_code={product_code}")

        # 네이버쇼핑 검색
        service = get_naver_shopping_service()
        sellers = service.search_product(product_code, display=100)

        return NaverShoppingSearchResponse(
            product_code=product_code,
            total=len(sellers),
            sellers=sellers
        )

    except Exception as e:
        logger.error(f"네이버쇼핑 검색 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"네이버쇼핑 검색 중 오류가 발생했습니다: {str(e)}"
        )


# ========== 필터 관리 API ==========

@router.get("/filters", response_model=List[FilterResponse])
async def get_filters(db: Session = Depends(get_db)):
    """
    네이버쇼핑 판매처 필터 목록 조회

    Returns:
        필터 목록
    """
    try:
        filters = db.query(NaverShoppingFilter).order_by(NaverShoppingFilter.created_at.desc()).all()
        return [
            FilterResponse(
                id=f.id,
                mall_name=f.mall_name,
                created_at=f.created_at.isoformat()
            )
            for f in filters
        ]
    except Exception as e:
        logger.error(f"필터 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"필터 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/filters", response_model=FilterResponse)
async def create_filter(filter_data: FilterCreate, db: Session = Depends(get_db)):
    """
    네이버쇼핑 판매처 필터 추가

    Args:
        filter_data: 필터 정보 (mall_name)

    Returns:
        생성된 필터 정보
    """
    try:
        # 중복 체크
        existing = db.query(NaverShoppingFilter).filter(
            NaverShoppingFilter.mall_name == filter_data.mall_name
        ).first()

        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"이미 등록된 필터입니다: {filter_data.mall_name}"
            )

        # 필터 생성
        new_filter = NaverShoppingFilter(mall_name=filter_data.mall_name)
        db.add(new_filter)
        db.commit()
        db.refresh(new_filter)

        logger.info(f"필터 추가됨: {filter_data.mall_name}")

        # 필터 캐시 리로드
        service = get_naver_shopping_service()
        service.reload_filters()

        return FilterResponse(
            id=new_filter.id,
            mall_name=new_filter.mall_name,
            created_at=new_filter.created_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"필터 추가 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"필터 추가 중 오류가 발생했습니다: {str(e)}"
        )


@router.delete("/filters/{filter_id}")
async def delete_filter(filter_id: int, db: Session = Depends(get_db)):
    """
    네이버쇼핑 판매처 필터 삭제

    Args:
        filter_id: 필터 ID

    Returns:
        삭제 결과 메시지
    """
    try:
        filter_obj = db.query(NaverShoppingFilter).filter(
            NaverShoppingFilter.id == filter_id
        ).first()

        if not filter_obj:
            raise HTTPException(
                status_code=404,
                detail=f"필터를 찾을 수 없습니다: {filter_id}"
            )

        mall_name = filter_obj.mall_name
        db.delete(filter_obj)
        db.commit()

        # 필터 캐시 리로드
        service = get_naver_shopping_service()
        service.reload_filters()

        logger.info(f"필터 삭제됨: {mall_name}")

        return {"message": f"필터가 삭제되었습니다: {mall_name}"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"필터 삭제 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"필터 삭제 중 오류가 발생했습니다: {str(e)}"
        )
