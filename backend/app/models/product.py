from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel

class Product(BaseModel):
    __tablename__ = "products"

    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"))
    product_code = Column(String(100), unique=True, nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    category = Column(String(50))
    description = Column(Text)
    image_url = Column(String(500))

    # 관계 설정
    brand = relationship("Brand", back_populates="products")
    purchase_items = relationship("PurchaseItem", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")
    inventory = relationship("Inventory", back_populates="product")