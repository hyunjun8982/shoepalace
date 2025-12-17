from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, field_validator

# Inventory 스키마
class InventorySchema(BaseModel):
    id: str
    product_id: str
    size: str
    quantity: int
    reserved_quantity: int
    location: Optional[str] = None
    min_stock_level: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'product_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    brand_id: str
    product_code: str
    product_name: str
    category: Optional[str] = None
    description: Optional[str] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    brand_id: Optional[str] = None
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

class Product(ProductBase):
    id: str
    brand_name: Optional[str] = None
    brand_icon_url: Optional[str] = None
    inventory: Optional[List[InventorySchema]] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'brand_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class ProductList(BaseModel):
    total: int
    items: list[Product]