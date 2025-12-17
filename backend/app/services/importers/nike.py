"""
Nike Product Importer
나이키 한국 공식 웹사이트에서 상품 정보 수집
"""

from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import json
import re

from app.services.importers.base import BaseProductImporter
import logging

logger = logging.getLogger(__name__)


class NikeImporter(BaseProductImporter):
    """나이키 상품 Importer"""

    def __init__(self, db):
        super().__init__(db, brand_key="nike")
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9',
        })

    def fetch_products(self, limit: Optional[int] = None, category: Optional[str] = None, **kwargs) -> List[Dict]:
        """
        나이키 웹사이트에서 상품 정보 수집

        Args:
            limit: 최대 상품 수
            category: 카테고리 (running, basketball, lifestyle 등)

        Returns:
            상품 정보 리스트
        """
        products = []
        base_url = self.brand_config['scrape_config']['base_url']

        categories = [category] if category else self.brand_config['scrape_config']['categories']
        logger.info(f"Fetching Nike products from {len(categories)} categories")

        for cat in categories:
            try:
                cat_products = self._fetch_category_products(cat, limit)
                products.extend(cat_products)

                if limit and len(products) >= limit:
                    products = products[:limit]
                    break

            except Exception as e:
                logger.error(f"Error fetching category {cat}: {e}")
                continue

        logger.info(f"Total Nike products fetched: {len(products)}")
        return products

    def _fetch_category_products(self, category: str, limit: Optional[int] = None) -> List[Dict]:
        """특정 카테고리의 나이키 상품 수집"""
        products = []

        # 나이키는 API 엔드포인트를 사용할 수 있음 (변경될 수 있음)
        # 예시 URL - 실제 엔드포인트는 네트워크 탭에서 확인 필요
        api_url = "https://api.nike.com/cic/browse/v2"

        params = {
            'queryid': 'products',
            'anonymousId': 'guest',
            'country': 'kr',
            'language': 'ko',
            'channel': 'nikeSite',
            'count': 60,
            'offset': 0,
        }

        page = 0
        max_pages = 10

        while page < max_pages:
            try:
                params['offset'] = page * 60

                logger.debug(f"Fetching Nike {category} page {page + 1}")
                response = self.session.get(api_url, params=params, timeout=30)

                if response.status_code == 200:
                    try:
                        data = response.json()
                        items = data.get('data', {}).get('products', {}).get('products', [])

                        for item in items:
                            product = self._parse_nike_product(item, category)
                            if product:
                                products.append(product)

                        if not items:
                            break

                        logger.info(f"Nike {category} page {page + 1}: Found {len(items)} products")

                        if limit and len(products) >= limit:
                            break

                    except json.JSONDecodeError:
                        logger.error("Failed to parse Nike API response")
                        break
                else:
                    logger.warning(f"Nike API returned status {response.status_code}")
                    break

                page += 1

            except Exception as e:
                logger.error(f"Error fetching Nike products: {e}")
                break

        return products

    def _parse_nike_product(self, item: Dict, category: str) -> Optional[Dict]:
        """나이키 API 응답 파싱"""
        try:
            product_info = item.get('productInfo', [{}])[0] if item.get('productInfo') else {}

            # 상품 코드 (스타일 코드)
            code = (
                item.get('id') or
                product_info.get('merchProduct', {}).get('styleColor') or
                product_info.get('merchProduct', {}).get('styleNumber')
            )

            if not code:
                return None

            # 상품명
            title = item.get('title') or product_info.get('productContent', {}).get('title')

            # 이미지
            image_url = None
            if item.get('images'):
                image_url = item['images'].get('portraitURL') or item['images'].get('squarishURL')

            # 가격
            price = None
            if item.get('price'):
                price_info = item['price']
                price = price_info.get('currentPrice') or price_info.get('fullPrice')

            # 색상
            colors = []
            color_desc = product_info.get('productContent', {}).get('colorDescription')
            if color_desc:
                colors = [color_desc]

            # 사이즈는 상세 페이지에서만 가능
            return {
                'code': str(code).strip(),
                'name': title or f"Nike {code}",
                'category': category,
                'description': product_info.get('productContent', {}).get('description'),
                'image_url': image_url,
                'colors': colors if colors else None,
                'sizes': None,
                'price': price,
            }

        except Exception as e:
            logger.debug(f"Error parsing Nike product: {e}")
            return None
