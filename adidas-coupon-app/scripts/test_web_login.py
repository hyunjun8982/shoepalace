"""
웹브라우저 로그인 테스트 스크립트
- 로그인 성공/실패 여부 확인
- access token 발급 여부 확인

사용법:
    python test_web_login.py <email> <password> [--mobile]

    --mobile: 모바일 User-Agent로 위장하여 테스트
"""
import sys
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException

# 모바일 User-Agent (아디다스 앱 WebView와 유사)
MOBILE_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 "
    "Mobile Safari/537.36"
)


def test_login(email: str, password: str, use_mobile: bool = False):
    """웹브라우저 로그인 테스트 (extract_hybrid.py와 동일한 로직)"""
    driver = None

    try:
        print("=" * 60)
        print("웹브라우저 로그인 테스트")
        if use_mobile:
            print(">>> 모바일 User-Agent 모드 <<<")
        print("=" * 60)
        print(f"계정: {email}")
        print()

        # Chrome 옵션
        options = uc.ChromeOptions()
        options.add_argument('--incognito')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')

        # 모바일 모드 설정
        if use_mobile:
            options.add_argument(f'--user-agent={MOBILE_USER_AGENT}')
            print(f"[UA] {MOBILE_USER_AGENT[:60]}...")

        print("[1] 브라우저 시작...")
        # version_main 제거 - 자동 감지
        driver = uc.Chrome(options=options)

        # 모바일/데스크톱 화면 크기 설정
        if use_mobile:
            # 모바일 화면 크기 (Galaxy S23 Ultra)
            driver.set_window_size(412, 915)
        else:
            driver.set_window_size(1200, 800)

        driver.implicitly_wait(10)

        # 로그인 페이지 이동 (extract_hybrid.py와 동일)
        print("[2] 로그인 페이지 이동...")
        try:
            driver.get('https://www.adidas.co.kr/account-login')
        except Exception as e:
            print(f"  페이지 이동 실패, 재시도: {e}")
            time.sleep(1)
            driver.get('https://www.adidas.co.kr/account-login')

        # 페이지 로드 대기 (이메일 입력창이 나타날 때까지)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        print("  완료")

        # 쿠키 동의 버튼 처리 (extract_hybrid.py와 동일)
        print("[2-1] 쿠키 동의 팝업 확인...")
        driver.implicitly_wait(0)

        cookie_consent_selectors = [
            '#glass-gdpr-default-consent-accept-button',
            'button[data-auto-id="consent-modal-accept-btn"]',
            '#onetrust-accept-btn-handler',
        ]

        cookie_clicked = False
        for selector in cookie_consent_selectors:
            try:
                consent_btn = driver.find_element(By.CSS_SELECTOR, selector)
                if consent_btn.is_displayed():
                    consent_btn.click()
                    print(f"  쿠키 동의 클릭: {selector}")
                    cookie_clicked = True
                    time.sleep(1)
                    break
            except NoSuchElementException:
                continue

        if not cookie_clicked:
            print("  쿠키 동의 팝업 없음 (이미 처리됨)")

        driver.implicitly_wait(10)

        # 이메일 입력 (extract_hybrid.py와 동일한 셀렉터)
        print("[3] 이메일 입력...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.clear()
        email_input.send_keys(email)
        print("  완료")

        # 비밀번호 입력 (extract_hybrid.py와 동일한 셀렉터)
        print("[4] 비밀번호 입력...")
        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.clear()
        password_input.send_keys(password)
        print("  완료")

        # 로그인 전 쿠키 확인
        print("\n[로그인 전 쿠키]")
        cookies_before = driver.get_cookies()
        token_before = None
        for c in cookies_before:
            if 'token' in c['name'].lower() or 'access' in c['name'].lower():
                print(f"  - {c['name']}: {c['value'][:50]}...")
                if c['name'] == 'account.grant.accessToken':
                    token_before = c['value']
        if not token_before:
            print("  (access token 없음)")

        # 로그인 버튼 클릭
        print("\n[5] 로그인 버튼 클릭...")
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()

        # 결과 대기 (최대 15초)
        print("[6] 로그인 결과 대기...")
        start_time = time.time()
        login_success = False
        login_error = None
        access_token = None

        while time.time() - start_time < 15:
            time.sleep(1)
            elapsed = int(time.time() - start_time)

            # 쿠키에서 토큰 확인
            cookies = driver.get_cookies()
            for c in cookies:
                if c['name'] == 'account.grant.accessToken':
                    access_token = c['value']
                    break

            if access_token:
                login_success = True
                print(f"  ({elapsed}초) 토큰 발견!")
                break

            # 에러 메시지 확인
            page_source = driver.page_source.lower()
            if 'invalid email or password' in page_source or '이메일 또는 비밀번호가 잘못' in page_source:
                login_error = "비밀번호 오류"
                print(f"  ({elapsed}초) 로그인 실패 감지: {login_error}")
                break

            # 페이지 전환 확인 (마이페이지로 이동)
            current_url = driver.current_url
            if 'my-account' in current_url or 'account-dashboard' in current_url:
                print(f"  ({elapsed}초) 마이페이지 전환 감지")
                # 다시 쿠키 확인
                cookies = driver.get_cookies()
                for c in cookies:
                    if c['name'] == 'account.grant.accessToken':
                        access_token = c['value']
                        login_success = True
                        break
                if login_success:
                    break

            print(f"  ({elapsed}초) 대기 중... URL: {current_url[:50]}")

        # 결과 출력
        print("\n" + "=" * 60)
        print("테스트 결과")
        print("=" * 60)

        print(f"\n[로그인 성공 여부] {'✓ 성공' if login_success else '✗ 실패'}")

        if login_error:
            print(f"[에러 메시지] {login_error}")

        print(f"\n[Access Token 발급 여부] {'✓ 발급됨' if access_token else '✗ 없음'}")

        if access_token:
            print(f"  토큰 길이: {len(access_token)} 문자")
            print(f"  토큰 시작: {access_token[:50]}...")
            print(f"  토큰 끝: ...{access_token[-30:]}")

        # 모든 쿠키 출력
        print("\n[현재 모든 쿠키]")
        cookies = driver.get_cookies()
        for c in cookies:
            name = c['name']
            value = c['value']
            if len(value) > 50:
                value = value[:50] + "..."
            print(f"  - {name}: {value}")

        print("\n" + "=" * 60)

        # 잠시 대기 (브라우저 확인용)
        print("\n브라우저를 5초 후 종료합니다...")
        time.sleep(5)

        return {
            'success': login_success,
            'error': login_error,
            'has_token': access_token is not None,
            'token': access_token
        }

    except Exception as e:
        print(f"\n[ERROR] 테스트 중 오류: {e}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e), 'has_token': False}

    finally:
        if driver:
            driver.quit()
            print("\n[브라우저 종료]")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용법: python test_web_login.py <email> <password> [--mobile]")
        print()
        print("옵션:")
        print("  --mobile  모바일 User-Agent로 위장하여 테스트")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    use_mobile = '--mobile' in sys.argv

    result = test_login(email, password, use_mobile=use_mobile)

    print("\n[최종 결과]")
    print(f"  모드: {'모바일' if use_mobile else '데스크톱'}")
    print(f"  로그인 성공: {result['success']}")
    print(f"  토큰 발급: {result['has_token']}")
    if result['error']:
        print(f"  에러: {result['error']}")
