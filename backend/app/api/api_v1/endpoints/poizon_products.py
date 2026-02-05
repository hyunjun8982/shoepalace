"""
포이즌 상품 정보 API
"""
import logging
from typing import List, Optional
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api import deps
from app.crud import crud_poizon_product
from app.crud import crud_poizon_product_price
from app.services.poizon_product_service import get_poizon_product_service, BRANDS
from app.services.poizon_service import get_poizon_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ========== Pydantic 모델 ==========

class ProductResponse(BaseModel):
    """상품 정보 응답"""
    id: UUID
    brand_key: str
    brand_name: str
    level1_category_name: Optional[str]
    title: str
    article_number: str
    logo_url: Optional[str]
    spu_id: Optional[int]
    # 미리 계산된 평균가
    avg_price_small: Optional[int]    # 신발 소형 (220-250)
    avg_price_large: Optional[int]    # 신발 대형 (255-290)
    avg_price_apparel: Optional[int]  # 의류 (S~XXL)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BrandProductsResponse(BaseModel):
    """브랜드별 상품 조회 응답"""
    brand_key: str
    brand_name: str
    products: List[ProductResponse]
    total: int


class SyncRequest(BaseModel):
    """동기화 요청"""
    end_page: int = 495  # 기본 495페이지 (전체)


class SyncResponse(BaseModel):
    """동기화 응답"""
    brand_key: str
    brand_name: str
    total_synced: int
    message: str


class PriceInfo(BaseModel):
    """가격 정보"""
    sku_id: str
    size_kr: str
    size_us: Optional[str]
    average_price: Optional[int]


class ProductPricesResponse(BaseModel):
    """상품 가격 정보 응답"""
    spu_id: int
    prices: List[PriceInfo]
    total: int


class BatchPricesRequest(BaseModel):
    """여러 SPU ID 가격 조회 요청"""
    spu_ids: List[int]


class BatchPricesResponse(BaseModel):
    """여러 SPU ID 가격 조회 응답"""
    prices: dict  # { spu_id: [PriceInfo, ...] }


# ========== API 엔드포인트 ==========

