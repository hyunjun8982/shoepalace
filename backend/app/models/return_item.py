from sqlalchemy import Column, String, Text, Integer, ForeignKey, Enum, DateTime, Date, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from .base import BaseModel


class ReturnItemStatus(str, enum.Enum):
    in_stock = "in_stock"  # 반품 입고 (보유 중)
    shipped = "shipped"    # 출고 완료


class ReturnItem(BaseModel):
    """반품 건별 개별 관리 (건마다 사유/사진/출고 정보가 다름)"""
    __tablename__ = "return_items"

    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    size = Column(String(20), nullable=False)
    quantity = Column(Integer, default=1)
    reason = Column(Text, nullable=True)  # 반품/불량 사유
    image_url = Column(String(500), nullable=True)  # 불량 사진
    status = Column(Enum(ReturnItemStatus), default=ReturnItemStatus.in_stock, nullable=False, index=True)
    received_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # 입고 처리자

    # 출고(판매) 정보
    sale_date = Column(Date, nullable=True)  # 판매일
    customer_name = Column(String(100), nullable=True)  # 판매처/고객명 (예: 번개장터)
    customer_contact = Column(String(100), nullable=True)  # 연락처
    sale_price = Column(Numeric(12, 2), nullable=True)  # 판매가격
    tracking_number = Column(String(100), nullable=True)  # 송장번호
    ship_notes = Column(Text, nullable=True)  # 출고 메모
    shipped_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # 출고 처리자
    shipped_at = Column(DateTime, nullable=True)  # 출고 처리 일시

    # 관계 설정
    product = relationship("Product")
    receiver = relationship("User", foreign_keys=[received_by])
    shipper = relationship("User", foreign_keys=[shipped_by])
