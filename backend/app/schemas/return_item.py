from typing import Optional, List, Literal
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

RegistrationStatus = Literal["registered", "unregistered", "hold"]


def _clean_platforms(v):
    """등록처 목록 정리 (공백 제거, 빈 값/중복 제거)"""
    if not v:
        return None
    cleaned = []
    for p in v:
        p = (p or "").strip()
        if p and p not in cleaned:
            cleaned.append(p)
    return cleaned or None


class ReturnItemCreate(BaseModel):
    """반품 입고 (구매금액 0원, 건별 개별 등록)"""
    product_id: str
    size: str
    reason: Optional[str] = None
    registration_status: RegistrationStatus = "unregistered"
    registration_platforms: Optional[List[str]] = None

    @field_validator('registration_platforms', mode='before')
    @classmethod
    def clean_platforms(cls, v):
        return _clean_platforms(v)


class ReturnBatchItem(ReturnItemCreate):
    """일괄 반품 입고 1줄 (수량만큼 개별 건으로 생성)"""
    quantity: int = Field(1, ge=1, le=100)


class ReturnBatchCreate(BaseModel):
    items: List[ReturnBatchItem] = Field(..., min_length=1)


class ReturnBatchCreatedLine(BaseModel):
    """입력 줄별로 생성된 반품 건 ID 목록 (사진 업로드용)"""
    ids: List[str]


class ReturnBatchResult(BaseModel):
    total_created: int
    lines: List[ReturnBatchCreatedLine]


class ReturnRegistrationUpdate(BaseModel):
    """판매처 등록 여부 수정"""
    registration_status: RegistrationStatus
    registration_platforms: Optional[List[str]] = None

    @field_validator('registration_platforms', mode='before')
    @classmethod
    def clean_platforms(cls, v):
        return _clean_platforms(v)


class ReturnBulkDeleteRequest(BaseModel):
    """반품 입고 일괄 취소"""
    ids: List[str] = Field(..., min_length=1, max_length=1000)


class ReturnShipRequest(BaseModel):
    """반품 출고 처리 (판매 등록과 유사한 입력)"""
    sale_date: date  # 판매일
    customer_name: str  # 판매처/고객명 (예: 번개장터)
    customer_contact: Optional[str] = None  # 연락처
    sale_price: Optional[float] = None  # 판매가격
    tracking_number: Optional[str] = None  # 송장번호
    notes: Optional[str] = None  # 메모


class ReturnItemResponse(BaseModel):
    id: str
    product_id: str
    size: str
    quantity: int
    reason: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    registration_status: str = "unregistered"
    registration_platforms: Optional[List[str]] = None
    created_at: datetime

    # 상품 정보
    product_name: Optional[str] = None
    brand_name: Optional[str] = None
    sku_code: Optional[str] = None

    # 처리자 정보
    received_by_name: Optional[str] = None

    # 출고 정보
    sale_date: Optional[date] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    sale_price: Optional[float] = None
    tracking_number: Optional[str] = None
    ship_notes: Optional[str] = None
    shipped_by_name: Optional[str] = None
    shipped_at: Optional[datetime] = None

    @field_validator('id', 'product_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    @field_validator('status', mode='before')
    @classmethod
    def convert_status(cls, v):
        return v.value if hasattr(v, 'value') else v

    class Config:
        from_attributes = True


class ReturnItemList(BaseModel):
    total: int
    items: List[ReturnItemResponse]
