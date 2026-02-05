"""
Poizon API 엔드포인트
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException, Path, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api import deps
from app.crud import crud_poizon_product_price
from app.services.poizon_service import get_poizon_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ========== Pydantic 모델 ==========

class SizeWithPrice(BaseModel):
    """사이즈와 가격 정보"""
    size_kr: str
    size_us: str | None
    sku_id: str
    average_price: int | None  # 평균가격만 포함


class ProductPricesResponse(BaseModel):
    """상품 가격 정보 응답"""
    spu_id: int
    sizes: List[SizeWithPrice]


class FetchPricesRequest(BaseModel):
    """가격 정보 실시간 조회 요청"""
    spu_ids: List[int]


class FetchPricesResponse(BaseModel):
    """가격 정보 실시간 조회 응답"""
    data: dict  # { spu_id: [SizeWithPrice] }
    total_spus: int
    total_sizes: int


# ========== API 엔드포인트 ==========

@router.get("/product-prices/{spu_id}", response_model=ProductPricesResponse)
async def get_product_prices(
    spu_id: int = Path(..., description="SPU ID"),
    db: Session = Depends(deps.get_db)
):
    """
    SPU ID로 모든 사이즈와 가격 정보를 DB에서 조회

    Args:
        spu_id: 포이즌 SPU ID
        db: DB 세션

    Returns:
        모든 사이즈와 각 사이즈별 평균가격
    """
    try:
        logger.info(f"[Poizon API] 상품 가격 조회 요청: SPU ID={spu_id}")

        # DB에서 가격 정보 조회
        prices = crud_poizon_product_price.get_prices_by_spu_id(db, spu_id)

        if not prices:
            logger.warning(f"[Poizon API] SPU ID {spu_id}에 대한 가격 정보 없음")
            return ProductPricesResponse(spu_id=spu_id, sizes=[])

        # 응답 변환
        sizes_with_prices = []
        for price in prices:
            sizes_with_prices.append(SizeWithPrice(
                size_kr=price.size_kr,
                size_us=price.size_us,
                sku_id=price.sku_id,
                average_price=price.average_price
            ))

        logger.info(f"[Poizon API] SPU {spu_id}: {len(sizes_with_prices)}개 사이즈 가격 조회 완료")

        return ProductPricesResponse(
            spu_id=spu_id,
            sizes=sizes_with_prices
        )

    except Exception as e:
        logger.error(f"상품 가격 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"상품 가격 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/fetch-prices", response_model=FetchPricesResponse)
async def fetch_prices(request: FetchPricesRequest):
    """
    SPU ID 리스트로 실시간 가격 정보 조회 (성능 테스트용)

    포이즌 API를 직접 호출하여 사이즈별 가격 정보를 가져옵니다.

    Args:
        request: SPU ID 리스트

    Returns:
        각 SPU의 사이즈별 가격 정보
    """
    try:
        logger.info(f"[Poizon API] 실시간 가격 조회 요청: {len(request.spu_ids)}개 SPU")

        service = get_poizon_service()

        # 1. 사이즈 정보 조회
        sizes_result = service.get_sizes_by_spuids(request.spu_ids)

        # 2. 모든 SKU ID 수집
        all_sku_ids = []
        for spu_id, sizes in sizes_result.items():
            for size in sizes:
                all_sku_ids.append(size["sku_id"])

        logger.info(f"[Poizon API] 총 {len(all_sku_ids)}개 SKU ID 수집 완료")

        # 3. 가격 정보 일괄 조회
        prices_result = service.get_prices_batch(all_sku_ids)

        # 4. 결과 조합
        result_data = {}
        total_sizes = 0

        for spu_id, sizes in sizes_result.items():
            sizes_with_prices = []

            for size in sizes:
                sku_id = size["sku_id"]
                price_info = prices_result.get(sku_id)

                sizes_with_prices.append({
                    "size_kr": size["size_kr"],
                    "size_us": size["size_us"],
                    "sku_id": sku_id,
                    "average_price": price_info.get("average_price") if price_info else None
                })
                total_sizes += 1

            result_data[str(spu_id)] = sizes_with_prices

        logger.info(f"[Poizon API] 가격 조회 완료: {len(sizes_result)}개 SPU, {total_sizes}개 사이즈")

        return FetchPricesResponse(
            data=result_data,
            total_spus=len(sizes_result),
            total_sizes=total_sizes
        )

    except Exception as e:
        logger.error(f"실시간 가격 조회 실패: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"실시간 가격 조회 중 오류가 발생했습니다: {str(e)}"
        )
