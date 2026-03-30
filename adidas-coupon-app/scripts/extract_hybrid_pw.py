"""
아디다스 계정 정보 추출 - Playwright 버전
- Playwright 기반 웹 브라우저 자동화 (undetected-chromedriver 대체)
- 모바일 모드는 기존 Appium 사용

사용법:
    python extract_hybrid_pw.py <email> <password> --mode web    # Playwright 웹 브라우저
    python extract_hybrid_pw.py <email> <password> --mode mobile # 모바일 Appium
    python extract_hybrid_pw.py <email> <password> --mode hybrid # 웹 실패시 모바일 재시도
"""
import sys
import os
import time
import argparse
import json
import requests

sys.stdout.reconfigure(line_buffering=True)


def output_progress(account_id: int, status: str, message: str):
    """진행 상태 출력 (server.js에서 파싱)"""
    print(f'[PROGRESS] {{"id": {account_id or 0}, "status": "{status}", "message": "{message}"}}', flush=True)


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
    print("\n[1/5] 프로필 조회...")
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
    print("\n[2/5] 바코드 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            print(f"  바코드: {resp.json().get('memberId', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 레벨
    print("\n[3/5] adiClub 레벨 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/status', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            status_data = resp.json()
            print(f"  레벨: {status_data.get('levelDescription', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 포인트
    print("\n[4/5] 포인트 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            print(f"  포인트: {resp.json().get('availablePoints', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 쿠폰
    print("\n[5/5] 쿠폰 조회...")
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                available_vouchers = [v for v in data if not v.get('redeemed') and v.get('status') != 'REDEEMED']
                print(f"  쿠폰 수: {len(available_vouchers)}개")
                for v in available_vouchers:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    available = v.get('available', {})
                    expiry = available.get('to', 'N/A')
                    if expiry and expiry != 'N/A' and 'T' in str(expiry):
                        expiry = str(expiry).split('T')[0]
                    print(f"    - {name}: {code} (만료: {expiry})")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")


# ==================== 웹 모드 (Playwright) ====================

def _find_chrome_path():
    """시스템에 설치된 Chrome 경로 찾기"""
    chrome_paths = [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    ]
    for p in chrome_paths:
        if os.path.exists(p):
            return p
    return None


def _find_free_port():
    """사용 가능한 포트 찾기"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def web_login(email: str, password: str, headless: bool = False, incognito: bool = False, proxy: str = None):
    """
    Chrome을 직접 실행하고 Playwright CDP로 연결하여 봇 탐지 우회
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        print("[ERROR] LIBRARY_MISSING: Playwright가 설치되지 않았습니다.")
        print(f"에러 상세: {e}")
        print("설치: pip install playwright && playwright install chromium")
        return None

    print("\n[웹 모드] Playwright (CDP) 브라우저로 로그인")
    print("-" * 40)

    chrome_proc = None
    playwright_inst = None
    browser = None
    context = None

    try:
        print("[1/5] 브라우저 시작...")

        chrome_path = _find_chrome_path()
        if not chrome_path:
            print("  [ERROR] Chrome을 찾을 수 없습니다")
            return None

        import subprocess
        import tempfile

        debug_port = _find_free_port()
        tmp_dir = tempfile.mkdtemp(prefix='pw_cdp_')

        chrome_args = [
            chrome_path,
            f'--remote-debugging-port={debug_port}',
            f'--user-data-dir={tmp_dir}',
            '--window-size=1280,900',
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-popup-blocking',
            '--disable-extensions',
        ]
        if incognito:
            chrome_args.append('--incognito')
            print("[시크릿 모드] 활성화")
        if headless:
            chrome_args.append('--headless=new')
            chrome_args.append('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36')
            print("[백그라운드 모드] 활성화")
        if proxy:
            chrome_args.append(f'--proxy-server=http://{proxy}')
            print(f"[프록시] {proxy}")

        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        chrome_proc = subprocess.Popen(
            chrome_args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        time.sleep(2)

        playwright_inst = sync_playwright().start()
        browser = playwright_inst.chromium.connect_over_cdp(f'http://localhost:{debug_port}')
        context = browser.contexts[0]

        if context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()

        # CDP 세션 생성 (context.cookies()가 CDP 모드에서 빈 배열 반환하는 문제 우회)
        cdp_session = context.new_cdp_session(page)
        print("  완료")

        # 프록시 사용 시 실제 IP 확인
        if proxy:
            try:
                page.goto("https://api.ipify.org?format=json", timeout=10000)
                ip_text = page.inner_text('body')
                print(f"[프록시 IP 확인] {ip_text}")
            except Exception as e:
                print(f"[프록시 IP 확인 실패] {e}")

        print("[2/5] 로그인 페이지 이동...")
        page.goto("https://www.adidas.co.kr/account-login", wait_until="domcontentloaded", timeout=30000)

        # Access Denied (IP 차단) 감지
        try:
            content = page.content()
            if 'Access Denied' in content or "don't have permission" in content:
                print("  [ERROR] IP_BLOCKED: Access Denied - IP가 일시 차단됨")
                return "IP_BLOCKED"
        except Exception:
            pass

        login_timeout = 30000 if proxy else 15000
        page.wait_for_selector('input[name="email"], input[type="email"]', timeout=login_timeout)
        print("  완료")

        # 쿠키 동의 처리
        print("[2.5/5] 쿠키 동의 팝업 확인...")
        for selector in ['#glass-gdpr-default-consent-accept-button', 'button[data-auto-id="consent-modal-accept-btn"]', '#onetrust-accept-btn-handler']:
            try:
                btn = page.query_selector(selector)
                if btn and btn.is_visible():
                    btn.click()
                    print("  쿠키 동의 클릭")
                    page.wait_for_timeout(1000)
                    break
            except Exception:
                continue

        # 이메일 입력
        print("[3/5] 이메일 입력...")
        email_input = page.wait_for_selector('input[name="email"], input[type="email"]', timeout=10000)
        email_input.fill('')
        email_input.type(email, delay=50)
        print("  완료")

        # 비밀번호 입력
        print("[4/5] 비밀번호 입력...")
        password_input = page.query_selector('input[name="password"], input[type="password"]')
        password_input.fill('')
        password_input.type(password, delay=50)
        print("  완료")

        # 로그인 버튼 클릭
        print("[5/5] 로그인 버튼 클릭...")
        login_btn = page.query_selector('button[type="submit"]')
        login_btn.click()
        print("  완료")

        # 로그인 결과 대기
        page.wait_for_timeout(3000)

        # 토큰 대기
        print("\n토큰 대기 중...")
        access_token = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            # CDN 차단 감지
            try:
                content = page.content()
                if 'd3r3itx' in content or ('cloudfront.net' in content and '사용자' in content):
                    print(f"  [ERROR] API_BLOCKED: 페이지 내 CDN 인증 요청 감지")
                    return "API_BLOCKED"
            except Exception:
                pass

            try:
                current_url = page.url
                if 'cloudfront' in current_url.lower() and 'adidas' not in current_url.lower():
                    print(f"  [ERROR] API_BLOCKED: CDN 차단 감지 (URL: {current_url})")
                    return "API_BLOCKED"
            except Exception:
                pass

            # 에러 메시지 확인
            login_error = None
            for selector in ['#password--error', '.gl-form-notice__error', '.gl-form-hint--error', '[data-auto-id="login-error"]', 'p[class*="_error_"]']:
                try:
                    error_elems = page.query_selector_all(selector)
                    for error_elem in error_elems:
                        if error_elem.is_visible():
                            error_text = error_elem.inner_text().strip()
                            if error_text:
                                login_error = error_text
                                break
                    if login_error:
                        break
                except Exception:
                    continue

            if login_error:
                # 비밀번호 오류 우선 체크
                if any(kw in login_error for kw in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                    print(f"  [ERROR] PASSWORD_WRONG: {login_error}")
                    return "PASSWORD_WRONG"

                if any(kw in login_error for kw in ['오류가 발생했습니다', '다시 시도하세요', 'error occurred', 'try again']):
                    cdp_cookies = cdp_session.send('Network.getAllCookies').get('cookies', [])
                    for cookie in cdp_cookies:
                        if cookie['name'] == 'account.grant.accessToken':
                            print(f"  봇 차단 메시지에도 불구하고 토큰 발견!")
                            return cookie['value']
                    print(f"  [ERROR] BOT_BLOCKED: {login_error}")
                    return f"BOT_BLOCKED:{login_error}"

                cdp_cookies = cdp_session.send('Network.getAllCookies').get('cookies', [])
                for cookie in cdp_cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        print(f"  에러 메시지에도 불구하고 토큰 발견!")
                        return cookie['value']

                if any(kw in login_error for kw in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                    print(f"  [ERROR] PASSWORD_WRONG: {login_error}")
                    return None
                else:
                    print(f"  [ERROR] LOGIN_FAILED: {login_error}")
                    return None

            # 쿠키에서 토큰 확인 (CDP 세션으로 조회)
            try:
                cdp_cookies = cdp_session.send('Network.getAllCookies').get('cookies', [])
                for cookie in cdp_cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        break
            except Exception:
                pass

            if access_token:
                print("  토큰 발견!")
                break

            page.wait_for_timeout(500)

        if not access_token:
            try:
                cdp_cookies = cdp_session.send('Network.getAllCookies').get('cookies', [])
                for cookie in cdp_cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        print("  타임아웃 직전 토큰 발견!")
                        return access_token
            except Exception:
                pass

            try:
                content = page.content()
                if 'd3r3itx' in content or 'cloudfront.net' in content:
                    print(f"  [ERROR] API_BLOCKED: 타임아웃 후 CDN 차단 감지")
                    return "API_BLOCKED"
            except Exception:
                pass

        return access_token

    except Exception as e:
        print(f"웹 로그인 오류: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        try:
            if browser:
                browser.close()
        except Exception:
            pass
        try:
            if playwright_inst:
                playwright_inst.stop()
        except Exception:
            pass
        try:
            if chrome_proc:
                chrome_proc.terminate()
                chrome_proc.wait(timeout=5)
        except Exception:
            pass
        print("브라우저 종료")


# ==================== 모바일 모드 (Appium) ====================

def get_connected_device():
    """연결된 Android 디바이스 UDID 가져오기"""
    import subprocess
    try:
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
    """모바일 아디다스 앱(Appium)으로 로그인하여 토큰 추출"""
    import importlib.util
    script_dir = os.path.dirname(os.path.abspath(__file__))
    extract_account_path = os.path.join(script_dir, 'extract_account.py')

    if os.path.exists(extract_account_path):
        spec = importlib.util.spec_from_file_location("extract_account", extract_account_path)
        extract_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(extract_module)

        print("\n[모바일 모드] 아디다스 앱으로 로그인")
        print("-" * 40)

        access_token = extract_module.mobile_login_and_extract(email, password, device_udid)

        if access_token and access_token != "LOGIN_SUCCESS_NO_TOKEN":
            return access_token
        else:
            return None
    else:
        print(f"extract_account.py를 찾을 수 없습니다: {extract_account_path}")
        return None


# ==================== 메인 ====================

def extract_account(email: str, password: str, mode: str = 'web', device: str = None, headless: bool = False, account_id: int = None, incognito: bool = False, proxy: str = None):
    """계정 정보 추출 (웹, 모바일, 또는 하이브리드 모드)"""
    mode_label = {'web': 'PW-WEB', 'mobile': 'MOBILE', 'hybrid': 'PW-HYBRID(웹+모바일)'}
    print("=" * 60)
    print(f"아디다스 계정 정보 추출 ({mode_label.get(mode, mode.upper())} 모드) [Playwright]")
    if headless and mode in ['web', 'hybrid']:
        print("헤드리스 모드: ON (백그라운드 실행)")
    print("=" * 60)
    print(f"이메일: {email}")

    access_token = None
    used_mode = None
    web_result = None
    mobile_result = None

    if mode == 'web':
        output_progress(account_id, 'processing', '[PW웹] 브라우저 로그인 중...')
        access_token = web_login(email, password, headless=headless, incognito=incognito, proxy=proxy)
        used_mode = 'web'
    elif mode == 'mobile':
        output_progress(account_id, 'processing', '[모바일] Appium 로그인 중...')
        access_token = mobile_login(email, password, device)
        used_mode = 'mobile'
    elif mode == 'hybrid':
        print("\n[1차] Playwright 웹 브라우저 로그인 시도...")
        output_progress(account_id, 'processing', '[PW웹] 로그인 중...')
        access_token = web_login(email, password, headless=headless, incognito=incognito, proxy=proxy)
        used_mode = 'web'

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
            web_result = '비밀번호오류'
        else:
            web_result = '성공'

        if need_mobile_fallback:
            print("\n[2차] 모바일 Appium 로그인 시도...")
            output_progress(account_id, 'processing', f'[PW웹:{web_result}] 모바일 로그인 중...')
            access_token = mobile_login(email, password, device)
            used_mode = 'mobile'

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

    is_error = access_token and (
        access_token.startswith('BOT_BLOCKED') or
        access_token.startswith('API_BLOCKED') or
        access_token.startswith('PASSWORD_WRONG') or
        access_token.startswith('LOGIN_FAILED')
    )

    if access_token and not is_error:
        print("\n" + "=" * 60)
        print(f"토큰 획득 성공! (사용 모드: {used_mode}, Playwright)")
        print("=" * 60)
        print(f"Access Token: {access_token[:50]}...")

        output_progress(account_id, 'processing', 'API로 계정 정보 조회 중...')
        test_api_with_token(access_token)

        if mode == 'hybrid':
            if mobile_result:
                status_msg = f'PW웹:{web_result} / 모바일:{mobile_result}'
            else:
                status_msg = f'PW웹:{web_result}'
            output_progress(account_id, 'success', status_msg)
        else:
            output_progress(account_id, 'success', f'정보 조회 완료 (PW-{used_mode})')
        return True
    else:
        print("\n" + "=" * 60)
        if is_error:
            print(f"로그인 실패: {access_token}")
            if mode == 'hybrid':
                if mobile_result:
                    status_msg = f'PW웹:{web_result} / 모바일:{mobile_result}'
                else:
                    status_msg = f'PW웹:{web_result}'
                output_progress(account_id, 'error', status_msg)
            else:
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
                    status_msg = f'PW웹:{web_result} / 모바일:{mobile_result}'
                else:
                    status_msg = f'PW웹:{web_result or "실패"}'
                output_progress(account_id, 'error', status_msg)
            else:
                output_progress(account_id, 'error', '토큰 획득 실패')
        print("=" * 60)
        return False


def main():
    parser = argparse.ArgumentParser(description='아디다스 계정 정보 추출 (Playwright 웹/모바일 하이브리드)')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--mode', '-m', choices=['web', 'mobile', 'hybrid'], default='web',
                        help='추출 모드: web(Playwright), mobile(Appium), hybrid(웹→모바일 재시도)')
    parser.add_argument('--device', '-d', help='모바일 모드에서 사용할 디바이스 UDID')
    parser.add_argument('--headless', action='store_true', default=False,
                        help='헤드리스 모드')
    parser.add_argument('--id', type=str, help='계정 ID (진행 상태 출력용)')
    parser.add_argument('--incognito', action='store_true', default=False,
                        help='시크릿(incognito) 모드로 브라우저 실행')
    parser.add_argument('--proxy', type=str, default=None,
                        help='프록시 서버 (IP:PORT 형식)')

    args = parser.parse_args()

    if not args.email or not args.password:
        print("사용법:")
        print("  python extract_hybrid_pw.py <email> <password> --mode web      # Playwright 웹 브라우저")
        print("  python extract_hybrid_pw.py <email> <password> --mode mobile   # 모바일 Appium")
        print("  python extract_hybrid_pw.py <email> <password> --mode hybrid   # 웹 실패시 모바일 재시도")
        return

    extract_account(args.email, args.password, args.mode, args.device, args.headless, args.id, args.incognito, args.proxy)


if __name__ == "__main__":
    main()
