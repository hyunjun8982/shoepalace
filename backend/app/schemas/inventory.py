from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, field_validator
from uuid import UUID

class InventoryBase(BaseModel):
    product_id: str
    warehouse_id: Optional[str] = None
    quantity: int = 0
    reserved_quantity: int = 0
    location: Optional[str] = None
    min_stock_level: int = 0

class InventoryCreate(InventoryBase):
    pass

class InventoryUpdate(BaseModel):
    warehouse_id: Optional[str] = None
    quantity: Optional[int] = None
    reserved_quantity: Optional[int] = None
    location: Optional[str] = None
    min_stock_level: Optional[int] = None

class Inventory(InventoryBase):
    id: str
    available_quantity: int
    is_low_stock: bool
    last_updated: datetime
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'product_id', 'warehouse_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class InventoryList(BaseModel):
    total: int
    items: List[Inventory]

# 재고 조정 스키마
class AdjustmentType(str):
    purchase = "purchase"
    sale = "sale"
    return_ = "return"
    damage = "damage"
    adjustment = "adjustment"
    transfer = "transfer"

class InventoryAdjustmentBase(BaseModel):
    product_id: str
    adjustment_type: str
    quantity: int
    reference_id: Optional[str] = None
    notes: Optional[str] = None

class InventoryAdjustmentCreate(InventoryAdjustmentBase):
    pass

class InventoryAdjustment(InventoryAdjustmentBase):
    id: str
    adjusted_by: str
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'product_id', 'adjusted_by', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class InventoryAdjustmentList(BaseModel):
    total: int
    items: List[InventoryAdjustment]

# 재고 현황 상세 (상품 정보 포함)
class InventoryDetail(Inventory):
    product_name: str
    brand: Optional[str] = ''
    category: Optional[str] = ''
    size: Optional[str] = None
    color: Optional[str] = None
    sku_code: Optional[str] = None
    warehouse_name: Optional[str] = None
    warehouse_location: Optional[str] = None
    warehouse_image_url: Optional[str] = None

class InventoryDetailList(BaseModel):
    total: int
    items: List[InventoryDetail]

# 구매/판매 이력
class PurchaseHistoryItem(BaseModel):
    purchase_date: datetime
    transaction_no: str
    size: Optional[str] = None
    quantity: int
    purchase_price: float
    supplier: Optional[str] = None
    buyer_name: Optional[str] = None

class SaleHistoryItem(BaseModel):
    sale_date: datetime
    sale_number: str
    size: Optional[str] = None
    quantity: int
    sale_price: float
    customer_name: Optional[str] = None
    seller_name: Optional[str] = None

# 사이즈별 재고 정보
class SizeInventory(BaseModel):
    id: str
    size: str
    quantity: int
    location: Optional[str] = None
    warehouse_name: Optional[str] = None
    warehouse_location: Optional[str] = None
    warehouse_image_url: Optional[str] = None

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

# 재고 상세 (구매/판매 이력 포함)
class InventoryDetailWithHistory(InventoryDetail):
    size_inventories: List[SizeInventory] = []  # 사이즈별 재고 정보
    purchase_history: List[PurchaseHistoryItem] = []
    sale_history: List[SaleHistoryItem] = []

# 창고 변경 스키마
class InventoryWarehouseUpdate(BaseModel):
    warehouse_id: Optional[str] = None
