"""
Appium 세션 관리 모듈
- 세션을 미리 연결하고 유지
- HTTP API로 세션 상태 조회 및 작업 요청
- 세션 끊김 시 자동 재연결

사용법:
    # 세션 서버 시작 (백그라운드)
    python appium_session.py --server

    # 세션 상태 확인
    python appium_session.py --status

    # 쿠폰 발급 요청
    python appium_session.py --issue <email> <password> <coupon_type>
"""
import sys
import os
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException

# 포트 설정
SESSION_SERVER_PORT = 4780

# 전역 드라이버 (세션 유지)
_driver = None
_driver_lock = threading.Lock()
_last_activity = time.time()
_session_status = "disconnected"


# ==================== Appium 세션 관리 ====================

def get_appium_options():
    """Appium 옵션 생성"""
    options = UiAutomator2Options()
    options.platform_name = 'Android'
    options.automation_name = 'UiAutomator2'
    options.app_package = 'com.adidas.app'
    options.app_activity = 'com.adidas.app.MainActivity'  # 메인 액티비티 지정
    options.no_reset = True
    options.new_command_timeout = 600  # 10분 타임아웃

    android_home = 'C:\\platform-tools'
    options.set_capability('appium:androidSdkRoot', android_home)
    options.set_capability('appium:adbExecTimeout', 60000)
    options.set_capability('appium:chromedriverAutodownload', True)
    # 앱이 이미 실행 중이면 재시작하지 않음
    options.set_capability('appium:autoLaunch', False)

    return options


def connect_appium():
    """Appium 세션 연결"""
    global _driver, _session_status, _last_activity

    with _driver_lock:
        if _driver is not None:
            try:
                # 기존 세션 확인
                _driver.current_package
                _session_status = "connected"
                return True
            except:
                _driver = None

        try:
            print("[Appium] 세션 연결 중...")
            options = get_appium_options()
            _driver = webdriver.Remote('http://localhost:4723', options=options)
            _session_status = "connected"
            _last_activity = time.time()
            print("[Appium] 세션 연결 성공")

            # 앱 실행
            _driver.activate_app('com.adidas.app')
            time.sleep(1)
            print("[Appium] 아디다스 앱 실행됨")
            return True

        except Exception as e:
            print(f"[Appium] 연결 실패: {e}")
            _session_status = "error"
            _driver = None
            return False


def disconnect_appium():
    """Appium 세션 종료"""
    global _driver, _session_status

    with _driver_lock:
        if _driver:
            try:
                _driver.quit()
            except:
                pass
            _driver = None
        _session_status = "disconnected"
        print("[Appium] 세션 종료됨")


def check_session():
    """세션 상태 확인"""
    global _driver, _session_status

    with _driver_lock:
        if _driver is None:
            _session_status = "disconnected"
            return False

        try:
            _driver.current_package
            _session_status = "connected"
            return True
        except:
            _driver = None
            _session_status = "disconnected"
            return False


def get_driver():
    """현재 드라이버 반환 (없으면 연결 시도)"""
    global _driver

    if not check_session():
        connect_appium()

    return _driver


# ==================== 로그인/로그아웃 함수 (issue_coupon_mobile.py에서 가져옴) ====================

def wait_for_element(driver, by, value, timeout=10, condition='presence'):
    """요소 대기"""
    try:
        wait = WebDriverWait(driver, timeout)
        if condition == 'clickable':
            element = wait.until(EC.element_to_be_clickable((by, value)))
        elif condition == 'visible':
            element = wait.until(EC.visibility_of_element_located((by, value)))
        else:
            element = wait.until(EC.presence_of_element_located((by, value)))
        return element
    except TimeoutException:
        return None


def clear_webview_cookies(driver) -> bool:
    """WebView 쿠키 삭제 (이전 계정 토큰 제거)"""
    try:
        contexts = driver.contexts
        if not contexts:
            return False

        webview_context = None
        for ctx in contexts:
            if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                webview_context = ctx
                break

        if webview_context:
            driver.switch_to.context(webview_context)
            driver.delete_all_cookies()
            driver.switch_to.context('NATIVE_APP')
            return True
        return False
    except:
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return False


