from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum


class SettlementStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SettlementType(str, Enum):
    PURCHASE = "purchase"
    SALE = "sale"
    MONTHLY = "monthly"


class SettlementBase(BaseModel):
    settlement_type: SettlementType
    settlement_date: datetime
    start_date: datetime
    end_date: datetime
    target_user_id: Optional[str] = None
    target_user_name: Optional[str] = None
    total_amount: float = 0
    settlement_amount: float = 0
    fee_amount: float = 0
    tax_amount: float = 0
    final_amount: float = 0
    transaction_count: int = 0
    status: SettlementStatus = SettlementStatus.PENDING
    notes: Optional[str] = None


class SettlementCreate(SettlementBase):
    pass


class SettlementUpdate(BaseModel):
    settlement_type: Optional[SettlementType] = None
    settlement_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    target_user_id: Optional[str] = None
    target_user_name: Optional[str] = None
    total_amount: Optional[float] = None
    settlement_amount: Optional[float] = None
    fee_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    final_amount: Optional[float] = None
    transaction_count: Optional[int] = None
    status: Optional[SettlementStatus] = None
    notes: Optional[str] = None


class SettlementInDB(SettlementBase):
    id: str
    processed_by: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Settlement(SettlementInDB):
    pass


class SettlementList(BaseModel):
    items: List[Settlement]
    total: int
    skip: int
    limit: int


class SettlementSummary(BaseModel):
    total_settlements: int
    pending_count: int
    completed_count: int
    total_amount: float
    total_settlement_amount: float
    total_fee_amount: float
    total_final_amount: float