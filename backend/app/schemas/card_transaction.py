from typing import Optional
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, field_validator


class CardTransactionBase(BaseModel):
    organization: str
    client_type: Optional[str] = "P"  # "P": 개인, "B": 법인
    card_name: Optional[str] = None
    card_no: Optional[str] = None
    used_date: date
    used_time: Optional[str] = None
    merchant_name: Optional[str] = None
    used_amount: float = 0
    payment_type: Optional[str] = None
    installment_month: Optional[int] = None
    currency_code: Optional[str] = "KRW"
    is_domestic: bool = True
    krw_amount: Optional[float] = None
    approval_no: Optional[str] = None
    payment_due_date: Optional[str] = None
    cancel_status: str = "normal"
    cancel_amount: Optional[float] = None
    vat: Optional[float] = None
    service_fee: Optional[float] = None
    merchant_corp_no: Optional[str] = None
    merchant_type: Optional[str] = None
    merchant_tel: Optional[str] = None
    merchant_addr: Optional[str] = None
    merchant_no: Optional[str] = None


class CardTransaction(CardTransactionBase):
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


class CardTransactionList(BaseModel):
    total: int
    items: list[CardTransaction]


class CardTransactionSyncRequest(BaseModel):
    organization: str  # 카드사 코드
    start_date: str    # YYYYMMDD
    end_date: str      # YYYYMMDD
    inquiry_type: str = "1"  # "0":카드별, "1":전체
    card_no: Optional[str] = None  # 카드별 조회시
    member_store_info_type: str = "3"  # "0":미포함, "1":가맹점, "2":부가세, "3":전체
    client_type: str = "P"  # "P": 개인, "B": 법인


class CardTransactionSyncResponse(BaseModel):
    total_count: int    # API에서 가져온 총 건수
    new_count: int      # 신규 저장 건수
    updated_count: int  # 업데이트 건수
    message: str


class CardInfo(BaseModel):
    card_name: str
    card_no: str
    card_type: Optional[str] = None
    user_name: Optional[str] = None
    is_sleep: Optional[str] = None
    state: Optional[str] = None
    image_link: Optional[str] = None


class CardListResponse(BaseModel):
    cards: list[CardInfo]
    organization: str


# 계정 연동 스키마
class AccountRegisterRequest(BaseModel):
    organization: str  # 카드사/은행 코드
    login_id: str      # 로그인 ID
    password: str      # 로그인 비밀번호 (평문 → 백엔드에서 RSA 암호화)
    card_no: Optional[str] = None      # 카드번호 (현대카드 등 일부 카드사 필수)
    card_password: Optional[str] = None  # 카드 비밀번호 (일부 카드사 필수)
    client_type: str = "P"  # "P": 개인, "B": 법인
    business_type: str = "CD"  # "CD": 카드, "BK": 은행
    owner_name: Optional[str] = None   # 소유자 이름


class AccountRegisterResponse(BaseModel):
    connected_id: str
    organization: str
    message: str


class ConnectedAccount(BaseModel):
    connected_id: str
    organization_list: list[str] = []


class ConnectedAccountListResponse(BaseModel):
    accounts: list[ConnectedAccount]


# 카드사별 계정 정보
class CodefAccountInfo(BaseModel):
    organization: str
    organization_name: str = ""
    client_type: str = "P"  # "P": 개인, "B": 법인
    login_id: Optional[str] = None
    card_no: Optional[str] = None
    connected_id: Optional[str] = None
    owner_name: Optional[str] = None
    is_connected: bool = False
    connected_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CodefAccountListResponse(BaseModel):
    accounts: list[CodefAccountInfo]


class CodefAccountSaveRequest(BaseModel):
    organization: str
    client_type: str = "P"
    login_id: Optional[str] = None
    card_no: Optional[str] = None
    owner_name: Optional[str] = None


# 카드사 코드 매핑
ORGANIZATION_MAP = {
    "0301": "KB카드",
    "0302": "현대카드",
    "0303": "삼성카드",
    "0304": "NH카드",
    "0305": "BC카드",
    "0306": "신한카드",
    "0307": "씨티카드",
    "0309": "우리카드",
    "0311": "롯데카드",
    "0313": "하나카드",
    "0315": "전북카드",
    "0316": "광주카드",
    "0320": "수협카드",
    "0321": "제주카드",
}
