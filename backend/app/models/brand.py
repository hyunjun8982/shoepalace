from sqlalchemy import Column, String, Boolean, Text
from sqlalchemy.orm import relationship
from .base import BaseModel

class Brand(BaseModel):
    __tablename__ = "brands"

    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    icon_url = Column(String(500))  # 브랜드 아이콘 URL
    is_active = Column(Boolean, default=True)

    # 관계 설정
    products = relationship("Product", back_populates="brand")