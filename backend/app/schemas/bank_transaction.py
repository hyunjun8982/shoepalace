from typing import Optional
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, field_validator


class BankTransactionBase(BaseModel):
    organization: str
    account_no: Optional[str] = None
    account_name: Optional[str] = None
    account_holder: Optional[str] = None
    tr_date: date
    tr_time: Optional[str] = None
    description1: Optional[str] = None
    description2: Optional[str] = None
    description3: Optional[str] = None
    description4: Optional[str] = None
    tr_amount_out: float = 0
    tr_amount_in: float = 0
    balance: float = 0
    currency: Optional[str] = "KRW"


class BankTransaction(BankTransactionBase):
    id: str
    user_id: Optional[str] = None
    owner_name: Optional[str] = None
    synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'user_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True


class BankTransactionList(BaseModel):
    total: int
    items: list[BankTransaction]


class BankTransactionSyncRequest(BaseModel):
    organization: str
    account_no: str
    start_date: str  # YYYYMMDD
    end_date: str    # YYYYMMDD
    client_type: str = "B"  # "P": 개인, "B": 법인(기업)


class BankTransactionSyncResponse(BaseModel):
    total_count: int
    new_count: int
    updated_count: int
    message: str


# 은행 기관코드 매핑
BANK_ORGANIZATION_MAP = {
    "0002": "KDB산업은행",
    "0003": "IBK기업은행",
    "0004": "KB국민은행",
    "0007": "수협은행",
    "0011": "NH농협은행",
    "0012": "지역농축협",
    "0020": "우리은행",
    "0023": "SC제일은행",
    "0027": "한국씨티은행",
    "0031": "대구은행",
    "0032": "부산은행",
    "0034": "광주은행",
    "0035": "제주은행",
    "0037": "전북은행",
    "0039": "경남은행",
    "0045": "새마을금고",
    "0048": "신협",
    "0071": "우체국",
    "0081": "하나은행",
    "0088": "신한은행",
    "0089": "케이뱅크",
    "0090": "카카오뱅크",
    "0092": "토스뱅크",
}
