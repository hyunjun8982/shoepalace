from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional
import pandas as pd
import io
from datetime import datetime

from app.api import deps
from app.models.trending_product import TrendingProduct
from app.models.product import Product
from app.models.brand import Brand
from app.schemas import trending_product as schemas

router = APIRouter()


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
