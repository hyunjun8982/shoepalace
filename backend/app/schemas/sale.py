from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, field_validator
from app.models.sale import SaleStatus

class SaleItemBase(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    brand_name: Optional[str] = None
    category: Optional[str] = None
    size: Optional[str] = None
    quantity: int = 1
    seller_sale_price_original: Decimal
    seller_sale_currency: Optional[str] = "USD"
    seller_sale_price_krw: Decimal
    product_image_url: Optional[str] = None

class SaleItemCreate(SaleItemBase):
    pass

class SaleItemUpdate(SaleItemBase):
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    seller_sale_price_krw: Optional[Decimal] = None

class SaleItem(SaleItemBase):
    id: str
    sale_id: str
    company_sale_price: Optional[Decimal] = None
    seller_margin: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'sale_id', 'product_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class SaleBase(BaseModel):
    sale_date: date
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    notes: Optional[str] = None
    transaction_statement_url: Optional[str] = None
    tax_invoice_url: Optional[str] = None

class SaleCreate(SaleBase):
    items: List[SaleItemCreate]

class SaleUpdate(BaseModel):
    sale_date: Optional[date] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    total_company_amount: Optional[Decimal] = None
    total_seller_margin: Optional[Decimal] = None
    status: Optional[SaleStatus] = None
    notes: Optional[str] = None
    transaction_statement_url: Optional[str] = None
    tax_invoice_url: Optional[str] = None

class Sale(SaleBase):
    id: str
    sale_number: str
    seller_id: str
    seller_name: Optional[str] = None
    total_seller_amount: Optional[Decimal] = None
    total_company_amount: Optional[Decimal] = None
    total_seller_margin: Optional[Decimal] = None
    status: SaleStatus
    created_at: datetime
    updated_at: datetime
    items: List[SaleItem] = []

    @field_validator('id', 'seller_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class SaleList(BaseModel):
    total: int
    items: List[Sale]