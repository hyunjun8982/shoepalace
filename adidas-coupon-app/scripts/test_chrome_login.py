"""
모바일 Chrome 브라우저로 아디다스 로그인 테스트
- 아디다스 앱 없이 직접 로그인 URL 접속
- 로그인 후 쿠키에서 토큰 추출
"""
import sys
import os
import time
import argparse
import requests

# ANDROID_HOME 환경변수 설정
if not os.environ.get('ANDROID_HOME'):
    if os.path.exists('C:\\platform-tools\\adb.exe'):
        os.environ['ANDROID_HOME'] = 'C:\\platform-tools'
        os.environ['ANDROID_SDK_ROOT'] = 'C:\\platform-tools'

try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("Appium 라이브러리가 설치되지 않았습니다.")
    print("설치: pip install Appium-Python-Client")
    sys.exit(1)


# 아디다스 로그인 URL (모바일 앱에서 사용하는 것과 동일)
ADIDAS_LOGIN_URL = "https://account-frontends.adidas.com/account-portal-universal?redirect_uri=https%3A%2F%2Fwww.adidas.co.kr%2Fmy-account&client_id=293FC0ECC43A4F5804C07A4ABC2FC833&response_type=code&scope=openid"

# 또는 한국 웹사이트 로그인 페이지
ADIDAS_KR_LOGIN_URL = "https://www.adidas.co.kr/account-login"


def get_connected_device():
    """연결된 Android 디바이스 UDID 가져오기"""
    import subprocess
    import sys
    try:
        # Windows에서 콘솔 창 숨기기
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True, timeout=10, creationflags=creationflags)
        lines = result.stdout.strip().split('\n')[1:]
        for line in lines:
            if '\tdevice' in line:
                return line.split('\t')[0]
    except Exception as e:
        print(f"ADB 오류: {e}")
    return None


