"""포이즌 가격비교 스키마"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class PoizonPriceWatchAddItem(BaseModel):
    """관심 상품 추가 항목"""
    article_number: str
    sell_price: Optional[int] = None


class PoizonPriceWatchAdd(BaseModel):
    """관심 상품코드 일괄 추가"""
    items: List[PoizonPriceWatchAddItem] = Field(..., min_length=1)


class PoizonPriceWatchItem(BaseModel):
    """관심 상품 응답"""
    article_number: str
    found: bool = False
    title: Optional[str] = None
    logo_url: Optional[str] = None
    spu_id: Optional[int] = None
    avg_price_small: Optional[int] = None
    avg_price_large: Optional[int] = None
    avg_price_apparel: Optional[int] = None
    price_details: Optional[List[Any]] = None
    sell_price: Optional[int] = None
    created_at: datetime


class PoizonPriceWatchListResponse(BaseModel):
    """관심 상품 목록 응답"""
    items: List[PoizonPriceWatchItem]
    total: int
    found_count: int
    not_found_count: int


class PoizonPriceRefreshRequest(BaseModel):
    """가격 갱신 요청"""
    article_numbers: Optional[List[str]] = None
