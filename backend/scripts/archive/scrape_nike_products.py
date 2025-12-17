"""
나이키 비공식 API를 사용하여 실제 상품 정보를 수집하고 DB에 저장하는 스크립트
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import json
import time
from urllib.parse import urlencode
from typing import List, Dict, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.brand import Brand
from app.models.product import Product
from app.core.config import settings

# 데이터베이스 연결
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class NikeProductScraper:
    """나이키 비공식 API를 사용하여 상품 정보를 수집하는 클래스"""

    def __init__(self, country='kr', language='ko'):
        self.country = country
        self.language = language
        self.base_api_url = 'https://api.nike.com/cic/browse/v2'
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def get_initial_products(self, url: str) -> Dict:
        """첫 페이지를 로드하고 초기 상품 데이터와 다음 페이지 링크를 추출"""
        try:
            response = self.session.get(url)
            print(f"응답 상태 코드: {response.status_code}")
            html = response.text

            # 디버깅: HTML 일부 출력
            if len(html) < 1000:
                print(f"HTML 길이가 너무 짧습니다: {len(html)}")
                print(f"HTML 내용: {html[:500]}")

            # __NEXT_DATA__ 스크립트에서 JSON 추출
            start = html.find('<script id="__NEXT_DATA__" type="application/json">')
            if start == -1:
                print("초기 데이터를 찾을 수 없습니다.")
                # HTML에서 다른 패턴 찾기
                if 'nike.com' not in html.lower():
                    print("나이키 페이지가 아닌 것 같습니다.")
                return {'products': [], 'next': None}

            start += len('<script id="__NEXT_DATA__" type="application/json">')
            end = html.find('</script>', start)
            json_str = html[start:end]

            data = json.loads(json_str)
            props = data.get('props', {})
            page_props = props.get('pageProps', {})
            initial_state = page_props.get('initialState', {})
            wall = initial_state.get('Wall', {})

            products = wall.get('products', [])
            page_data = wall.get('pageData', {})
            next_page_link = page_data.get('next', '')

            return {
                'products': products,
                'next': next_page_link
            }
        except json.JSONDecodeError as e:
            print(f"JSON 파싱 에러: {e}")
            return {'products': [], 'next': None}
        except Exception as e:
            print(f"예상치 못한 에러: {e}")
            return {'products': [], 'next': None}

    def get_products_from_api(self, endpoint: str) -> Dict:
        """API를 통해 다음 페이지의 상품 데이터 가져오기"""
        params = {
            'queryid': 'products',
            'anonymousId': '7CC266B713D36CCC7275B33B6E4F9206',
            'country': self.country,
            'endpoint': endpoint,
            'language': self.language,
            'localizedRangeStr': '{lowestPrice} — {highestPrice}'
        }

        url = self.base_api_url + '?' + urlencode(params)

        try:
            response = self.session.get(url)
            data = response.json()

            products = data.get('data', {}).get('products', {}).get('products', [])
            next_page = data.get('data', {}).get('products', {}).get('pages', {}).get('next', '')

            return {
                'products': products,
                'next': next_page
            }
        except Exception as e:
            print(f"API 요청 에러: {e}")
            return {'products': [], 'next': None}

    def parse_product(self, product: Dict) -> Dict:
        """상품 데이터를 정리된 형태로 파싱"""
        price_info = product.get('price', {})

        product_url = product.get('url', '')
        if product_url:
            product_url = product_url.replace('{countryLang}', f'https://www.nike.com/{self.country}')

        # 색상 정보 추출
        color_description = product.get('colorDescription', '')

        # 사이즈 정보는 상세 페이지에서만 확인 가능하므로 일단 기본값
        # 실제로는 각 사이즈별로 별도 레코드를 생성해야 함

        return {
            'title': product.get('title', ''),
            'subtitle': product.get('subtitle', ''),
            'pid': product.get('pid', ''),
            'current_price': price_info.get('currentPrice', 0),
            'full_price': price_info.get('fullPrice', 0),
            'in_stock': product.get('inStock', False),
            'product_url': product_url,
            'image_url': product.get('imageUrl', ''),
            'category': product.get('category', ''),
            'color': color_description
        }

    def scrape_category(self, category_url: str, max_products: Optional[int] = None) -> List[Dict]:
        """카테고리 URL에서 모든 상품 정보 수집"""
        all_products = []

        # 첫 페이지 로드
        print(f"첫 페이지 로딩 중: {category_url}")
        initial_data = self.get_initial_products(category_url)

        for product in initial_data['products']:
            parsed = self.parse_product(product)
            all_products.append(parsed)

            if max_products and len(all_products) >= max_products:
                return all_products[:max_products]

        print(f"초기 상품 수집 완료: {len(all_products)}개")

        # API를 통해 나머지 페이지 로드
        next_endpoint = initial_data['next']
        page_num = 2

        while next_endpoint:
            print(f"{page_num}페이지 로딩 중...")
            api_data = self.get_products_from_api(next_endpoint)

            for product in api_data['products']:
                parsed = self.parse_product(product)
                all_products.append(parsed)

                if max_products and len(all_products) >= max_products:
                    return all_products[:max_products]

            next_endpoint = api_data['next']
            page_num += 1

            print(f"현재까지 수집된 상품: {len(all_products)}개")

            # API 호출 간격 조절
            time.sleep(0.5)

        return all_products

    def save_to_database(self, products: List[Dict]) -> int:
        """수집한 상품 데이터를 데이터베이스에 저장"""
        db = SessionLocal()
        saved_count = 0

        try:
            # Nike 브랜드 찾기 또는 생성
            nike_brand = db.query(Brand).filter(Brand.name == "Nike").first()
            if not nike_brand:
                nike_brand = Brand(
                    name="Nike",
                    description="Just Do It",
                    is_active=True
                )
                db.add(nike_brand)
                db.flush()

            # 상품 저장
            for product_data in products:
                # 이미 존재하는 상품인지 확인
                existing = db.query(Product).filter(
                    Product.product_code == product_data['pid']
                ).first()

                if existing:
                    # 기존 상품 업데이트
                    existing.product_name = product_data['title']
                    existing.description = product_data['subtitle']
                    existing.is_active = product_data['in_stock']
                    print(f"기존 상품 업데이트: {product_data['title']}")
                else:
                    # 새 상품 생성
                    # 카테고리 결정
                    category = "shoes"  # 기본값
                    if "clothing" in product_data.get('category', '').lower():
                        category = "clothing"
                    elif "accessories" in product_data.get('category', '').lower():
                        category = "accessories"

                    # 사이즈는 일단 기본값 (추후 상세 페이지에서 수집 필요)
                    sizes = ["260", "265", "270", "275", "280"]  # 신발 기본 사이즈

                    # 각 사이즈별로 상품 생성
                    for size in sizes[:1]:  # 일단 하나의 사이즈만 생성
                        new_product = Product(
                            brand_id=nike_brand.id,
                            product_code=f"{product_data['pid']}-{size}",
                            product_name=product_data['title'],
                            category=category,
                            size=size,
                            color=product_data['color'] or "N/A",
                            description=product_data['subtitle'],
                            is_active=product_data['in_stock']
                        )
                        db.add(new_product)
                        saved_count += 1
                        print(f"새 상품 추가: {product_data['title']} ({size})")

            db.commit()
            print(f"\n총 {saved_count}개 상품이 데이터베이스에 저장되었습니다.")

        except Exception as e:
            print(f"데이터베이스 저장 중 오류: {e}")
            db.rollback()
            raise
        finally:
            db.close()

        return saved_count


def main():
    """메인 실행 함수"""
    print("=== 나이키 상품 스크래핑 시작 ===\n")

    # 스크래퍼 초기화
    scraper = NikeProductScraper(country='kr', language='ko')

    # 카테고리별 스크래핑 설정
    categories = [
        {
            'name': '남성 신발',
            'url': 'https://www.nike.com/kr/w/men-shoes-nik1zy7ok',
            'max_products': 10  # 테스트를 위해 10개로 제한
        },
        # 더 많은 카테고리를 추가하려면 여기에 추가
        # {
        #     'name': '여성 신발',
        #     'url': 'https://www.nike.com/kr/w/women-shoes-5e1x6zy7ok',
        #     'max_products': 20
        # },
    ]

    all_products = []

    for category in categories:
        print(f"\n카테고리: {category['name']}")
        print("-" * 50)

        products = scraper.scrape_category(
            category['url'],
            max_products=category.get('max_products')
        )

        if products:
            all_products.extend(products)
            print(f"{category['name']}에서 {len(products)}개 상품 수집 완료")
        else:
            print(f"{category['name']}에서 상품을 수집하지 못했습니다.")

        # 카테고리 간 휴식
        time.sleep(2)

    # 데이터베이스에 저장
    if all_products:
        print(f"\n총 {len(all_products)}개의 상품을 수집했습니다.")

        # JSON 백업 저장
        with open('nike_products_backup.json', 'w', encoding='utf-8') as f:
            json.dump(all_products, f, ensure_ascii=False, indent=2)
        print("백업 파일 저장 완료: nike_products_backup.json")

        # 자동으로 데이터베이스에 저장 (테스트 중이므로 확인 생략)
        print("\n데이터베이스에 저장 중...")
        scraper.save_to_database(all_products)
    else:
        print("수집된 상품이 없습니다.")

    print("\n=== 스크래핑 완료 ===")


if __name__ == "__main__":
    main()