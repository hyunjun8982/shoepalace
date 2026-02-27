from datetime import datetime
from sqlalchemy import Column, String, Date, Numeric, DateTime, Text, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class BankTransaction(BaseModel):
    """은행 수시입출 거래내역"""
    __tablename__ = "bank_transactions"
    __table_args__ = (
        UniqueConstraint(
            'organization', 'account_no', 'tr_date', 'tr_time',
            'tr_amount_out', 'tr_amount_in', 'balance',
            name='uix_bank_transaction_unique'
        ),
    )

    # 소유자
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    owner_name = Column(String(100), nullable=True)

    # 은행/계좌 정보
    organization = Column(String(10), nullable=False, index=True)  # 은행 기관코드
    account_no = Column(String(50), nullable=True)                 # 계좌번호
    account_name = Column(String(100), nullable=True)              # 계좌명(상품명)
    account_holder = Column(String(100), nullable=True)            # 예금주명

    # 거래 정보
    tr_date = Column(Date, nullable=False, index=True)             # 거래일자
    tr_time = Column(String(10), nullable=True)                    # 거래시간 (HHMMSS)
    description1 = Column(String(200), nullable=True)              # 적요1 (입금처/받는분)
    description2 = Column(String(200), nullable=True)              # 적요2 (거래점명)
    description3 = Column(String(200), nullable=True)              # 적요3 (메모)
    description4 = Column(String(200), nullable=True)              # 적요4 (거래구분)

    # 금액
    tr_amount_out = Column(Numeric(15, 2), nullable=False, default=0)    # 출금액
    tr_amount_in = Column(Numeric(15, 2), nullable=False, default=0)     # 입금액
    balance = Column(Numeric(15, 2), nullable=False, default=0)          # 거래후잔액

    # 기타
    currency = Column(String(10), nullable=True, default="KRW")

    # 동기화 메타
    synced_at = Column(DateTime, default=datetime.utcnow)
    raw_data = Column(Text, nullable=True)
