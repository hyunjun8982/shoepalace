"""
아디다스 계정 정보 추출 - 웹/모바일 하이브리드 버전
- 웹(undetected-chromedriver) 또는 모바일(Appium) 중 선택 가능
- 한쪽이 막히면 다른 쪽으로 전환하여 사용

사용법:
    python extract_hybrid.py <email> <password> --mode web    # 웹 브라우저 사용
    python extract_hybrid.py <email> <password> --mode mobile # 모바일 Appium 사용
    python extract_hybrid.py <email> <password> --mode hybrid # 웹 실패시 모바일 재시도
    python extract_hybrid.py <email> <password>               # 기본값: web
"""
import sys
import os
import time
import argparse
import json
import requests

# stdout 버퍼링 비활성화 (실시간 로그 출력)
sys.stdout.reconfigure(line_buffering=True)


def output_progress(account_id: int, status: str, message: str):
    """진행 상태 출력 (server.js에서 파싱)"""
    # account_id가 없어도 일단 출력 (디버깅)
    print(f'[PROGRESS] {{"id": {account_id or 0}, "status": "{status}", "message": "{message}"}}', flush=True)

# ANDROID_HOME 환경변수 설정 (모바일 모드용)
if not os.environ.get('ANDROID_HOME'):
    if os.path.exists('C:\\platform-tools\\adb.exe'):
        os.environ['ANDROID_HOME'] = 'C:\\platform-tools'
        os.environ['ANDROID_SDK_ROOT'] = 'C:\\platform-tools'


def test_api_with_token(access_token: str):
    """토큰으로 API 테스트하여 계정 정보 추출"""
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
            print(f"  전화번호: {profile.get('mobileNumber') or profile.get('phone', 'N/A')}")
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
                    # 유효기간 - available.to에서 가져오기
                    available = v.get('available', {})
                    expiry = available.get('to', 'N/A')
                    # 날짜 형식 변환 (2026-01-05T01:33:25Z -> 2026-01-05)
                    if expiry and expiry != 'N/A' and 'T' in str(expiry):
                        expiry = str(expiry).split('T')[0]
                    print(f"    - {name}: {code} (만료: {expiry})")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")


# ==================== 웹 모드 (undetected-chromedriver) ====================

