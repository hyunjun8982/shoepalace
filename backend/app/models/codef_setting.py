from sqlalchemy import Column, String, Boolean, Text
from app.models.base import BaseModel


class CodefSetting(BaseModel):
    """CODEF API 설정 테이블"""
    __tablename__ = "codef_settings"

    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=True, default="")
    description = Column(String(500), nullable=True)
    is_encrypted = Column(Boolean, default=False)
