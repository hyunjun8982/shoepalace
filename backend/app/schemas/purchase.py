from typing import Optional, List, Any, Dict
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, field_validator, validator, ConfigDict
from app.models.purchase import PaymentType, PurchaseStatus

class PurchaseItemBase(BaseModel):
    product_id: str
    size: Optional[str] = None
    warehouse_id: Optional[str] = None
    quantity: int = 1
    purchase_price: float  # Decimal에서 float로 변경
    selling_price: Optional[float] = None
    margin_rate: Optional[float] = None
    receipt_image_url: Optional[str] = None
    product_image_url: Optional[str] = None
    notes: Optional[str] = None

    @validator('product_id')
    def validate_product_id(cls, v):
        if v:
            try:
                UUID(v)
            except ValueError:
                raise ValueError(f"올바른 UUID 형식이 아닙니다: {v}")
        return v

class PurchaseItemCreate(PurchaseItemBase):
    pass

class PurchaseItemUpdate(PurchaseItemBase):
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    purchase_price: Optional[float] = None

class ProductInfo(BaseModel):
    """Product 정보를 위한 스키마"""
    id: str
    product_code: str
    product_name: str
    category: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    brand_name: Optional[str] = None
    brand_icon_url: Optional[str] = None

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class WarehouseInfo(BaseModel):
    """Warehouse 정보를 위한 스키마"""
    id: str
    warehouse_code: str
    name: str
    location: Optional[str] = None

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class PurchaseItem(PurchaseItemBase):
    id: str
    warehouse_id: Optional[str] = None
    purchase_id: str
    created_at: datetime
    product: Optional[ProductInfo] = None  # 상품 정보 포함
    warehouse: Optional[WarehouseInfo] = None  # 창고 정보 포함

    @field_validator('id', 'purchase_id', 'product_id', 'warehouse_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class PurchaseBase(BaseModel):
    transaction_no: str
    purchase_date: date
    payment_type: PaymentType
    supplier: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_urls: Optional[List[str]] = []  # 영수증 이미지 URL 목록 (다중)
    notes: Optional[str] = None

class PurchaseCreate(BaseModel):
    transaction_no: Optional[str] = None  # 자동 생성을 위해 옵셔널로 변경
    purchase_date: date
    payment_type: PaymentType
    supplier: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_urls: Optional[List[str]] = []  # 영수증 이미지 URL 목록 (다중)
    notes: Optional[str] = None
    buyer_id: Optional[str] = None  # 구매자 ID (admin이 지정 가능)
    receiver_id: Optional[str] = None  # 입고확인자 ID
    items: List[PurchaseItemCreate]

class PurchaseUpdate(BaseModel):
    transaction_no: Optional[str] = None
    purchase_date: Optional[date] = None
    payment_type: Optional[PaymentType] = None
    supplier: Optional[str] = None
    receipt_url: Optional[str] = None
    receipt_urls: Optional[List[str]] = None  # 영수증 이미지 URL 목록 (다중)
    status: Optional[PurchaseStatus] = None
    notes: Optional[str] = None
    items: Optional[List[PurchaseItemCreate]] = None

class Purchase(PurchaseBase):
    id: str
    buyer_id: Optional[str] = None
    buyer_name: Optional[str] = None  # 구매자 이름
    receiver_id: Optional[str] = None  # 입고확인자 ID
    receiver_name: Optional[str] = None  # 입고확인자 이름
    is_confirmed: bool = False  # 입고확인 여부
    confirmed_at: Optional[datetime] = None  # 입고확인 일시
    total_amount: float  # Decimal에서 float로 변경하여 JSON 직렬화 문제 해결
    status: PurchaseStatus
    created_at: datetime
    updated_at: datetime
    items: List[PurchaseItem] = []

    @field_validator('id', 'buyer_id', 'receiver_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    @field_validator('total_amount', mode='before')
    @classmethod
    def convert_decimal_to_float(cls, v):
        if isinstance(v, Decimal):
            return float(v)
        return v

    class Config:
        from_attributes = True

class PurchaseList(BaseModel):
    total: int
    items: List[Purchase]