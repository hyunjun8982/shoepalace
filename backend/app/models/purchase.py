from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Enum, Text, Numeric, Integer, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from .base import BaseModel

class PaymentType(str, enum.Enum):
    corp_card = "corp_card"
    corp_account = "corp_account"
    personal_card = "personal_card"
    personal_card_inser = "personal_card_inser"  # 개인카드(인서)
    personal_card_dahee = "personal_card_dahee"  # 개인카드(다희)

class PurchaseStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    cancelled = "cancelled"

class Purchase(BaseModel):
    __tablename__ = "purchases"

    transaction_no = Column(String(50), unique=True, nullable=False, index=True)
    purchase_date = Column(Date, nullable=False)
    buyer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # 입고확인자
    is_confirmed = Column(Boolean, default=False)  # 입고확인 여부
    confirmed_at = Column(DateTime, nullable=True)  # 입고확인 일시
    payment_type = Column(Enum(PaymentType), nullable=False)
    supplier = Column(String(100))
    total_amount = Column(Numeric(12, 2), default=0)
    status = Column(Enum(PurchaseStatus), default=PurchaseStatus.pending)
    receipt_url = Column(String(500))  # 영수증 이미지 URL (단일, 하위호환용)
    receipt_urls = Column(JSON, default=list)  # 영수증 이미지 URL 목록 (다중)
    notes = Column(Text)

    # 관계 설정
    buyer = relationship("User", foreign_keys=[buyer_id], back_populates="purchases")
    receiver = relationship("User", foreign_keys=[receiver_id])
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

class PurchaseItem(BaseModel):
    __tablename__ = "purchase_items"

    purchase_id = Column(UUID(as_uuid=True), ForeignKey("purchases.id"))
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    size = Column(String(20))
    warehouse_id = Column(UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=True)
    quantity = Column(Integer, default=1)
    purchase_price = Column(Numeric(10, 2), nullable=False)
    selling_price = Column(Numeric(10, 2))
    margin_rate = Column(Numeric(5, 2))
    receipt_image_url = Column(String(500))
    product_image_url = Column(String(500))
    notes = Column(Text)

    # 관계 설정
    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product", back_populates="purchase_items")
    warehouse = relationship("Warehouse")
