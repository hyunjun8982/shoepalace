from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class CardCreate(BaseModel):
    card_type: str  # "corp" 또는 "personal"
    card_issuer: str  # 카드사
    card_number: str  # 마지막 4자리 또는 전체
    owner_name: str  # 카드 소유주명
    notes: Optional[str] = None


class CardUpdate(BaseModel):
    card_type: Optional[str] = None
    card_issuer: Optional[str] = None
    card_number: Optional[str] = None
    owner_name: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CardResponse(BaseModel):
    id: UUID
    card_type: str
    card_issuer: str
    card_number: str
    owner_name: str
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CardListResponse(BaseModel):
    items: list[CardResponse]
    total: int
    skip: int
    limit: int
