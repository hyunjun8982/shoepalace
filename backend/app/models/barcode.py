from sqlalchemy import Column, String, ForeignKey, Boolean, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel
import uuid

class Barcode(BaseModel):
    __tablename__ = "barcodes"

    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    size = Column(String(50), nullable=False)  # 사이즈 (예: M, L, 260, etc)
    barcode_value = Column(String(128), nullable=False, unique=True, index=True)
    barcode_type = Column(String(20), default="code128")  # ean13, code128, qr, custom
    is_active = Column(Boolean, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # 관계 설정
    product = relationship("Product", foreign_keys=[product_id], viewonly=True)
    created_user = relationship("User", foreign_keys=[created_by])

    # 인덱스
    __table_args__ = (
        Index('idx_barcode_active', 'barcode_value', 'is_active'),
    )
