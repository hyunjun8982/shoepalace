"""
네이버쇼핑 필터 모델
"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.models.base import Base


class NaverShoppingFilter(Base):
    """네이버쇼핑 판매처 필터"""

    __tablename__ = "naver_shopping_filters"

    id = Column(Integer, primary_key=True, index=True)
    mall_name = Column(String(100), unique=True, nullable=False, index=True, comment="필터링할 판매처명")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")

    def __repr__(self):
        return f"<NaverShoppingFilter(id={self.id}, mall_name={self.mall_name})>"