def login_with_session(email: str, password: str, is_batch_continuation: bool = False) -> tuple:
    """
    기존 세션으로 로그인 (issue_coupon_mobile.py의 login_with_driver와 동일한 로직)
    Returns: (success: bool, access_token: Optional[str], error: Optional[str])
    """
    global _last_activity

    driver = get_driver()
    if driver is None:
        return (False, None, "Appium 세션 없음")

    _last_activity = time.time()

    try:
        print(f"\n[로그인] {email}" + (" (배치계속)" if is_batch_continuation else ""), flush=True)

        # [0단계] 항상 쿠키 삭제 (이전 계정 토큰 완전 제거)
        print("  쿠키삭제...", flush=True)
        clear_webview_cookies(driver)
        time.sleep(0.3)
        clear_webview_cookies(driver)

        # [1단계] 딥링크로 로그인 화면 직접 이동
        print("  로그인 화면 이동...", flush=True)
        driver.execute_script("mobile: deepLink", {
            "url": "adidas://login",
            "package": "com.adidas.app"
        })
        print("  adidas://login 딥링크 실행")
        time.sleep(1.5)  # 로그인 화면 로드 대기

        # [2단계] 이메일 입력
        print("\n[2단계] 이메일 입력")
        email_field = wait_for_element(driver, AppiumBy.XPATH,
            "//android.widget.EditText[@resource-id='login.email.input']",
            timeout=10, condition='clickable')

        if not email_field:
            email_field = wait_for_element(driver, AppiumBy.XPATH,
                "(//android.webkit.WebView//android.widget.EditText)[1]",
                timeout=5, condition='clickable')

        if not email_field:
            print("  [ERROR] 이메일 입력란을 찾을 수 없음")
            return (False, None, "이메일 입력란을 찾을 수 없음")

        email_field.clear()
        email_field.send_keys(email)
        print("  이메일 입력 완료")

        # [3단계] 비밀번호 입력
        print("\n[3단계] 비밀번호 입력")
        password_entered = False

        try:
            pwd_field = driver.find_element(AppiumBy.XPATH,
                "//android.widget.EditText[@resource-id='login.password.input']")
            pwd_field.clear()
            pwd_field.send_keys(password)
            print("  비밀번호 입력 완료")
            password_entered = True
        except:
            pass

        if not password_entered:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH,
                    "(//android.webkit.WebView//android.widget.EditText)[2]")
                pwd_field.clear()
                pwd_field.send_keys(password)
                print("  비밀번호 입력 완료 (WebView)")
                password_entered = True
            except:
                pass

        if not password_entered:
            print("  [ERROR] 비밀번호 입력란을 찾을 수 없음")
            return (False, None, "비밀번호 입력란을 찾을 수 없음")

        # [4단계] 로그인하기 버튼 클릭
        print("\n[4단계] '로그인하기' 버튼 클릭")
        submit_clicked = False

        try:
            submit_btn = driver.find_element(AppiumBy.XPATH,
                "//android.widget.Button[@resource-id='login-submit-button']")
            submit_btn.click()
            print("  로그인 버튼 클릭 (resource-id)")
            submit_clicked = True
        except:
            pass

        if not submit_clicked:
            for text in ['로그인하기', 'LOG IN', '로그인']:
                try:
                    submit_btn = driver.find_element(AppiumBy.XPATH,
                        f"//android.widget.Button[@text='{text}']")
                    submit_btn.click()
                    print(f"  '{text}' 버튼 클릭")
                    submit_clicked = True
                    break
                except:
                    pass

        if not submit_clicked:
            print("  [ERROR] 로그인 버튼을 찾을 수 없음")
            return (False, None, "로그인 제출 버튼을 찾을 수 없음")

        # [5단계] 토큰 추출 (새 토큰만 수락)
        access_token = None
        old_token = None
        start_time = time.time()
        max_wait = 15

        # WebView 컨텍스트로 전환
        try:
            contexts = driver.contexts
            webview_context = None
            for ctx in contexts:
                if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                    webview_context = ctx
                    break

            if webview_context:
                driver.switch_to.context(webview_context)

                # 기존 토큰 확인 (무시 대상)
                try:
                    cookies = driver.get_cookies()
                    for cookie in cookies:
                        if cookie.get('name') == 'account.grant.accessToken':
                            old_token = cookie.get('value')
                            print(f"  [!] 기존토큰 발견 (무시예정)", flush=True)
                            driver.delete_cookie('account.grant.accessToken')
                            break
                except:
                    pass

                # 토큰 대기 루프
                while time.time() - start_time < max_wait:
                    try:
                        cookies = driver.get_cookies()

                        for cookie in cookies:
                            if cookie.get('name') == 'account.grant.accessToken':
                                new_token = cookie.get('value')
                                # 기존 토큰과 다른 경우에만 수락
                                if old_token and new_token == old_token:
                                    continue
                                access_token = new_token
                                break

                        if access_token:
                            print(f"  [OK] 새토큰 획득 ({int(time.time() - start_time)}초)", flush=True)
                            break

                        # 로그인 실패 확인 (5초 후)
                        if time.time() - start_time > 5:
                            try:
                                page_source = driver.page_source
                                error_patterns = ['Invalid email or password', 'incorrect password',
                                                '이메일 또는 비밀번호가 잘못', '로그인에 실패']
                                if any(err.lower() in page_source.lower() for err in error_patterns):
                                    print("  [FAIL] 비밀번호 오류", flush=True)
                                    driver.switch_to.context('NATIVE_APP')
                                    return (False, None, "비밀번호 오류")
                            except:
                                pass

                    except:
                        break

                    time.sleep(0.5)

                # 네이티브로 복귀
                try:
                    driver.switch_to.context('NATIVE_APP')
                except:
                    pass

                if not access_token:
                    print(f"  토큰을 찾을 수 없음 ({int(time.time() - start_time)}초 대기)")
            else:
                print(f"  WebView 컨텍스트를 찾을 수 없음: {contexts}")
        except Exception as e:
            print(f"  토큰 추출 중 오류: {e}")
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass

        if access_token:
            print("\n[OK] 로그인 성공")
        else:
            # WebView에서 토큰을 못 찾았지만, 네이티브에서 로그인 성공 확인
            time.sleep(1)
            page_source = driver.page_source
            if 'profile_login_button' in page_source or '로그인하기' in page_source:
                print("  [FAILED] 로그인 실패 (로그인 화면 유지)")
                return (False, None, "로그인 실패")
            print("  [OK] 로그인 성공 (토큰 미추출)")

        # [6단계] X 버튼 클릭하여 팝업 닫기
        print("\n[6단계] 팝업 닫기")
        for desc in ['Close', 'close', '닫기', 'X']:
            x_btn = wait_for_element(driver, AppiumBy.XPATH, f"//*[@content-desc='{desc}']",
                timeout=3, condition='clickable')
            if x_btn:
                x_btn.click()
                print("  X 버튼 클릭")
                break

        if access_token:
            return (True, access_token, None)
        else:
            return (False, None, "토큰 추출 실패")

    except WebDriverException as e:
        print(f"[ERROR] WebDriver 오류: {e}")
        return (False, None, str(e))
    except Exception as e:
        print(f"[ERROR] 로그인 오류: {e}")
        return (False, None, str(e))


