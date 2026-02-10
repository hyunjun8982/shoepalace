"""아디다스 구매/판매 비교 모델 (임시)"""
from sqlalchemy import Column, String, Integer, Date
from app.models.base import BaseModel


class AdidasComparisonPurchase(BaseModel):
    """구매 내역"""
    __tablename__ = "adidas_comparison_purchases"

    product_code = Column(String(100), nullable=False, index=True)
    size = Column(String(20), nullable=True)
    quantity = Column(Integer, default=0)
    unit_price = Column(Integer, nullable=True)
    buyer_name = Column(String(50), nullable=False)  # 다희/인서/수동
    source = Column(String(100), nullable=False)      # 구매처/시트명
    category = Column(String(20), nullable=True)      # 의류/신발
    note = Column(String(200), nullable=True)


class AdidasComparisonSale(BaseModel):
    """판매 내역"""
    __tablename__ = "adidas_comparison_sales"

    product_code = Column(String(100), nullable=False, index=True)
    size = Column(String(20), nullable=True)
    quantity = Column(Integer, default=0)
    unit_price = Column(Integer, nullable=True)
    total_price = Column(Integer, nullable=True)
    source = Column(String(100), nullable=False)      # 브랜드/섹션명
    sale_date = Column(Date, nullable=True)
    note = Column(String(200), nullable=True)
