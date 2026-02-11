"""
Poizon API 서비스 (상품 조회 + 사이즈/가격 조회 통합)
"""
import logging
import re
import time
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.utils.poizon.poizon_api import PoizonAPI

logger = logging.getLogger(__name__)

# Poizon API 인증 정보
APP_KEY = "5acc0257eeb54da09d2d90382e805621"
APP_SECRET = "f5eecdadd2f94afb9e0351d52ae9c5140272d01d35da42b098ffd00f9c4504ee"
BASE_URL = "https://open.poizon.com/dop/api/v1/pop/api/v1"

# 브랜드 정보
BRANDS = {
    "adidas": {"id": 3, "name": "아디다스"},
    "nike": {"id": 144, "name": "나이키"},
    "jordan": {"id": 13, "name": "조던"},
    "adidas_originals": {"id": 494, "name": "아디다스 오리지널"},
    "arcteryx": {"id": 10429, "name": "아크테릭스"},
    "kolon_sport": {"id": 1000444, "name": "코오롱스포츠"},
    "the_north_face": {"id": 45, "name": "노스페이스"},
    "new_balance": {"id": 4, "name": "뉴발란스"},
    "salomon": {"id": 1000079, "name": "살로몬"},
    "stussy": {"id": 10087, "name": "스투시"},
    "supreme": {"id": 439, "name": "슈프림"},
}


