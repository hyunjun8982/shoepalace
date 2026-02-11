"""포이즌 가격비교 관심 상품 모델"""
from sqlalchemy import Column, String, BigInteger, Integer, JSON
from .base import BaseModel


class PoizonPriceWatch(BaseModel):
    """포이즌 가격비교 관심 상품"""

    __tablename__ = "poizon_price_watch"

    article_number = Column(String(100), nullable=False, unique=True, index=True)
    global_spu_id = Column(BigInteger, nullable=True)
    title = Column(String(500), nullable=True)
    logo_url = Column(String(1000), nullable=True)

    # 미리 계산된 평균가
    avg_price_small = Column(Integer, nullable=True)    # 신발 소형 (220-250)
    avg_price_large = Column(Integer, nullable=True)    # 신발 대형 (255-290)
    avg_price_apparel = Column(Integer, nullable=True)  # 의류 (S~XXL)

    # 사이즈별 가격 상세 (JSON)
    # [{"size_kr": "220", "size_us": "4", "average_price": 150000}, ...]
    price_details = Column(JSON, nullable=True)

    sell_price = Column(BigInteger, nullable=True)  # 판매예상가
    note = Column(String(200), nullable=True)

    def __repr__(self):
        return f"<PoizonPriceWatch(article_number={self.article_number}, global_spu_id={self.global_spu_id})>"
