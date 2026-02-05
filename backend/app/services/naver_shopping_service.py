"""
네이버쇼핑 API 서비스
"""
import logging
import urllib.request
import urllib.parse
import json
from typing import List, Dict, Set
from app.db.database import SessionLocal
from app.models.naver_shopping_filter import NaverShoppingFilter

logger = logging.getLogger(__name__)

# 네이버 API 인증 정보
NAVER_CLIENT_ID = "dN1HqlH3uDjX5WjKLGwQ"
NAVER_CLIENT_SECRET = "KPzH189wWO"


class NaverShoppingService:
    """네이버쇼핑 검색 서비스"""

    def __init__(self):
        self.client_id = NAVER_CLIENT_ID
        self.client_secret = NAVER_CLIENT_SECRET
        self.base_url = "https://openapi.naver.com/v1/search/shop.json"
        self._filter_cache: Set[str] = set()
        self._load_filters()

    def _load_filters(self):
        """DB에서 필터 목록 로드"""
        try:
            db = SessionLocal()
            try:
                filters = db.query(NaverShoppingFilter).all()
                self._filter_cache = {f.mall_name for f in filters}
                logger.info(f"[네이버쇼핑] 필터 로드 완료: {len(self._filter_cache)}개")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[네이버쇼핑] 필터 로드 실패: {e}", exc_info=True)
            self._filter_cache = set()

    def reload_filters(self):
        """필터 목록 재로드 (필터 변경 후 호출)"""
        self._load_filters()

    def search_product(self, product_code: str, display: int = 100) -> List[Dict]:
        """
        상품코드로 네이버쇼핑 검색

        Args:
            product_code: 상품코드 (예: JI0496)
            display: 검색 결과 개수 (기본 100개, 최대 100개)

        Returns:
            판매처 정보 리스트 [
                {
                    "title": "상품명",
                    "link": "판매처 링크",
                    "lprice": "최저가",
                    "mallName": "판매처명"
                },
                ...
            ]
        """
        try:
            # 검색어 인코딩
            enc_text = urllib.parse.quote(product_code)

            # URL 구성
            url = (
                f"{self.base_url}?"
                f"query={enc_text}&"
                f"display={min(display, 100)}&"  # 최대 100개
                f"sort=asc&"
                f"exclude=cbshop"  # 해외 쇼핑몰 제외
            )

            # 요청 생성
            request = urllib.request.Request(url)
            request.add_header("X-Naver-Client-Id", self.client_id)
            request.add_header("X-Naver-Client-Secret", self.client_secret)

            # API 호출
            response = urllib.request.urlopen(request)
            rescode = response.getcode()

            if rescode == 200:
                response_body = response.read()
                result = json.loads(response_body.decode('utf-8'))

                # 결과에서 필요한 정보만 추출 및 필터링
                items = result.get('items', [])
                filtered_items = self._filter_and_clean_items(items)

                logger.info(f"[네이버쇼핑] {product_code} 검색 완료: {len(filtered_items)}개 판매처")
                return filtered_items
            else:
                logger.error(f"[네이버쇼핑] API 오류: {rescode}")
                return []

        except Exception as e:
            logger.error(f"[네이버쇼핑] 검색 실패: {e}", exc_info=True)
            return []

    def _filter_and_clean_items(self, items: List[Dict]) -> List[Dict]:
        """
        검색 결과 필터링 및 정제

        Args:
            items: 네이버 API 원본 결과

        Returns:
            필터링 및 정제된 결과
        """
        filtered = []

        for item in items:
            # link 정제 (\/를 /로 변경)
            link = item.get('link', '').replace('\\/', '/')
            mall_name = item.get('mallName', '')

            # smartstore.naver.com 제외 (개인 판매자)
            if 'smartstore.naver.com' in link:
                continue

            # DB 필터 적용
            if mall_name in self._filter_cache:
                continue

            # 필요한 정보만 추출
            filtered_item = {
                'title': item.get('title', ''),
                'link': link,
                'lprice': item.get('lprice', '0'),
                'mallName': mall_name
            }

            filtered.append(filtered_item)

        return filtered


# 전역 인스턴스
_naver_shopping_service = None


def get_naver_shopping_service() -> NaverShoppingService:
    """전역 네이버쇼핑 서비스 인스턴스 반환"""
    global _naver_shopping_service
    if _naver_shopping_service is None:
        _naver_shopping_service = NaverShoppingService()
    return _naver_shopping_service
