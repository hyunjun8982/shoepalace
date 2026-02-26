"""
아디다스 계정 스키마
"""
from datetime import datetime, date
from typing import Optional, Union
from pydantic import BaseModel, EmailStr, field_serializer
from uuid import UUID


class AdidasAccountBase(BaseModel):
    email: EmailStr
    password: str
    birthday: Optional[str] = None
    adikr_barcode: Optional[str] = None
    barcode_image_url: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    current_points: Optional[int] = None
    owned_vouchers: Optional[str] = None
    is_active: bool = True
    fetch_status: Optional[str] = None
    web_fetch_status: Optional[str] = None
    mobile_fetch_status: Optional[str] = None
    web_issue_status: Optional[str] = None
    mobile_issue_status: Optional[str] = None
    memo: Optional[str] = None
    last_coupon_issued: Optional[datetime] = None
    next_coupon_available_date: Optional[str] = None


class AdidasAccountCreate(AdidasAccountBase):
    pass


class AdidasAccountUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    birthday: Optional[str] = None
    adikr_barcode: Optional[str] = None
    barcode_image_url: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    current_points: Optional[int] = None
    owned_vouchers: Optional[str] = None
    is_active: Optional[bool] = None
    fetch_status: Optional[str] = None
    web_fetch_status: Optional[str] = None
    mobile_fetch_status: Optional[str] = None
    web_issue_status: Optional[str] = None
    mobile_issue_status: Optional[str] = None
    memo: Optional[str] = None
    session_cookies: Optional[str] = None
    last_coupon_issued: Optional[datetime] = None
    next_coupon_available_date: Optional[str] = None


class AdidasAccountInDB(AdidasAccountBase):
    id: UUID
    session_cookies: Optional[str] = None
    last_login: Optional[datetime] = None
    last_coupon_check: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    next_coupon_available_date: Optional[Union[str, date]] = None

    @field_serializer('next_coupon_available_date')
    def serialize_date(self, value: Optional[Union[str, date]], _info):
        if isinstance(value, date):
            return value.isoformat()
        return value

    class Config:
        from_attributes = True


class SaveCookiesRequest(BaseModel):
    """세션 쿠키 저장 요청"""
    cookies: str  # JSON 문자열로 쿠키 저장


class AdidasAccountInfo(BaseModel):
    """마이페이지에서 가져온 계정 정보"""
    email: str
    name: Optional[str] = None
    birthday: Optional[str] = None
    adikr_barcode: Optional[str] = None
    phone: Optional[str] = None
    current_points: Optional[int] = None
    owned_vouchers: Optional[str] = None


class CouponStatus(BaseModel):
    """쿠폰 보유 현황"""
    account_id: UUID
    email: str
    discount_15: int = 0  # 15% 할인 쿠폰
    discount_20: int = 0  # 20% 할인 쿠폰
    amount_100k: int = 0  # 10만원 쿠폰
    amount_50k: int = 0   # 5만원 쿠폰
    total_coupons: int = 0
    last_checked: Optional[datetime] = None


class IssueCouponRequest(BaseModel):
    """쿠폰 발급 요청"""
    coupon_amount: str = "100000"
