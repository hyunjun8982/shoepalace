from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class CodefApiLog(BaseModel):
    """CODEF API 호출 로그 (일일 호출 제한 추적용)"""
    __tablename__ = "codef_api_logs"

    endpoint = Column(String(300), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    status_code = Column(Integer, nullable=True)
    res_code = Column(String(20), nullable=True)  # CF-00000 등
    error_message = Column(Text, nullable=True)
