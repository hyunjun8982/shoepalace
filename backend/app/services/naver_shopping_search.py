"""
네이버 쇼핑 검색 서비스
"""
import httpx
import logging
from typing import List, Dict
from urllib.parse import quote

logger = logging.getLogger(__name__)


class NaverShoppingSearchService:
    """네이버 쇼핑 검색 서비스"""

    def __init__(self):
        self.api_url = "https://openapi.naver.com/v1/search/shop.json"
        self.client_id = "dN1HqlH3uDjX5WjKLGwQ"
        self.client_secret = "KPzH189wWO"

    async def search_products(
        self,
        keyword: str,
        display: int = 20,
        sort: str = "asc"
    ) -> List[Dict]:
        """
        네이버 쇼핑에서 상품 검색

        Args:
            keyword: 검색 키워드
            display: 검색 결과 출력 건수 (1~100)
            sort: 정렬 옵션 (sim: 정확도순, date: 날짜순, asc: 가격오름차순, dsc: 가격내림차순)

        Returns:
            상품 정보 리스트
        """
        try:
            # URL 인코딩
            enc_keyword = quote(keyword)

            # 요청 URL 구성
            url = f"{self.api_url}?query={enc_keyword}&display={display}&sort={sort}"

            # 헤더 설정
            headers = {
                "X-Naver-Client-Id": self.client_id,
                "X-Naver-Client-Secret": self.client_secret
            }

            logger.info(f"네이버 쇼핑 검색 시작: keyword={keyword}, display={display}")

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()

                # 응답 데이터 파싱
                items = data.get('items', [])
                products = self._parse_products(items)

                logger.info(f"네이버 쇼핑 검색 완료: {len(products)}개 상품")
                return products

        except httpx.HTTPStatusError as e:
            logger.error(f"네이버 쇼핑 API HTTP 오류: {e}")
            raise

        except Exception as e:
            logger.error(f"네이버 쇼핑 검색 실패: {e}")
            raise

    def _parse_products(self, items: List[Dict]) -> List[Dict]:
        """
        네이버 쇼핑 API 응답 데이터 파싱

        Args:
            items: API 응답 items

        Returns:
            파싱된 상품 정보 리스트
        """
        products = []

        for item in items:
            # HTML 태그 제거
            title = self._remove_html_tags(item.get('title', ''))

            product = {
                'mall_name': item.get('mallName', '네이버쇼핑'),
                'title': title,
                'price': int(item.get('lprice', 0)),  # 최저가
                'link': item.get('link', ''),
                'image': item.get('image', ''),
                'brand': item.get('brand', ''),
                'maker': item.get('maker', ''),
                'category1': item.get('category1', ''),
                'category2': item.get('category2', ''),
            }
            products.append(product)

        return products

    def _remove_html_tags(self, text: str) -> str:
        """HTML 태그 제거"""
        import re
        clean = re.compile('<.*?>')
        return re.sub(clean, '', text)


# 전역 인스턴스
_naver_service = None


def get_naver_shopping_service() -> NaverShoppingSearchService:
    """전역 네이버 쇼핑 서비스 인스턴스 반환"""
    global _naver_service
    if _naver_service is None:
        _naver_service = NaverShoppingSearchService()
    return _naver_service