def logout_with_session():
    """세션으로 로그아웃 (딥링크 사용)"""
    driver = get_driver()
    if driver is None:
        return False

    try:
        # NATIVE_APP 컨텍스트로 전환
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass

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
        print(f"[ERROR] 로그아웃 오류: {e}")
        return False


# ==================== HTTP API 서버 ====================

class SessionHandler(BaseHTTPRequestHandler):
    """세션 관리 HTTP 핸들러"""

    def log_message(self, format, *args):
        """로그 출력 (선택적)"""
        print(f"[API] {args[0]}")

    def send_json(self, data, status=200):
        """JSON 응답"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        """CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """GET 요청 처리"""
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/status':
            # 세션 상태 조회
            connected = check_session()
            self.send_json({
                'status': _session_status,
                'connected': connected,
                'last_activity': _last_activity
            })

        elif path == '/connect':
            # 세션 연결
            success = connect_appium()
            self.send_json({
                'success': success,
                'status': _session_status
            })

        elif path == '/disconnect':
            # 세션 종료
            disconnect_appium()
            self.send_json({
                'success': True,
                'status': _session_status
            })

        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)

    def do_POST(self):
        """POST 요청 처리"""
        parsed = urlparse(self.path)
        path = parsed.path

        # 요청 본문 파싱
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'

        try:
            data = json.loads(body)
        except:
            data = {}

        if path == '/login':
            # 로그인 요청
            email = data.get('email')
            password = data.get('password')

            if not email or not password:
                self.send_json({'success': False, 'error': 'email과 password 필요'}, 400)
                return

            success, token, error = login_with_session(email, password)
            self.send_json({
                'success': success,
                'token': token,
                'error': error
            })

        elif path == '/logout':
            # 로그아웃 요청
            success = logout_with_session()
            self.send_json({'success': success})

        elif path == '/issue':
            # 쿠폰 발급 요청 (로그인 + 발급 + 로그아웃)
            email = data.get('email')
            password = data.get('password')
            coupon_type = data.get('coupon_type', '100000')

            if not email or not password:
                self.send_json({'success': False, 'error': 'email과 password 필요'}, 400)
                return

            # 로그인
            success, token, error = login_with_session(email, password)
            if not success:
                self.send_json({
                    'success': False,
                    'error': error or '로그인 실패'
                })
                return

            # 쿠폰 발급 (API 호출)
            if token:
                from issue_coupon_mobile import issue_coupon_via_api
                result = issue_coupon_via_api(token, coupon_type)
            else:
                result = {'success': False, 'message': '토큰 없음'}

            # 로그아웃
            logout_with_session()

            self.send_json(result)

        elif path == '/issue-batch':
            # 배치 쿠폰 발급 (여러 계정 순차 처리, 세션 재사용)
            accounts = data.get('accounts', [])
            coupon_type = data.get('coupon_type', '100000')

            if not accounts:
                self.send_json({'success': False, 'error': '계정 목록 필요'}, 400)
                return

            # 세션 연결 확인
            if not check_session():
                connect_appium()

            results = []
            for i, acc in enumerate(accounts):
                acc_id = acc.get('id')
                email = acc.get('email')
                password = acc.get('password')

                # 진행 상태 출력 (server.js에서 파싱)
                print(f'[PROGRESS] {{"id": {acc_id}, "status": "processing", "message": "{coupon_type}원 발급 중..."}}', flush=True)

                # 로그인
                is_batch_continuation = (i > 0)
                success, token, error = login_with_session(email, password, is_batch_continuation)

                if not success:
                    print(f'[PROGRESS] {{"id": {acc_id}, "status": "error", "message": "로그인 실패"}}', flush=True)
                    results.append({'id': acc_id, 'success': False, 'message': error or '로그인 실패'})
                    logout_with_session()
                    continue

                # 쿠폰 발급 (API 호출)
                if token:
                    from issue_coupon_mobile import issue_coupon_via_api, get_account_vouchers, parse_vouchers
                    result = issue_coupon_via_api(token, coupon_type, login_email=email)

                    # 결과 출력
                    status = 'success' if result.get('success') else ('warning' if result.get('error_type') == 'cooldown_period' else 'error')
                    points = result.get('remaining_points', 0)
                    voucher_count = len(result.get('vouchers', []))
                    print(f'[PROGRESS] {{"id": {acc_id}, "status": "{status}", "message": "{result.get("message", "")}", "data": {{"remaining_points": {points}, "voucher_count": {voucher_count}}}}}', flush=True)

                    # 쿠폰 정보 출력
                    for v in result.get('vouchers', []):
                        print(f'[VOUCHER] {{"id": {acc_id}, "voucher": {json.dumps(v, ensure_ascii=False)}}}', flush=True)

                    results.append({'id': acc_id, **result})
                else:
                    print(f'[PROGRESS] {{"id": {acc_id}, "status": "error", "message": "토큰 없음"}}', flush=True)
                    results.append({'id': acc_id, 'success': False, 'message': '토큰 없음'})

                # 로그아웃
                logout_with_session()

            self.send_json({'success': True, 'results': results})

        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)


