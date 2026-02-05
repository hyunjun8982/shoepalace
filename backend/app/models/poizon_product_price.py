"""
포이즌 상품 가격 정보 모델
"""
from sqlalchemy import Column, BigInteger, String, Integer, DateTime, Index
from sqlalchemy.sql import func
from app.db.database import Base


class PoizonProductPrice(Base):
    """포이즌 상품 가격 정보"""
    __tablename__ = "poizon_product_prices"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    spu_id = Column(BigInteger, nullable=False, index=True, comment="포이즌 SPU ID")
    sku_id = Column(String(50), nullable=False, unique=True, index=True, comment="포이즌 SKU ID")
    size_kr = Column(String(20), nullable=False, comment="한국 사이즈 (mm)")
    size_us = Column(String(10), nullable=True, comment="US 사이즈")
    average_price = Column(Integer, nullable=True, comment="평균 가격 (원)")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="생성일시")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="수정일시")

    # 복합 인덱스 (SPU ID로 조회하는 경우가 많음)
    __table_args__ = (
        Index('idx_spu_id_size', 'spu_id', 'size_kr'),
    )
