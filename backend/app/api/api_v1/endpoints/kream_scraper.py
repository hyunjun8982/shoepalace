"""
KREAM 크롤러 API 엔드포인트
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.models.user import User
from app.models.product import Product
from app.models.brand import Brand
from app.services.kream_scraper import KreamScraper
from app.services.kream_api_scraper import KreamAPIScraper
from app.db.database import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter()


class ScrapeRequest(BaseModel):
    keyword: str
    max_products: int = 100  # API 최대치
    page: int = 1
    save_to_db: bool = True


class BulkSaveRequest(BaseModel):
    keyword: str
    max_products: int = 100
    total_pages: int = 1


class ScrapeResult(BaseModel):
    total_scraped: int
    total_saved: int
    products: List[dict]
    errors: List[str]


async def save_scraped_products_to_db(products: List[dict], current_user: User):
    """크롤링한 상품을 DB에 저장"""
    db = SessionLocal()
    saved_count = 0
    errors = []

    try:
        for product_data in products:
            try:
                # 모델번호로 중복 체크
                model_number = product_data.get('model_number', '')
                if not model_number:
                    errors.append(f"모델번호 없음: {product_data.get('product_name_ko', 'Unknown')}")
                    continue

                existing = db.query(Product).filter(
                    Product.product_code == model_number
                ).first()

                if existing:
                    logger.info(f"Product already exists: {model_number}")
                    errors.append(f"이미 존재하는 상품: {model_number}")
                    continue

                # 브랜드 찾기 또는 생성
                brand_name = product_data.get('brand', 'Unknown')
                brand = db.query(Brand).filter(Brand.name == brand_name).first()
                if not brand:
                    brand = Brand(name=brand_name, description=f'From KREAM scraping')
                    db.add(brand)
                    db.flush()  # brand.id 생성
                
                # 설명 필드에 추가 정보 포함
                description_parts = []
                if product_data.get('product_name_en'):
                    description_parts.append(f"영문명: {product_data['product_name_en']}")
                if product_data.get('color'):
                    description_parts.append(f"색상: {product_data['color']}")
                if product_data.get('release_price'):
                    description_parts.append(f"발매가: {product_data['release_price']:,}원")
                if product_data.get('source_url'):
                    description_parts.append(f"출처: {product_data['source_url']}")
                
                description = "\n".join(description_parts) if description_parts else None

                # 카테고리 매핑 (KREAM 카테고리 → 시스템 카테고리)
                category_1d = product_data.get('category_1d', '')
                category = 'etc'  # 기본값

                if '신발' in category_1d or '스니커즈' in category_1d:
                    category = 'shoe'
                elif '아우터' in category_1d or '상의' in category_1d or '하의' in category_1d or '패딩' in category_1d:
                    category = 'clothing'
                elif '가방' in category_1d or '지갑' in category_1d:
                    category = 'bag'
                elif '액세서리' in category_1d or '시계' in category_1d or '모자' in category_1d:
                    category = 'accessory'

                logger.info(f"   카테고리 매핑: '{category_1d}' → '{category}'")

                # 새 상품 생성
                new_product = Product(
                    brand_id=brand.id,
                    product_code=model_number,
                    product_name=product_data.get('product_name_ko') or product_data.get('product_name_en', ''),
                    description=description,
                    image_url=product_data.get('image_url'),
                    category=category,
                )

                db.add(new_product)
                saved_count += 1

            except Exception as e:
                error_msg = f"상품 저장 실패 ({product_data.get('product_name_ko', 'Unknown')}): {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        db.commit()
        logger.info(f"Saved {saved_count} products to database")

    except Exception as e:
        db.rollback()
        logger.error(f"Database error: {e}")
        errors.append(f"DB 오류: {str(e)}")
    finally:
        db.close()

    return saved_count, errors


@router.post("/scrape", response_model=ScrapeResult)
async def scrape_kream_products(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    KREAM에서 상품을 크롤링합니다.

    **주의사항:**
    - 이 기능은 교육/개발 목적으로만 사용하세요
    - 과도한 요청은 IP 차단의 원인이 될 수 있습니다
    - KREAM의 이용약관을 준수하세요
    """
    try:
        logger.info(f"Starting KREAM scraping: keyword={request.keyword}, max={request.max_products}")

        # 크롤링 실행 - API 직접 호출 방식 (봇 차단 우회)
        api_scraper = KreamAPIScraper()
        products = await api_scraper.search_products(
            keyword=request.keyword,
            max_products=request.max_products,
            page=request.page
        )

        if not products:
            return ScrapeResult(
                total_scraped=0,
                total_saved=0,
                products=[],
                errors=["크롤링된 상품이 없습니다."]
            )

        # 품번 중복 처리 및 이미지 다운로드
        expanded_products = []
        for product_data in products:
            model_numbers = product_data.get('model_number', '').split('/')

            # 품번이 여러 개인 경우 각각 별도 상품으로 생성
            for model_num in model_numbers:
                model_num = model_num.strip()
                if not model_num:
                    continue

                # 상품 데이터 복사
                new_product = product_data.copy()
                new_product['model_number'] = model_num

                # 이미지 다운로드
                print(f"\n🖼️ 이미지 다운로드 시도: {new_product.get('product_name_ko', 'Unknown')} ({model_num})")
                print(f"   이미지 URL: {new_product.get('image_url', 'None')}")
                print(f"   브랜드: {new_product.get('brand', 'None')}")

                if new_product.get('image_url') and new_product.get('brand'):
                    try:
                        local_path = await api_scraper.download_image(
                            image_url=new_product['image_url'],
                            brand_name=new_product['brand'],
                            model_number=model_num
                        )
                        new_product['image_url'] = local_path  # 로컬 경로로 교체
                        print(f"   ✅ 다운로드 성공: {local_path}")
                        logger.info(f"✅ 이미지 다운로드 완료: {new_product.get('product_name_ko', 'Unknown')} ({model_num}) -> {local_path}")
                    except Exception as e:
                        print(f"   ❌ 다운로드 실패: {e}")
                        logger.error(f"❌ 이미지 다운로드 실패: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"   ⚠️ 이미지 URL 또는 브랜드 정보 없음")

                expanded_products.append(new_product)

        logger.info(f"📦 품번 분할 후 총 상품 수: {len(expanded_products)}개")

        # DB 저장
        saved_count = 0
        errors = []

        if request.save_to_db:
            saved_count, errors = await save_scraped_products_to_db(expanded_products, current_user)

        return ScrapeResult(
            total_scraped=len(expanded_products),
            total_saved=saved_count,
            products=expanded_products,
            errors=errors
        )

    except Exception as e:
        logger.error(f"Scraping error: {e}")
        raise HTTPException(status_code=500, detail=f"크롤링 오류: {str(e)}")


@router.post("/bulk-save", response_model=ScrapeResult)
async def bulk_save_kream_products(
    request: BulkSaveRequest,
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    여러 페이지의 상품을 한 번에 수집하고 저장합니다.
    """
    try:
        logger.info(f"Starting bulk save: keyword={request.keyword}, pages={request.total_pages}")

        all_products = []
        api_scraper = KreamAPIScraper()

        # 모든 페이지 수집
        for page in range(1, request.total_pages + 1):
            logger.info(f"Fetching page {page}/{request.total_pages}")
            products = await api_scraper.search_products(
                keyword=request.keyword,
                max_products=request.max_products,
                page=page
            )

            if not products:
                logger.info(f"No products found on page {page}")
                break

            # 품번 중복 처리 및 이미지 다운로드
            for product_data in products:
                model_numbers = product_data.get('model_number', '').split('/')

                for model_num in model_numbers:
                    model_num = model_num.strip()
                    if not model_num:
                        continue

                    new_product = product_data.copy()
                    new_product['model_number'] = model_num

                    # 이미지 다운로드
                    if new_product.get('image_url') and new_product.get('brand'):
                        try:
                            local_path = await api_scraper.download_image(
                                image_url=new_product['image_url'],
                                brand_name=new_product['brand'],
                                model_number=model_num
                            )
                            new_product['image_url'] = local_path
                            logger.info(f"✅ Image downloaded: {model_num}")
                        except Exception as e:
                            logger.error(f"❌ Image download failed: {e}")

                    all_products.append(new_product)

        logger.info(f"📦 Total products collected: {len(all_products)}")

        # DB 저장
        saved_count = 0
        errors = []

        if all_products:
            saved_count, errors = await save_scraped_products_to_db(all_products, current_user)

        return ScrapeResult(
            total_scraped=len(all_products),
            total_saved=saved_count,
            products=all_products,
            errors=errors
        )

    except Exception as e:
        logger.error(f"Bulk save error: {e}")
        raise HTTPException(status_code=500, detail=f"일괄 저장 오류: {str(e)}")


@router.get("/test")
async def test_scraper(
    keyword: str = "나이키",
    max_products: int = 3,
    kream_email: str = "",
    kream_password: str = "",
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    크롤러 테스트 엔드포인트 (DB 저장 안함)
    """
    try:
        if not kream_email or not kream_password:
            raise HTTPException(status_code=400, detail="KREAM 계정 정보가 필요합니다.")

        scraper = KreamScraper(
            email=kream_email,
            password=kream_password,
            headless=True
        )
        products = await scraper.scrape_products(
            keyword=keyword,
            max_products=max_products
        )

        return {
            "success": True,
            "total": len(products),
            "products": products
        }

    except Exception as e:
        logger.error(f"Test scraping error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
