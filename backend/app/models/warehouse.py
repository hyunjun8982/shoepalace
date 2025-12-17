from sqlalchemy import Column, String, Boolean, Text
from .base import BaseModel

class Warehouse(BaseModel):
    __tablename__ = "warehouses"

    warehouse_code = Column(String(50), unique=True, nullable=False, index=True)  # 창고 코드 (예: WH001)
    name = Column(String(100), nullable=False)  # 창고 이름
    location = Column(String(200))  # 창고 위치 (예: 1층, A구역)
    image_url = Column(String(500))  # 창고 사진 URL
    is_active = Column(Boolean, default=True)  # 활성 상태
    description = Column(Text)  # 설명/메모
