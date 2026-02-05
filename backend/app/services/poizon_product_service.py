"""
포이즌 상품 정보 가져오기 서비스
"""
import logging
from typing import List, Dict, Optional
from app.utils.poizon.poizon_api import PoizonAPI

# Poizon API 인증 정보 (poizon_service.py와 동일)
APP_KEY = "5acc0257eeb54da09d2d90382e805621"
APP_SECRET = "f5eecdadd2f94afb9e0351d52ae9c5140272d01d35da42b098ffd00f9c4504ee"

logger = logging.getLogger(__name__)

# 설정
BASE_URL = "https://open.poizon.com/dop/api/v1/pop/api/v1"
ENDPOINT = "intl-commodity/intl/spu/spu-basic-info/by-brandId"

# 브랜드 정보
BRANDS = {
    "adidas": {"id": 3, "name": "아디다스"},
    "nike": {"id": 144, "name": "나이키"},
    "jordan": {"id": 13, "name": "조던"},
    "adidas_originals": {"id": 494, "name": "아디다스 오리지널"}
}


class PoizonProductService:
    """포이즌 상품 정보 서비스"""

    def __init__(self):
        self.client = PoizonAPI(APP_KEY, APP_SECRET, BASE_URL)
        self.page_size = 20
        self.max_page = 495

    def get_products_by_brand(
        self,
        brand_key: str,
        start_page: int = 1,
        end_page: int = 495
    ) -> List[Dict]:
        """
        브랜드별 상품 조회

        Args:
            brand_key: 브랜드 키 ("adidas", "nike", "jordan", "adidas_originals")
            start_page: 시작 페이지 (기본값: 1)
            end_page: 종료 페이지 (기본값: 495)

        Returns:
            상품 정보 리스트
        """
        if brand_key not in BRANDS:
            raise ValueError(f"Invalid brand_key: {brand_key}")

        brand_info = BRANDS[brand_key]
        brand_id = brand_info["id"]
        brand_name = brand_info["name"]

        logger.info(f"브랜드 '{brand_name}' 상품 조회 시작: {start_page}페이지 ~ {end_page}페이지")

        all_products = []

        for page_num in range(start_page, end_page + 1):
            try:
                logger.info(f"[{brand_name}] {page_num}/{end_page} 페이지 조회 중...")

                params = {
                    "language": "ko",
                    "brandIdList": [brand_id],
                    "pageNum": page_num,
                    "pageSize": self.page_size,
                    "region": "KR"
                }

                response = self.client.send_request(ENDPOINT, params)

                if response.get("code") == 200:
                    data = response.get("data", {})
                    contents = data.get("contents", [])

                    # 필요한 정보만 추출
                    for item in contents:
                        product = {
                            "brand_key": brand_key,
                            "brand_name": brand_name,
                            "level1CategoryName": item.get("level1CategoryName"),
                            "title": item.get("title"),
                            "articleNumber": item.get("articleNumber"),
                            "logoUrl": item.get("logoUrl"),
                            "spuId": item.get("spuId")  # SPU ID 추가
                        }
                        all_products.append(product)

                    logger.info(f"[{brand_name}] {page_num}페이지: {len(contents)}개 상품 추출")

                    # 더 이상 데이터가 없으면 중단
                    if len(contents) == 0:
                        logger.info(f"[{brand_name}] {page_num}페이지에 데이터 없음. 조회 종료")
                        break

                else:
                    logger.error(f"[{brand_name}] API 오류: {response.get('msg')}")
                    break

            except Exception as e:
                logger.error(f"[{brand_name}] {page_num}페이지 조회 실패: {e}")
                import traceback
                logger.error(traceback.format_exc())
                # 오류 발생 시 다음 페이지 계속 시도
                continue

        logger.info(f"브랜드 '{brand_name}' 조회 완료: 총 {len(all_products)}개 상품")
        return all_products

    def get_products_by_brand_page(
        self,
        brand_key: str,
        page_num: int
    ) -> List[Dict]:
        """
        브랜드별 상품 단일 페이지 조회

        Args:
            brand_key: 브랜드 키 ("adidas", "nike", "jordan", "adidas_originals")
            page_num: 페이지 번호

        Returns:
            상품 정보 리스트 (해당 페이지)
        """
        if brand_key not in BRANDS:
            raise ValueError(f"Invalid brand_key: {brand_key}")

        brand_info = BRANDS[brand_key]
        brand_id = brand_info["id"]
        brand_name = brand_info["name"]

        try:
            params = {
                "language": "ko",
                "brandIdList": [brand_id],
                "pageNum": page_num,
                "pageSize": self.page_size,
                "region": "KR"
            }

            response = self.client.send_request(ENDPOINT, params)

            if response.get("code") == 200:
                data = response.get("data", {})
                contents = data.get("contents", [])

                products = []
                for item in contents:
                    product = {
                        "brand_key": brand_key,
                        "brand_name": brand_name,
                        "level1CategoryName": item.get("level1CategoryName"),
                        "title": item.get("title"),
                        "articleNumber": item.get("articleNumber"),
                        "logoUrl": item.get("logoUrl"),
                        "spuId": item.get("spuId")
                    }
                    products.append(product)

                logger.info(f"[{brand_name}] {page_num}페이지: {len(products)}개 상품 조회")
                return products
            else:
                logger.error(f"[{brand_name}] API 오류: {response.get('msg')}")
                return []

        except Exception as e:
            logger.error(f"[{brand_name}] {page_num}페이지 조회 실패: {e}")
            return []

    def get_all_brands_products(
        self,
        start_page: int = 1,
        end_page: int = 495
    ) -> Dict[str, List[Dict]]:
        """
        모든 브랜드의 상품 조회

        Args:
            start_page: 시작 페이지 (기본값: 1)
            end_page: 종료 페이지 (기본값: 495)

        Returns:
            {
                "adidas": [...],
                "nike": [...],
                "jordan": [...],
                "adidas_originals": [...]
            }
        """
        logger.info("모든 브랜드 상품 조회 시작")

        results = {}

        for brand_key in BRANDS.keys():
            logger.info(f"\n{'='*80}")
            logger.info(f"브랜드: {BRANDS[brand_key]['name']} 조회 시작")
            logger.info(f"{'='*80}")

            products = self.get_products_by_brand(brand_key, start_page, end_page)
            results[brand_key] = products

        logger.info(f"\n모든 브랜드 조회 완료")
        for brand_key, products in results.items():
            logger.info(f"  {BRANDS[brand_key]['name']}: {len(products)}개")

        return results


# 전역 인스턴스
_poizon_product_service: Optional[PoizonProductService] = None


def get_poizon_product_service() -> PoizonProductService:
    """전역 포이즌 상품 서비스 인스턴스 반환"""
    global _poizon_product_service
    if _poizon_product_service is None:
        _poizon_product_service = PoizonProductService()
    return _poizon_product_service
