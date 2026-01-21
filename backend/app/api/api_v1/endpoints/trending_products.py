from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional
import pandas as pd
import io
import httpx
import uuid
from datetime import datetime

from app.api import deps
from app.models.trending_product import TrendingProduct
from app.models.product import Product
from app.models.brand import Brand
from app.schemas import trending_product as schemas

router = APIRouter()

@router.get("/kream-ranking/")
async def get_kream_ranking(
    category_id: str = Query("281", description="KREAM 카테고리 ID (예: 281=패딩, 38=상의)"),
    date_range: Optional[str] = Query(None, description="기간 필터 (weekly, monthly) - 없으면 실시간"),
):
    """
    KREAM 실시간 인기상품(급상승) 랭킹 API 프록시
    - category_id: KREAM 카테고리 ID (직접 지정)
    - date_range: 기간 필터 (weekly, monthly) - 없으면 실시간
    """
    import os
    import urllib.parse

    category_filter = category_id
    request_key = str(uuid.uuid4())
    now = datetime.now()
    client_datetime = now.strftime("%Y%m%d%H%M%S") + "+0900"

    # KREAM API 직접 호출 URL
    kream_url = f"https://api.kream.co.kr/api/h/tabs/ranking/?category_filter={category_filter}&request_key={request_key}"
    if date_range:
        kream_url += f"&date_range_filter={date_range}"

    headers = {
        "accept": "*/*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "https://kream.co.kr",
        "referer": f"https://kream.co.kr/?tab=home_ranking_v2&category_filter={category_filter}",
        "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "x-kream-api-version": "52",
        "x-kream-client-datetime": client_datetime,
        "x-kream-device-id": f"web;{str(uuid.uuid4())}",
        "x-kream-web-build-version": "25.15.7",
        "x-kream-web-request-secret": "kream-djscjsghdkd",
    }

    # Cloudflare Workers URL (무료, 월 100,000회)
    cf_worker_url = os.getenv("CF_WORKER_URL", "")

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            if cf_worker_url:
                # Render 프록시를 통해 호출
                encoded_url = urllib.parse.quote(kream_url, safe='')
                proxy_url = f"{cf_worker_url}?url={encoded_url}"
                response = await client.get(proxy_url, timeout=30.0)
            else:
                # 직접 호출 시도
                response = await client.get(kream_url, headers=headers)

            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"KREAM API 오류: {str(e)}")
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"KREAM API 요청 실패: {type(e).__name__}: {str(e)}")


@router.get("/kream-image-proxy/")
async def proxy_kream_image(
    url: str = Query(..., description="KREAM 이미지 URL"),
):
    """
    KREAM 이미지 프록시 - CORS 우회용
    """
    from fastapi.responses import Response

    if not url.startswith("https://kream-phinf.pstatic.net/"):
        raise HTTPException(status_code=400, detail="허용되지 않은 이미지 URL입니다.")

    headers = {
        "referer": "https://kream.co.kr/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "image/png")
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 로드 실패: {str(e)}")


@router.post("/upload/", response_model=dict)
async def upload_trending_products(
    file: UploadFile = File(...),
    category: str = Query(..., description="카테고리 (shoes, apparel, accessories 등)"),
    data_period: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    엑셀 파일로 KREAM 인기 상품 데이터 업로드
    - 같은 카테고리의 기존 데이터를 삭제하고 새 데이터로 교체
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="엑셀 파일만 업로드 가능합니다.")

    try:
        # 엑셀 파일 읽기
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))

        # 컬럼명 매핑 (한글 -> 영문)
        df.columns = ['Rank', 'Brand', 'ProductName', 'ProductID', 'ModelNumber']

        # 데이터 검증
        required_cols = ['Rank', 'Brand', 'ProductName', 'ProductID']
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"필수 컬럼 '{col}'이 없습니다."
                )

        # 해당 카테고리의 기존 데이터만 삭제
        deleted_count = db.query(TrendingProduct).filter(
            TrendingProduct.category == category
        ).delete()
        db.commit()

        # 새 데이터 삽입
        uploaded_count = 0
        for _, row in df.iterrows():
            trending_product = TrendingProduct(
                rank=int(row['Rank']),
                brand=str(row['Brand']).strip(),
                product_name=str(row['ProductName']).strip(),
                kream_product_id=int(row['ProductID']),
                model_number=str(row['ModelNumber']).strip() if pd.notna(row['ModelNumber']) else None,
                category=category,
                data_period=data_period or f"{datetime.now().strftime('%Y-%m')} 최근 30일"
            )
            db.add(trending_product)
            uploaded_count += 1

        db.commit()

        return {
            "message": "업로드 성공",
            "uploaded_count": uploaded_count,
            "deleted_count": deleted_count,
            "category": category,
            "data_period": data_period or f"{datetime.now().strftime('%Y-%m')} 최근 30일"
        }

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")


