"""
Base Product Importer
모든 브랜드 Importer의 기본 클래스
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional
import time
import json
from pathlib import Path

from sqlalchemy.orm import Session
from app.models.product import Product
from app.models.brand import Brand
import logging

logger = logging.getLogger(__name__)


class BaseProductImporter(ABC):
    """브랜드 상품 정보 수집 기본 클래스"""

    def __init__(self, db: Session, brand_key: str):
        """
        Args:
            db: 데이터베이스 세션
            brand_key: 브랜드 키 (예: "newbalance", "nike")
        """
        self.db = db
        self.brand_key = brand_key
        self.brand_config = self._load_brand_config()
        self.brand = self._get_or_create_brand()

    def _load_brand_config(self) -> Dict:
        """브랜드 설정 로드"""
        config_path = Path(__file__).parent / "brands_config.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            brands = json.load(f)

        if self.brand_key not in brands:
            raise ValueError(f"Brand '{self.brand_key}' not found in configuration")

        return brands[self.brand_key]

    def _get_or_create_brand(self) -> Brand:
        """브랜드 조회 또는 생성"""
        brand_name = self.brand_config['name']
        brand = self.db.query(Brand).filter(Brand.name == brand_name).first()

        if not brand:
            logger.warning(f"Brand '{brand_name}' not found. Creating new brand.")
            brand = Brand(
                name=brand_name,
                description=self.brand_config['description'],
                is_active=True
            )
            self.db.add(brand)
            self.db.commit()
            self.db.refresh(brand)
            logger.info(f"Created brand: {brand_name}")

        return brand

    @abstractmethod
    def fetch_products(self, limit: Optional[int] = None, **kwargs) -> List[Dict]:
        """
        브랜드 웹사이트/API에서 상품 정보 조회

        Args:
            limit: 가져올 최대 상품 수
            **kwargs: 추가 필터 옵션 (category, color, size 등)

        Returns:
            상품 정보 리스트
            [{
                "code": "상품코드",
                "name": "상품명",
                "category": "카테고리",
                "description": "설명",
                "image_url": "이미지 URL",
                "colors": ["Black", "White"],
                "sizes": ["250", "260", "270"],
                "price": 159000
            }]
        """
        pass

    def normalize_product_data(self, raw_data: Dict) -> Dict:
        """
        원본 데이터를 DB 스키마에 맞게 정규화

        Args:
            raw_data: fetch_products()에서 반환된 상품 데이터

        Returns:
            정규화된 상품 데이터
        """
        return {
            'code': str(raw_data.get('code', '')).strip(),
            'name': str(raw_data.get('name', '')).strip(),
            'category': str(raw_data.get('category', '')).strip() if raw_data.get('category') else None,
            'description': self._build_description(raw_data),
            'image_url': str(raw_data.get('image_url', '')).strip() if raw_data.get('image_url') else None,
        }

    def _build_description(self, raw_data: Dict) -> Optional[str]:
        """상품 설명 생성 (색상, 사이즈 정보 포함)"""
        parts = []

        if raw_data.get('description'):
            parts.append(str(raw_data['description']))

        if raw_data.get('colors'):
            colors = ', '.join(raw_data['colors'])
            parts.append(f"Colors: {colors}")

        if raw_data.get('sizes'):
            sizes = ', '.join(raw_data['sizes'])
            parts.append(f"Sizes: {sizes}")

        if raw_data.get('price'):
            parts.append(f"Price: {raw_data['price']:,}원")

        return '\n'.join(parts) if parts else None

    def product_exists(self, product_code: str) -> bool:
        """상품 코드로 기존 상품 존재 여부 확인"""
        return self.db.query(Product).filter(
            Product.product_code == product_code
        ).first() is not None

    def create_product(self, product_data: Dict) -> Product:
        """상품 생성"""
        product = Product(
            brand_id=self.brand.id,
            product_code=product_data['code'],
            product_name=product_data['name'],
            category=product_data.get('category'),
            description=product_data.get('description'),
            image_url=product_data.get('image_url')
        )
        self.db.add(product)
        return product

    def update_product(self, product: Product, product_data: Dict) -> Product:
        """기존 상품 정보 업데이트"""
        product.product_name = product_data['name']

        if product_data.get('category'):
            product.category = product_data['category']
        if product_data.get('description'):
            product.description = product_data['description']
        if product_data.get('image_url'):
            product.image_url = product_data['image_url']

        return product

    def import_products(
        self,
        limit: Optional[int] = None,
        update_existing: bool = False,
        **kwargs
    ) -> Dict[str, int]:
        """
        상품 정보를 가져와서 DB에 저장

        Args:
            limit: 가져올 최대 상품 수
            update_existing: 기존 상품 정보 업데이트 여부
            **kwargs: fetch_products에 전달할 추가 인자

        Returns:
            {"created": int, "updated": int, "skipped": int, "failed": int}
        """
        stats = {
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "failed": 0
        }

        try:
            logger.info(f"Starting product import for {self.brand_config['name']}")
            raw_products = self.fetch_products(limit=limit, **kwargs)
            logger.info(f"Fetched {len(raw_products)} products from {self.brand_config['name']}")

            for idx, raw_product in enumerate(raw_products, 1):
                try:
                    # 데이터 정규화
                    product_data = self.normalize_product_data(raw_product)
                    product_code = product_data['code']

                    if not product_code:
                        logger.warning(f"Skipping product without code: {raw_product}")
                        stats["failed"] += 1
                        continue

                    # 기존 상품 확인
                    existing_product = self.db.query(Product).filter(
                        Product.product_code == product_code
                    ).first()

                    if existing_product:
                        if update_existing:
                            self.update_product(existing_product, product_data)
                            stats["updated"] += 1
                            logger.info(f"[{idx}/{len(raw_products)}] Updated: {product_code} - {product_data['name']}")
                        else:
                            stats["skipped"] += 1
                            logger.debug(f"[{idx}/{len(raw_products)}] Skipped (exists): {product_code}")
                    else:
                        self.create_product(product_data)
                        stats["created"] += 1
                        logger.info(f"[{idx}/{len(raw_products)}] Created: {product_code} - {product_data['name']}")

                    # 주기적으로 커밋 (100개마다)
                    if (stats["created"] + stats["updated"]) % 100 == 0:
                        self.db.commit()
                        logger.debug(f"Batch commit at {stats['created'] + stats['updated']} products")

                    # API 부하 방지 지연
                    time.sleep(1)

                except Exception as e:
                    stats["failed"] += 1
                    logger.error(f"Failed to import product {idx}: {e}")
                    logger.debug(f"Raw data: {raw_product}")
                    continue

            # 최종 커밋
            self.db.commit()
            logger.info(f"Import completed for {self.brand_config['name']}: {stats}")

        except Exception as e:
            logger.error(f"Import failed for {self.brand_config['name']}: {e}")
            self.db.rollback()
            raise

        return stats

    def get_import_summary(self) -> Dict:
        """현재 브랜드의 상품 통계"""
        total_products = self.db.query(Product).filter(
            Product.brand_id == self.brand.id
        ).count()

        return {
            "brand": self.brand_config['name'],
            "brand_key": self.brand_key,
            "total_products": total_products,
        }
