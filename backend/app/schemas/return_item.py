from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, field_validator


class ReturnItemCreate(BaseModel):
    """반품 입고 (구매금액 0원, 건별 개별 등록)"""
    product_id: str
    size: str
    reason: Optional[str] = None


class ReturnShipRequest(BaseModel):
    """반품 출고 처리 (판매 등록과 유사한 입력)"""
    sale_date: date  # 판매일
    customer_name: str  # 판매처/고객명 (예: 번개장터)
    customer_contact: Optional[str] = None  # 연락처
    sale_price: Optional[float] = None  # 판매가격
    tracking_number: Optional[str] = None  # 송장번호
    notes: Optional[str] = None  # 메모


class ReturnItemResponse(BaseModel):
    id: str
    product_id: str
    size: str
    quantity: int
    reason: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    created_at: datetime

    # 상품 정보
    product_name: Optional[str] = None
    brand_name: Optional[str] = None
    sku_code: Optional[str] = None

    # 처리자 정보
    received_by_name: Optional[str] = None

    # 출고 정보
    sale_date: Optional[date] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    sale_price: Optional[float] = None
    tracking_number: Optional[str] = None
    ship_notes: Optional[str] = None
    shipped_by_name: Optional[str] = None
    shipped_at: Optional[datetime] = None

    @field_validator('id', 'product_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    @field_validator('status', mode='before')
    @classmethod
    def convert_status(cls, v):
        return v.value if hasattr(v, 'value') else v

    class Config:
        from_attributes = True


class ReturnItemList(BaseModel):
    total: int
    items: List[ReturnItemResponse]