@router.get("/brands/{brand_key}", response_model=BrandProductsResponse)
async def get_brand_products(
    brand_key: str,
    db: Session = Depends(deps.get_db)
):
    """
    DB에서 브랜드별 상품 조회

    브랜드 키:
    - adidas: 아디다스
    - nike: 나이키
    - jordan: 조던
    - adidas_originals: 아디다스 오리지널
    """
    try:
        logger.info(f"[DB] 브랜드 상품 조회: brand_key={brand_key}")

        # 유효한 브랜드 키 확인
        if brand_key not in BRANDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid brand_key. Must be one of: {', '.join(BRANDS.keys())}"
            )

        # DB에서 상품 조회
        products = crud_poizon_product.get_products_by_brand(db, brand_key)
        brand_name = BRANDS[brand_key]["name"]

        return BrandProductsResponse(
            brand_key=brand_key,
            brand_name=brand_name,
            products=products,
            total=len(products)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"브랜드 상품 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"상품 조회 중 오류가 발생했습니다: {str(e)}")


def _calculate_avg_price(sizes: list, size_type: str) -> Optional[int]:
    """사이즈 목록에서 평균가 계산"""
    if size_type == 'small':
        # 신발 소형: 220-250
        filtered = [s for s in sizes if s.get('size_kr', '').isdigit() and 220 <= int(s['size_kr']) <= 250]
    elif size_type == 'large':
        # 신발 대형: 255-290
        filtered = [s for s in sizes if s.get('size_kr', '').isdigit() and 255 <= int(s['size_kr']) <= 290]
    else:
        # 의류: XS~XXXXL
        apparel_sizes = {'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'}
        filtered = [s for s in sizes if s.get('size_kr', '').upper() in apparel_sizes]

    valid_prices = [s['average_price'] for s in filtered if s.get('average_price') and s['average_price'] > 0]
    if not valid_prices:
        return None
    return round(sum(valid_prices) / len(valid_prices))


def _sync_brand_products_background(brand_key: str, end_page: int, db: Session):
    """백그라운드에서 실행되는 동기화 함수"""
    try:
        logger.info(f"[BACKGROUND SYNC] 브랜드 상품 업데이트 시작: brand_key={brand_key}, pages=1-{end_page}")

        brand_name = BRANDS[brand_key]["name"]
        product_service = get_poizon_product_service()
        poizon_service = get_poizon_service()

        # 1단계: Poizon API에서 상품 정보 가져오기 (SPU ID 수집)
        products = product_service.get_products_by_brand(
            brand_key,
            1,  # 항상 1페이지부터 시작
            end_page
        )

        logger.info(f"[BACKGROUND SYNC] Poizon API에서 {len(products)}개 상품 조회 완료")

        # 필드명을 DB 모델에 맞게 변환 + SPU ID → 상품 인덱스 매핑
        db_products_data = []
        spu_to_product_idx = {}  # SPU ID → 상품 인덱스

        for idx, product_data in enumerate(products):
            db_product_data = {
                "brand_key": product_data["brand_key"],
                "brand_name": product_data["brand_name"],
                "level1_category_name": product_data.get("level1CategoryName"),
                "title": product_data["title"],
                "article_number": product_data["articleNumber"],
                "logo_url": product_data.get("logoUrl"),
                "spu_id": product_data.get("spuId"),
                # 평균가 필드 (나중에 채움)
                "avg_price_small": None,
                "avg_price_large": None,
                "avg_price_apparel": None,
            }
            db_products_data.append(db_product_data)

            # SPU ID → 인덱스 매핑
            if product_data.get("spuId"):
                spu_to_product_idx[product_data["spuId"]] = idx

        spu_ids = list(spu_to_product_idx.keys())

        # 2단계: SPU ID로 사이즈 + 평균가 한번에 조회 (statisticsDataQry 사용)
        total_prices_synced = 0
        if spu_ids:
            logger.info(f"[BACKGROUND SYNC] 사이즈+가격 조회 시작: {len(spu_ids)}개 상품")

            # 배치 크기 설정 (API 권장: 5개)
            batch_size = 5
            total_batches = (len(spu_ids) + batch_size - 1) // batch_size

            for i in range(0, len(spu_ids), batch_size):
                batch_spu_ids = spu_ids[i:i + batch_size]
                batch_num = i // batch_size + 1

                try:
                    # 사이즈 + 평균가 한번에 조회 (API 1회)
                    sizes_with_prices = poizon_service.get_sizes_with_prices(batch_spu_ids)

                    # 각 SPU별로 가격 정보 저장 + 평균가 계산
                    for spu_id, sizes in sizes_with_prices.items():
                        prices_data = []

                        for size in sizes:
                            prices_data.append({
                                "sku_id": size["sku_id"],
                                "size_kr": size["size_kr"],
                                "size_us": size["size_us"],
                                "average_price": size.get("average_price")
                            })

                        # DB에 가격 정보 저장
                        count = crud_poizon_product_price.upsert_prices(db, spu_id, prices_data)
                        total_prices_synced += count

                        # 상품 데이터에 평균가 추가
                        if spu_id in spu_to_product_idx:
                            product_idx = spu_to_product_idx[spu_id]
                            db_products_data[product_idx]["avg_price_small"] = _calculate_avg_price(sizes, 'small')
                            db_products_data[product_idx]["avg_price_large"] = _calculate_avg_price(sizes, 'large')
                            db_products_data[product_idx]["avg_price_apparel"] = _calculate_avg_price(sizes, 'apparel')

                    logger.info(f"[BACKGROUND SYNC] 배치 {batch_num}/{total_batches} 완료")

                except Exception as e:
                    logger.error(f"[BACKGROUND SYNC] 배치 {batch_num} 처리 실패: {e}", exc_info=True)
                    continue

            logger.info(f"[BACKGROUND SYNC] 사이즈+가격 조회 완료: {total_prices_synced}개 가격 정보")

        # 3단계: DB에 상품 저장 (기존 데이터 교체, 평균가 포함)
        synced_count = crud_poizon_product.replace_brand_products(db, brand_key, db_products_data)
        logger.info(f"[BACKGROUND SYNC] DB 상품 업데이트 완료: {synced_count}개")

        logger.info(f"[BACKGROUND SYNC] 전체 동기화 완료 - 상품: {synced_count}개, 가격: {total_prices_synced}개")

    except Exception as e:
        logger.error(f"[BACKGROUND SYNC] 브랜드 상품 업데이트 실패: {e}", exc_info=True)


@router.post("/brands/{brand_key}/sync", response_model=SyncResponse)
async def sync_brand_products(
    brand_key: str,
    sync_request: SyncRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db)
):
    """
    Poizon API에서 상품 정보를 가져와서 DB에 저장 (백그라운드 업데이트)

    브랜드 키:
    - adidas: 아디다스
    - nike: 나이키
    - jordan: 조던
    - adidas_originals: 아디다스 오리지널
    """
    try:
        logger.info(f"[SYNC] 브랜드 상품 업데이트 요청: brand_key={brand_key}, pages=1-{sync_request.end_page}")

        # 유효한 브랜드 키 확인
        if brand_key not in BRANDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid brand_key. Must be one of: {', '.join(BRANDS.keys())}"
            )

        brand_name = BRANDS[brand_key]["name"]

        # 백그라운드 태스크 추가
        background_tasks.add_task(_sync_brand_products_background, brand_key, sync_request.end_page, db)

        # 즉시 응답 반환
        return SyncResponse(
            brand_key=brand_key,
            brand_name=brand_name,
            total_synced=0,  # 백그라운드 처리 중이므로 0
            message=f"{brand_name} 상품 업데이트를 시작했습니다. 백그라운드에서 처리 중입니다."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"브랜드 상품 업데이트 요청 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"업데이트 요청 중 오류가 발생했습니다: {str(e)}")


@router.get("/brands/{brand_key}/last-update")
async def get_brand_last_update(
    brand_key: str,
    db: Session = Depends(deps.get_db)
):
    """
    브랜드의 마지막 업데이트 시간 조회

    브랜드의 상품 중 가장 최근에 업데이트된 시간을 반환합니다.
    """
    try:
        if brand_key not in BRANDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid brand_key. Must be one of: {', '.join(BRANDS.keys())}"
            )

        # 가장 최근 업데이트된 상품 조회
        latest_product = crud_poizon_product.get_products_by_brand(db, brand_key, skip=0, limit=1)

        if latest_product:
            return {
                "brand_key": brand_key,
                "brand_name": BRANDS[brand_key]["name"],
                "last_update": latest_product[0].updated_at,
                "has_data": True
            }
        else:
            return {
                "brand_key": brand_key,
                "brand_name": BRANDS[brand_key]["name"],
                "last_update": None,
                "has_data": False
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"마지막 업데이트 시간 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"조회 중 오류가 발생했습니다: {str(e)}")


@router.get("/stats")
async def get_stats(db: Session = Depends(deps.get_db)):
    """
    전체 상품 통계
    """
    try:
        stats = {}
        total = 0

        for brand_key, brand_info in BRANDS.items():
            count = crud_poizon_product.count_products_by_brand(db, brand_key)
            stats[brand_key] = {
                "brand_name": brand_info["name"],
                "count": count
            }
            total += count

        return {
            "brands": stats,
            "total": total
        }

    except Exception as e:
        logger.error(f"통계 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"통계 조회 중 오류가 발생했습니다: {str(e)}")


@router.get("/prices/{spu_id}", response_model=ProductPricesResponse)
async def get_product_prices(
    spu_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    SPU ID로 상품 가격 정보 조회
    """
    try:
        prices = crud_poizon_product_price.get_prices_by_spu_id(db, spu_id)

        return ProductPricesResponse(
            spu_id=spu_id,
            prices=[
                PriceInfo(
                    sku_id=p.sku_id,
                    size_kr=p.size_kr,
                    size_us=p.size_us,
                    average_price=p.average_price
                )
                for p in prices
            ],
            total=len(prices)
        )
    except Exception as e:
        logger.error(f"가격 정보 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"가격 정보 조회 중 오류가 발생했습니다: {str(e)}")


@router.post("/prices/batch")
async def get_batch_prices(
    request: BatchPricesRequest,
    db: Session = Depends(deps.get_db)
):
    """
    여러 SPU ID의 가격 정보 일괄 조회
    """
    try:
        result = {}

        for spu_id in request.spu_ids:
            prices = crud_poizon_product_price.get_prices_by_spu_id(db, spu_id)
            result[spu_id] = [
                {
                    "sku_id": p.sku_id,
                    "size_kr": p.size_kr,
                    "size_us": p.size_us,
                    "average_price": p.average_price
                }
                for p in prices
            ]

        return {"prices": result}
    except Exception as e:
        logger.error(f"배치 가격 정보 조회 실패: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"가격 정보 조회 중 오류가 발생했습니다: {str(e)}")
