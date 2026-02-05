"""
Poizon 상품 모델
"""
from sqlalchemy import Column, String, BigInteger, Integer, Index
from .base import BaseModel


class PoizonProduct(BaseModel):
    """Poizon 상품 정보"""

    __tablename__ = "poizon_products"

    # 브랜드 정보
    brand_key = Column(String(50), nullable=False, index=True)
    brand_name = Column(String(100), nullable=False)

    # 상품 정보
    level1_category_name = Column(String(100), nullable=True)
    title = Column(String(500), nullable=False)
    article_number = Column(String(100), nullable=False, unique=True, index=True)  # 모델번호 (상품코드)
    logo_url = Column(String(500), nullable=True)
    spu_id = Column(BigInteger, nullable=True, index=True)  # Poizon SPU ID

    # 미리 계산된 평균가 (페이지 로드 속도 향상)
    avg_price_small = Column(Integer, nullable=True)    # 신발 소형 (220-250) 평균가
    avg_price_large = Column(Integer, nullable=True)    # 신발 대형 (255-290) 평균가
    avg_price_apparel = Column(Integer, nullable=True)  # 의류 (S~XXL) 평균가

    # 복합 인덱스: 브랜드별 조회 최적화
    __table_args__ = (
        Index('idx_brand_article', 'brand_key', 'article_number'),
    )

    def __repr__(self):
        return f"<PoizonProduct(id={self.id}, brand={self.brand_name}, article_number={self.article_number})>"
