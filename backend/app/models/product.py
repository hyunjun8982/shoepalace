from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel

class Product(BaseModel):
    __tablename__ = "products"

    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"))
    product_code = Column(String(100), unique=True, nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    description = Column(Text)
    image_url = Column(String(500))
    barcode_id = Column(UUID(as_uuid=True), ForeignKey("barcodes.id"), nullable=True, index=True)

    # 관계 설정
    brand = relationship("Brand", back_populates="products")
    purchase_items = relationship("PurchaseItem", back_populates="product", cascade="all, delete-orphan")
    sale_items = relationship("SaleItem", back_populates="product", cascade="all, delete-orphan")
    inventory = relationship("Inventory", back_populates="product", cascade="all, delete-orphan")
    # Barcodes는 1:N 관계 (하나의 상품이 여러 바코드를 가짐)
    barcodes = relationship(
        "Barcode",
        primaryjoin="Product.id == foreign(Barcode.product_id)",
        foreign_keys="[Barcode.product_id]",
        viewonly=True,
        lazy="select"
    )