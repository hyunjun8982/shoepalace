from sqlalchemy import Column, String, Integer, ForeignKey, Enum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from .base import BaseModel

class AdjustmentType(str, enum.Enum):
    purchase = "purchase"  # 구매 입고
    sale = "sale"  # 판매 출고
    return_ = "return"  # 반품
    damage = "damage"  # 파손
    adjustment = "adjustment"  # 재고 조정
    transfer = "transfer"  # 이동

class InventoryAdjustment(BaseModel):
    __tablename__ = "inventory_adjustments"

    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    adjustment_type = Column(Enum(AdjustmentType), nullable=False)
    quantity = Column(Integer, nullable=False)  # 양수: 입고, 음수: 출고
    reference_id = Column(String(100))  # 참조 번호 (구매/판매 ID 등)
    notes = Column(Text)
    adjusted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # 관계 설정
    product = relationship("Product")
    user = relationship("User")