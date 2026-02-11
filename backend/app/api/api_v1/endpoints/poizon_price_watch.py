"""포이즌 가격비교 관심 상품 API"""
import logging
import threading
from typing import Dict, Any, Optional, List
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.orm import Session

from app.db.database import get_db, SessionLocal
from app.models.poizon_price_watch import PoizonPriceWatch
from app.schemas.poizon_price_watch import (
    PoizonPriceWatchAdd,
    PoizonPriceWatchItem,
    PoizonPriceWatchListResponse,
    PoizonPriceRefreshRequest,
)
from app.crud import crud_poizon_product
from app.services.poizon_service import get_poizon_service
from app.api.api_v1.endpoints.poizon_products import _calculate_avg_price

logger = logging.getLogger(__name__)

router = APIRouter()

# 가격 갱신 상태 (메모리)
_refresh_status: Dict[str, Any] = {
    "is_refreshing": False,
    "current": 0,
    "total": 0,
    "message": "",
}


@router.get("/items", response_model=PoizonPriceWatchListResponse)
def get_watch_items(db: Session = Depends(get_db)):
    """관심 상품 목록 조회"""
    watch_items = db.query(PoizonPriceWatch).order_by(
        PoizonPriceWatch.created_at.asc()
    ).all()

    items = []
    found_count = 0

    for watch in watch_items:
        # watch 테이블의 title/logo_url 우선, 없으면 poizon_products에서 보조 조회
        title = watch.title
        logo_url = watch.logo_url

        if not title or not logo_url:
            product = crud_poizon_product.get_product_by_article_number(
                db, watch.article_number
            )
            if product:
                title = title or product.title
                logo_url = logo_url or product.logo_url

        has_data = (title is not None) or (watch.avg_price_small is not None) or (watch.avg_price_large is not None) or (watch.avg_price_apparel is not None)
        if has_data:
            found_count += 1

        items.append(PoizonPriceWatchItem(
            article_number=watch.article_number,
            found=has_data,
            title=title,
            logo_url=logo_url,
            spu_id=watch.global_spu_id,
            avg_price_small=watch.avg_price_small,
            avg_price_large=watch.avg_price_large,
            avg_price_apparel=watch.avg_price_apparel,
            price_details=watch.price_details,
            sell_price=watch.sell_price,
            created_at=watch.created_at,
        ))

    return PoizonPriceWatchListResponse(
        items=items,
        total=len(items),
        found_count=found_count,
        not_found_count=len(items) - found_count,
    )


@router.post("/items")
def add_watch_items(data: PoizonPriceWatchAdd, db: Session = Depends(get_db)):
    """관심 상품코드 일괄 추가 (중복 시 sell_price 업데이트)"""
    added = 0
    updated = 0

    for item in data.items:
        code = item.article_number.strip().upper()
        if not code:
            continue

        existing = db.query(PoizonPriceWatch).filter(
            PoizonPriceWatch.article_number == code
        ).first()

        if existing:
            # 중복이어도 sell_price가 있으면 업데이트
            if item.sell_price is not None:
                existing.sell_price = item.sell_price
                updated += 1
            continue

        record = PoizonPriceWatch(
            article_number=code,
            sell_price=item.sell_price,
        )
        db.add(record)
        added += 1

    db.commit()
    msg_parts = []
    if added:
        msg_parts.append(f"{added}개 추가")
    if updated:
        msg_parts.append(f"{updated}개 가격 업데이트")
    return {"message": ", ".join(msg_parts) if msg_parts else "변경 없음", "added": added, "updated": updated}


@router.delete("/items/{article_number}")
def delete_watch_item(article_number: str, db: Session = Depends(get_db)):
    """관심 상품 개별 삭제"""
    record = db.query(PoizonPriceWatch).filter(
        PoizonPriceWatch.article_number == article_number.upper()
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="관심 상품을 찾을 수 없습니다")
    db.delete(record)
    db.commit()
    return {"message": "삭제 완료"}


@router.delete("/items")
def delete_all_watch_items(db: Session = Depends(get_db)):
    """관심 상품 전체 삭제"""
    count = db.query(PoizonPriceWatch).delete()
    db.commit()
    return {"message": f"{count}개 삭제 완료"}


