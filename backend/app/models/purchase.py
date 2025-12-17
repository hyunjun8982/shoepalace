from sqlalchemy import Column, String, Date, ForeignKey, Enum, Text, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from .base import BaseModel

class PaymentType(str, enum.Enum):
    corp_card = "corp_card"
    corp_account = "corp_account"
    personal_card = "personal_card"

class PurchaseStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    cancelled = "cancelled"

class Purchase(BaseModel):
    __tablename__ = "purchases"

    transaction_no = Column(String(50), unique=True, nullable=False, index=True)
    purchase_date = Column(Date, nullable=False)
    buyer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    payment_type = Column(Enum(PaymentType), nullable=False)
    supplier = Column(String(100))
    total_amount = Column(Numeric(12, 2), default=0)
    status = Column(Enum(PurchaseStatus), default=PurchaseStatus.pending)
    receipt_url = Column(String(500))  # 영수증 이미지 URL
    notes = Column(Text)

    # 관계 설정
    buyer = relationship("User", back_populates="purchases")
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
