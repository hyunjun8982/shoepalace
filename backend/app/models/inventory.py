from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

class Inventory(BaseModel):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint('product_id', 'size', name='uix_product_size'),
    )

    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    size = Column(String(20), nullable=False)
    quantity = Column(Integer, default=0)
    reserved_quantity = Column(Integer, default=0)
    location = Column(String(100))
    min_stock_level = Column(Integer, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 불량 물품 관련 필드
    defect_quantity = Column(Integer, default=0)  # 불량 수량
    defect_reason = Column(Text, nullable=True)  # 불량 사유
    defect_marked_at = Column(DateTime, nullable=True)  # 불량 마킹 일시
    defect_image_url = Column(String(500), nullable=True)  # 불량 이미지 URL

    # 관계 설정
    product = relationship("Product", back_populates="inventory")

    @property
    def available_quantity(self):
        """사용 가능한 재고 수량"""
        return self.quantity - self.reserved_quantity

    @property
    def is_low_stock(self):
        """최소 재고 수준 이하 여부"""
        return self.available_quantity <= self.min_stock_level