def _refresh_single_item(article_number: str) -> bool:
    """단일 상품 가격 갱신 (별도 DB 세션 사용, 스레드 안전)"""
    db = SessionLocal()
    try:
        watch = db.query(PoizonPriceWatch).filter(
            PoizonPriceWatch.article_number == article_number
        ).first()
        if not watch:
            return False

        poizon_service = get_poizon_service()
        result = poizon_service.get_price_data_by_article_number(article_number)

        if result:
            if result.get("title"):
                watch.title = result["title"]
            if result.get("logo_url"):
                watch.logo_url = result["logo_url"]

            sizes = result.get("sizes", [])
            if sizes:
                avg_small = _calculate_avg_price(sizes, 'small')
                avg_large = _calculate_avg_price(sizes, 'large')
                avg_apparel = _calculate_avg_price(sizes, 'apparel')

                watch.avg_price_small = avg_small
                watch.avg_price_large = avg_large
                watch.avg_price_apparel = avg_apparel

                watch.price_details = [
                    {
                        "size_kr": s["size_kr"],
                        "size_us": s.get("size_us"),
                        "average_price": s.get("average_price"),
                        "leak_price": s.get("leak_price"),
                    }
                    for s in sizes
                ]

                db.commit()
                logger.info(f"[가격갱신] {article_number}: small={avg_small}, large={avg_large}, apparel={avg_apparel}")
                return True
            else:
                db.commit()
                logger.warning(f"[가격갱신] {article_number}: 대상 사이즈 없음 (title={result.get('title')})")
        else:
            logger.warning(f"[가격갱신] {article_number}: POIZON 미등록")

        return False
    except Exception as e:
        logger.error(f"[가격갱신] {article_number} 실패: {e}")
        db.rollback()
        return False
    finally:
        db.close()


# 진행 카운터 락
_refresh_lock = threading.Lock()


def _refresh_prices_background(db: Session, article_numbers: Optional[List[str]] = None):
    """
    백그라운드에서 관심 상품 가격 갱신 (병렬 처리)

    흐름:
    1. 각 article_number → sku/by-article-number로 SKU 목록 조회
    2. 각 skuId → recommend-bid/price로 가격 조회
    3. 평균가 계산 → poizon_price_watch 테이블 업데이트
    """
    global _refresh_status
    try:
        query = db.query(PoizonPriceWatch)
        if article_numbers:
            query = query.filter(PoizonPriceWatch.article_number.in_(article_numbers))
        watch_items = query.all()
        codes = [w.article_number for w in watch_items]
        total = len(codes)

        _refresh_status.update({
            "is_refreshing": True,
            "current": 0,
            "total": total,
            "message": f"가격 조회 시작... ({total}개)",
        })

        if not codes:
            _refresh_status.update({
                "is_refreshing": False,
                "message": "갱신할 상품이 없습니다",
            })
            return

        refreshed = 0
        completed = 0

        def on_done(future):
            nonlocal refreshed, completed
            with _refresh_lock:
                completed += 1
                if future.result():
                    refreshed += 1
                _refresh_status.update({
                    "current": completed,
                    "message": f"가격 조회 중... ({completed}/{total})",
                })

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = []
            for code in codes:
                f = executor.submit(_refresh_single_item, code)
                f.add_done_callback(on_done)
                futures.append(f)

            # 모든 작업 완료 대기
            for f in futures:
                f.result()

        _refresh_status.update({
            "is_refreshing": False,
            "current": total,
            "total": total,
            "message": f"가격 갱신 완료! {refreshed}개 상품 업데이트",
        })

    except Exception as e:
        logger.error(f"가격 갱신 실패: {e}", exc_info=True)
        _refresh_status.update({
            "is_refreshing": False,
            "message": f"갱신 실패: {str(e)}",
        })


@router.post("/refresh")
def refresh_prices(
    background_tasks: BackgroundTasks,
    data: PoizonPriceRefreshRequest = Body(default=PoizonPriceRefreshRequest()),
    db: Session = Depends(get_db),
):
    """관심 상품 POIZON 가격 갱신 (백그라운드)"""
    if _refresh_status.get("is_refreshing"):
        return {"message": "이미 갱신 중입니다", "status": _refresh_status}

    background_tasks.add_task(_refresh_prices_background, db, data.article_numbers)
    return {"message": "가격 갱신을 시작합니다"}


@router.get("/refresh-status")
def get_refresh_status():
    """가격 갱신 진행 상태 조회"""
    return _refresh_status