def run_server():
    """HTTP 서버 실행"""
    server = HTTPServer(('localhost', SESSION_SERVER_PORT), SessionHandler)
    print(f"\n[세션 서버] http://localhost:{SESSION_SERVER_PORT}")
    print("  GET  /status      - 세션 상태")
    print("  GET  /connect     - 세션 연결")
    print("  POST /issue       - 단일 발급")
    print("  POST /issue-batch - 배치 발급 (세션 재사용)")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[서버 종료]")
        disconnect_appium()
        server.shutdown()


# ==================== 메인 ====================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법:")
        print("  python appium_session.py --server     # 세션 서버 시작")
        print("  python appium_session.py --status     # 세션 상태 확인")
        print("  python appium_session.py --connect    # 세션 연결")
        print("  python appium_session.py --disconnect # 세션 종료")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == '--server':
        # 서버 시작 전 세션 연결
        print("[초기화] Appium 세션 미리 연결...")
        connect_appium()
        run_server()

    elif cmd == '--status':
        import requests
        try:
            resp = requests.get(f'http://localhost:{SESSION_SERVER_PORT}/status', timeout=3)
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"세션 서버에 연결할 수 없음: {e}")

    elif cmd == '--connect':
        import requests
        try:
            resp = requests.get(f'http://localhost:{SESSION_SERVER_PORT}/connect', timeout=30)
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"세션 서버에 연결할 수 없음: {e}")

    elif cmd == '--disconnect':
        import requests
        try:
            resp = requests.get(f'http://localhost:{SESSION_SERVER_PORT}/disconnect', timeout=5)
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"세션 서버에 연결할 수 없음: {e}")

    else:
        print(f"알 수 없는 명령: {cmd}")
