"""
KREAM 상품 크롤러 - Playwright 기반
주의: 이 코드는 교육/개발 목적으로만 사용하세요.
상업적 사용 시 법적 문제가 발생할 수 있습니다.
"""

import asyncio
import re
import json
import logging
import os
import httpx
import time
import random
from pathlib import Path
from typing import List, Dict, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class KreamScraper:
    """KREAM 크롤러 - Playwright 기반 (로그인 불필요)"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

    async def _ensure_chromium_installed(self):
        """Chromium이 설치되어 있는지 확인하고, 없으면 설치"""
        import os
        import subprocess

        chromium_path = '/root/.cache/ms-playwright/chromium-1091/chrome-linux/chrome'

        if not os.path.exists(chromium_path):
            logger.info("⚠️ Chromium이 설치되어 있지 않습니다. 자동으로 설치합니다...")
            try:
                # Chromium 설치
                subprocess.run(
                    ['python', '-m', 'playwright', 'install', 'chromium'],
                    check=True,
                    capture_output=True,
                    text=True
                )
                logger.info("✅ Chromium 설치 완료")
            except subprocess.CalledProcessError as e:
                logger.error(f"❌ Chromium 설치 실패: {e.stderr}")
                raise

    async def _init_browser(self):
        """Playwright 브라우저 초기화"""
        if self.browser:
            return

        # Chromium 설치 확인
        await self._ensure_chromium_installed()

        logger.info("Playwright 브라우저 초기화 중...")
        playwright = await async_playwright().start()

        self.browser = await playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
            ]
        )

        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            locale='ko-KR',
            extra_http_headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            }
        )

        # 강화된 봇 감지 우회 스크립트
        await self.context.add_init_script("""
            // navigator.webdriver 제거
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // Chrome 객체 추가 (HeadlessChrome 감지 우회)
            window.chrome = {
                runtime: {}
            };

            // Permissions API 오버라이드
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Plugin 배열 추가
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Languages 추가
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en']
            });
        """)

        self.page = await self.context.new_page()
        logger.info("✅ Playwright 브라우저 초기화 완료")

    async def login(self) -> bool:
        """KREAM에 로그인"""
        try:
            await self._init_browser()

            logger.info("KREAM 로그인 페이지 접속 중...")
            await self.page.goto("https://kream.co.kr/login", wait_until='domcontentloaded', timeout=60000)
            await asyncio.sleep(2)

            # 이메일 입력
            logger.info("이메일 입력 중...")
            email_selector = "input[type='email'], input[name='email'], input[placeholder*='이메일']"
            try:
                await self.page.wait_for_selector(email_selector, timeout=10000)
                await self.page.fill(email_selector, self.email)
                logger.info("✅ 이메일 입력 완료")
            except Exception as e:
                logger.error(f"❌ 이메일 입력 실패: {e}")
                await self.page.screenshot(path='/tmp/kream_login_email_fail.png')
                return False

            # 비밀번호 입력
            logger.info("비밀번호 입력 중...")
            password_selector = "input[type='password'], input[name='password']"
            try:
                await self.page.fill(password_selector, self.password)
                logger.info("✅ 비밀번호 입력 완료")
            except Exception as e:
                logger.error(f"❌ 비밀번호 입력 실패: {e}")
                await self.page.screenshot(path='/tmp/kream_login_password_fail.png')
                return False

            # 로그인 버튼 클릭
            logger.info("로그인 버튼 클릭 중...")
            login_button_selector = "button[type='submit'], button.login_btn_box, a.login_btn_box"
            try:
                await self.page.click(login_button_selector)
                logger.info("✅ 로그인 버튼 클릭 완료")
            except Exception as e:
                logger.error(f"❌ 로그인 버튼 클릭 실패: {e}")
                await self.page.screenshot(path='/tmp/kream_login_button_fail.png')
                return False

            # 로그인 성공 대기 (URL 변경 확인)
            await asyncio.sleep(5)

            current_url = self.page.url
            if "login" not in current_url:
                logger.info(f"✅ KREAM 로그인 성공! 현재 URL: {current_url}")
                return True
            else:
                logger.error(f"❌ 로그인 실패 - 여전히 로그인 페이지: {current_url}")
                await self.page.screenshot(path='/tmp/kream_login_final_fail.png')
                return False

        except Exception as e:
            logger.error(f"❌ 로그인 중 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            if self.page:
                await self.page.screenshot(path='/tmp/kream_login_error.png')
            return False

    async def scrape_products(self, keyword: str, max_products: int = 10) -> List[Dict]:
        """
        검색어로 상품을 찾아 상세 정보까지 모두 수집

        Args:
            keyword: 검색 키워드
            max_products: 수집할 최대 상품 개수

        Returns:
            상품 상세 정보 리스트
        """
        try:
            start_time = time.time()

            # 브라우저 초기화 (로그인 없이)
            print("⏱️ [STEP 1/5] 브라우저 초기화 시작...")
            logger.info("⏱️ [STEP 1/5] 브라우저 초기화 시작...")
            step_start = time.time()
            await self._init_browser()
            print(f"✅ [STEP 1/5] 브라우저 초기화 완료 ({time.time() - step_start:.2f}초)")
            logger.info(f"✅ [STEP 1/5] 브라우저 초기화 완료 ({time.time() - step_start:.2f}초)")

            # 1단계: 검색 페이지 접속
            print("⏱️ [STEP 2/5] 검색 페이지 접속 중...")
            logger.info("⏱️ [STEP 2/5] 검색 페이지 접속 중...")
            step_start = time.time()
            search_url = f"https://kream.co.kr/search?keyword={keyword}&tab=products"

            await self.page.goto(search_url, wait_until='domcontentloaded', timeout=60000)
            # 검색 페이지도 React 앱이므로 충분히 대기
            await asyncio.sleep(5)
            print(f"✅ [STEP 2/5] 검색 페이지 로드 완료 ({time.time() - step_start:.2f}초)")
            logger.info(f"✅ [STEP 2/5] 검색 페이지 로드 완료 ({time.time() - step_start:.2f}초)")

            # 디버그: 스크린샷 저장
            await self.page.screenshot(path='/tmp/kream_search_page.png')
            print("📸 검색 페이지 스크린샷 저장: /tmp/kream_search_page.png")
            logger.info("📸 검색 페이지 스크린샷 저장: /tmp/kream_search_page.png")

            # 페이지 스크롤하여 더 많은 상품 로드
            print("⏱️ [STEP 3/5] 페이지 스크롤 및 상품 링크 수집 중...")
            logger.info("⏱️ [STEP 3/5] 페이지 스크롤 및 상품 링크 수집 중...")
            step_start = time.time()
            for i in range(2):
                await self.page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await asyncio.sleep(1.0)

            # product_id 추출
            product_links = await self.page.query_selector_all("a[href*='/products/']")
            print(f"🔍 찾은 링크 수: {len(product_links)}개")
            logger.info(f"🔍 찾은 링크 수: {len(product_links)}개")
            product_ids = []

            for link in product_links[:max_products * 3]:  # 여유있게 수집
                href = await link.get_attribute('href')
                if href and '/products/' in href:
                    try:
                        product_id = href.split('/products/')[1].split('?')[0]
                        if product_id and product_id.isdigit() and product_id not in product_ids:
                            product_ids.append(product_id)
                            if len(product_ids) >= max_products:
                                break
                    except:
                        continue

            if not product_ids:
                logger.warning(f"검색어 '{keyword}'에 대한 상품을 찾을 수 없습니다.")
                await self.page.screenshot(path='/tmp/kream_no_products.png')
                return []

            logger.info(f"✅ [STEP 3/5] 링크 수집 완료 ({time.time() - step_start:.2f}초) - {len(product_ids)}개 상품")

            # 4단계: 각 product_id에 대해 상세 정보 조회
            logger.info(f"⏱️ [STEP 4/5] 상품 상세 정보 수집 중 ({len(product_ids)}개)...")
            step_start = time.time()
            products = []
            for i, product_id in enumerate(product_ids, 1):
                product_start = time.time()
                logger.info(f"  ⏱️ [{i}/{len(product_ids)}] 상품 {product_id} 처리 중...")

                product_data = await self._get_product_info(product_id)

                if product_data:
                    products.append(product_data)
                    logger.info(f"  ✅ [{i}/{len(product_ids)}] 완료 ({time.time() - product_start:.2f}초)")
                else:
                    logger.warning(f"  ⚠️ [{i}/{len(product_ids)}] 실패 ({time.time() - product_start:.2f}초)")

                # 서버 부하 방지 및 봇 차단 회피 (2-3초 랜덤 대기)
                wait_time = random.uniform(2.0, 3.0)
                logger.info(f"  ⏳ 다음 상품까지 {wait_time:.1f}초 대기...")
                await asyncio.sleep(wait_time)

            logger.info(f"✅ [STEP 4/5] 상품 정보 수집 완료 ({time.time() - step_start:.2f}초) - {len(products)}개 성공")

            logger.info(f"🎉 전체 크롤링 완료! 총 소요 시간: {time.time() - start_time:.2f}초")
            return products

        except Exception as e:
            logger.error(f"❌ 크롤링 중 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            return []

        finally:
            # 브라우저 정리
            await self.close()

    async def _get_product_info(self, product_id: str) -> Optional[Dict]:
        """상품 상세 페이지에서 정보 추출"""
        try:
            product_url = f"https://kream.co.kr/products/{product_id}"

            await self.page.goto(product_url, wait_until='domcontentloaded', timeout=60000)
            await asyncio.sleep(2)

            # 페이지 HTML 가져오기 - 더 오래 대기
            await asyncio.sleep(5)
            content = await self.page.content()

            # 디버그: HTML 저장
            with open(f'/tmp/kream_product_{product_id}.html', 'w', encoding='utf-8') as f:
                f.write(content)
            logger.info(f"HTML 저장됨: /tmp/kream_product_{product_id}.html (크기: {len(content)} bytes)")

            soup = BeautifulSoup(content, 'html.parser')

            # 상품 정보 추출
            product_data = {
                'product_id': product_id,
                'product_name_ko': '',
                'product_name_en': '',
                'model_number': '',
                'brand': '',
                'color': '',
                'release_price': None,
                'image_url': None,
                'source_url': product_url,
            }

            # 1. JSON-LD 스키마에서 정보 추출 (가장 정확함)
            json_ld_script = soup.find("script", {"type": "application/ld+json", "id": "Product"})
            if json_ld_script:
                try:
                    json_data = json.loads(json_ld_script.string)
                    logger.info(f"JSON-LD 데이터 발견: {json_data.get('name')}")

                    # 영문 상품명
                    if json_data.get("name"):
                        product_data["product_name_en"] = json_data["name"]

                    # 브랜드
                    if json_data.get("brand") and json_data["brand"].get("name"):
                        product_data["brand"] = json_data["brand"]["name"]

                    # 모델번호 (SKU)
                    if json_data.get("sku"):
                        product_data["model_number"] = json_data["sku"]

                    # 이미지 URL
                    if json_data.get("image") and len(json_data["image"]) > 0:
                        product_data["image_url"] = json_data["image"][0]

                    # 가격 (현재가 - 발매가 아님, 일단 보류)
                    # if json_data.get("offers") and json_data["offers"].get("price"):
                    #     try:
                    #         product_data["release_price"] = int(json_data["offers"]["price"])
                    #     except:
                    #         pass

                    # description에서 한글 상품명 추출
                    if json_data.get("description"):
                        desc = json_data["description"]
                        parts = desc.split(" ")
                        korean_parts = [p for p in parts if any("가" <= c <= "힣" for c in p)]
                        if korean_parts and len(korean_parts) > 1:
                            product_data["product_name_ko"] = " ".join(korean_parts[:10]).split("상품을")[0].strip()

                    # 색상 추출 (영문 상품명에서)
                    if json_data.get("name"):
                        product_data["color"] = self._extract_color_from_name(json_data["name"])
                except Exception as e:
                    logger.error(f"JSON-LD 파싱 실패: {e}")

            # 4. Meta 태그에서 정보 보완
            if not product_data["product_name_ko"]:
                title_tag = soup.find("title")
                if title_tag:
                    title_text = title_tag.get_text()
                    if "|" in title_text:
                        product_data["product_name_ko"] = title_text.split("|")[0].strip()
            
            if not product_data["model_number"]:
                keywords_meta = soup.find("meta", {"name": "keywords"})
                if keywords_meta and keywords_meta.get("content"):
                    keywords = keywords_meta["content"]
                    if "," in keywords:
                        first_keyword = keywords.split(",")[0].strip()
                        if re.match(r"^[A-Z0-9\-]+$", first_keyword):
                            product_data["model_number"] = first_keyword
            
            if not product_data["brand"]:
                brand_meta = soup.find("meta", {"name": "product:brand"})
                if brand_meta and brand_meta.get("content"):
                    product_data["brand"] = brand_meta["content"]


            # 디버그: 추출된 데이터 로깅
            logger.info(f"[DEBUG] 추출된 상품 정보 (ID: {product_id}):")
            for key, value in product_data.items():
                if value:
                    logger.info(f"  - {key}: {value}")
            
            if not product_data.get('product_name_ko') and not product_data.get('brand'):
                logger.warning(f"⚠️ 상품 정보가 비어있음 (ID: {product_id}). HTML 파일 확인 필요.")
            else:
                logger.info(f"✅ 상품 정보 추출: {product_data.get('product_name_ko') or product_data.get('brand')} (ID: {product_id})")
            
            return product_data

        except Exception as e:
            logger.error(f"❌ 상품 정보 추출 실패 (ID: {product_id}): {e}")
            return None

    def _extract_color_from_name(self, name: str) -> str:
        """상품명에서 색상 추출"""
        # 일반적인 신발 색상 패턴
        color_patterns = [
            r'\b(Black|White|Red|Blue|Green|Yellow|Orange|Purple|Pink|Brown|Grey|Gray|Navy|Beige|Cream|Tan|Olive|Maroon)\b',
            r'\b(블랙|화이트|레드|블루|그린|옐로우|오렌지|퍼플|핑크|브라운|그레이|네이비|베이지|크림|탄|올리브|마룬)\b',
        ]

        colors = []
        for pattern in color_patterns:
            matches = re.findall(pattern, name, re.IGNORECASE)
            colors.extend(matches)

        return " ".join(colors) if colors else ""

    async def download_image(self, image_url: str, brand_name: str, model_number: str) -> str:
        """
        이미지 다운로드 및 로컬 저장

        Args:
            image_url: 다운로드할 이미지 URL
            brand_name: 브랜드명 (폴더명으로 사용)
            model_number: 모델번호 (파일명으로 사용)

        Returns:
            저장된 파일 경로 (상대 경로)
        """
        try:
            # 기본 경로 설정
            base_path = Path("/app/uploads/products")
            brand_folder = base_path / brand_name.replace(" ", "_")
            brand_folder.mkdir(parents=True, exist_ok=True)

            # 파일명: 모델번호.png
            filename = f"{model_number.replace('/', '_')}.png"
            file_path = brand_folder / filename

            # 이미 파일이 존재하면 스킵
            if file_path.exists():
                logger.info(f"✅ 이미지 이미 존재: {file_path}")
                return f"uploads/products/{brand_name.replace(' ', '_')}/{filename}"

            # 이미지 다운로드
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()

                # 파일 저장
                with open(file_path, 'wb') as f:
                    f.write(response.content)

                logger.info(f"✅ 이미지 다운로드 완료: {file_path}")
                return f"uploads/products/{brand_name.replace(' ', '_')}/{filename}"

        except Exception as e:
            logger.error(f"❌ 이미지 다운로드 실패: {e}")
            return image_url  # 실패 시 원본 URL 반환

    async def close(self):
        """브라우저 종료"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        logger.info("브라우저 종료 완료")