def web_login(email: str, password: str, headless: bool = False):
    """
    웹 브라우저(undetected-chromedriver)로 로그인하여 토큰 추출
    headless: True면 백그라운드에서 실행 (봇 차단될 가능성 높음)
    """
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import TimeoutException, NoSuchElementException
    except ImportError as e:
        print("웹 모드에 필요한 라이브러리가 없습니다.")
        print(f"에러 상세: {e}")
        print(f"Python 버전: {sys.version}")
        print("설치: pip install undetected-chromedriver selenium")
        print("")
        print("[참고] Python 3.13은 undetected-chromedriver와 호환되지 않을 수 있습니다.")
        print("       Python 3.11 또는 3.12를 사용해 주세요.")
        return None

    print("\n[웹 모드] Chrome 브라우저로 로그인")
    print("-" * 40)

    driver = None
    try:
        # 헤드리스 모드 알림
        if headless:
            print("[주의] 헤드리스 모드 활성화 - 봇 차단될 가능성 있음")

        # 설치된 Chrome 버전 자동 감지
        chrome_version = None
        try:
            import subprocess
            import re
            import sys
            # Windows에서 콘솔 창 숨기기
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            # Windows에서 Chrome 버전 확인
            chrome_paths = [
                r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
            ]
            for chrome_path in chrome_paths:
                if os.path.exists(chrome_path):
                    # wmic으로 버전 가져오기
                    result = subprocess.run(
                        ['wmic', 'datafile', 'where', f'name="{chrome_path.replace(os.sep, os.sep + os.sep)}"', 'get', 'Version', '/value'],
                        capture_output=True, text=True, timeout=10,
                        creationflags=creationflags
                    )
                    match = re.search(r'Version=(\d+)', result.stdout)
                    if match:
                        chrome_version = int(match.group(1))
                        print(f"[감지] 설치된 Chrome 버전: {chrome_version}")
                        break
        except Exception as e:
            print(f"[경고] Chrome 버전 감지 실패: {e}")

        print("[1/5] 브라우저 시작...")
        # version_main 파라미터로 Chrome 버전 지정 (자동 드라이버 다운로드)
        # Chrome 143+ 호환성을 위해 추가 설정
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # 매 시도마다 새로운 옵션 객체 생성 (재사용 방지)
                retry_options = uc.ChromeOptions()
                retry_options.add_argument('--incognito')
                retry_options.add_argument('--window-size=1280,900')
                retry_options.add_argument('--lang=ko-KR')
                retry_options.add_argument('--disable-blink-features=AutomationControlled')
                retry_options.add_argument('--no-first-run')
                retry_options.add_argument('--no-default-browser-check')
                retry_options.add_argument('--disable-popup-blocking')
                retry_options.add_argument('--disable-extensions')
                retry_options.add_argument('--disable-gpu')
                retry_options.add_argument('--disable-dev-shm-usage')
                retry_options.add_argument('--no-sandbox')
                if headless:
                    retry_options.add_argument('--headless=new')

                driver = uc.Chrome(
                    options=retry_options,
                    use_subprocess=True,
                    version_main=chrome_version,
                    driver_executable_path=None,  # 자동 다운로드
                )
                # 브라우저 안정화 대기 (Chrome 143+ 대응)
                time.sleep(3)

                # 윈도우 핸들 확인 (여러 번 시도)
                handle_check_retries = 3
                for hc in range(handle_check_retries):
                    try:
                        _ = driver.current_window_handle
                        break
                    except Exception as he:
                        if hc < handle_check_retries - 1:
                            time.sleep(1)
                        else:
                            raise he

                break  # 성공
            except Exception as e:
                print(f"  [시도 {attempt+1}/{max_retries}] 드라이버 초기화 실패: {e}")
                try:
                    driver.quit()
                except:
                    pass
                driver = None
                if attempt < max_retries - 1:
                    time.sleep(3)
                else:
                    raise Exception(f"브라우저 시작 실패 (모든 시도 실패): {e}")

        if driver is None:
            raise Exception("브라우저 시작 실패")

        driver.implicitly_wait(10)
        print("  완료")

        print("[2/5] 로그인 페이지 이동...")
        # 페이지 이동 전 브라우저 상태 재확인
        page_load_retries = 3
        for plr in range(page_load_retries):
            try:
                # 윈도우 핸들 확인 (브라우저가 살아있는지)
                _ = driver.current_window_handle
                driver.get("https://www.adidas.co.kr/account-login")
                break
            except Exception as e:
                print(f"  페이지 이동 실패 ({plr+1}/{page_load_retries}): {e}")
                if plr < page_load_retries - 1:
                    time.sleep(2)
                else:
                    raise Exception(f"페이지 이동 실패: {e}")

        # 페이지 로드 대기
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        print("  완료")

        # 쿠키 동의 처리
        print("[2.5/5] 쿠키 동의 팝업 확인...")
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
                    print(f"  쿠키 동의 클릭")
                    time.sleep(1)
                    break
            except NoSuchElementException:
                continue

        driver.implicitly_wait(10)

        # 이메일 입력
        print("[3/5] 이메일 입력...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.clear()
        email_input.send_keys(email)
        print("  완료")

        # 비밀번호 입력
        print("[4/5] 비밀번호 입력...")
        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.clear()
        password_input.send_keys(password)
        print("  완료")

        # 로그인 버튼 클릭
        print("[5/5] 로그인 버튼 클릭...")
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        print("  완료")

        # 로그인 결과 대기 (에러 메시지가 표시될 시간 확보)
        time.sleep(3)

        # 토큰 쿠키 대기
        print("\n토큰 대기 중...")
        access_token = None
        login_error = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            # implicitly_wait 끄고 체크
            driver.implicitly_wait(0)
            try:
                # [1] Basic Auth 팝업 감지 (CDN 차단) - 최우선 체크
                try:
                    alert = driver.switch_to.alert
                    alert_text = alert.text if alert else ''
                    print(f"  Alert 감지: {alert_text}")
                    # Basic Auth 팝업 감지 (cloudfront, 로그인, 사용자 이름 등)
                    if alert_text and ('cloudfront' in alert_text.lower() or
                                       '로그인' in alert_text or
                                       '사용자' in alert_text or
                                       'username' in alert_text.lower() or
                                       'password' in alert_text.lower() or
                                       'authentication' in alert_text.lower()):
                        print(f"  [ERROR] API_BLOCKED: CDN 인증 요청 감지 - {alert_text}")
                        try:
                            alert.dismiss()
                        except:
                            pass
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"
                except:
                    pass  # alert 없으면 무시

                # [2] URL에서 CDN 차단 감지
                try:
                    current_url = driver.current_url
                    if 'cloudfront' in current_url.lower() and 'adidas' not in current_url.lower():
                        print(f"  [ERROR] API_BLOCKED: CDN 차단 감지 (URL: {current_url})")
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"
                except:
                    pass

                # [3] 페이지 내 Basic Auth 관련 요소 감지 (d3r3itx... cloudfront URL이 보이면)
                try:
                    page_source = driver.page_source
                    if 'd3r3itx' in page_source or ('cloudfront.net' in page_source and '사용자' in page_source):
                        print(f"  [ERROR] API_BLOCKED: 페이지 내 CDN 인증 요청 감지")
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"
                except:
                    pass

                # [4] 에러 메시지 확인 (비밀번호 오류 등)
                login_error = None
                error_selectors = [
                    '#password--error',
                    '.gl-form-notice__error',
                    '.gl-form-hint--error',
                    '[data-auto-id="login-error"]',
                    'p[class*="_error_"]',  # 동적 클래스명 에러 요소 (예: _error_1lve8_65)
                ]

                for selector in error_selectors:
                    try:
                        error_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                        for error_elem in error_elems:
                            if error_elem.is_displayed():
                                error_text = error_elem.text.strip()
                                if error_text:
                                    login_error = error_text
                                    break
                        if login_error:
                            break
                    except:
                        continue

                # 페이지 소스에서 에러 텍스트 직접 확인 - 비활성화 (오탐 방지)
                # 페이지 소스 전체 검색은 오탐이 많아서 에러 요소가 visible할 때만 감지
                # if not login_error:
                #     try:
                #         page_source = driver.page_source
                #         if '잘못된 이메일/비밀번호' in page_source:
                #             if 'cloudfront' not in page_source and 'd3r3itx' not in page_source:
                #                 login_error = '잘못된 이메일/비밀번호입니다'
                #     except:
                #         pass

                if login_error:
                    # "오류가 발생했습니다" 메시지는 봇 차단 의심
                    if any(keyword in login_error for keyword in ['오류가 발생했습니다', '다시 시도하세요', 'error occurred', 'try again']):
                        # ★ 봇 차단 메시지가 떠도 토큰이 있을 수 있음 (로그인 성공 후 후속 페이지에서 에러)
                        try:
                            cookies = driver.get_cookies()
                            for cookie in cookies:
                                if cookie['name'] == 'account.grant.accessToken':
                                    access_token = cookie['value']
                                    print(f"  봇 차단 메시지에도 불구하고 토큰 발견! API 호출 시도...")
                                    driver.implicitly_wait(10)
                                    return access_token
                        except:
                            pass
                        # 토큰 없으면 봇 차단으로 처리
                        print(f"  [ERROR] BOT_BLOCKED: {login_error}")
                        driver.implicitly_wait(10)
                        return f"BOT_BLOCKED:{login_error}"

                    # 에러 메시지가 떴지만, Basic Auth 팝업이 뜰 수 있으니 잠시 대기 후 재확인
                    print(f"  에러 메시지 감지: {login_error} - Basic Auth 팝업 확인 중...")
                    time.sleep(3)  # 3초 대기

                    # Basic Auth 팝업 확인 방법 1: window handles 변화 체크
                    try:
                        handles = driver.window_handles
                        print(f"  윈도우 핸들 수: {len(handles)}")
                    except Exception as e:
                        print(f"  윈도우 핸들 조회 실패: {e} - Basic Auth 팝업 가능성")
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"

                    # Basic Auth 팝업 확인 방법 2: 페이지 소스 조회 시도
                    try:
                        page_source = driver.page_source
                        # cloudfront 또는 d3r3itx가 페이지에 있으면 차단
                        if 'd3r3itx' in page_source or 'cloudfront.net' in page_source:
                            print(f"  [ERROR] API_BLOCKED: 페이지 내 CDN 인증 요청 감지")
                            driver.implicitly_wait(10)
                            return "API_BLOCKED"
                    except Exception as e:
                        # 페이지 소스 조회 실패 = Basic Auth 팝업이 blocking 중일 가능성
                        print(f"  페이지 소스 조회 실패: {e} - Basic Auth 팝업 가능성")
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"

                    # Basic Auth 팝업 확인 방법 3: JavaScript 실행 시도
                    try:
                        result = driver.execute_script("return document.readyState")
                        print(f"  페이지 상태: {result}")
                    except Exception as e:
                        print(f"  JavaScript 실행 실패: {e} - Basic Auth 팝업 가능성")
                        driver.implicitly_wait(10)
                        return "API_BLOCKED"

                    # Basic Auth 팝업 확인 방법 4: alert 체크
                    try:
                        alert = driver.switch_to.alert
                        alert_text = alert.text if alert else ''
                        if alert_text:
                            print(f"  [ERROR] API_BLOCKED: Alert 팝업 감지 - {alert_text}")
                            try:
                                alert.dismiss()
                            except:
                                pass
                            driver.implicitly_wait(10)
                            return "API_BLOCKED"
                    except:
                        pass

                    # 모든 체크 통과 = 실제 비밀번호 오류로 보이지만...
                    # ★ 중요: 에러 메시지가 떠도 토큰이 있을 수 있음 (로그인은 성공했으나 후속 에러)
                    # 토큰 쿠키 확인 후 있으면 계속 진행
                    try:
                        cookies = driver.get_cookies()
                        for cookie in cookies:
                            if cookie['name'] == 'account.grant.accessToken':
                                access_token = cookie['value']
                                print(f"  에러 메시지에도 불구하고 토큰 발견! API 호출 시도...")
                                driver.implicitly_wait(10)
                                return access_token
                    except:
                        pass

                    # 토큰 없으면 실제 로그인 실패
                    if any(keyword in login_error for keyword in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                        print(f"  [ERROR] PASSWORD_WRONG: {login_error}")
                    else:
                        print(f"  [ERROR] LOGIN_FAILED: {login_error}")
                    driver.implicitly_wait(10)
                    return None

            except Exception as e:
                pass
            finally:
                driver.implicitly_wait(10)

            # 쿠키에서 토큰 확인
            try:
                cookies = driver.get_cookies()
                for cookie in cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        break
            except:
                pass

            if access_token:
                print("  토큰 발견!")
                break

            time.sleep(0.5)

        # 토큰을 못 찾고 타임아웃된 경우
        if not access_token:
            # ★ 마지막으로 쿠키에서 토큰 한번 더 확인
            try:
                cookies = driver.get_cookies()
                for cookie in cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        print(f"  타임아웃 직전 토큰 발견!")
                        return access_token
            except:
                pass

            # CDN 차단 확인
            try:
                page_source = driver.page_source
                if 'd3r3itx' in page_source or 'cloudfront.net' in page_source:
                    print(f"  [ERROR] API_BLOCKED: 타임아웃 후 CDN 차단 감지")
                    return "API_BLOCKED"
            except:
                pass

        return access_token

    except Exception as e:
        print(f"웹 로그인 오류: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
            print("브라우저 종료")


# ==================== 모바일 모드 (Appium + 아디다스 앱) ====================

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


def mobile_login(email: str, password: str, device_udid: str = None):
    """
    모바일 아디다스 앱(Appium)으로 로그인하여 토큰 추출
    기존 extract_account.py의 로직 사용
    """
    # 기존 extract_account.py 모듈 임포트
    import importlib.util
    script_dir = os.path.dirname(os.path.abspath(__file__))
    extract_account_path = os.path.join(script_dir, 'extract_account.py')

    if os.path.exists(extract_account_path):
        spec = importlib.util.spec_from_file_location("extract_account", extract_account_path)
        extract_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(extract_module)

        print("\n[모바일 모드] 아디다스 앱으로 로그인")
        print("-" * 40)

        # extract_account.py의 mobile_login_and_extract 함수 실행
        access_token = extract_module.mobile_login_and_extract(email, password, device_udid)

        if access_token and access_token != "LOGIN_SUCCESS_NO_TOKEN":
            return access_token
        else:
            return None
    else:
        print(f"extract_account.py를 찾을 수 없습니다: {extract_account_path}")
        return None


# ==================== 메인 ====================

def extract_account(email: str, password: str, mode: str = 'web', device: str = None, headless: bool = False, account_id: int = None):
    """
    계정 정보 추출 (웹, 모바일, 또는 하이브리드 모드)
    headless: 웹 모드에서 백그라운드 실행 여부
    account_id: 진행 상태 출력용 계정 ID
    """
    mode_label = {'web': 'WEB', 'mobile': 'MOBILE', 'hybrid': 'HYBRID(웹+모바일)'}
    print("=" * 60)
    print(f"아디다스 계정 정보 추출 ({mode_label.get(mode, mode.upper())} 모드)")
    if headless and mode in ['web', 'hybrid']:
        print("헤드리스 모드: ON (백그라운드 실행)")
    print("=" * 60)
    print(f"이메일: {email}")

    access_token = None
    used_mode = None  # 실제 사용된 모드
    web_result = None  # 하이브리드 모드용 웹 결과
    mobile_result = None  # 하이브리드 모드용 모바일 결과

    if mode == 'web':
        output_progress(account_id, 'processing', '[웹] 브라우저 로그인 중...')
        access_token = web_login(email, password, headless=headless)
        used_mode = 'web'
    elif mode == 'mobile':
        output_progress(account_id, 'processing', '[모바일] Appium 로그인 중...')
        access_token = mobile_login(email, password, device)
        used_mode = 'mobile'
    elif mode == 'hybrid':
        # 하이브리드: 웹 먼저 시도, 실패 시 모바일로 재시도
        print("\n[1차] 웹 브라우저 로그인 시도...")
        output_progress(account_id, 'processing', '[웹] 로그인 중...')
        access_token = web_login(email, password, headless=headless)
        used_mode = 'web'

        # 웹 실패 여부 판단 (모바일 재시도가 필요한 에러들)
        need_mobile_fallback = False
        if not access_token:
            need_mobile_fallback = True
            web_result = '실패'
            print("  → 웹 로그인 실패 (토큰 없음)")
        elif access_token.startswith('BOT_BLOCKED') or access_token.startswith('API_BLOCKED'):
            need_mobile_fallback = True
            web_result = '차단'
            print(f"  → 웹 로그인 차단: {access_token}")
        elif access_token.startswith('LOGIN_FAILED'):
            need_mobile_fallback = True
            web_result = '실패'
            print(f"  → 웹 로그인 실패: {access_token}")
        elif access_token.startswith('PASSWORD_WRONG'):
            # PASSWORD_WRONG은 비밀번호 문제이므로 모바일 재시도 불필요
            web_result = '비밀번호오류'
        else:
            web_result = '성공'

        if need_mobile_fallback:
            print("\n[2차] 모바일 Appium 로그인 시도...")
            output_progress(account_id, 'processing', f'[웹:{web_result}] 모바일 로그인 중...')
            access_token = mobile_login(email, password, device)
            used_mode = 'mobile'

            # 모바일 결과 판단
            if not access_token:
                mobile_result = '실패'
            elif access_token.startswith('BOT_BLOCKED') or access_token.startswith('API_BLOCKED'):
                mobile_result = '차단'
            elif access_token.startswith('LOGIN_FAILED'):
                mobile_result = '실패'
            elif access_token.startswith('PASSWORD_WRONG'):
                mobile_result = '비밀번호오류'
            else:
                mobile_result = '성공'
    else:
        print(f"알 수 없는 모드: {mode}")
        output_progress(account_id, 'error', f'알 수 없는 모드: {mode}')
        return False

    # 에러 문자열인지 확인 (BOT_BLOCKED:..., API_BLOCKED 등은 토큰이 아님)
    is_error = access_token and (
        access_token.startswith('BOT_BLOCKED') or
        access_token.startswith('API_BLOCKED') or
        access_token.startswith('PASSWORD_WRONG') or
        access_token.startswith('LOGIN_FAILED')
    )

    # 하이브리드 모드에서 웹/모바일 결과 메시지 생성
    def get_hybrid_status_msg(web_res, mobile_res, final_status):
        """하이브리드 모드 상태 메시지 생성"""
        if mode != 'hybrid':
            return final_status
        parts = []
        if web_res:
            parts.append(f'웹:{web_res}')
        if mobile_res:
            parts.append(f'모바일:{mobile_res}')
        if parts:
            return ' / '.join(parts)
        return final_status

    if access_token and not is_error:
        print("\n" + "=" * 60)
        print(f"토큰 획득 성공! (사용 모드: {used_mode})")
        print("=" * 60)
        print(f"Access Token: {access_token[:50]}...")

        # API로 계정 정보 조회
        output_progress(account_id, 'processing', 'API로 계정 정보 조회 중...')
        test_api_with_token(access_token)

        # 하이브리드 모드 결과 메시지
        if mode == 'hybrid':
            if mobile_result:
                # 웹 실패 → 모바일 성공
                status_msg = f'웹:{web_result} / 모바일:{mobile_result}'
            else:
                # 웹만 성공
                status_msg = f'웹:{web_result}'
            output_progress(account_id, 'success', status_msg)
        else:
            output_progress(account_id, 'success', f'정보 조회 완료 ({used_mode})')
        return True
    else:
        print("\n" + "=" * 60)
        if is_error:
            print(f"로그인 실패: {access_token}")
            # 하이브리드 모드 에러 메시지
            if mode == 'hybrid':
                if mobile_result:
                    status_msg = f'웹:{web_result} / 모바일:{mobile_result}'
                else:
                    status_msg = f'웹:{web_result}'
                output_progress(account_id, 'error', status_msg)
            else:
                # 에러 타입에 따른 메시지
                if access_token.startswith('PASSWORD_WRONG'):
                    output_progress(account_id, 'error', '비밀번호 오류')
                elif access_token.startswith('BOT_BLOCKED'):
                    output_progress(account_id, 'error', '봇 차단됨')
                elif access_token.startswith('API_BLOCKED'):
                    output_progress(account_id, 'error', 'API 차단됨')
                else:
                    output_progress(account_id, 'error', '로그인 실패')
        else:
            print("토큰 획득 실패!")
            if mode == 'hybrid':
                if mobile_result:
                    status_msg = f'웹:{web_result} / 모바일:{mobile_result}'
                else:
                    status_msg = f'웹:{web_result or "실패"}'
                output_progress(account_id, 'error', status_msg)
            else:
                output_progress(account_id, 'error', '토큰 획득 실패')
        print("=" * 60)
        return False


def main():
    parser = argparse.ArgumentParser(description='아디다스 계정 정보 추출 (웹/모바일 하이브리드)')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--mode', '-m', choices=['web', 'mobile', 'hybrid'], default='web',
                        help='추출 모드: web(웹브라우저), mobile(Appium), hybrid(웹→모바일 재시도)')
    parser.add_argument('--device', '-d', help='모바일 모드에서 사용할 디바이스 UDID')
    parser.add_argument('--headless', action='store_true', default=False,
                        help='헤드리스 모드 (백그라운드 실행, 봇 차단 가능성 높음)')
    parser.add_argument('--id', type=int, help='계정 ID (진행 상태 출력용)')

    args = parser.parse_args()

    if not args.email or not args.password:
        print("사용법:")
        print("  python extract_hybrid.py <email> <password> --mode web      # 웹 브라우저")
        print("  python extract_hybrid.py <email> <password> --mode mobile   # 모바일 Appium")
        print("  python extract_hybrid.py <email> <password> --mode hybrid   # 웹 실패시 모바일 재시도")
        return

    extract_account(args.email, args.password, args.mode, args.device, args.headless, args.id)


if __name__ == "__main__":
    main()
