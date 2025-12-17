from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.sql import func
from app.models.base import Base


class TrendingProduct(Base):
    """KREAM 인기 상품 (최근 30일 판매량 TOP100)"""
    __tablename__ = "trending_products"

    id = Column(Integer, primary_key=True, index=True)
    rank = Column(Integer, nullable=False, comment="순위")
    brand = Column(String(100), nullable=False, index=True, comment="브랜드명")
    product_name = Column(String(500), nullable=False, comment="상품명")
    kream_product_id = Column(Integer, nullable=False, unique=True, comment="KREAM 상품 ID")
    model_number = Column(String(200), nullable=True, comment="모델 번호")
    category = Column(String(50), nullable=True, index=True, comment="카테고리 (shoes, clothing 등)")

    # 메타데이터
    upload_date = Column(DateTime(timezone=True), server_default=func.now(), comment="업로드 날짜")
    data_period = Column(String(100), nullable=True, comment="데이터 기간 (예: 2024-09 최근 30일)")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 인덱스
    __table_args__ = (
        Index('idx_brand_rank', 'brand', 'rank'),
        Index('idx_category_rank', 'category', 'rank'),
    )
