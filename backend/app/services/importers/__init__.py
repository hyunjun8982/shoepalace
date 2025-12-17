"""
Product Importers Package
브랜드별 상품 정보 자동 수집 모듈
"""

from .base import BaseProductImporter
from .newbalance import NewBalanceImporter
from .nike import NikeImporter
from .adidas import AdidasImporter

__all__ = [
    'BaseProductImporter',
    'NewBalanceImporter',
    'NikeImporter',
    'AdidasImporter',
]

# 브랜드별 Importer 매핑
IMPORTERS = {
    'newbalance': NewBalanceImporter,
    'nike': NikeImporter,
    'adidas': AdidasImporter,
}


def get_importer(brand_key: str, db):
    """
    브랜드 키로 Importer 인스턴스 반환

    Args:
        brand_key: 브랜드 키 (newbalance, nike, adidas)
        db: 데이터베이스 세션

    Returns:
        BaseProductImporter 인스턴스

    Raises:
        ValueError: 지원하지 않는 브랜드인 경우
    """
    importer_class = IMPORTERS.get(brand_key.lower())
    if not importer_class:
        available = ', '.join(IMPORTERS.keys())
        raise ValueError(f"Unsupported brand: {brand_key}. Available: {available}")

    return importer_class(db)
