"""
Adidas Product Importer
아디다스 한국 공식 웹사이트에서 상품 정보 수집
"""

from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import json
import re

from app.services.importers.base import BaseProductImporter
import logging

logger = logging.getLogger(__name__)


class AdidasImporter(BaseProductImporter):
    """아디다스 상품 Importer"""

    def __init__(self, db):
        super().__init__(db, brand_key="adidas")
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9',
        })

    def fetch_products(self, limit: Optional[int] = None, category: Optional[str] = None, **kwargs) -> List[Dict]:
        """
        아디다스 웹사이트에서 상품 정보 수집

        Args:
            limit: 최대 상품 수
            category: 카테고리 (shoes, clothing 등)

        Returns:
            상품 정보 리스트
        """
        products = []

        categories = [category] if category else self.brand_config['scrape_config']['categories']
        logger.info(f"Fetching Adidas products from {len(categories)} categories")

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

        logger.info(f"Total Adidas products fetched: {len(products)}")
        return products

    def _fetch_category_products(self, category: str, limit: Optional[int] = None) -> List[Dict]:
        """특정 카테고리의 아디다스 상품 수집"""
        products = []
        page = 1
        max_pages = 10

        while page <= max_pages:
            try:
                # 아디다스 API 엔드포인트 (실제 구조 확인 필요)
                url = f"{self.brand_config['scrape_config']['base_url']}/api/search/product"
                params = {
                    'query': category,
                    'start': (page - 1) * 48,
                    'count': 48,
                }

                logger.debug(f"Fetching Adidas {category} page {page}")
                response = self.session.get(url, params=params, timeout=30)

                if response.status_code == 200:
                    try:
                        data = response.json()
                        items = data.get('raw', {}).get('itemList', {}).get('items', [])

                        if not items:
                            break

                        for item in items:
                            product = self._parse_adidas_product(item, category)
                            if product:
                                products.append(product)

                        logger.info(f"Adidas {category} page {page}: Found {len(items)} products")

                        if limit and len(products) >= limit:
                            break

                    except json.JSONDecodeError:
                        logger.warning("Failed to parse Adidas API response, trying HTML parsing")
                        # HTML 파싱 fallback
                        soup = BeautifulSoup(response.content, 'lxml')
                        html_products = self._parse_html_products(soup, category)
                        products.extend(html_products)

                        if not html_products:
                            break
                else:
                    logger.warning(f"Adidas API returned status {response.status_code}")
                    break

                page += 1

            except Exception as e:
                logger.error(f"Error fetching Adidas products: {e}")
                break

        return products

    def _parse_adidas_product(self, item: Dict, category: str) -> Optional[Dict]:
        """아디다스 API 응답 파싱"""
        try:
            # 상품 코드 (모델 코드)
            code = item.get('productId') or item.get('modelId') or item.get('id')

            if not code:
                return None

            # 상품명
            name = item.get('displayName') or item.get('name') or item.get('title')

            # 이미지
            image_url = None
            if item.get('image'):
                image_url = item['image'].get('src') or item['image'].get('url')
                if image_url and not image_url.startswith('http'):
                    image_url = 'https://www.adidas.co.kr' + image_url

            # 가격
            price = None
            if item.get('price'):
                price_text = str(item['price'])
                price_match = re.search(r'[\d,]+', price_text.replace(',', ''))
                if price_match:
                    price = int(price_match.group().replace(',', ''))

            # 색상
            colors = []
            color = item.get('color') or item.get('colorway')
            if color:
                colors = [color]

            return {
                'code': str(code).strip(),
                'name': name or f"Adidas {code}",
                'category': category,
                'description': item.get('description'),
                'image_url': image_url,
                'colors': colors if colors else None,
                'sizes': None,
                'price': price,
            }

        except Exception as e:
            logger.debug(f"Error parsing Adidas product: {e}")
            return None

    def _parse_html_products(self, soup: BeautifulSoup, category: str) -> List[Dict]:
        """HTML 파싱 fallback 방식"""
        products = []

        # 아디다스 상품 아이템 선택자 (실제 HTML 구조에 맞게 수정 필요)
        product_elements = soup.select('.product-card, .item, [class*="product"]')

        for element in product_elements:
            try:
                # 상품 코드
                code = element.get('data-product-id') or element.get('data-model-id')

                if not code:
                    link = element.select_one('a[href*="/product/"]')
                    if link:
                        href = link.get('href', '')
                        match = re.search(r'/product/([A-Z0-9_\-]+)', href)
                        if match:
                            code = match.group(1)

                if not code:
                    continue

                # 상품명
                name_elem = element.select_one('.product-name, .name, h3, h4, [class*="title"]')
                name = name_elem.get_text(strip=True) if name_elem else f"Adidas {code}"

                # 이미지
                img_elem = element.select_one('img')
                image_url = None
                if img_elem:
                    image_url = img_elem.get('src') or img_elem.get('data-src')
                    if image_url and not image_url.startswith('http'):
                        image_url = 'https://www.adidas.co.kr' + image_url

                # 가격
                price_elem = element.select_one('.price, .sale-price, [class*="price"]')
                price = None
                if price_elem:
                    price_text = price_elem.get_text(strip=True)
                    price_match = re.search(r'[\d,]+', price_text.replace(',', ''))
                    if price_match:
                        price = int(price_match.group().replace(',', ''))

                products.append({
                    'code': str(code).strip(),
                    'name': name,
                    'category': category,
                    'description': None,
                    'image_url': image_url,
                    'colors': None,
                    'sizes': None,
                    'price': price,
                })

            except Exception as e:
                logger.debug(f"Error parsing Adidas HTML element: {e}")
                continue

        return products