class PoizonService:
    """Poizon API 서비스 (상품 조회 + 사이즈/가격 조회)"""

    def __init__(self):
        self.client = PoizonAPI(APP_KEY, APP_SECRET, BASE_URL)
        self.region = "KR"
        self.language = "ko"
        self.currency = "KRW"
        self.page_size = 20
        self.max_page = 495

    def get_price_data_by_article_number(self, article_number: str) -> Optional[Dict]:
        """
        상품코드로 상품 정보 + 사이즈별 가격 전체 조회

        흐름:
        1. sku/sku-basic-info/by-article-number → spuInfo(title, logoUrl) + SKU 목록
        2. recommend-bid/price per skuId → 가격 조회 (50% 백분위수 = average_price)

        Args:
            article_number: 상품코드 ("/"가 포함된 경우 뒤의 것 사용)

        Returns:
            {
                "title": "상품명",
                "logo_url": "이미지 URL",
                "sizes": [{ size_kr, size_us, sku_id, bar_code, average_price }, ...]
            } 또는 None
        """
        try:
            # "/"가 들어가있는 경우 뒤의 것 추출
            clean_article = article_number.split("/")[-1].strip()

            endpoint = "intl-commodity/intl/sku/sku-basic-info/by-article-number"
            params = {
                "articleNumber": clean_article,
                "region": self.region,
            }

            logger.info(f"[Poizon] SKU 조회: {clean_article}")
            response = self.client.send_request(endpoint, params)

            if response.get("code") != 200 or not response.get("data"):
                logger.warning(f"[Poizon] {clean_article}: SKU 정보 없음")
                return None

            ALLOWED_APPAREL_SIZES = {'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'}
            SIZE_NORMALIZE = {'2XL': 'XXL', '3XL': 'XXXL', '4XL': 'XXXXL', '5XL': 'XXXXXL'}

            # spuInfo에서 title, logoUrl 추출
            title = None
            logo_url = None
            sizes = []
            seen_sizes = set()

            for item in response["data"]:
                spu_info = item.get("spuInfo", {})
                if spu_info:
                    title = title or spu_info.get("title")
                    logo_url = logo_url or spu_info.get("logoUrl")

                for sku in item.get("skuInfoList", []):
                    sku_id = sku.get("skuId")
                    bar_code = sku.get("barCode", "")

                    size_kr = None
                    size_us = None
                    for region in sku.get("regionSalePvInfoList", []):
                        size_info_list = region.get("sizeInfos") or region.get("sizeInfo") or []
                        for size_info in size_info_list:
                            size_key = size_info.get("sizeKey")
                            size_value = str(size_info.get("value", ""))

                            if size_key == "KR":
                                if "(" in size_value:
                                    size_kr = size_value.split("(")[0].strip()
                                elif "mm" in size_value.lower():
                                    mm_match = re.search(r'(\d+)mm', size_value.lower())
                                    if mm_match:
                                        size_kr = mm_match.group(1)
                                elif size_value.isdigit():
                                    size_kr = size_value
                            elif size_key == "SIZE":
                                cleaned = size_value.upper().strip()
                                if cleaned.startswith("SIZE "):
                                    cleaned = cleaned[5:].strip()
                                if "/" in cleaned:
                                    cleaned = cleaned.split("/")[-1].strip()
                                cleaned = SIZE_NORMALIZE.get(cleaned, cleaned)
                                if cleaned in ALLOWED_APPAREL_SIZES:
                                    size_kr = cleaned
                            elif size_key == "US Men":
                                size_us = size_value

                    if size_kr and sku_id and size_kr not in seen_sizes:
                        seen_sizes.add(size_kr)
                        sizes.append({
                            "size_kr": size_kr,
                            "size_us": size_us,
                            "sku_id": str(sku_id),
                            "bar_code": bar_code,
                        })

            logger.info(f"[Poizon] {clean_article}: {len(sizes)}개 SKU, title={title}")

            if not sizes:
                return None

            # 대상 사이즈 필터링 (220-290 신발, XS-XXXXL 의류)
            SMALL_SIZES = set(str(x) for x in range(220, 255, 5))
            LARGE_SIZES = set(str(x) for x in range(255, 295, 5))
            TARGET_SIZES = SMALL_SIZES | LARGE_SIZES | ALLOWED_APPAREL_SIZES

            target_skus = [s for s in sizes if s["size_kr"] in TARGET_SIZES]

            if not target_skus:
                logger.warning(f"[Poizon] {article_number}: 대상 사이즈 없음")
                return {"title": title, "logo_url": logo_url, "sizes": []}

            # recommend-bid/price로 각 skuId별 가격 조회
            sku_ids = [s["sku_id"] for s in target_skus]
            prices = self.get_prices_batch(sku_ids, max_workers=3, delay=0.3)

            for sku in target_skus:
                price_info = prices.get(sku["sku_id"])
                if price_info:
                    sku["average_price"] = price_info.get("average_price")
                    sku["leak_price"] = price_info.get("leak_price")
                else:
                    sku["average_price"] = None
                    sku["leak_price"] = None

            logger.info(f"[Poizon] {article_number}: {len(target_skus)}개 사이즈 가격 조회 완료")
            return {"title": title, "logo_url": logo_url, "sizes": target_skus}

        except Exception as e:
            logger.error(f"[Poizon] {article_number} 조회 실패: {e}")
            return None

    def get_sizes_with_prices(self, spu_ids: List[int]) -> Dict[int, List[Dict]]:
        """
        SPU ID 목록으로 사이즈/SKU 정보 + 평균가를 한번에 조회

        statisticsDataQry.salesEnable=true 옵션으로 averagePrice 포함

        Args:
            spu_ids: SPU ID 목록 (최대 5개 권장)

        Returns:
            {
                spuId: [
                    {
                        "size_kr": "270",
                        "size_us": "8.5",
                        "sku_id": "123456",
                        "bar_code": "ABC123",
                        "average_price": 53997  # 평균가 (원)
                    },
                    ...
                ]
            }
        """
        try:
            endpoint = "intl-commodity/intl/sku/sku-basic-info/by-spu"
            params = {
                "spuIds": spu_ids,
                "sellerStatusEnable": False,
                "buyStatusEnable": False,
                "statisticsDataQry": {
                    "salesEnable": True  # 이 옵션이 averagePrice를 활성화
                },
                "region": self.region,
                "language": self.language
            }

            logger.info(f"[Poizon] 사이즈+가격 조회 요청 - SPU IDs: {spu_ids}")

            response = self.client.send_request(endpoint, params)

            response_code = response.get("code")
            response_msg = response.get("msg", "")
            response_data = response.get("data")

            if response_code != 200:
                logger.error(f"[Poizon] API 에러 - 코드: {response_code}, 메시지: {response_msg}")
                return {}

            if not response_data:
                logger.warning(f"[Poizon] SPU ID {spu_ids}에 대한 데이터 없음")
                return {}

            result = {}

            for item in response_data:
                spu_id = item.get("spuId")
                if not spu_id:
                    continue

                sizes = []
                seen_sizes = set()  # 중복 사이즈 체크용
                sku_info_list = item.get("skuInfoList", [])

                # 허용된 의류 사이즈 목록
                ALLOWED_APPAREL_SIZES = {'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'}
                # 사이즈 정규화 매핑 (2XL -> XXL 등)
                SIZE_NORMALIZE = {'2XL': 'XXL', '3XL': 'XXXL', '4XL': 'XXXXL', '5XL': 'XXXXXL'}

                for sku in sku_info_list:
                    sku_id = sku.get("skuId")
                    bar_code = sku.get("barCode", "")

                    # 사이즈 정보 추출
                    # 신발: sizeKey = "KR" (270, 280 등 mm 단위)
                    # 의류: sizeKey = "SIZE" (XS, S, M, L 등)
                    size_kr = None
                    size_us = None
                    for region in sku.get("regionSalePvInfoList", []):
                        for size_info in region.get("sizeInfos", []):
                            size_key = size_info.get("sizeKey")
                            size_value = str(size_info.get("value", ""))
                            if size_key == "KR":
                                # 다양한 포맷 처리
                                # 1. "235 (EU 36.5)" → "235"
                                # 2. "EU 46 285mm" → "285"
                                # 3. "270" → "270"
                                if "(" in size_value:
                                    size_kr = size_value.split("(")[0].strip()
                                elif "mm" in size_value.lower():
                                    # "EU 46 285mm" → "285" 추출
                                    mm_match = re.search(r'(\d+)mm', size_value.lower())
                                    if mm_match:
                                        size_kr = mm_match.group(1)
                                    else:
                                        size_kr = None  # 파싱 실패 시 스킵
                                elif size_value.isdigit():
                                    size_kr = size_value
                                else:
                                    # 숫자가 아닌 이상한 값은 스킵
                                    size_kr = None
                            elif size_key == "SIZE":
                                # 사이즈 값 정리
                                cleaned = size_value.upper().strip()
                                # "SIZE " 접두사 제거
                                if cleaned.startswith("SIZE "):
                                    cleaned = cleaned[5:].strip()
                                # "A/XS", "A/S" 등 접두사 제거
                                if "/" in cleaned:
                                    cleaned = cleaned.split("/")[-1].strip()
                                # 정규화 (2XL -> XXL 등)
                                cleaned = SIZE_NORMALIZE.get(cleaned, cleaned)
                                # 허용된 사이즈만 사용
                                if cleaned in ALLOWED_APPAREL_SIZES:
                                    size_kr = cleaned
                            elif size_key == "US Men":
                                size_us = size_value

                    # 평균가 추출 (globalAveragePrice.amount)
                    average_price = None
                    avg_price_data = sku.get("averagePrice", {})
                    global_avg = avg_price_data.get("globalAveragePrice", {})
                    if global_avg:
                        amount = global_avg.get("amount")
                        if amount:
                            average_price = int(amount)

                    # 중복 사이즈 제거 (첫 번째 것만 사용)
                    if size_kr and sku_id and size_kr not in seen_sizes:
                        seen_sizes.add(size_kr)
                        sizes.append({
                            "size_kr": size_kr,
                            "size_us": size_us,
                            "sku_id": str(sku_id),
                            "bar_code": bar_code,
                            "average_price": average_price
                        })

                if sizes:
                    result[spu_id] = sizes

            logger.info(f"[Poizon] {len(result)}개 SPU의 사이즈+가격 정보 조회 완료")
            return result

        except Exception as e:
            logger.error(f"[Poizon] 사이즈+가격 조회 실패: {e}", exc_info=True)
            return {}

    def get_sizes_by_spuids(self, spu_ids: List[int]) -> Dict[int, List[Dict]]:
        """
        SPU ID 목록으로 사이즈 및 SKU 정보 조회 (하위 호환용)

        NOTE: 가격 정보가 필요하면 get_sizes_with_prices() 사용 권장

        Args:
            spu_ids: SPU ID 목록

        Returns:
            {
                spuId: [
                    {
                        "size_kr": "270",
                        "size_us": "8.5",
                        "sku_id": "123456",
                        "bar_code": "ABC123"
                    },
                    ...
                ]
            }
        """
        # get_sizes_with_prices 호출 후 average_price 필드만 제거
        result = self.get_sizes_with_prices(spu_ids)

        # average_price 필드 제거 (하위 호환성)
        for spu_id, sizes in result.items():
            for size in sizes:
                size.pop("average_price", None)

        return result

    def get_price_by_skuid(self, sku_id: str) -> Optional[Dict]:
        """
        SKU ID로 가격 정보 조회

        Args:
            sku_id: SKU ID

        Returns:
            {
                "min_price": 100000,
                "max_price": 150000,
                "average_price": 125000,
                "global_min_price": 95000,
                "high_demand_price": 130000
            }
        """
        try:
            endpoint = "recommend-bid/price"
            params = {
                "skuId": sku_id,
                "biddingType": 20,
                "region": self.region,
                "currency": self.currency
            }

            response = self.client.send_request(endpoint, params)

            if not response.get("data"):
                logger.warning(f"[Poizon] SKU {sku_id}에 대한 가격 데이터 없음")
                return None

            data = response["data"]
            price_ranges = data.get("priceRangeItems", [])

            # priceRangeItems가 없으면 가격 정보 없음
            if not price_ranges:
                logger.info(f"[Poizon] SKU {sku_id}: 가격 정보 없음 (priceRangeItems 비어있음)")
                return None

            # priceRangeItems에서 백분위수별 가격 추출
            # percentValue: 10, 30, 50, 70, 90
            price_map = {item["percentValue"]: item["price"] for item in price_ranges}

            # leakInfos에서 최저입찰가 추출
            leak_price = None
            leak_infos = data.get("leakInfos", [])
            if leak_infos:
                leak_price = leak_infos[0].get("leakPrice")

            return {
                "min_price": price_map.get(10),  # 10% 백분위수 = 최저가
                "max_price": price_map.get(90),  # 90% 백분위수 = 최고가
                "average_price": price_map.get(50),  # 50% 백분위수 = 중간값(평균가)
                "leak_price": leak_price,  # 최저입찰가
                "global_min_price": data.get("globalMinPrice"),
                "high_demand_price": price_map.get(90)  # 고수요 가격도 90% 백분위수 사용
            }

        except Exception as e:
            logger.error(f"[Poizon] SKU {sku_id} 가격 조회 실패: {e}", exc_info=True)
            return None

    def get_prices_batch(
        self,
        sku_ids: List[str],
        max_workers: int = 3,
        delay: float = 0.3
    ) -> Dict[str, Optional[Dict]]:
        """
        여러 SKU ID의 가격 정보 일괄 조회

        포이즌 API rate limit으로 인해 동시 요청 수 제한 필요.
        max_workers=3, delay=0.3초로 안정적인 조회 가능.

        Args:
            sku_ids: SKU ID 목록
            max_workers: 동시 요청 수 (기본값: 3, 최대 권장: 5)
            delay: 각 요청 후 대기 시간(초) (기본값: 0.3)

        Returns:
            {
                "sku_id_1": { price_info },
                "sku_id_2": { price_info },
                ...
            }
        """
        if not sku_ids:
            return {}

        result = {}

        def fetch_with_delay(sku_id: str) -> tuple:
            """SKU 가격 조회 후 딜레이"""
            price = self.get_price_by_skuid(sku_id)
            time.sleep(delay)
            return sku_id, price

        # 제한된 병렬 처리
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_sku = {
                executor.submit(fetch_with_delay, sku_id): sku_id
                for sku_id in sku_ids
            }

            for future in as_completed(future_to_sku):
                try:
                    sku_id, price = future.result()
                    result[sku_id] = price
                except Exception as e:
                    sku_id = future_to_sku[future]
                    logger.error(f"[Poizon] SKU {sku_id} 가격 조회 실패: {e}")
                    result[sku_id] = None

        return result

    def get_prices_sequential(
        self,
        sku_ids: List[str],
        delay: float = 0.3
    ) -> Dict[str, Optional[Dict]]:
        """
        여러 SKU ID의 가격 정보 순차 조회 (가장 안정적)

        Args:
            sku_ids: SKU ID 목록
            delay: 각 요청 사이 대기 시간(초) (기본값: 0.3)

        Returns:
            {
                "sku_id_1": { price_info },
                "sku_id_2": { price_info },
                ...
            }
        """
        result = {}

        for i, sku_id in enumerate(sku_ids):
            result[sku_id] = self.get_price_by_skuid(sku_id)
            if i < len(sku_ids) - 1:
                time.sleep(delay)

        return result

    # ========== 상품 조회 메서드 ==========

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
        endpoint = "intl-commodity/intl/spu/spu-basic-info/by-brandId"

        logger.info(f"브랜드 '{brand_name}' 상품 조회 시작: {start_page}페이지 ~ {end_page}페이지")

        all_products = []

        for page_num in range(start_page, end_page + 1):
            try:
                logger.info(f"[{brand_name}] {page_num}/{end_page} 페이지 조회 중...")

                params = {
                    "language": self.language,
                    "brandIdList": [brand_id],
                    "pageNum": page_num,
                    "pageSize": self.page_size,
                    "region": self.region
                }

                response = self.client.send_request(endpoint, params)

                if response.get("code") == 200:
                    data = response.get("data", {})
                    contents = data.get("contents", [])

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
                        all_products.append(product)

                    logger.info(f"[{brand_name}] {page_num}페이지: {len(contents)}개 상품 추출")

                    if len(contents) == 0:
                        logger.info(f"[{brand_name}] {page_num}페이지에 데이터 없음. 조회 종료")
                        break
                else:
                    logger.error(f"[{brand_name}] API 오류: {response.get('msg')}")
                    break

            except Exception as e:
                logger.error(f"[{brand_name}] {page_num}페이지 조회 실패: {e}")
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
            brand_key: 브랜드 키
            page_num: 페이지 번호

        Returns:
            상품 정보 리스트 (해당 페이지)
        """
        if brand_key not in BRANDS:
            raise ValueError(f"Invalid brand_key: {brand_key}")

        brand_info = BRANDS[brand_key]
        brand_id = brand_info["id"]
        brand_name = brand_info["name"]
        endpoint = "intl-commodity/intl/spu/spu-basic-info/by-brandId"

        try:
            params = {
                "language": self.language,
                "brandIdList": [brand_id],
                "pageNum": page_num,
                "pageSize": self.page_size,
                "region": self.region
            }

            response = self.client.send_request(endpoint, params)

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
                ...
            }
        """
        logger.info("모든 브랜드 상품 조회 시작")

        results = {}
        for brand_key in BRANDS.keys():
            products = self.get_products_by_brand(brand_key, start_page, end_page)
            results[brand_key] = products

        logger.info("모든 브랜드 조회 완료")
        for brand_key, products in results.items():
            logger.info(f"  {BRANDS[brand_key]['name']}: {len(products)}개")

        return results


# 전역 인스턴스
_poizon_service = None


def get_poizon_service() -> PoizonService:
    """전역 Poizon 서비스 인스턴스 반환"""
    global _poizon_service
    if _poizon_service is None:
        _poizon_service = PoizonService()
    return _poizon_service


# 하위 호환성을 위한 별칭
def get_poizon_product_service() -> PoizonService:
    """전역 Poizon 서비스 인스턴스 반환 (하위 호환용)"""
    return get_poizon_service()
