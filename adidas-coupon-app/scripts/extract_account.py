"""
Adidas 모바일 앱 로그인 및 정보 추출
- Appium으로 네이티브 앱에서 직접 로그인
- 토큰 추출 후 API로 계정 정보 조회

사용법:
    단일 계정: python extract_account.py <email> <password>
    배치 모드: python extract_account.py --batch accounts.json

배치 모드 JSON 형식:
    [{"email": "test@test.com", "password": "1234", "id": 1}, ...]
"""
import sys
import os
import time
import argparse
import requests
import json
from typing import Optional, Dict, Any, List

# ANDROID_HOME 환경변수 설정
if os.environ.get('ANDROID_HOME'):
    os.environ['ANDROID_HOME'] = os.environ['ANDROID_HOME'].strip()
if os.environ.get('ANDROID_SDK_ROOT'):
    os.environ['ANDROID_SDK_ROOT'] = os.environ['ANDROID_SDK_ROOT'].strip()

if not os.environ.get('ANDROID_HOME') and not os.environ.get('ANDROID_SDK_ROOT'):
    if os.path.exists('C:\\platform-tools\\adb.exe'):
        os.environ['ANDROID_HOME'] = 'C:\\platform-tools'
        os.environ['ANDROID_SDK_ROOT'] = 'C:\\platform-tools'
        os.environ['PATH'] = 'C:\\platform-tools;' + os.environ.get('PATH', '')

try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options
    from appium.webdriver.common.appiumby import AppiumBy
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.by import By
    APPIUM_AVAILABLE = True
except ImportError:
    APPIUM_AVAILABLE = False
    print("Appium 라이브러리가 설치되지 않았습니다.")
    print("설치: pip install Appium-Python-Client")


def get_connected_device():
    """연결된 Android 디바이스 UDID 가져오기"""
    import subprocess
    import sys
    try:
        # Windows에서 콘솔 창 숨기기
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(
            ['adb', 'devices'],
            capture_output=True, text=True, timeout=10,
            creationflags=creationflags
        )
        lines = result.stdout.strip().split('\n')[1:]
        for line in lines:
            if '\tdevice' in line:
                return line.split('\t')[0]
    except Exception as e:
        print(f"ADB 오류: {e}")
    return None


def clear_webview_cookies(driver) -> bool:
    """
    웹뷰 쿠키만 삭제 (로그아웃 실패 시 사용)
    - 앱 데이터는 유지하고 로그인 토큰만 삭제
    """
    try:
        print("  웹뷰 쿠키 삭제 중...")

        # 웹뷰 컨텍스트로 전환하여 쿠키 삭제
        contexts = driver.contexts
        webview_contexts = [ctx for ctx in contexts if 'WEBVIEW' in ctx and 'Terrace' not in ctx]

        cookies_deleted = False
        for ctx in webview_contexts:
            try:
                driver.switch_to.context(ctx)
                driver.delete_all_cookies()
                print(f"  {ctx} 쿠키 삭제 완료")
                cookies_deleted = True
            except Exception as e:
                print(f"  {ctx} 쿠키 삭제 실패: {e}")

        # 네이티브로 복귀
        driver.switch_to.context('NATIVE_APP')

        if cookies_deleted:
            print("  웹뷰 쿠키 삭제 완료")
            return True
        else:
            print("  삭제할 웹뷰가 없음")
            return False

    except Exception as e:
        print(f"  웹뷰 쿠키 삭제 오류: {e}")
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return False


