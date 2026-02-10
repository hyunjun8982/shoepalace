from pydantic import BaseModel, Field, field_serializer
from typing import Optional
from datetime import datetime, date
from uuid import UUID


class AdidasComparisonPurchaseCreate(BaseModel):
    """구매내역 수동 입력"""
    product_code: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(..., ge=1)
    size: Optional[str] = Field(None, max_length=20)
    unit_price: Optional[int] = None
    note: Optional[str] = Field(None, max_length=200)


class AdidasComparisonPurchaseInDB(BaseModel):
    """구매내역 DB 스키마"""
    id: UUID
    product_code: str
    size: Optional[str] = None
    quantity: int
    unit_price: Optional[int] = None
    buyer_name: str
    source: str
    category: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime

    @field_serializer('id')
    def serialize_uuid(self, value: UUID) -> str:
        return str(value)

    class Config:
        from_attributes = True


class AdidasComparisonSaleInDB(BaseModel):
    """판매내역 DB 스키마"""
    id: UUID
    product_code: str
    size: Optional[str] = None
    quantity: int
    unit_price: Optional[int] = None
    total_price: Optional[int] = None
    source: str
    sale_date: Optional[date] = None
    note: Optional[str] = None
    created_at: datetime

    @field_serializer('id')
    def serialize_uuid(self, value: UUID) -> str:
        return str(value)

    class Config:
        from_attributes = True


class AdidasComparisonInventoryUpsert(BaseModel):
    """재고 입력/수정"""
    product_code: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(..., ge=0)
    note: Optional[str] = Field(None, max_length=200)


class AdidasComparisonInventoryInDB(BaseModel):
    """재고 DB 스키마"""
    id: UUID
    product_code: str
    quantity: int
    note: Optional[str] = None
    created_at: datetime

    @field_serializer('id')
    def serialize_uuid(self, value: UUID) -> str:
        return str(value)

    class Config:
        from_attributes = True


class AdidasComparisonSummary(BaseModel):
    """품번별 비교 요약"""
    product_code: str
    total_purchased_qty: int = 0
    total_sales_qty: int = 0
    difference: int = 0
    inventory_qty: Optional[int] = None
    inventory_match: Optional[bool] = None


class AdidasComparisonSummaryResponse(BaseModel):
    """비교 요약 응답"""
    items: list[AdidasComparisonSummary]
    total: int
    total_purchased: int = 0
    total_sold: int = 0


class AdidasComparisonStatsResponse(BaseModel):
    """통계 응답"""
    purchase_count: int = 0
    sale_count: int = 0
    purchase_product_codes: int = 0
    sale_product_codes: int = 0
