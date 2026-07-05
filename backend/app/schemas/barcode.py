from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

class BarcodeBase(BaseModel):
    barcode_value: str
    barcode_type: str = "code128"
    is_active: bool = True
    notes: Optional[str] = None

class BarcodeCreate(BarcodeBase):
    product_id: UUID
    size: str  # 사이즈 (필수)

class BarcodeUpdate(BaseModel):
    size: Optional[str] = None  # 사이즈
    barcode_value: Optional[str] = None
    barcode_type: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class Barcode(BarcodeBase):
    id: UUID
    product_id: UUID
    size: str
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BarcodeResponse(Barcode):
    pass

class BarcodeSearchResult(BaseModel):
    barcode_id: UUID
    product_id: UUID
    size: str  # 사이즈
    barcode_value: str
    product_code: str
    product_name: str
    brand_name: Optional[str] = None
    image_url: Optional[str] = None
    available_qty: Optional[int] = 0

    class Config:
        from_attributes = True