def test_api_with_token(access_token: str) -> Dict[str, Any]:
    """Access Token으로 API 호출 테스트"""
    print("\n" + "=" * 60)
    print("Adidas API 테스트")
    print("=" * 60)

    headers = {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }
    cookies = {'account.grant.accessToken': access_token}
    results = {}

    # 1. 프로필
    print("\n[1/4] 프로필 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/profile',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            results['profile'] = profile
            print(f"  이름: {profile.get('firstName', 'N/A')}")
            print(f"  이메일: {profile.get('email', 'N/A')}")
            print(f"  생일: {profile.get('dateOfBirth', 'N/A')}")
            print(f"  전화번호: {profile.get('mobileNumber', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 2. 바코드
    print("\n[2/4] 바코드 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/memberid',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['member'] = data
            print(f"  바코드: {data.get('memberId', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 3. 포인트
    print("\n[3/4] 포인트 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/wallet',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['wallet'] = data
            print(f"  포인트: {data.get('availablePoints', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 4. 쿠폰
    print("\n[4/4] 쿠폰 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['vouchers'] = data
            if isinstance(data, list):
                print(f"  쿠폰 수: {len(data)}개")
                for v in data:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    expire = v.get('available', {}).get('to', 'N/A')
                    if expire != 'N/A':
                        expire = expire[:10]
                    print(f"    - {name}: {code} (만료: {expire})")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    return results


def check_and_handle_error_screen(driver) -> bool:
    """
    아디다스 앱의 에러 화면 감지 및 처리
    - generic_error_icon, generic_error_title_text 등으로 에러 화면 감지
    - "다시 시도하세요" 버튼 클릭하여 복구

    Returns: True if error was detected and handled, False otherwise
    """
    try:
        page_source = driver.page_source

        # 에러 화면 감지 (resource-id 또는 텍스트로)
        error_indicators = [
            'generic_error_icon',
            'generic_error_title_text',
            'generic_error_description_text',
            'generic_error_button',
        ]

        is_error_screen = any(indicator in page_source for indicator in error_indicators)

        if not is_error_screen:
            # 텍스트로도 확인
            if '오류가 발생했습니다' in page_source and '다시 시도' in page_source:
                is_error_screen = True

        if is_error_screen:
            print("\n[ERROR] BOT_BLOCKED:앱에서 오류 화면 감지됨 (계정 차단 의심)")
            print("  - 오류가 발생했습니다")
            print("  - 죄송합니다. 요청 처리 과정에서 문제가 발생했습니다.")

            # "다시 시도하세요" 버튼 클릭하여 로그인 웹뷰로 복구
            retry_clicked = False

            # 1순위: resource-id로 찾기
            try:
                retry_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='generic_error_button']")
                retry_btn.click()
                print("  '다시 시도하세요' 버튼 클릭 (resource-id)")
                retry_clicked = True
            except:
                pass

            # 2순위: 텍스트로 찾기
            if not retry_clicked:
                try:
                    retry_btn = driver.find_element(AppiumBy.XPATH, "//*[@text='다시 시도하세요']")
                    retry_btn.click()
                    print("  '다시 시도하세요' 버튼 클릭 (text)")
                    retry_clicked = True
                except:
                    pass

            # 3순위: contains로 찾기
            if not retry_clicked:
                try:
                    retry_btn = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '다시 시도')]")
                    retry_btn.click()
                    print("  '다시 시도' 버튼 클릭 (contains)")
                    retry_clicked = True
                except:
                    pass

            if retry_clicked:
                time.sleep(2)  # 웹뷰 로딩 대기
                print("  로그인 웹뷰로 복구됨")

            return True

        return False

    except Exception as e:
        print(f"  에러 화면 체크 중 예외: {e}")
        return False


def login_with_driver(driver, email: str, password: str, is_batch_continuation: bool = False) -> tuple:
    """
    웹뷰 컨텍스트에서 로그인하여 토큰 추출
    Args:
        driver: Appium 드라이버
        email: 이메일
        password: 비밀번호
        is_batch_continuation: 배치 모드에서 첫 번째 계정 이후인지 여부 (True면 대기 시간 최소화)
    Returns: (success: bool, token: Optional[str])
    """
    try:
        print("=" * 60)
        print("Adidas 로그인 (웹뷰 방식)")
        print("=" * 60)
        print(f"계정: {email}")
        if is_batch_continuation:
            print("  [배치 모드] 빠른 처리 활성화\n")
        else:
            print()

        # [0단계] 배치 모드에서 이전 계정 쿠키 삭제 (중요!)
        if is_batch_continuation:
            print("[0단계] 이전 계정 쿠키 삭제")
            clear_webview_cookies(driver)

        # [1단계] 딥링크로 로그인 화면 직접 이동
        print("[1단계] 로그인 화면 이동 (딥링크)")
        driver.execute_script("mobile: deepLink", {
            "url": "adidas://login",
            "package": "com.adidas.app"
        })
        print("  adidas://login 딥링크 실행")
        time.sleep(1.5)  # 로그인 화면 로드 대기

        # 에러 화면 체크 (계정 차단 등으로 인한 오류 화면)
        if check_and_handle_error_screen(driver):
            # 에러 화면이 감지되면 실패 반환 (다시 시도 버튼은 이미 클릭됨)
            return (False, None)

        # [2단계] 웹뷰 컨텍스트로 전환 (아디다스 앱 내 웹뷰)
        print("\n[2단계] 웹뷰 컨텍스트 전환")

        time.sleep(1)  # 웹뷰 로딩 대기 (2초에서 1초로 단축)

        adidas_webview = None
        start_wait = time.time()
        max_wait = 10  # 최대 10초로 단축 (15초에서)

        while time.time() - start_wait < max_wait:
            contexts = driver.contexts
            webview_contexts = [ctx for ctx in contexts if 'WEBVIEW' in ctx and 'Terrace' not in ctx]

            if webview_contexts:
                print(f"  사용 가능한 웹뷰: {webview_contexts}")

            # 각 웹뷰를 순회하면서 아디다스 URL을 가진 것 찾기
            for ctx in webview_contexts:
                try:
                    driver.switch_to.context(ctx)
                    url = driver.current_url
                    print(f"  {ctx} URL: {url}")

                    if 'adidas' in url.lower():
                        adidas_webview = ctx
                        print(f"  아디다스 웹뷰 발견: {ctx}")
                        break
                    else:
                        # 아디다스가 아니면 네이티브로 복귀
                        driver.switch_to.context('NATIVE_APP')
                except Exception as e:
                    print(f"  {ctx} 접근 오류: {e}")
                    try:
                        driver.switch_to.context('NATIVE_APP')
                    except:
                        pass

            if adidas_webview:
                elapsed = time.time() - start_wait
                print(f"  아디다스 웹뷰 확정: {adidas_webview} ({elapsed:.1f}초)")
                break

            time.sleep(0.3)  # 0.3초마다 확인 (0.5초에서 단축)

        if not adidas_webview:
            print("  아디다스 웹뷰를 찾을 수 없습니다")
            # 네이티브 방식으로 폴백
            driver.switch_to.context('NATIVE_APP')
            return login_native_fallback(driver, email, password)

        # 이미 아디다스 웹뷰로 전환된 상태

        # [3단계] 웹뷰에서 로그인
        print("\n[3단계] 웹뷰에서 로그인")
        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # ★ 중요: 로그인 전 기존 토큰 쿠키 삭제 (이전 계정 토큰 제거)
        try:
            old_cookies = driver.get_cookies()
            token_cookies_to_delete = ['account.grant.accessToken', 'account.grant.refreshToken']
            deleted_any = False
            for cookie in old_cookies:
                if cookie.get('name') in token_cookies_to_delete:
                    driver.delete_cookie(cookie.get('name'))
                    print(f"  기존 토큰 쿠키 삭제: {cookie.get('name')}")
                    deleted_any = True
            if deleted_any:
                print(f"  이전 계정 토큰 삭제 완료 (새 로그인 준비)")
        except Exception as e:
            print(f"  토큰 쿠키 삭제 실패 (무시): {e}")

        # 이메일 입력 - 우선순위가 높은 셀렉터를 먼저 시도 (최적화)
        email_input = None
        # 가장 흔한 셀렉터를 먼저 시도
        email_selectors_priority = [
            'input[name="email"]',
            'input[type="email"]',
            '#login\\.email\\.input',
        ]
        # 대체 셀렉터
        email_selectors_fallback = [
            'input[id*="email"]',
            'input[data-auto-id="login-email-input"]',
            '#email',
        ]

        start_find = time.time()
        max_find_wait = 5  # 최대 5초로 단축

        while time.time() - start_find < max_find_wait:
            # 먼저 우선순위 높은 셀렉터 시도
            for selector in email_selectors_priority:
                try:
                    email_input = driver.find_element(By.CSS_SELECTOR, selector)
                    if email_input and email_input.is_displayed():
                        elapsed = time.time() - start_find
                        print(f"  이메일 필드 발견: {selector} ({elapsed:.1f}초)")
                        break
                except:
                    continue

            if email_input:
                break

            # 우선순위 셀렉터로 못 찾으면 대체 셀렉터 시도
            for selector in email_selectors_fallback:
                try:
                    email_input = driver.find_element(By.CSS_SELECTOR, selector)
                    if email_input and email_input.is_displayed():
                        elapsed = time.time() - start_find
                        print(f"  이메일 필드 발견 (대체): {selector} ({elapsed:.1f}초)")
                        break
                except:
                    continue

            if email_input:
                break

            time.sleep(0.2)  # 0.2초마다 확인 (0.3초에서 단축)

        if email_input:
            try:
                email_input.clear()
                email_input.send_keys(email)
                print(f"  이메일 입력 완료")
            except Exception as e:
                print(f"  이메일 입력 실패: {e}")
                driver.switch_to.context('NATIVE_APP')
                return (False, None)
        else:
            print(f"  이메일 필드 찾기 실패 - 모든 셀렉터 시도 완료")
            # 쿠키 확인
            cookies = driver.get_cookies()
            print(f"  현재 쿠키 수: {len(cookies)}")
            for cookie in cookies:
                if cookie.get('name') == 'account.grant.accessToken':
                    print("  토큰 발견!")
                    driver.switch_to.context('NATIVE_APP')
                    return (True, cookie['value'])

            # 페이지 소스 전체 저장 (디버깅용)
            try:
                debug_html = driver.page_source
                with open('debug_webview_page.html', 'w', encoding='utf-8') as f:
                    f.write(debug_html)
                print("  디버깅용 HTML 저장: debug_webview_page.html")
            except:
                pass

            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # 비밀번호 입력 - 최적화된 셀렉터 순서
        password_input = None
        # 가장 흔한 셀렉터를 먼저 시도
        password_selectors = [
            'input[type="password"]',
            'input[name="password"]',
            '#login\\.password\\.input',
            'input[id*="password"]',
        ]

        for selector in password_selectors:
            try:
                password_input = driver.find_element(By.CSS_SELECTOR, selector)
                if password_input and password_input.is_displayed():
                    print(f"  비밀번호 필드 발견: {selector}")
                    break
                password_input = None
            except:
                continue

        if password_input:
            try:
                password_input.clear()
                password_input.send_keys(password)
                print(f"  비밀번호 입력 완료")
            except Exception as e:
                print(f"  비밀번호 입력 실패: {e}")
                driver.switch_to.context('NATIVE_APP')
                return (False, None)
        else:
            print(f"  비밀번호 필드 찾기 실패")
            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # 로그인 버튼 클릭 - 최적화된 셀렉터 순서
        login_btn = None
        # 가장 흔한 셀렉터를 먼저 시도
        login_selectors = [
            'button[type="submit"]',
            '#login-submit-button',
            'input[type="submit"]',
        ]

        for selector in login_selectors:
            try:
                login_btn = driver.find_element(By.CSS_SELECTOR, selector)
                if login_btn and login_btn.is_displayed():
                    print(f"  로그인 버튼 발견: {selector}")
                    break
                login_btn = None
            except:
                continue

        # CSS selector로 못 찾으면 XPath로 시도
        if not login_btn:
            xpath_selectors = [
                '//button[@type="submit"]',
                '//button[contains(text(), "로그인")]',
            ]
            for xpath in xpath_selectors:
                try:
                    login_btn = driver.find_element(By.XPATH, xpath)
                    if login_btn and login_btn.is_displayed():
                        print(f"  로그인 버튼 발견 (XPath): {xpath}")
                        break
                    login_btn = None
                except:
                    continue

        if login_btn:
            try:
                login_btn.click()
                print(f"  로그인 버튼 클릭")
            except Exception as e:
                print(f"  로그인 버튼 클릭 실패: {e}")
                driver.switch_to.context('NATIVE_APP')
                return (False, None)
        else:
            print(f"  로그인 버튼 찾기 실패")
            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # [4단계] 토큰 추출 대기
        print("\n[4단계] 토큰 추출 대기")
        access_token = None
        start_time = time.time()
        max_wait = 20

        while time.time() - start_time < max_wait:
            try:
                cookies = driver.get_cookies()

                # cookies가 None이면 스킵
                if cookies is None:
                    time.sleep(0.5)
                    continue

                # 디버깅: 쿠키 목록 출력 (5초마다)
                elapsed = int(time.time() - start_time)
                if elapsed % 5 == 0:
                    cookie_names = [c.get('name', '') for c in cookies]
                    print(f"  쿠키 ({len(cookies)}개): {cookie_names[:10]}...")

                for cookie in cookies:
                    if cookie.get('name') == 'account.grant.accessToken':
                        access_token = cookie.get('value')
                        print(f"  토큰 획득 성공!")
                        break

                if access_token:
                    # 토큰 획득 성공 직후, 웹뷰에서 토큰 쿠키 삭제 (다음 계정에 영향 방지)
                    try:
                        token_cookies = ['account.grant.accessToken', 'account.grant.refreshToken']
                        for token_name in token_cookies:
                            driver.delete_cookie(token_name)
                        print(f"  웹뷰 토큰 쿠키 삭제 완료")
                    except Exception as e:
                        print(f"  토큰 쿠키 삭제 실패 (무시): {e}")
                    break

                # 에러 메시지 확인 (웹뷰) - 실제 로그인 에러만 감지
                try:
                    page_source = driver.page_source
                    # 더 구체적인 에러 패턴만 체크 (일반적인 '실패' 단어는 제외)
                    login_error_patterns = [
                        'Invalid email or password',
                        'incorrect password',
                        '잘못된 이메일 또는 비밀번호',
                        '이메일 또는 비밀번호가 잘못',
                        'login failed',
                        'authentication failed',
                    ]
                    if any(err.lower() in page_source.lower() for err in login_error_patterns):
                        print("  로그인 실패 감지 (비밀번호 오류)")
                        print("[ERROR] PASSWORD_WRONG")
                        break
                except:
                    pass

                # 네이티브 에러 화면 확인 (계정 차단 등)
                try:
                    driver.switch_to.context('NATIVE_APP')
                    if check_and_handle_error_screen(driver):
                        # 에러 화면 감지됨 - 다시 시도 버튼은 이미 클릭됨
                        return (False, None)
                    # 다시 웹뷰로 복귀
                    contexts = driver.contexts
                    if contexts:
                        for ctx in contexts:
                            if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                                driver.switch_to.context(ctx)
                                break
                except:
                    pass

            except Exception as e:
                print(f"  쿠키 조회 오류: {e}")
                break

            time.sleep(0.5)
            if int(time.time() - start_time) % 3 == 0:
                print(f"  대기 중... ({int(time.time() - start_time)}초)")

        # 네이티브로 복귀
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass

        if access_token:
            print("  로그인 성공!")
            return (True, access_token)
        else:
            print("  토큰 획득 실패")
            return (False, None)

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return (False, None)


def login_native_fallback(driver, email: str, password: str) -> tuple:
    """
    웹뷰 전환 실패 시 네이티브 방식으로 로그인 (토큰 없이)
    """
    print("\n[폴백] 네이티브 방식으로 로그인 시도")

    try:
        # 이메일 입력
        email_entered = False
        for xpath in [
            "//android.widget.EditText[@resource-id='login.email.input']",
            "//android.webkit.WebView//android.widget.EditText[@resource-id='login.email.input']",
            "(//android.webkit.WebView//android.widget.EditText)[1]"
        ]:
            try:
                email_field = driver.find_element(AppiumBy.XPATH, xpath)
                email_field.clear()
                email_field.send_keys(email)
                print(f"  이메일 입력 완료")
                email_entered = True
                break
            except:
                pass

        if not email_entered:
            return (False, None)

        time.sleep(0.5)

        # 비밀번호 입력
        password_entered = False
        for xpath in [
            "//android.widget.EditText[@resource-id='login.password.input']",
            "//android.webkit.WebView//android.widget.EditText[@resource-id='login.password.input']",
            "(//android.webkit.WebView//android.widget.EditText)[2]"
        ]:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH, xpath)
                pwd_field.clear()
                pwd_field.send_keys(password)
                print(f"  비밀번호 입력 완료")
                password_entered = True
                break
            except:
                pass

        if not password_entered:
            return (False, None)

        time.sleep(0.5)

        # 로그인 버튼 클릭
        submit_clicked = False
        for xpath in [
            "//android.widget.Button[@resource-id='login-submit-button']",
            "//android.widget.Button[@text='로그인하기']",
            "//android.widget.Button[@text='LOG IN']"
        ]:
            try:
                submit_btn = driver.find_element(AppiumBy.XPATH, xpath)
                submit_btn.click()
                print(f"  로그인 버튼 클릭")
                submit_clicked = True
                break
            except:
                pass

        if not submit_clicked:
            return (False, None)

        # 결과 대기
        time.sleep(5)
        page_source = driver.page_source

        if any(err in page_source for err in ['잘못된', 'Invalid', '실패']):
            return (False, None)

        # 로그인 성공 (토큰 없음)
        return (True, None)

    except Exception as e:
        print(f"  폴백 로그인 오류: {e}")
        return (False, None)


def get_token_from_webview(driver, max_wait: int = 20) -> Optional[str]:
    """
    웹뷰에서 토큰 쿠키 추출
    로그인 후 프로필/계정 페이지로 이동하여 웹뷰에서 토큰 확인
    """
    print("\n[토큰 추출] 웹뷰 쿠키에서 토큰 확인...")

    access_token = None
    start_time = time.time()

    try:
        # 먼저 프로필/계정 화면으로 이동 (웹뷰가 로드되도록)
        print("  프로필 화면으로 이동 시도...")

        # 프로필 탭 클릭 시도
        profile_selectors = [
            '//android.widget.ImageView[@content-desc="프로필" or @content-desc="Profile" or @content-desc="계정"]',
            '//android.view.View[@content-desc="프로필" or @content-desc="Profile"]',
            '//android.widget.TextView[@text="프로필" or @text="Profile"]',
            '//*[contains(@content-desc, "profile") or contains(@content-desc, "Profile")]',
            '//*[@content-desc="프로필"]',
        ]

        for selector in profile_selectors:
            try:
                elem = driver.find_element(AppiumBy.XPATH, selector)
                elem.click()
                print(f"  프로필 탭 클릭: {selector}")
                time.sleep(3)
                break
            except:
                continue

        # 토큰 추출 대기 루프 (최대 max_wait 초)
        while time.time() - start_time < max_wait:
            contexts = driver.contexts
            print(f"  사용 가능한 컨텍스트: {contexts}")

            # WEBVIEW_chrome 또는 다른 WEBVIEW 시도
            for ctx in contexts:
                if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                    print(f"  {ctx} 컨텍스트 전환 시도...")
                    try:
                        driver.switch_to.context(ctx)
                        print(f"  {ctx} 전환 성공, 쿠키 조회 중...")

                        # 쿠키 조회
                        cookies = driver.get_cookies()
                        print(f"  쿠키 {len(cookies)}개 발견")

                        # 디버깅: 쿠키 이름 출력
                        cookie_names = [c.get('name', '') for c in cookies]
                        token_related = [n for n in cookie_names if 'token' in n.lower() or 'account' in n.lower() or 'auth' in n.lower()]
                        if token_related:
                            print(f"  토큰 관련 쿠키: {token_related}")

                        for cookie in cookies:
                            if cookie.get('name') == 'account.grant.accessToken':
                                access_token = cookie.get('value')
                                print(f"  토큰 발견!")
                                driver.switch_to.context('NATIVE_APP')
                                return access_token

                        driver.switch_to.context('NATIVE_APP')

                    except Exception as e:
                        print(f"  {ctx} 접근 오류: {e}")
                        try:
                            driver.switch_to.context('NATIVE_APP')
                        except:
                            pass

            # 토큰이 없으면 잠시 대기 후 재시도
            if not access_token:
                time.sleep(2)
                print(f"  토큰 대기 중... ({int(time.time() - start_time)}초)")

    except Exception as e:
        print(f"  토큰 추출 오류: {e}")

    # NATIVE_APP로 복귀 확인
    try:
        driver.switch_to.context('NATIVE_APP')
    except:
        pass

    print("  토큰을 찾지 못함")
    return None


def logout_with_driver(driver) -> bool:
    """로그아웃 (딥링크 사용)"""
    try:
        window_size = driver.get_window_size()
        width = window_size['width']
        height = window_size['height']

        print("\n[로그아웃] 시작")

        # 딥링크로 프로필 화면 직접 이동
        driver.execute_script("mobile: deepLink", {
            "url": "adidas://profile",
            "package": "com.adidas.app"
        })
        print("  adidas://profile 딥링크 실행")
        time.sleep(1)

        # 하단으로 스크롤하여 로그아웃 찾기
        for i in range(5):
            driver.swipe(width // 2, int(height * 0.8), width // 2, int(height * 0.2), 400)
            time.sleep(0.3)
            page_source = driver.page_source
            if '로그아웃' in page_source or 'LOGOUT' in page_source:
                break

        # 로그아웃 버튼 클릭
        logout_clicked = False
        for text in ['로그아웃', 'LOGOUT', 'Log out']:
            try:
                logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                logout_btn.click()
                print(f"  로그아웃 버튼 클릭 ({text})")
                logout_clicked = True
                time.sleep(0.5)
                break
            except:
                pass

        if not logout_clicked:
            for desc in ['로그아웃', 'logout', 'LOGOUT']:
                try:
                    logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    logout_btn.click()
                    print(f"  로그아웃 버튼 클릭 (content-desc: {desc})")
                    logout_clicked = True
                    time.sleep(0.5)
                    break
                except:
                    pass

        if not logout_clicked:
            print("  [WARNING] 로그아웃 버튼 미발견")
            return False

        # 확인 팝업 처리
        time.sleep(0.5)
        for text in ['로그아웃', 'LOG OUT', '확인', 'Yes', 'OK']:
            try:
                confirm_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                confirm_btn.click()
                print(f"  확인 버튼 클릭 ({text})")
                break
            except:
                pass

        # 로그아웃 처리 완료 대기 (중요: 다음 계정 로그인 전 필수)
        time.sleep(1.5)
        print("[OK] 로그아웃 완료")
        return True

    except Exception as e:
        print(f"  로그아웃 오류: {e}")
        return False


def mobile_login_and_extract(email: str, password: str, device_udid: str = None) -> Optional[str]:
    """
    모바일 앱에서 로그인 후 토큰 추출
    """
    if not APPIUM_AVAILABLE:
        print("Appium이 설치되지 않았습니다.")
        return None

    if not device_udid:
        device_udid = get_connected_device()
    if not device_udid:
        print("연결된 디바이스가 없습니다.")
        return None

    print(f"디바이스: {device_udid}")

    driver = None
    try:
        # Appium 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.udid = device_udid
        options.device_name = device_udid
        options.app_package = 'com.adidas.app'
        options.no_reset = True
        options.new_command_timeout = 300

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)

        # ADB 타임아웃 증가 (기본 20초 → 60초)
        options.set_capability('appium:adbExecTimeout', 60000)

        # 웹뷰 디버깅을 위한 크롬드라이버 자동 다운로드
        options.set_capability('appium:chromedriverAutodownload', True)

        print("\n[1/6] Appium 연결 중...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("  Appium 연결 성공")

        # 앱 실행
        print("\n[2/6] 아디다스 앱 실행...")
        driver.activate_app('com.adidas.app')
        time.sleep(3)

        # 로그인 (토큰도 함께 추출 시도)
        login_success, access_token = login_with_driver(driver, email, password)

        if not login_success:
            print("\n로그인 실패!")
            # 로그인 실패해도 로그아웃 시도 (다음 계정 처리를 위해)
            try:
                logout_with_driver(driver)
            except:
                pass
            return None

        # 로그인 중 토큰을 못 가져왔으면 추가 시도
        if not access_token:
            print("\n[추가 토큰 추출] 프로필 화면에서 재시도...")
            access_token = get_token_from_webview(driver)

        if access_token:
            print(f"\n토큰 획득 성공!")
        else:
            print("\n토큰을 찾지 못했지만 로그인은 성공")
            access_token = "LOGIN_SUCCESS_NO_TOKEN"

        # 로그아웃 시도
        logout_success = logout_with_driver(driver)

        # 로그아웃 실패 시 웹뷰 쿠키만 삭제 (다음 계정에 영향 방지)
        if not logout_success:
            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
            clear_webview_cookies(driver)

        return access_token

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        # 오류 발생 시에도 로그아웃 시도 (다음 계정 처리를 위해)
        if driver:
            print("\n[경고] 오류 발생 - 로그아웃 시도...")
            try:
                logout_with_driver(driver)
            except:
                pass
            # 로그아웃 실패 시 쿠키 삭제
            try:
                clear_webview_cookies(driver)
            except:
                pass
        return None

    finally:
        if driver:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            driver.quit()
            print("\nAppium 세션 종료")


def process_single_account_with_driver(driver, email: str, password: str, is_batch_continuation: bool = False) -> Dict[str, Any]:
    """
    기존 Appium 드라이버를 사용하여 단일 계정 처리 (배치 모드용)
    드라이버 생성/종료를 하지 않고 로그인/추출/로그아웃만 수행

    Args:
        driver: Appium 드라이버
        email: 이메일
        password: 비밀번호
        is_batch_continuation: 배치에서 첫 번째 계정 이후인지 여부 (True면 대기 최소화)

    Returns: { success, token, api_result, error }
    """
    result = {
        'email': email,
        'success': False,
        'token': None,
        'api_result': None,
        'error': None
    }

    try:
        # 앱 실행 확인 및 활성화
        print(f"\n{'='*60}")
        print(f"계정 처리: {email}")
        print('='*60)

        current_pkg = driver.current_package
        if current_pkg != "com.adidas.app":
            driver.activate_app("com.adidas.app")
            time.sleep(2)

        # 로그인 (토큰도 함께 추출 시도)
        # 배치 연속 모드에서는 대기 시간 최소화
        login_success, access_token = login_with_driver(driver, email, password, is_batch_continuation)

        if not login_success:
            result['error'] = 'LOGIN_FAILED'
            print(f"\n로그인 실패: {email}")
            return result

        # 로그인 중 토큰을 못 가져왔으면 추가 시도
        if not access_token:
            print("\n[추가 토큰 추출] 프로필 화면에서 재시도...")
            access_token = get_token_from_webview(driver)

        if access_token and access_token != "LOGIN_SUCCESS_NO_TOKEN":
            result['token'] = access_token
            result['success'] = True
            print(f"\n토큰 획득 성공: {email}")

            # API 테스트
            api_result = test_api_with_token(access_token)
            result['api_result'] = api_result
        elif access_token == "LOGIN_SUCCESS_NO_TOKEN":
            result['success'] = True
            result['error'] = 'NO_TOKEN'
            print(f"\n로그인 성공 (토큰 미추출): {email}")
        else:
            result['error'] = 'TOKEN_FAILED'
            print(f"\n토큰 획득 실패: {email}")

        # 로그아웃 시도
        logout_success = logout_with_driver(driver)

        # 로그아웃 실패 시 웹뷰 쿠키만 삭제 (다음 계정에 영향 방지)
        if not logout_success:
            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
            clear_webview_cookies(driver)

        # 계정 간 짧은 대기 (안정성)
        time.sleep(1)

        return result

    except Exception as e:
        print(f"\n계정 처리 오류 ({email}): {e}")
        import traceback
        traceback.print_exc()
        result['error'] = str(e)

        # 오류 발생 시에도 웹뷰 쿠키 삭제 시도
        try:
            clear_webview_cookies(driver)
        except:
            pass

        return result


def mobile_batch_extract(accounts: List[Dict], device_udid: str = None) -> List[Dict]:
    """
    배치 모드: 여러 계정을 하나의 Appium 세션으로 처리

    Args:
        accounts: [{"email": "...", "password": "...", "id": ...}, ...]
        device_udid: 디바이스 UDID (생략시 자동 감지)

    Returns:
        [{"id": ..., "email": ..., "success": ..., "api_result": ..., "error": ...}, ...]
    """
    if not APPIUM_AVAILABLE:
        print("[ERROR] Appium이 설치되지 않았습니다.")
        return [{'id': acc.get('id'), 'email': acc.get('email'), 'success': False, 'error': 'APPIUM_NOT_AVAILABLE'} for acc in accounts]

    if not device_udid:
        device_udid = get_connected_device()
    if not device_udid:
        print("[ERROR] 연결된 디바이스가 없습니다.")
        return [{'id': acc.get('id'), 'email': acc.get('email'), 'success': False, 'error': 'NO_DEVICE'} for acc in accounts]

    print(f"\n{'='*60}")
    print(f"배치 모드 시작 - {len(accounts)}개 계정")
    print(f"디바이스: {device_udid}")
    print('='*60)

    results = []
    driver = None

    try:
        # Appium 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.udid = device_udid
        options.device_name = device_udid
        options.app_package = 'com.adidas.app'
        options.no_reset = True
        options.new_command_timeout = 600  # 배치 처리를 위해 타임아웃 증가

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)
        options.set_capability('appium:adbExecTimeout', 60000)
        options.set_capability('appium:chromedriverAutodownload', True)

        print("\n[Appium] 연결 중...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("[Appium] 연결 성공 (세션 1회)")

        # 앱 실행
        driver.activate_app('com.adidas.app')
        time.sleep(2)

        # 각 계정 순차 처리
        for i, account in enumerate(accounts):
            email = account.get('email')
            password = account.get('password')
            acc_id = account.get('id')

            print(f"\n[{i+1}/{len(accounts)}] 처리 중: {email}")

            # 단일 계정 처리 (첫 번째 계정 이후에는 배치 연속 모드로 대기 시간 최소화)
            is_continuation = (i > 0)
            account_result = process_single_account_with_driver(driver, email, password, is_continuation)
            account_result['id'] = acc_id

            # 결과 출력 (server.js에서 파싱용)
            print(f"\n[BATCH_RESULT] {json.dumps(account_result, ensure_ascii=False)}")

            results.append(account_result)

            # 다음 계정 전 대기 (로그아웃 후 화면 안정화) - 0.5초로 단축
            if i < len(accounts) - 1:
                print(f"\n다음 계정 준비 중... (0.5초 대기)")
                time.sleep(0.5)

        print(f"\n{'='*60}")
        print(f"배치 처리 완료 - 성공: {sum(1 for r in results if r['success'])}/{len(results)}")
        print('='*60)

        return results

    except Exception as e:
        print(f"\n[ERROR] 배치 처리 오류: {e}")
        import traceback
        traceback.print_exc()

        # 처리되지 않은 계정들은 에러로 마킹
        processed_ids = {r['id'] for r in results}
        for acc in accounts:
            if acc.get('id') not in processed_ids:
                results.append({
                    'id': acc.get('id'),
                    'email': acc.get('email'),
                    'success': False,
                    'error': f'BATCH_ERROR: {str(e)}'
                })

        return results

    finally:
        if driver:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            driver.quit()
            print("\n[Appium] 세션 종료")


def main():
    parser = argparse.ArgumentParser(description='Adidas 모바일 로그인 및 정보 추출')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--device', '-d', help='디바이스 UDID (생략시 자동 감지)')
    parser.add_argument('--batch', '-b', help='배치 모드: JSON 파일 경로 또는 JSON 문자열')

    args = parser.parse_args()

    print("=" * 60)
    print("Adidas 모바일 로그인 테스트")
    print("=" * 60)

    # 배치 모드
    if args.batch:
        print("\n[배치 모드] 활성화")

        # JSON 파일 또는 JSON 문자열 파싱
        accounts = []
        try:
            # 파일인지 확인
            if os.path.exists(args.batch):
                print(f"  JSON 파일: {args.batch}")
                with open(args.batch, 'r', encoding='utf-8') as f:
                    accounts = json.load(f)
            else:
                # JSON 문자열로 해석
                print("  JSON 문자열 파싱")
                accounts = json.loads(args.batch)
        except Exception as e:
            print(f"\n[ERROR] JSON 파싱 실패: {e}")
            return

        if not accounts:
            print("\n[ERROR] 처리할 계정이 없습니다.")
            return

        print(f"  계정 수: {len(accounts)}개")

        # 배치 처리 실행
        results = mobile_batch_extract(accounts, args.device)

        # 최종 결과 출력
        print(f"\n[BATCH_COMPLETE] {json.dumps({'total': len(results), 'success': sum(1 for r in results if r['success']), 'results': results}, ensure_ascii=False)}")
        return

    # 단일 계정 모드
    if not args.email or not args.password:
        print("\n사용법:")
        print("  단일: python extract_account.py <email> <password>")
        print("  배치: python extract_account.py --batch accounts.json")
        return

    print(f"\n이메일: {args.email}")

    access_token = mobile_login_and_extract(args.email, args.password, args.device)

    if access_token and access_token != "LOGIN_SUCCESS_NO_TOKEN":
        print("\n" + "=" * 60)
        print("토큰 획득 성공!")
        print("=" * 60)
        print(f"\nAccess Token: {access_token[:50]}...")

        # 토큰 저장
        with open('adidas_mobile_token.txt', 'w') as f:
            f.write(f"access_token={access_token}\n")
        print("토큰 저장됨: adidas_mobile_token.txt")

        # API 테스트
        test_api_with_token(access_token)
    elif access_token == "LOGIN_SUCCESS_NO_TOKEN":
        print("\n" + "=" * 60)
        print("로그인 성공! (토큰 미추출)")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("로그인 실패!")
        print("=" * 60)


if __name__ == "__main__":
    main()
