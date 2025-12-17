from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TrendingProductBase(BaseModel):
    rank: int
    brand: str
    product_name: str
    kream_product_id: int
    model_number: Optional[str] = None
    category: Optional[str] = None
    data_period: Optional[str] = None


class TrendingProductCreate(TrendingProductBase):
    pass


class TrendingProductUpdate(BaseModel):
    rank: Optional[int] = None
    brand: Optional[str] = None
    product_name: Optional[str] = None
    model_number: Optional[str] = None
    category: Optional[str] = None
    data_period: Optional[str] = None


class TrendingProduct(TrendingProductBase):
    id: int
    upload_date: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TrendingProductWithInventory(TrendingProduct):
    """재고 정보를 포함한 인기 상품"""
    inventory_count: int = 0  # 우리 재고에 있는 수량

    class Config:
        from_attributes = True


class TrendingProductList(BaseModel):
    total: int
    items: list[TrendingProduct]


class TrendingProductStats(BaseModel):
    """카테고리별/브랜드별 통계"""
    total_count: int
    by_brand: dict[str, int]
    by_category: dict[str, int]
    latest_upload_date: Optional[datetime] = None