@router.get("/", response_model=schemas.TrendingProductList)
def get_trending_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    brand: Optional[str] = None,
    db: Session = Depends(deps.get_db)
):
    """인기 상품 목록 조회"""
    query = db.query(TrendingProduct)

    if category:
        query = query.filter(TrendingProduct.category == category)
    if brand:
        query = query.filter(TrendingProduct.brand == brand)

    total = query.count()
    items = query.order_by(TrendingProduct.rank).offset(skip).limit(limit).all()

    return schemas.TrendingProductList(total=total, items=items)


@router.get("/with-inventory/", response_model=list[schemas.TrendingProductWithInventory])
def get_trending_products_with_inventory(
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    brand: Optional[str] = None,
    db: Session = Depends(deps.get_db)
):
    """
    재고 정보를 포함한 인기 상품 목록 조회
    - 우리 재고에 해당 상품이 있는지 체크
    """
    query = db.query(TrendingProduct)

    if category:
        query = query.filter(TrendingProduct.category == category)
    if brand:
        query = query.filter(TrendingProduct.brand == brand)

    trending_products = query.order_by(TrendingProduct.rank).limit(limit).all()

    result = []
    for tp in trending_products:
        # 모델 번호로 우리 재고 검색
        inventory_count = 0
        if tp.model_number:
            # 상품 코드가 모델 번호와 일치하는 상품 찾기 (Brand와 조인)
            matching_products = db.query(Product).join(Brand).filter(
                and_(
                    Product.product_code.contains(tp.model_number),
                    Brand.name == tp.brand
                )
            ).all()

            # 해당 상품들의 재고 합계
            from app.models.inventory import Inventory
            for product in matching_products:
                inventory = db.query(Inventory).filter(
                    Inventory.product_id == product.id
                ).first()
                if inventory:
                    inventory_count += inventory.quantity or 0

        result.append(schemas.TrendingProductWithInventory(
            **tp.__dict__,
            inventory_count=inventory_count
        ))

    return result


@router.get("/stats/", response_model=schemas.TrendingProductStats)
def get_trending_stats(db: Session = Depends(deps.get_db)):
    """인기 상품 통계"""
    total_count = db.query(TrendingProduct).count()

    # 브랜드별 집계
    brand_counts = db.query(
        TrendingProduct.brand,
        func.count(TrendingProduct.id)
    ).group_by(TrendingProduct.brand).all()
    by_brand = {brand: count for brand, count in brand_counts}

    # 카테고리별 집계
    category_counts = db.query(
        TrendingProduct.category,
        func.count(TrendingProduct.id)
    ).group_by(TrendingProduct.category).all()
    by_category = {category: count for category, count in category_counts if category}

    # 최근 업로드 날짜
    latest = db.query(func.max(TrendingProduct.upload_date)).scalar()

    return schemas.TrendingProductStats(
        total_count=total_count,
        by_brand=by_brand,
        by_category=by_category,
        latest_upload_date=latest
    )


@router.get("/categories/", response_model=list[str])
def get_categories(db: Session = Depends(deps.get_db)):
    """등록된 카테고리 목록 조회"""
    categories = db.query(TrendingProduct.category).distinct().filter(
        TrendingProduct.category.isnot(None)
    ).all()
    return [cat[0] for cat in categories]


@router.delete("/", response_model=dict)
def delete_all_trending_products(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """모든 인기 상품 데이터 삭제 (관리자만)"""
    deleted_count = db.query(TrendingProduct).delete()
    db.commit()

    return {
        "message": "모든 데이터 삭제 완료",
        "deleted_count": deleted_count
    }
