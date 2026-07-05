import enum
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class CardType(str, enum.Enum):
    CORP = "corp"  # 법인카드
    PERSONAL = "personal"  # 개인카드


class CardIssuer(str, enum.Enum):
    SHINHAN = "shinhan"  # 신한
    KB = "kb"  # KB국민
    HYUNDAI = "hyundai"  # 현대
    SAMSUNG = "samsung"  # 삼성
    LOTTE = "lotte"  # 롯데
    HANA = "hana"  # 하나
    NH = "nh"  # NH농협
    WOORI = "woori"  # 우리
    SC = "sc"  # SC제일
    CITI = "citi"  # 씨티
    OTHER = "other"  # 기타


class Card(BaseModel):
    """결제 카드 관리"""
    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint('card_issuer', 'card_number', name='uix_card_unique'),
    )

    card_type = Column(String(20), nullable=False)  # "corp" 또는 "personal"
    card_issuer = Column(String(50), nullable=False)  # 카드사
    card_number = Column(String(20), nullable=False)  # 마지막 4자리 또는 전체 (마스킹)
    owner_name = Column(String(100), nullable=False)  # 카드 소유주명
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    notes = Column(String(500), nullable=True)  # 비고

    user = relationship("User", foreign_keys=[user_id])

    # 구매 및 판매에서 사용되는 역 관계
    purchases = relationship("Purchase", back_populates="payment_card", foreign_keys="Purchase.payment_card_id")
    sales = relationship("Sale", back_populates="payment_card", foreign_keys="Sale.payment_card_id")
