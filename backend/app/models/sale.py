from sqlalchemy import Column, String, Date, ForeignKey, Enum, Text, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from .base import BaseModel

class SaleStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    cancelled = "cancelled"

class Sale(BaseModel):
    __tablename__ = "sales"

    sale_number = Column(String(50), unique=True, nullable=False)  # 판매번호
    sale_date = Column(Date, nullable=False)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    customer_name = Column(String(100))
    customer_contact = Column(String(100))
    total_seller_amount = Column(Numeric(12, 2), default=0)
    total_company_amount = Column(Numeric(12, 2), default=0)
    total_seller_margin = Column(Numeric(12, 2), default=0)
    status = Column(Enum(SaleStatus), default=SaleStatus.pending)
    notes = Column(Text)
    transaction_statement_url = Column(String(500))  # 거래명세서 URL
    tax_invoice_url = Column(String(500))  # 세금계산서 URL

    # 관계 설정
    seller = relationship("User", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")

class SaleItem(BaseModel):
    __tablename__ = "sale_items"

    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id"))
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    product_name = Column(String(255))
    size = Column(String(50))
    quantity = Column(Integer, default=1)
    seller_sale_price_original = Column(Numeric(10, 2), nullable=False)
    seller_sale_currency = Column(String(3), default="USD")
    seller_sale_price_krw = Column(Numeric(10, 2), nullable=False)
    company_sale_price = Column(Numeric(10, 2))
    seller_margin = Column(Numeric(10, 2))
    product_image_url = Column(String(500))

    # 관계 설정
    sale = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")