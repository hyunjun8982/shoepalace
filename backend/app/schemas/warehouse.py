from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID

class WarehouseBase(BaseModel):
    warehouse_code: str = Field(..., description="창고 코드 (예: WH001)")
    name: str = Field(..., description="창고 이름")
    location: Optional[str] = Field(None, description="창고 위치")
    is_active: bool = Field(True, description="활성 상태")
    description: Optional[str] = Field(None, description="설명/메모")

class WarehouseCreate(WarehouseBase):
    pass

class WarehouseUpdate(BaseModel):
    warehouse_code: Optional[str] = None
    name: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None

class Warehouse(WarehouseBase):
    id: str
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

class WarehouseList(BaseModel):
    total: int
    items: list[Warehouse]
