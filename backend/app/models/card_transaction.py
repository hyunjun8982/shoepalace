import enum
from datetime import datetime
from sqlalchemy import Column, String, Date, Numeric, Boolean, DateTime, Integer, Text, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class CancelStatus(str, enum.Enum):
    normal = "normal"           # 정상
    cancelled = "cancelled"     # 취소
    partial = "partial"         # 부분취소
    rejected = "rejected"       # 거절


class PaymentMethod(str, enum.Enum):
    lump_sum = "lump_sum"       # 일시불
    installment = "installment" # 할부
    other = "other"             # 그외


class CardTransaction(BaseModel):
    """카드 이용 내역"""
    __tablename__ = "card_transactions"
    __table_args__ = (
        UniqueConstraint(
            'organization', 'approval_no', 'used_date', 'card_no',
            name='uix_card_transaction_unique'
        ),
    )

    # 소유자
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    owner_name = Column(String(100), nullable=True)

    # 카드사 정보
    organization = Column(String(10), nullable=False, index=True)  # 기관코드 (0301, 0302 등)
    client_type = Column(String(1), nullable=True, default="P")  # "P": 개인, "B": 법인
    card_name = Column(String(200), nullable=True)
    card_no = Column(String(50), nullable=True)  # 마스킹된 카드번호

    # 이용 정보
    used_date = Column(Date, nullable=False, index=True)
    used_time = Column(String(10), nullable=True)
    merchant_name = Column(String(300), nullable=True)
    used_amount = Column(Numeric(15, 2), nullable=False, default=0)

    # 결제 방법
    payment_type = Column(String(10), nullable=True)  # 1:일시불, 2:할부, 3:그외
    installment_month = Column(Integer, nullable=True)

    # 통화/해외
    currency_code = Column(String(10), nullable=True, default="KRW")
    is_domestic = Column(Boolean, default=True)  # True:국내, False:해외
    krw_amount = Column(Numeric(15, 2), nullable=True)  # 원화금액 (해외건)

    # 승인 정보
    approval_no = Column(String(50), nullable=True, index=True)
    payment_due_date = Column(String(10), nullable=True)  # 결제예정일

    # 취소 정보
    cancel_status = Column(String(20), nullable=False, default="normal")  # normal, cancelled, partial, rejected
    cancel_amount = Column(Numeric(15, 2), nullable=True)

    # 세금 정보
    vat = Column(Numeric(15, 2), nullable=True)
    service_fee = Column(Numeric(15, 2), nullable=True)  # 봉사료

    # 가맹점 상세 정보
    merchant_corp_no = Column(String(50), nullable=True)   # 사업자번호
    merchant_type = Column(String(200), nullable=True)      # 업종
    merchant_tel = Column(String(50), nullable=True)        # 전화번호
    merchant_addr = Column(Text, nullable=True)             # 주소
    merchant_no = Column(String(50), nullable=True)         # 가맹점번호

    # 동기화 메타
    synced_at = Column(DateTime, default=datetime.utcnow)   # CODEF에서 동기화한 시점
    raw_data = Column(Text, nullable=True)                  # 원본 JSON (디버깅용)
