from sqlalchemy import Column, String, Integer, Float, DateTime, Enum, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from .base import Base


class SettlementStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SettlementType(str, enum.Enum):
    PURCHASE = "purchase"  # 구매 정산
    SALE = "sale"          # 판매 정산
    MONTHLY = "monthly"    # 월간 정산


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    settlement_type = Column(Enum(SettlementType), nullable=False)
    settlement_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)

    # 정산 대상자 정보
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    target_user_name = Column(String(100), nullable=True)

    # 금액 정보
    total_amount = Column(Float, default=0)  # 총 거래액
    settlement_amount = Column(Float, default=0)  # 정산 금액
    fee_amount = Column(Float, default=0)  # 수수료
    tax_amount = Column(Float, default=0)  # 세금
    final_amount = Column(Float, default=0)  # 최종 정산액

    # 거래 건수
    transaction_count = Column(Integer, default=0)

    # 상태 및 메모
    status = Column(Enum(SettlementStatus), default=SettlementStatus.PENDING)
    notes = Column(Text, nullable=True)

    # 정산 처리 정보
    processed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    processed_at = Column(DateTime, nullable=True)

    # 타임스탬프
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 관계
    target_user = relationship("User", foreign_keys=[target_user_id], backref="settlements")
    processor = relationship("User", foreign_keys=[processed_by])