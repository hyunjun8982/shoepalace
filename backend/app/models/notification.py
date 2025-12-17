from sqlalchemy import Column, String, DateTime, Boolean, Enum, Text
from sqlalchemy.sql import func
from .base import BaseModel
import uuid
import enum


class NotificationType(str, enum.Enum):
    """알림 타입"""
    STOCK_OUT = "stock_out"  # 품절
    STOCK_LOW = "stock_low"  # 재고 부족


class Notification(BaseModel):
    """알림 모델"""
    __tablename__ = "notifications"

    type = Column(Enum(NotificationType), nullable=False, comment="알림 타입")
    title = Column(String(200), nullable=False, comment="알림 제목")
    message = Column(Text, nullable=False, comment="알림 메시지")

    # 관련 정보
    product_id = Column(String(36), nullable=True, comment="상품 ID")
    product_name = Column(String(200), nullable=True, comment="상품명")
    product_code = Column(String(100), nullable=True, comment="상품 코드")
    product_image_url = Column(String(500), nullable=True, comment="상품 이미지 URL")
    size = Column(String(50), nullable=True, comment="사이즈")
    previous_quantity = Column(String(20), nullable=True, comment="이전 수량")
    current_quantity = Column(String(20), nullable=True, comment="현재 수량")

    is_read = Column(Boolean, default=False, nullable=False, comment="읽음 여부")
    read_at = Column(DateTime(timezone=True), nullable=True, comment="읽은 시간")
