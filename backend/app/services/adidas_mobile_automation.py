"""
Adidas 모바일 웹 자동화 서비스
Playwright를 사용하여 Chrome mobile emulation으로 Adidas 모바일 웹사이트에 접근
"""
import asyncio
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
import logging

logger = logging.getLogger(__name__)


class AdidasMobileAutomation:
    """Adidas 모바일 웹 자동화 클래스"""

    # 모바일 디바이스 설정 (iPhone 12 Pro)
    MOBILE_DEVICE = {
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1",
        "viewport": {"width": 390, "height": 844},
        "device_scale_factor": 3,
        "is_mobile": True,
        "has_touch": True,
    }

    def __init__(self, headless: bool = True):
        """
        Args:
            headless: 헤드리스 모드로 실행할지 여부
        """
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None

    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        await self.close()

    async def start(self):
        """브라우저 시작"""
        try:
            self.playwright = await async_playwright().start()

            # Chromium 브라우저 시작
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )

            # 모바일 디바이스 컨텍스트 생성
            self.context = await self.browser.new_context(
                **self.MOBILE_DEVICE,
                locale='ko-KR',
                timezone_id='Asia/Seoul',
            )

            # 자동화 탐지 우회
            await self.context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            """)

            # 새 페이지 생성
            self.page = await self.context.new_page()

            logger.info("모바일 브라우저 시작 완료")

        except Exception as e:
            logger.error(f"브라우저 시작 실패: {e}")
            await self.close()
            raise

    async def close(self):
        """브라우저 종료"""
        try:
            if self.page:
                await self.page.close()
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            logger.info("브라우저 종료 완료")
        except Exception as e:
            logger.error(f"브라우저 종료 중 오류: {e}")

    async def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Adidas 모바일 웹사이트에 로그인

        Args:
            email: 이메일
            password: 비밀번호

        Returns:
            로그인 결과 딕셔너리
        """
        try:
            if not self.page:
                raise RuntimeError("브라우저가 시작되지 않았습니다")

            # Adidas 사이트로 이동 (모바일 에뮬레이션으로 접근)
            logger.info("Adidas 로그인 페이지 접속 중...")
            await self.page.goto('https://www.adidas.co.kr/account-login',
                                wait_until='networkidle',
                                timeout=30000)

            # 페이지 스크린샷 (디버깅용)
            await self.page.screenshot(path='/tmp/adidas_login_page.png')

            # 로그인 폼 찾기 (실제 선택자는 사이트 분석 후 수정 필요)
            logger.info("로그인 폼 입력 중...")

            # 이메일 입력
            email_input = await self.page.wait_for_selector('input[name="login_id"]', timeout=10000)
            await email_input.fill(email)

            # 비밀번호 입력
            password_input = await self.page.wait_for_selector('input[name="login_pw"]', timeout=10000)
            await password_input.fill(password)

            # 로그인 버튼 클릭
            login_button = await self.page.wait_for_selector('button[type="submit"], input[type="submit"]', timeout=10000)
            await login_button.click()

            # 로그인 완료 대기 (메인 페이지로 이동 또는 오류 메시지 확인)
            await asyncio.sleep(3)

            # 현재 URL 확인
            current_url = self.page.url

            # 로그인 실패 메시지 확인
            error_element = await self.page.query_selector('.error-message, .alert-danger, .login-error')
            if error_element:
                error_text = await error_element.inner_text()
                logger.error(f"로그인 실패: {error_text}")
                return {
                    "success": False,
                    "error": error_text,
                    "url": current_url
                }

            # 로그인 성공 확인 (URL이 변경되었거나 사용자 정보가 보이는지)
            if 'Login.action' not in current_url:
                logger.info("로그인 성공")

                # 쿠키 추출
                cookies = await self.context.cookies()

                return {
                    "success": True,
                    "url": current_url,
                    "cookies": cookies
                }
            else:
                logger.warning("로그인 상태 불확실")
                return {
                    "success": False,
                    "error": "로그인 상태를 확인할 수 없습니다",
                    "url": current_url
                }

        except Exception as e:
            logger.error(f"로그인 중 오류 발생: {e}")
            # 오류 발생 시 스크린샷
            try:
                await self.page.screenshot(path='/tmp/adidas_login_error.png')
            except:
                pass
            return {
                "success": False,
                "error": str(e)
            }

    async def get_user_info(self) -> Dict[str, Any]:
        """
        사용자 정보 추출 (마이페이지 접근)

        Returns:
            사용자 정보 딕셔너리
        """
        try:
            if not self.page:
                raise RuntimeError("브라우저가 시작되지 않았습니다")

            # 마이페이지로 이동
            logger.info("마이페이지 접속 중...")
            await self.page.goto('https://m.adidas.co.kr/MO/Mypage/MyInfo.action',
                                wait_until='networkidle',
                                timeout=30000)

            # 페이지 스크린샷
            await self.page.screenshot(path='/tmp/adidas_mypage.png')

            # 사용자 정보 추출 (실제 선택자는 사이트 분석 후 수정 필요)
            user_info = {}

            # 이름
            name_element = await self.page.query_selector('.user-name, .member-name')
            if name_element:
                user_info['name'] = await name_element.inner_text()

            # 이메일
            email_element = await self.page.query_selector('.user-email, .member-email')
            if email_element:
                user_info['email'] = await email_element.inner_text()

            # 전화번호
            phone_element = await self.page.query_selector('.user-phone, .member-phone')
            if phone_element:
                user_info['phone'] = await phone_element.inner_text()

            # 생년월일
            birthday_element = await self.page.query_selector('.user-birthday, .member-birthday')
            if birthday_element:
                user_info['birthday'] = await birthday_element.inner_text()

            logger.info(f"사용자 정보 추출 완료: {user_info}")
            return {
                "success": True,
                "data": user_info
            }

        except Exception as e:
            logger.error(f"사용자 정보 추출 중 오류: {e}")
            try:
                await self.page.screenshot(path='/tmp/adidas_userinfo_error.png')
            except:
                pass
            return {
                "success": False,
                "error": str(e)
            }

    async def get_coupons(self) -> Dict[str, Any]:
        """
        사용 가능한 쿠폰 목록 조회

        Returns:
            쿠폰 목록 딕셔너리
        """
        try:
            if not self.page:
                raise RuntimeError("브라우저가 시작되지 않았습니다")

            # 쿠폰 페이지로 이동
            logger.info("쿠폰 페이지 접속 중...")
            await self.page.goto('https://m.adidas.co.kr/MO/Mypage/MyCoupon.action',
                                wait_until='networkidle',
                                timeout=30000)

            # 페이지 스크린샷
            await self.page.screenshot(path='/tmp/adidas_coupons.png')

            # 쿠폰 목록 추출 (실제 선택자는 사이트 분석 후 수정 필요)
            coupon_elements = await self.page.query_selector_all('.coupon-item, .coupon-list li')

            coupons = []
            for element in coupon_elements:
                coupon = {}

                # 쿠폰 이름
                name_el = await element.query_selector('.coupon-name, .coupon-title')
                if name_el:
                    coupon['name'] = await name_el.inner_text()

                # 할인 금액/비율
                discount_el = await element.query_selector('.coupon-discount, .discount-amount')
                if discount_el:
                    coupon['discount'] = await discount_el.inner_text()

                # 유효기간
                expiry_el = await element.query_selector('.coupon-expiry, .valid-period')
                if expiry_el:
                    coupon['expiry'] = await expiry_el.inner_text()

                if coupon:
                    coupons.append(coupon)

            logger.info(f"쿠폰 {len(coupons)}개 추출 완료")
            return {
                "success": True,
                "count": len(coupons),
                "coupons": coupons
            }

        except Exception as e:
            logger.error(f"쿠폰 조회 중 오류: {e}")
            try:
                await self.page.screenshot(path='/tmp/adidas_coupons_error.png')
            except:
                pass
            return {
                "success": False,
                "error": str(e)
            }


# 사용 예시
async def test_automation():
    """테스트 함수"""
    async with AdidasMobileAutomation(headless=False) as automation:
        # 로그인
        result = await automation.login("test@example.com", "password123")
        print(f"로그인 결과: {result}")

        if result.get("success"):
            # 사용자 정보 조회
            user_info = await automation.get_user_info()
            print(f"사용자 정보: {user_info}")

            # 쿠폰 조회
            coupons = await automation.get_coupons()
            print(f"쿠폰 정보: {coupons}")


if __name__ == "__main__":
    # 테스트 실행
    asyncio.run(test_automation())
