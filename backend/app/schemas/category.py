from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, field_validator

class CategoryBase(BaseModel):
    name: str
    name_kr: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: bool = True
    display_order: int = 0

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    name_kr: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None

class Category(CategoryBase):
    id: str
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

class CategoryList(BaseModel):
    total: int
    items: list[Category]
