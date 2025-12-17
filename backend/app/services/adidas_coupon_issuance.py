"""
아디다스 쿠폰 발급 (웹 크롤링 - Playwright)
"""
import asyncio
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


async def issue_coupon(email: str, password: str, coupon_amount: str = "100000") -> dict:
    """
    아디다스 쿠폰 발급

    Args:
        email: 아디다스 계정 이메일
        password: 아디다스 계정 비밀번호
        coupon_amount: 쿠폰 금액 (10000, 30000, 50000, 100000)

    Returns:
        dict: {"success": bool, "message": str}
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()

        try:
            print(f"[쿠폰발급] 시작: {email}, {coupon_amount}원")

            # 1. 로그인 페이지 접속
            print("[1단계] 로그인 페이지 접속")
            await page.goto('https://www.adidas.co.kr/account-login', wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # 이메일 입력
            await page.fill('input[type="email"]', email)
            await asyncio.sleep(0.5)

            # 비밀번호 입력
            await page.fill('input[type="password"]', password)
            await asyncio.sleep(0.5)

            # 로그인 버튼 클릭
            await page.click('button[type="submit"]')
            await asyncio.sleep(3)

            # 로그인 실패 체크
            current_url = page.url
            if 'account-login' in current_url:
                return {"success": False, "message": "로그인 실패 (계정 정보 확인 필요)"}

            print("[1단계] 로그인 성공")

            # 2. 쿠폰 발급 페이지 접속
            print("[2단계] 쿠폰 발급 페이지 접속")
            await page.goto('https://www.adidas.co.kr/voucher-exchange', wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # 100,000원 쿠폰 버튼 찾기 및 클릭
            print(f"[2단계] {coupon_amount}원 쿠폰 버튼 클릭")
            try:
                # 포인트 금액으로 쿠폰 버튼 찾기
                coupon_button = page.locator(f'text="{int(coupon_amount):,}원"').first
                await coupon_button.click()
                await asyncio.sleep(2)
            except Exception as e:
                print(f"[2단계] 쿠폰 버튼 클릭 실패: {e}")
                return {"success": False, "message": f"{coupon_amount}원 쿠폰을 찾을 수 없습니다"}

            # 3. 상품권 교환하기 버튼 클릭
            print("[3단계] 상품권 교환하기 버튼 클릭")
            try:
                exchange_button = page.locator('text="상품권 교환하기"').first
                await exchange_button.click()
                await asyncio.sleep(2)
            except Exception as e:
                print(f"[3단계] 상품권 교환하기 버튼 클릭 실패: {e}")
                return {"success": False, "message": "상품권 교환하기 버튼을 찾을 수 없습니다"}

            # 4. 상품권 교환 확정하기 버튼 클릭
            print("[4단계] 상품권 교환 확정하기 버튼 클릭")
            try:
                confirm_button = page.locator('text="상품권 교환 확정하기"').first
                await confirm_button.click()
                await asyncio.sleep(2)
            except Exception as e:
                print(f"[4단계] 상품권 교환 확정하기 버튼 클릭 실패: {e}")
                return {"success": False, "message": "상품권 교환 확정하기 버튼을 찾을 수 없습니다"}

            # 5. 완료 팝업 닫기
            print("[5단계] 완료 팝업 닫기")
            try:
                # X 버튼이나 닫기 버튼 찾기
                close_selectors = [
                    'button[aria-label="닫기"]',
                    'button[aria-label="close"]',
                    'button.close',
                    '[class*="close"]'
                ]

                closed = False
                for selector in close_selectors:
                    try:
                        close_button = page.locator(selector).first
                        await close_button.click(timeout=2000)
                        closed = True
                        break
                    except:
                        continue

                if not closed:
                    print("[5단계] 닫기 버튼을 찾을 수 없음 (자동 닫힘일 수 있음)")

                await asyncio.sleep(1)
            except Exception as e:
                print(f"[5단계] 팝업 닫기 실패: {e}")

            print("[5단계] 쿠폰 발급 완료")

            # 6. 로그아웃
            print("[6단계] 로그아웃")
            try:
                await page.goto('https://www.adidas.co.kr/my-account/profile', wait_until='networkidle', timeout=30000)
                await asyncio.sleep(1)

                logout_button = page.locator('text="로그아웃"').first
                await logout_button.click()
                await asyncio.sleep(1)
                print("[6단계] 로그아웃 완료")
            except Exception as e:
                print(f"[6단계] 로그아웃 실패: {e}")

            return {"success": True, "message": f"{coupon_amount}원 쿠폰이 발급되었습니다"}

        except PlaywrightTimeoutError as e:
            print(f"[ERROR] 타임아웃: {e}")
            return {"success": False, "message": "페이지 로딩 시간 초과"}
        except Exception as e:
            print(f"[ERROR] 예외 발생: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "message": f"쿠폰 발급 실패: {str(e)}"}
        finally:
            await browser.close()


def issue_coupon_sync(email: str, password: str, coupon_amount: str = "100000") -> dict:
    """동기 함수 래퍼"""
    return asyncio.run(issue_coupon(email, password, coupon_amount))


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3:
        email = sys.argv[1]
        password = sys.argv[2]
        amount = sys.argv[3] if len(sys.argv) >= 4 else "100000"
    else:
        email = "test@example.com"
        password = "password"
        amount = "100000"

    result = issue_coupon_sync(email, password, amount)
    print(f"\n결과: {result}")
