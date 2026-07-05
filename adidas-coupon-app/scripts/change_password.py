"""
아디다스 계정 비밀번호 변경 - API 검증 스크립트

흐름:
  1. undetected-chromedriver 로 실제 로그인 (old_password 사용) → accessToken 쿠키 획득
  2. POST https://www.adidas.co.kr/gw-api/v2/user/password 호출
     payload: {"old_password": "...", "new_password": "..."}
  3. 응답(status/body) 출력

사용법:
  python change_password.py <email> <old_password> <new_password>

주의: 성공 시 계정 비밀번호가 실제로 변경됩니다.
"""
import sys
import time
import json
import os
import tempfile
import requests

PASSWORD_CHANGE_URL = "https://www.adidas.co.kr/gw-api/v2/user/password"

# uc.Chrome() 동시 시작 시 chromedriver 패치/기동 충돌 방지용 크로스-프로세스 락
_STARTUP_LOCK_PATH = os.path.join(tempfile.gettempdir(), 'adidas_uc_startup.lock')


def _acquire_startup_lock(timeout=180, stale=120):
    """브라우저 시작 구간을 프로세스 간 직렬화. 획득하면 lock 경로 반환, 타임아웃이면 None(최선 노력으로 진행)."""
    start = time.time()
    while True:
        try:
            fd = os.open(_STARTUP_LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return _STARTUP_LOCK_PATH
        except FileExistsError:
            # 비정상 종료로 남은 stale 락이면 탈취
            try:
                if time.time() - os.path.getmtime(_STARTUP_LOCK_PATH) > stale:
                    os.remove(_STARTUP_LOCK_PATH)
                    continue
            except OSError:
                pass
            if time.time() - start > timeout:
                return None
            time.sleep(0.5)


def _release_startup_lock(lock_path):
    if lock_path:
        try:
            os.remove(lock_path)
        except OSError:
            pass


def get_api_headers():
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'origin': 'https://www.adidas.co.kr',
        'referer': 'https://www.adidas.co.kr/my-account',
    }


