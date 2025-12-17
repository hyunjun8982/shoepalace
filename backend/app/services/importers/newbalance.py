"""
New Balance Product Importer
뉴발란스 한국 공식 웹사이트에서 상품 정보 수집
"""

from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import time
import re

from app.services.importers.base import BaseProductImporter
import logging

logger = logging.getLogger(__name__)


class NewBalanceImporter(BaseProductImporter):
    """뉴발란스 상품 Importer"""

    def __init__(self, db):
        super().__init__(db, brand_key="newbalance")
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        })

    def fetch_products(self, limit: Optional[int] = None, category: Optional[str] = None, **kwargs) -> List[Dict]:
        """
        뉴발란스 웹사이트에서 상품 정보 수집

        Args:
            limit: 최대 상품 수
            category: 카테고리 필터 (shoes_men, shoes_women, apparel_men, apparel_women)

        Returns:
            상품 정보 리스트
        """
        products = []
        base_url = self.brand_config['scrape_config']['base_url']

        # 카테고리 설정
        categories = []
        if category:
            category_codes = self.brand_config['scrape_config']['category_codes']
            if category in category_codes:
                categories = [(category, category_codes[category])]
            else:
                logger.warning(f"Unknown category: {category}, using all categories")
                categories = list(category_codes.items())
        else:
            categories = list(self.brand_config['scrape_config']['category_codes'].items())

        logger.info(f"Fetching products from {len(categories)} categories")

        for cat_name, cat_code in categories:
            logger.info(f"Processing category: {cat_name} ({cat_code})")

            try:
                category_products = self._fetch_category_products(cat_code, cat_name, limit)
                products.extend(category_products)

                if limit and len(products) >= limit:
                    products = products[:limit]
                    break

            except Exception as e:
                logger.error(f"Error fetching category {cat_name}: {e}")
                continue

        logger.info(f"Total products fetched: {len(products)}")
        return products

    def _fetch_category_products(self, category_code: str, category_name: str, limit: Optional[int] = None) -> List[Dict]:
        """특정 카테고리의 상품 수집"""
        products = []
        page = 1
        max_pages = 10  # 최대 페이지 수 제한

        while page <= max_pages:
            try:
                # 뉴발란스 상품 목록 페이지 URL (실제 구조에 맞게 조정 필요)
                url = f"{self.brand_config['scrape_config']['base_url']}/shop/product_list.php"
                params = {
                    'category': category_code,
                    'page': page,
                }

                logger.debug(f"Fetching page {page} for category {category_code}")
                response = self.session.get(url, params=params, timeout=30)
                response.raise_for_status()

                soup = BeautifulSoup(response.content, 'lxml')

                # 상품 목록 파싱 (실제 HTML 구조에 맞게 수정 필요)
                product_items = self._parse_product_list(soup, category_name)

                if not product_items:
                    logger.debug(f"No more products found on page {page}")
                    break

                products.extend(product_items)
                logger.info(f"Page {page}: Found {len(product_items)} products (Total: {len(products)})")

                if limit and len(products) >= limit:
                    break

                page += 1
                time.sleep(1)  # 서버 부하 방지

            except requests.RequestException as e:
                logger.error(f"Request error on page {page}: {e}")
                break
            except Exception as e:
                logger.error(f"Parsing error on page {page}: {e}")
                break

        return products

    def _parse_product_list(self, soup: BeautifulSoup, category: str) -> List[Dict]:
        """상품 목록 HTML 파싱"""
        products = []

        # 예시: 실제 뉴발란스 웹사이트 HTML 구조에 맞게 수정 필요
        # 일반적인 쇼핑몰 구조 예시
        product_elements = soup.select('.product-item, .prd-item, .product, li.item')

        for element in product_elements:
            try:
                product = self._parse_product_element(element, category)
                if product:
                    products.append(product)
            except Exception as e:
                logger.debug(f"Failed to parse product element: {e}")
                continue

        return products

    def _parse_product_element(self, element, category: str) -> Optional[Dict]:
        """개별 상품 요소 파싱"""
        try:
            # 상품 코드 (data-product-code, data-style-code 등)
            code = (
                element.get('data-product-code') or
                element.get('data-style-code') or
                element.select_one('[data-product-code]')
            )

            if not code:
                # 상품 링크에서 코드 추출 시도
                link = element.select_one('a[href*="product_view"]')
                if link:
                    href = link.get('href', '')
                    match = re.search(r'[?&]code=([A-Z0-9\-]+)', href)
                    if match:
                        code = match.group(1)

            if not code:
                return None

            # 상품명
            name_elem = element.select_one('.product-name, .prd-name, .name, h3, h4')
            name = name_elem.get_text(strip=True) if name_elem else f"New Balance {code}"

            # 이미지 URL
            img_elem = element.select_one('img')
            image_url = None
            if img_elem:
                image_url = img_elem.get('src') or img_elem.get('data-src') or img_elem.get('data-original')
                if image_url and not image_url.startswith('http'):
                    image_url = self.brand_config['scrape_config']['base_url'] + image_url

            # 가격
            price_elem = element.select_one('.price, .prd-price, .sale-price')
            price = None
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                price_match = re.search(r'[\d,]+', price_text.replace(',', ''))
                if price_match:
                    price = int(price_match.group().replace(',', ''))

            # 색상 정보 (있는 경우)
            colors = []
            color_elems = element.select('.color-option, [data-color]')
            for color_elem in color_elems:
                color = color_elem.get('data-color') or color_elem.get('title')
                if color:
                    colors.append(color)

            return {
                'code': str(code).strip(),
                'name': name,
                'category': category,
                'description': None,
                'image_url': image_url,
                'colors': colors if colors else None,
                'sizes': None,  # 상세 페이지에서만 가져올 수 있음
                'price': price,
            }

        except Exception as e:
            logger.debug(f"Error parsing product element: {e}")
            return None

    def fetch_product_detail(self, product_code: str) -> Optional[Dict]:
        """
        상품 상세 정보 조회 (색상, 사이즈 등)

        Args:
            product_code: 상품 코드

        Returns:
            상세 정보를 포함한 상품 데이터
        """
        try:
            url = f"{self.brand_config['scrape_config']['base_url']}/shop/product_view.php"
            params = {'code': product_code}

            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'lxml')

            # 사이즈 옵션
            sizes = []
            size_elems = soup.select('.size-option, select[name*="size"] option, .size-list li')
            for size_elem in size_elems:
                size_text = size_elem.get_text(strip=True)
                if size_text and size_text not in ['사이즈 선택', 'Size']:
                    sizes.append(size_text)

            # 색상 옵션
            colors = []
            color_elems = soup.select('.color-option, .color-item')
            for color_elem in color_elems:
                color = color_elem.get('data-color') or color_elem.get('title') or color_elem.get_text(strip=True)
                if color:
                    colors.append(color)

            # 상품 설명
            desc_elem = soup.select_one('.product-description, .detail-info, .product-detail')
            description = desc_elem.get_text(strip=True) if desc_elem else None

            return {
                'sizes': sizes if sizes else None,
                'colors': colors if colors else None,
                'description': description,
            }

        except Exception as e:
            logger.error(f"Error fetching product detail for {product_code}: {e}")
            return None