def test_api_with_token(access_token: str):
    """토큰으로 API 테스트"""
    print("\n" + "=" * 60)
    print("Adidas API 테스트")
    print("=" * 60)

    headers = {
        'accept': '*/*',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
    }
    cookies = {'account.grant.accessToken': access_token}

    # 프로필
    print("\n[1/4] 프로필 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/profile', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            print(f"  이름: {profile.get('firstName', 'N/A')}")
            print(f"  이메일: {profile.get('email', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 바코드
    print("\n[2/4] 바코드 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            print(f"  바코드: {resp.json().get('memberId', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 포인트
    print("\n[3/4] 포인트 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            print(f"  포인트: {resp.json().get('availablePoints', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 쿠폰
    print("\n[4/4] 쿠폰 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  쿠폰 수: {len(data)}개")
                for v in data:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    print(f"    - {name}: {code}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")


def mobile_chrome_login(email: str, password: str, device_udid: str = None):
    """
    모바일 Chrome 브라우저로 아디다스 로그인
    """
    if not device_udid:
        device_udid = get_connected_device()
    if not device_udid:
        print("연결된 디바이스가 없습니다.")
        return None

    print(f"디바이스: {device_udid}")

    driver = None
    try:
        # Chrome 브라우저 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.udid = device_udid
        options.device_name = device_udid

        # Chrome 브라우저 사용
        options.browser_name = 'Chrome'
        options.set_capability('appium:chromedriverAutodownload', True)

        options.no_reset = True
        options.new_command_timeout = 300

        print("\n[1/5] Appium 연결 (Chrome 브라우저)...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("  Appium 연결 성공")

        # [2] 아디다스 로그인 페이지 접속
        print("\n[2/5] 아디다스 로그인 페이지 접속...")
        driver.get(ADIDAS_KR_LOGIN_URL)
        time.sleep(3)

        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # 쿠키 동의 팝업 처리
        print("\n  쿠키 동의 팝업 확인...")
        cookie_popup_selectors = [
            # 일반적인 쿠키 동의 버튼
            'button[id*="accept"]',
            'button[id*="consent"]',
            'button[class*="accept"]',
            'button[class*="consent"]',
            '#onetrust-accept-btn-handler',  # OneTrust (많이 사용됨)
            '.onetrust-accept-btn-handler',
            'button[aria-label*="동의"]',
            'button[aria-label*="Accept"]',
            'button[aria-label*="accept"]',
            # 아디다스 특정
            'button[data-auto-id="cookie-consent-accept"]',
            'button[data-testid="cookie-consent-accept"]',
            '#gl-modal__content button',
            '.gl-modal button',
            # 텍스트 기반
            '//button[contains(text(), "동의")]',
            '//button[contains(text(), "수락")]',
            '//button[contains(text(), "Accept")]',
            '//button[contains(text(), "모두 수락")]',
            '//button[contains(text(), "모두 동의")]',
        ]

        for selector in cookie_popup_selectors:
            try:
                if selector.startswith('//'):
                    # XPath
                    btn = driver.find_element(By.XPATH, selector)
                else:
                    # CSS
                    btn = driver.find_element(By.CSS_SELECTOR, selector)

                if btn and btn.is_displayed():
                    btn.click()
                    print(f"  쿠키 동의 버튼 클릭: {selector}")
                    time.sleep(1)
                    break
            except:
                continue

        # [3] 로그인 폼 입력
        print("\n[3/5] 로그인 폼 입력...")

        # 이메일 필드 찾기
        email_input = None
        email_selectors = [
            'input[name="email"]',
            'input[type="email"]',
            '#login\\.email\\.input',
            'input[id*="email"]',
            'input[placeholder*="이메일"]',
        ]

        for selector in email_selectors:
            try:
                email_input = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                if email_input:
                    print(f"  이메일 필드 발견: {selector}")
                    break
            except:
                continue

        if not email_input:
            print("  이메일 필드를 찾을 수 없습니다")
            # 페이지 소스 저장 (디버깅)
            with open('chrome_page_source.html', 'w', encoding='utf-8') as f:
                f.write(driver.page_source)
            print("  페이지 소스 저장: chrome_page_source.html")
            return None

        email_input.clear()
        email_input.send_keys(email)
        print(f"  이메일 입력 완료")
        time.sleep(0.5)

        # 비밀번호 필드 찾기
        password_input = None
        password_selectors = [
            'input[name="password"]',
            'input[type="password"]',
            '#login\\.password\\.input',
            'input[id*="password"]',
        ]

        for selector in password_selectors:
            try:
                password_input = driver.find_element(By.CSS_SELECTOR, selector)
                if password_input:
                    print(f"  비밀번호 필드 발견: {selector}")
                    break
            except:
                continue

        if not password_input:
            print("  비밀번호 필드를 찾을 수 없습니다")
            return None

        password_input.clear()
        password_input.send_keys(password)
        print(f"  비밀번호 입력 완료")
        time.sleep(0.5)

        # 로그인 버튼 클릭
        login_btn = None
        login_selectors = [
            'button[type="submit"]',
            '#login-submit-button',
            'button[data-auto-id="login-submit-button"]',
        ]

        for selector in login_selectors:
            try:
                login_btn = driver.find_element(By.CSS_SELECTOR, selector)
                if login_btn:
                    print(f"  로그인 버튼 발견: {selector}")
                    break
            except:
                continue

        if login_btn:
            login_btn.click()
            print("  로그인 버튼 클릭")
        else:
            print("  로그인 버튼을 찾을 수 없습니다")
            return None

        # [4] 로그인 완료 대기 및 토큰 추출
        print("\n[4/5] 토큰 추출 대기...")
        access_token = None
        start_time = time.time()
        max_wait = 15  # 초기 대기 시간 줄임

        # 먼저 로그인 결과 확인 (에러 메시지 체크)
        time.sleep(3)

        # 에러 메시지 확인
        error_selectors = [
            '.gl-form-hint--error',
            '[data-auto-id="login-error"]',
            '.error-message',
            '//div[contains(@class, "error")]',
            '//span[contains(@class, "error")]',
        ]

        for selector in error_selectors:
            try:
                if selector.startswith('//'):
                    error_elem = driver.find_element(By.XPATH, selector)
                else:
                    error_elem = driver.find_element(By.CSS_SELECTOR, selector)
                if error_elem and error_elem.is_displayed():
                    error_text = error_elem.text
                    if error_text:
                        print(f"  ⚠️ 로그인 에러 메시지: {error_text}")
            except:
                continue

        # URL 변화 확인
        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # 로그인 페이지에 그대로 있으면 실패로 간주
        if 'account-login' in current_url:
            print("  URL이 변경되지 않음 - 로그인 실패 가능성")

            # 페이지 소스에서 에러 확인
            page_source = driver.page_source
            if '비밀번호가 올바르지' in page_source or 'incorrect' in page_source.lower():
                print("  ⚠️ 비밀번호 오류 감지")
            elif '이메일 주소를 확인' in page_source or 'email' in page_source.lower() and 'invalid' in page_source.lower():
                print("  ⚠️ 이메일 오류 감지")

            # 스크린샷 저장
            try:
                driver.save_screenshot('login_result.png')
                print("  스크린샷 저장: login_result.png")
            except:
                pass

        # 쿠키에서 토큰 찾기
        while time.time() - start_time < max_wait:
            try:
                cookies = driver.get_cookies()
                elapsed = int(time.time() - start_time)

                for cookie in cookies:
                    if cookie.get('name') == 'account.grant.accessToken':
                        access_token = cookie.get('value')
                        print(f"  토큰 발견!")
                        break

                if access_token:
                    break

            except Exception as e:
                print(f"  쿠키 조회 오류: {e}")
                break

            time.sleep(1)

        # 토큰이 없으면 localStorage 확인
        if not access_token:
            print("\n  쿠키에 토큰 없음 - localStorage 확인...")
            try:
                # localStorage에서 토큰 관련 항목 확인
                local_storage_script = """
                var items = {};
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth') || key.toLowerCase().includes('grant')) {
                        items[key] = localStorage.getItem(key);
                    }
                }
                return JSON.stringify(items);
                """
                ls_data = driver.execute_script(local_storage_script)
                if ls_data and ls_data != '{}':
                    print(f"  localStorage 토큰 관련 데이터: {ls_data[:200]}...")

                    import json
                    ls_items = json.loads(ls_data)
                    for key, value in ls_items.items():
                        if 'accessToken' in key or 'access_token' in key:
                            access_token = value
                            print(f"  localStorage에서 토큰 발견: {key}")
                            break
            except Exception as e:
                print(f"  localStorage 조회 실패: {e}")

        # 토큰이 없으면 마이페이지로 이동해서 다시 시도
        if not access_token:
            print("\n  마이페이지로 이동하여 토큰 확인...")
            try:
                driver.get("https://www.adidas.co.kr/my-account")
                time.sleep(5)

                current_url = driver.current_url
                print(f"  마이페이지 URL: {current_url}")

                # 로그인 페이지로 리다이렉트되면 로그인 실패
                if 'account-login' in current_url or 'login' in current_url:
                    print("  ⚠️ 마이페이지 접속 실패 - 로그인되지 않음")
                else:
                    # 쿠키 다시 확인
                    cookies = driver.get_cookies()
                    for cookie in cookies:
                        if cookie.get('name') == 'account.grant.accessToken':
                            access_token = cookie.get('value')
                            print(f"  마이페이지에서 토큰 발견!")
                            break
            except Exception as e:
                print(f"  마이페이지 이동 실패: {e}")

        # [5] 결과
        print("\n[5/5] 결과")
        if access_token:
            print("=" * 60)
            print("토큰 획득 성공!")
            print("=" * 60)
            print(f"Access Token: {access_token[:50]}...")

            # API 테스트
            test_api_with_token(access_token)
            return access_token
        else:
            print("토큰을 찾지 못했습니다")

            # 현재 쿠키 전체 출력
            print("\n현재 쿠키:")
            cookies = driver.get_cookies()
            for c in cookies:
                print(f"  {c.get('name')}: {c.get('value', '')[:30]}...")

            return None

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        if driver:
            driver.quit()
            print("\nAppium 세션 종료")


def main():
    parser = argparse.ArgumentParser(description='모바일 Chrome으로 아디다스 로그인 테스트')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--device', '-d', help='디바이스 UDID')

    args = parser.parse_args()

    print("=" * 60)
    print("모바일 Chrome 아디다스 로그인 테스트")
    print("=" * 60)

    if not args.email or not args.password:
        print("\n사용법:")
        print("  python test_chrome_login.py <email> <password>")
        return

    print(f"\n이메일: {args.email}")

    mobile_chrome_login(args.email, args.password, args.device)


if __name__ == "__main__":
    main()