def browser_login_get_token(email: str, password: str, incognito: bool = False, proxy: str = None):
    """undetected-chromedriver 로 로그인 후 accessToken 반환 (issue_coupon.py 흐름 재활용)"""
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import NoSuchElementException

    driver = None
    access_token = None
    try:
        print("[1/4] 브라우저 시작...")
        options = uc.ChromeOptions()
        if incognito:
            options.add_argument('--incognito')
        if proxy:
            options.add_argument(f'--proxy-server=http://{proxy}')
            print(f"[프록시] {proxy}")
        options.add_argument('--window-size=1280,900')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')
        options.add_argument('--disable-popup-blocking')
        options.add_argument('--log-level=3')
        # 프로세스별 고유 프로필 → 병렬 시 세션/쿠키 격리
        user_data_dir = os.path.join(tempfile.gettempdir(), f'adidas_uc_profile_{os.getpid()}')
        options.add_argument(f'--user-data-dir={user_data_dir}')

        # 브라우저 시작(패치+기동) 구간만 직렬화하여 동시 실행 충돌 방지
        lock = _acquire_startup_lock()
        try:
            driver = uc.Chrome(options=options, use_subprocess=True)
            time.sleep(2)
        finally:
            _release_startup_lock(lock)
        driver.implicitly_wait(10)

        print("[2/4] 로그인 페이지 이동...")
        driver.get("https://www.adidas.co.kr/account-login")
        time.sleep(3)

        page_source = driver.page_source
        if 'Access Denied' in page_source or "don't have permission" in page_source:
            return None, "IP_BLOCKED"

        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )

        # 쿠키 동의
        driver.implicitly_wait(0)
        for selector in ['#glass-gdpr-default-consent-accept-button',
                         'button[data-auto-id="consent-modal-accept-btn"]',
                         '#onetrust-accept-btn-handler']:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, selector)
                if btn.is_displayed():
                    btn.click()
                    time.sleep(1)
                    break
            except NoSuchElementException:
                continue
        driver.implicitly_wait(10)

        print("[3/4] 로그인 정보 입력...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        pw_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')

        # React 제어 input: native value setter + input/change 이벤트 디스패치
        js_set = """
            const el = arguments[0], val = arguments[1];
            const proto = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', {bubbles: true}));
            el.dispatchEvent(new Event('change', {bubbles: true}));
            el.dispatchEvent(new Event('blur', {bubbles: true}));
        """
        driver.execute_script(js_set, email_input, email)
        time.sleep(0.3)
        driver.execute_script(js_set, pw_input, password)
        time.sleep(0.3)
        submit_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"], #login-submit-button')
        # 오버레이(쿠키 모달 등) 가로채기 방지를 위해 JS 클릭
        try:
            submit_btn.click()
        except Exception:
            driver.execute_script("arguments[0].click();", submit_btn)

        print("[4/4] 토큰 획득 중...")
        start = time.time()
        while time.time() - start < 20:
            driver.implicitly_wait(0)
            try:
                for selector in ['#password--error', '.gl-form-notice__error', '.gl-form-hint--error',
                                 '[data-auto-id="login-error"]', 'p[class*="_error_"]']:
                    for elem in driver.find_elements(By.CSS_SELECTOR, selector):
                        if elem.is_displayed() and elem.text.strip():
                            txt = elem.text.strip()
                            if any(k in txt for k in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                                return None, f"PASSWORD_WRONG: {txt}"
                            if any(k in txt for k in ['오류가 발생', '다시 시도', 'try again']):
                                return None, f"BOT_BLOCKED: {txt}"
                            return None, f"LOGIN_FAILED: {txt}"
            except Exception:
                pass
            finally:
                driver.implicitly_wait(10)

            try:
                for c in driver.get_cookies():
                    if c['name'] == 'account.grant.accessToken':
                        access_token = c['value']
                        break
            except Exception:
                pass
            if access_token:
                print("  토큰 발견!")
                return access_token, None
            time.sleep(0.5)

        return None, "TOKEN_FAILED"
    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass


def change_password(access_token: str, old_password: str, new_password: str):
    """비밀번호 변경 API 호출"""
    headers = get_api_headers()
    cookies = {'account.grant.accessToken': access_token}
    payload = {'old_password': old_password, 'new_password': new_password}

    print("\n=== 비밀번호 변경 API 호출 ===")
    print(f"  URL: {PASSWORD_CHANGE_URL}")
    print(f"  payload: {{'old_password': '***', 'new_password': '***'}}")
    resp = requests.post(PASSWORD_CHANGE_URL, json=payload, headers=headers, cookies=cookies, timeout=20)
    print(f"  HTTP {resp.status_code}")
    print(f"  응답 헤더 content-type: {resp.headers.get('content-type')}")
    body = resp.text
    print(f"  응답 본문: {body[:1000]}")
    return resp.status_code, body


def parse_vouchers(vouchers: list) -> list:
    """API 응답에서 쿠폰 정보 파싱 (사용된 쿠폰 제외) - issue_coupon.py와 동일 포맷"""
    import re
    coupon_list = []
    for v in vouchers:
        if v.get('redeemed') is True or v.get('status') == 'REDEEMED':
            continue
        raw_name = v.get('couponLabel') or v.get('name', '')
        value = v.get('value', '')
        if not value or not str(value).isdigit():
            match = re.search(r'(\d+)K[_\s]?KRW', raw_name, re.IGNORECASE)
            if match:
                value = str(int(match.group(1)) * 1000)
            else:
                match = re.search(r'[\d,]+', raw_name)
                if match:
                    value = match.group().replace(',', '')
        display_name = raw_name
        if value and str(value).isdigit():
            amount = int(value)
            is_discount = amount <= 20 and ('할인' in raw_name.lower() or 'discount' in raw_name.lower() or '%' in raw_name)
            if is_discount:
                if '%' not in raw_name:
                    display_name = f"{amount * 5}% 할인권" if amount <= 2 else f"{amount}% 할인권"
            elif amount >= 10000:
                display_name = f"{amount // 10000}만원 상품권"
            elif amount >= 1000:
                display_name = f"{amount}원 상품권"
        available = v.get('available', {})
        expiry = available.get('to', '')
        if expiry and 'T' in str(expiry):
            expiry = str(expiry).split('T')[0]
        coupon_list.append({
            'code': v.get('code', ''),
            'value': value,
            'name': display_name,
            'expiryDate': expiry,
        })
    return coupon_list


def fetch_account_info(access_token: str) -> dict:
    """로그인 토큰으로 계정 정보 조회 (best-effort). 실패해도 비번 변경엔 영향 없음.
    반환 필드: name, phone, barcode, level, points, vouchers"""
    headers = get_api_headers()
    cookies = {'account.grant.accessToken': access_token}
    info = {}
    print("\n=== 계정 정보 조회 (비번 변경과 동일 세션) ===")
    # 프로필 (이름/전화)
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/profile', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            p = r.json().get('profile', {})
            info['name'] = p.get('firstName') or p.get('lastName') or None
            info['phone'] = p.get('mobileNumber') or p.get('phone') or None
            print(f"  이름: {info.get('name')} / 전화: {info.get('phone')}")
    except Exception as e:
        print(f"  프로필 오류: {e}")
    # 바코드 (멤버ID)
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            info['barcode'] = r.json().get('memberId') or None
            print(f"  바코드: {info.get('barcode')}")
    except Exception as e:
        print(f"  바코드 오류: {e}")
    # adiClub 레벨
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/status', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            info['level'] = r.json().get('levelDescription') or None
            print(f"  레벨: {info.get('level')}")
    except Exception as e:
        print(f"  레벨 오류: {e}")
    # 포인트
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            pts = r.json().get('availablePoints')
            info['points'] = pts
            print(f"  포인트: {pts}")
    except Exception as e:
        print(f"  포인트 오류: {e}")
    # 쿠폰
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers?locale=ko_KR', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                info['vouchers'] = parse_vouchers(data)
                print(f"  쿠폰 수: {len(info['vouchers'])}개")
    except Exception as e:
        print(f"  쿠폰 오류: {e}")
    return info


def emit_result(obj: dict):
    """서버(server.js)가 파싱하는 결과 라인 출력"""
    print("[RESULT] " + json.dumps(obj, ensure_ascii=False))


def parse_args(argv):
    """[--incognito] [--headless] [--proxy <host:port>] [--] <email> <old_password> <new_password>"""
    incognito = False
    proxy = None
    positional = []
    i = 0
    seen_sep = False
    while i < len(argv):
        a = argv[i]
        if not seen_sep and a == '--':
            seen_sep = True
        elif not seen_sep and a == '--incognito':
            incognito = True
        elif not seen_sep and a == '--headless':
            pass  # 예약 (현재 미사용)
        elif not seen_sep and a == '--proxy':
            if i + 1 < len(argv):
                proxy = argv[i + 1]
                i += 1
        else:
            positional.append(a)
        i += 1
    return incognito, proxy, positional


def main():
    incognito, proxy, positional = parse_args(sys.argv[1:])
    if len(positional) < 3:
        print("사용법: python change_password.py [--incognito] [--proxy host:port] [--] <email> <old_password> <new_password>")
        emit_result({'success': False, 'error': 'BAD_ARGS'})
        sys.exit(1)
    email, old_pw, new_pw = positional[0], positional[1], positional[2]
    print(f"대상 계정: {email}")

    token, err = browser_login_get_token(email, old_pw, incognito=incognito, proxy=proxy)
    if not token:
        print(f"\n[실패] 로그인/토큰 획득 실패: {err}")
        # err 예: 'PASSWORD_WRONG: ...', 'BOT_BLOCKED: ...', 'IP_BLOCKED', 'TOKEN_FAILED'
        code = (err or 'TOKEN_FAILED').split(':')[0].strip()
        if code not in ('PASSWORD_WRONG', 'BOT_BLOCKED', 'IP_BLOCKED', 'TOKEN_FAILED', 'LOGIN_FAILED'):
            code = 'TOKEN_FAILED'
        # BOT_BLOCKED 는 원문 메시지를 함께 전달
        error_field = err if code == 'BOT_BLOCKED' else code
        emit_result({'success': False, 'error': error_field, 'email': email})
        sys.exit(2)
    print(f"\n토큰 획득 성공 (len={len(token)})")

    # 동일 세션으로 계정 정보 조회 (best-effort, 비번 변경과 독립)
    info = {}
    try:
        info = fetch_account_info(token)
    except Exception as e:
        print(f"[조회] 전체 오류: {e}")

    try:
        status, body = change_password(token, old_pw, new_pw)
    except Exception as e:
        print(f"\n[실패] API 호출 예외: {e}")
        emit_result({'success': False, 'error': 'API_FAILED', 'email': email, 'info': info})
        sys.exit(3)

    if status == 200:
        print("\n[결과] 비밀번호 변경 성공 (HTTP 200)")
        emit_result({'success': True, 'email': email, 'status_code': status, 'info': info})
    else:
        print(f"\n[결과] 비밀번호 변경 실패/확인필요 (HTTP {status})")
        emit_result({'success': False, 'error': 'API_FAILED', 'status_code': status,
                     'email': email, 'body': (body or '')[:300], 'info': info})


if __name__ == '__main__':
    main()
