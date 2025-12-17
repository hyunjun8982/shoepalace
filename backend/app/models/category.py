from sqlalchemy import Column, String, Boolean, Text, Integer
from .base import BaseModel

class Category(BaseModel):
    __tablename__ = "categories"

    name = Column(String(50), unique=True, nullable=False, index=True)
    name_kr = Column(String(50), nullable=False)
    description = Column(Text)
    icon = Column(String(10))
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
