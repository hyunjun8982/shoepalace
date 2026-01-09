"""
Adidas 웹 로그인 후 브라우저 유지 (쿠폰 발급 API 테스트용)
- 로그인 완료 후 브라우저가 종료되지 않음
- 수동으로 쿠폰 발급 API 테스트 가능

사용법:
    python test_uc_browser_keep.py <email> <password>
"""
import sys
import time

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("필수 라이브러리가 설치되지 않았습니다.")
    print("설치 명령어: pip install undetected-chromedriver selenium")
    sys.exit(1)


def login_and_keep_browser(email: str, password: str):
    """
    로그인 후 브라우저를 유지 (종료하지 않음)
    """
    print("=" * 60)
    print("Adidas 로그인 후 브라우저 유지")
    print("=" * 60)
    print(f"이메일: {email}")
    print()

    # Chrome 옵션 설정
    options = uc.ChromeOptions()
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--lang=ko-KR')
    options.add_argument('--disable-blink-features=AutomationControlled')

    # undetected-chromedriver 시작
    print("[1/6] 브라우저 시작 중...")
    driver = uc.Chrome(options=options, use_subprocess=True)
    driver.implicitly_wait(10)
    print("  완료")

    print("[2/6] 로그인 페이지 이동 중...")
    driver.get("https://www.adidas.co.kr/account-login")

    # 페이지 로드 대기
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
    )
    print("  완료")

    # 쿠키 동의 처리
    print("[2.5/6] 쿠키 동의 팝업 확인 중...")
    driver.implicitly_wait(0)

    cookie_consent_selectors = [
        '#glass-gdpr-default-consent-accept-button',
        'button[data-auto-id="consent-modal-accept-btn"]',
        '#onetrust-accept-btn-handler',
    ]

    for selector in cookie_consent_selectors:
        try:
            consent_btn = driver.find_element(By.CSS_SELECTOR, selector)
            if consent_btn.is_displayed():
                consent_btn.click()
                print(f"  쿠키 동의 클릭 완료")
                try:
                    WebDriverWait(driver, 1).until(
                        EC.invisibility_of_element(consent_btn)
                    )
                except:
                    pass
                break
        except NoSuchElementException:
            continue

    driver.implicitly_wait(10)

    # 이메일 입력
    print("[3/6] 이메일 입력 중...")
    email_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
    )
    email_input.clear()
    email_input.send_keys(email)
    print("  완료")

    # 비밀번호 입력
    print("[4/6] 비밀번호 입력 중...")
    password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
    password_input.clear()
    password_input.send_keys(password)
    print("  완료")

    # 로그인 버튼 클릭
    print("[5/6] 로그인 버튼 클릭...")
    login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
    login_btn.click()
    print("  완료")

    # 토큰 쿠키 대기
    print("[6/6] 로그인 결과 대기 중...")
    access_token = None
    refresh_token = None
    start = time.time()
    max_wait = 15

    while time.time() - start < max_wait:
        cookies = driver.get_cookies()
        for cookie in cookies:
            if cookie['name'] == 'account.grant.accessToken':
                access_token = cookie['value']
            elif cookie['name'] == 'account.grant.refreshToken':
                refresh_token = cookie['value']

        if access_token:
            print("  토큰 발견!")
            break

        try:
            WebDriverWait(driver, 0.3).until(lambda d: False)
        except:
            pass

    if access_token:
        print("\n" + "=" * 60)
        print("로그인 성공!")
        print("=" * 60)
        print(f"\nAccess Token: {access_token[:80]}...")

        # 토큰 저장
        with open("adidas_token.txt", "w") as f:
            f.write(f"access_token={access_token}\n")
            if refresh_token:
                f.write(f"refresh_token={refresh_token}\n")
        print("토큰이 adidas_token.txt에 저장되었습니다.")

        print("\n" + "=" * 60)
        print("브라우저가 유지됩니다.")
        print("개발자 도구(F12)에서 Network 탭을 열고 쿠폰 발급을 테스트하세요.")
        print("종료하려면 브라우저를 닫거나 Ctrl+C를 누르세요.")
        print("=" * 60)

        # 브라우저 유지 (사용자가 종료할 때까지)
        try:
            while True:
                time.sleep(1)
                # 브라우저가 닫혔는지 확인
                try:
                    _ = driver.current_url
                except:
                    print("\n브라우저가 닫혔습니다.")
                    break
        except KeyboardInterrupt:
            print("\n\n사용자에 의해 종료됨")
            driver.quit()

        return access_token
    else:
        print("\n로그인 실패!")
        driver.quit()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용법: python test_uc_browser_keep.py <email> <password>")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    login_and_keep_browser(email, password)
