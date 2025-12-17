"""
KREAM API 크롤러 - API 직접 호출 방식
Playwright 대신 API를 직접 호출하여 봇 차단을 우회합니다.
"""

import httpx
import time
import logging
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import uuid
import aiofiles
import hashlib

logger = logging.getLogger(__name__)


class KreamAPIScraper:
    """KREAM API 직접 호출 크롤러"""

    def __init__(self):
        self.base_url = "https://api.kream.co.kr"
        self.device_id = f"web;{uuid.uuid4()}"

    def _get_headers(self) -> dict:
        """KREAM API 호출에 필요한 헤더 생성"""
        now = datetime.now().strftime("%Y%m%d%H%M%S%z")
        if not now.endswith("+0900"):
            now = now[:-2] + "+0900"

        return {
            "accept": "*/*",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            "origin": "https://kream.co.kr",
            "referer": "https://kream.co.kr/",
            "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "x-kream-api-version": "50",
            "x-kream-client-datetime": now,
            "x-kream-device-id": self.device_id,
            "x-kream-web-build-version": "25.13.4",
            "x-kream-web-request-secret": "kream-djscjsghdkd",
        }

    async def search_products(self, keyword: str, max_products: int = 100, page: int = 1) -> List[Dict]:
        """
        KREAM API로 상품 검색 (최대한 많이 가져오기)

        Args:
            keyword: 검색 키워드
            max_products: 최대 상품 수 (페이지당, 기본 100개 - API 최대치)
            page: 페이지 번호 (1부터 시작)

        Returns:
            상품 정보 리스트
        """
        try:
            start_time = time.time()
            print(f"⏱️ [API] KREAM API 검색 시작: {keyword} (페이지: {page}, 요청: {max_products}개)")

            url = f"{self.base_url}/api/screens/search/products"
            params = {
                "keyword": keyword,
                "tab": "products",
                "typed_string": keyword,
                "search_type": "direct",
                "per_page": max_products,  # API 최대값 요청
                "page": page,
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers=self._get_headers()
                )

                print(f"📡 [API] 응답 상태: {response.status_code}")

                if response.status_code != 200:
                    print(f"❌ [API] API 호출 실패: {response.status_code}")
                    print(f"응답 내용: {response.text[:500]}")
                    return []

                data = response.json()
                print(f"✅ [API] API 응답 성공 ({time.time() - start_time:.2f}초)")

                # 응답 구조 확인 (디버깅)
                print(f"📦 [API] 응답 키 목록: {list(data.keys())}")

                # 전체 응답을 파일로 저장
                import json
                response_file = "/tmp/kream_api_response.json"
                with open(response_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                print(f"📦 [API] 전체 응답 저장: {response_file}")

                # content 구조 확인
                if "content" in data:
                    print(f"📦 [API] content 키 목록: {list(data['content'].keys())}")
                    if "items" in data['content']:
                        print(f"📦 [API] items 개수: {len(data['content']['items'])}")
                        # 첫 번째 item의 items 확인 (중첩 구조)
                        if data['content']['items']:
                            first_item = data['content']['items'][0]
                            if "items" in first_item and first_item['items']:
                                inner_item = first_item['items'][0]
                                print(f"📦 [API] 첫 번째 inner item 키: {list(inner_item.keys())}")
                                print(f"📦 [API] 첫 번째 inner item: {json.dumps(inner_item, indent=2, ensure_ascii=False)[:1500]}")

                # 응답 구조 분석 - display_type이 'product'인 항목 추출
                products = []
                seen_product_ids = set()  # 중복 방지용

                def extract_products(obj, depth=0):
                    """재귀적으로 상품 객체 찾기"""
                    if depth > 10 or len(products) >= max_products:
                        return

                    if isinstance(obj, dict):
                        # display_type이 'product'를 포함하는 경우
                        if 'display_type' in obj and 'product' in str(obj.get('display_type', '')).lower():
                            product_info = self._parse_product(obj)
                            # 중복 체크: product_id로 확인
                            if product_info and product_info.get('product_id'):
                                product_id = product_info['product_id']
                                if product_id not in seen_product_ids and len(products) < max_products:
                                    seen_product_ids.add(product_id)
                                    products.append(product_info)
                                    return  # 상품 찾았으면 더 깊이 탐색하지 않음

                        # 재귀 탐색
                        for value in obj.values():
                            extract_products(value, depth + 1)

                    elif isinstance(obj, list):
                        for item in obj:
                            extract_products(item, depth + 1)

                extract_products(data)
                print(f"🔍 [API] 파싱된 상품 수: {len(products)}개 (중복 제거 후)")

                return products

        except Exception as e:
            logger.error(f"❌ API 검색 오류: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _parse_product(self, item: dict) -> Optional[Dict]:
        """API 응답에서 상품 정보 추출"""
        try:
            # actions에서 click_product 이벤트 찾기
            product_info = None
            image_url = None

            if 'actions' in item:
                for action in item['actions']:
                    # 상품 정보 추출 (event_log의 properties에서)
                    if action.get('value') == 'click_product':
                        props = action.get('parameters', {}).get('properties', [])
                        if props and len(props) > 0:
                            import json
                            product_info = json.loads(props[0])

                            # 원본 API JSON 전체 출력
                            print(f"\n{'='*80}")
                            print(f"🔍 API 원본 JSON (전체):")
                            print(f"{'='*80}")
                            print(json.dumps(product_info, indent=2, ensure_ascii=False))
                            print(f"{'='*80}\n")

            # items에서 이미지 URL 찾기
            if 'items' in item:
                for sub_item in item['items']:
                    if 'image_item' in sub_item:
                        img_elem = sub_item['image_item'].get('image_element', {})
                        if 'variations' in img_elem and img_elem['variations']:
                            # variations[0]에 직접 url이 있음
                            var = img_elem['variations'][0]
                            if 'url' in var:
                                image_url = var['url']
                                break
                    if image_url:
                        break

            # 상품 정보가 없으면 None 반환
            if not product_info:
                return None

            # 색상 추출
            extracted_color = self._extract_color_from_name(product_info.get('product_name_en', ''))

            # 결과 구조 생성
            product_data = {
                'product_id': str(product_info.get('product_id', '')),
                'product_name_ko': product_info.get('product_name_ko', ''),
                'product_name_en': product_info.get('product_name_en', ''),
                'model_number': product_info.get('product_style_code', ''),
                'brand': product_info.get('brand_name', ''),
                'color': extracted_color,
                'release_price': product_info.get('price'),
                'image_url': image_url or '',
                'source_url': f"https://kream.co.kr/products/{product_info.get('product_id', '')}",
                'category_1d': product_info.get('shop_category_name_1d', ''),
                'category_2d': product_info.get('shop_category_name_2d', ''),
            }

            # 디버깅 로그 (콘솔 출력)
            print(f"\n📦 파싱 완료: {product_data['product_name_ko']}")
            print(f"   품번: {product_data['model_number']}, 브랜드: {product_data['brand']}")
            print(f"   카테고리: {product_data['category_1d']} > {product_data['category_2d']}")
            print(f"   색상: '{extracted_color}' (영문명: {product_info.get('product_name_en', '')})")
            print(f"   가격: {product_data['release_price']}원")
            print(f"   이미지 URL: {image_url[:80] if image_url else 'None'}...")

            return product_data

        except Exception as e:
            logger.error(f"상품 파싱 오류: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _extract_color_from_name(self, name: str) -> str:
        """상품명에서 색상 추출 (간단한 패턴 매칭)"""
        if not name:
            return ""

        # 일반적인 색상 키워드
        colors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 'Grey', 'Gray', 'Navy', 'Beige']

        found_colors = []
        name_upper = name.upper()

        for color in colors:
            if color.upper() in name_upper:
                found_colors.append(color)

        return ' '.join(found_colors) if found_colors else ""

    async def download_image(self, image_url: str, brand_name: str, model_number: str) -> str:
        """
        이미지를 다운로드하고 로컬 경로 반환

        Args:
            image_url: 이미지 URL
            brand_name: 브랜드명
            model_number: 모델번호

        Returns:
            로컬 이미지 경로 (예: /images/brands/Nike/ABC123.jpg)
        """
        try:
            # 이미지 URL 검증
            if not image_url or not image_url.startswith('http'):
                logger.warning(f"유효하지 않은 이미지 URL: {image_url}")
                return image_url

            # 브랜드 디렉토리 생성 (uploads/products/{브랜드명})
            # Docker 볼륨 마운트: ./uploads -> /app/uploads
            brand_dir = Path(f"/app/uploads/products/{brand_name}")
            brand_dir.mkdir(parents=True, exist_ok=True)

            # 파일 확장자 추출
            ext = '.png'  # 기본값 png
            if '.' in image_url:
                url_ext = image_url.split('?')[0].split('.')[-1].lower()
                if url_ext in ['jpg', 'jpeg', 'png', 'webp']:
                    ext = f'.{url_ext}'

            # 파일명 생성 (모델번호 기반)
            safe_model = model_number.replace('/', '_').replace('\\', '_')
            file_name = f"{safe_model}{ext}"
            file_path = brand_dir / file_name

            # 이미지 다운로드
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)

                if response.status_code == 200:
                    async with aiofiles.open(file_path, 'wb') as f:
                        await f.write(response.content)

                    # 상대 경로 반환 (프론트엔드에서 사용)
                    relative_path = f"/uploads/products/{brand_name}/{file_name}"
                    logger.info(f"✅ 이미지 다운로드 성공: {relative_path}")
                    return relative_path
                else:
                    logger.warning(f"이미지 다운로드 실패 (HTTP {response.status_code}): {image_url}")
                    return image_url

        except Exception as e:
            logger.error(f"❌ 이미지 다운로드 오류: {e}")
            return image_url
