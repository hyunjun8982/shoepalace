"""
아디다스 쿠폰 발급 - Playwright 버전 (API 기반)
- Chrome CDP 연결로 봇 탐지 우회 (Chrome 직접 실행 + connect_over_cdp)
- 로그인 후 API 직접 호출로 쿠폰 발급

사용법:
    python issue_coupon_pw.py <email> <password> <coupon_type>

    coupon_type:
        10000  - 1만원 상품권 (1500P)
        30000  - 3만원 상품권 (3000P)
        50000  - 5만원 상품권 (4000P)
        100000 - 10만원 상품권 (6000P)
"""
import sys
import os
import time
import argparse
import subprocess
import tempfile
import requests

# 쿠폰 타입별 정보
COUPON_TYPES = {
    '10000': {'name': '1만원 상품권', 'points': 1500, 'value': '10000'},
    '30000': {'name': '3만원 상품권', 'points': 3000, 'value': '30000'},
    '50000': {'name': '5만원 상품권', 'points': 4000, 'value': '50000'},
    '100000': {'name': '10만원 상품권', 'points': 6000, 'value': '100000'},
}


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


def get_api_headers():
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'origin': 'https://www.adidas.co.kr',
        'referer': 'https://www.adidas.co.kr/my-account',
    }


def get_account_profile(access_token: str) -> dict:
    """프로필 정보 조회 (이름, 전화번호)"""
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/profile',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            return {
                'name': profile.get('firstName', ''),
                'phone': profile.get('mobileNumber') or profile.get('phone', ''),
                'birthday': profile.get('birthday', ''),
            }
    except Exception as e:
        print(f"프로필 조회 오류: {e}")
    return {}


def get_account_barcode(access_token: str) -> str:
    """바코드(멤버ID) 조회"""
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('memberId', '')
    except Exception as e:
        print(f"바코드 조회 오류: {e}")
    return ''


def get_account_level(access_token: str) -> str:
    """adiClub 레벨 조회"""
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/status',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('levelDescription', '')
    except Exception as e:
        print(f"레벨 조회 오류: {e}")
    return ''


def get_account_points(access_token: str) -> int:
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('availablePoints', 0)
    except Exception as e:
        print(f"포인트 조회 오류: {e}")
    return 0


def get_account_vouchers(access_token: str) -> list:
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers?locale=ko_KR',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            vouchers = resp.json()
            if isinstance(vouchers, list):
                return vouchers
    except Exception as e:
        print(f"쿠폰 목록 조회 오류: {e}")
    return []


def parse_vouchers(vouchers: list) -> list:
    import re
    coupon_list = []
    for v in vouchers:
        if v.get('redeemed') == True or v.get('status') == 'REDEEMED':
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
            'expiryDate': expiry
        })
    return coupon_list


def get_available_voucher_offers(access_token: str) -> list:
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/offer/voucher/personal?locale=ko_KR',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            offers = resp.json()
            if isinstance(offers, list):
                return offers
    except Exception as e:
        print(f"상품권 목록 조회 오류: {e}")
    return []


def find_voucher_offer(offers: list, coupon_value: str) -> dict:
    for offer in offers:
        rewards = offer.get('rewards', [])
        for reward in rewards:
            reward_value = reward.get('value', '')
            if reward_value == coupon_value:
                return {
                    'offerId': offer.get('id'),
                    'rewardId': reward.get('id'),
                    'name': offer.get('name'),
                    'priceInPoints': offer.get('priceInPoints'),
                    'eligible': offer.get('eligible', False),
                    'eligibilityReasons': offer.get('eligibilityReasons', [])
                }
    return None


def claim_voucher(access_token: str, offer_id: int, reward_id: int) -> dict:
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        payload = {
            'offerId': offer_id,
            'rewardId': reward_id
        }
        resp = requests.post(
            'https://www.adidas.co.kr/api/account/loyalty/offer/claim',
            json=payload,
            headers=headers,
            cookies=cookies,
            timeout=15
        )
        if resp.status_code == 200:
            return {'success': True, 'data': resp.json()}
        else:
            return {'success': False, 'status_code': resp.status_code, 'error': resp.text}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def web_login_and_issue_coupon(email: str, password: str, coupon_type: str, incognito: bool = False, headless: bool = False, proxy: str = None):
    """Chrome CDP로 로그인하고 API로 쿠폰 발급 (봇 탐지 우회)"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright가 설치되지 않았습니다.")
        print("설치: pip install playwright && playwright install chromium")
        return {"success": False, "error": "LIBRARY_MISSING"}

    if coupon_type not in COUPON_TYPES:
        print(f"잘못된 쿠폰 타입: {coupon_type}")
        return {"success": False, "error": "INVALID_COUPON_TYPE"}

    coupon_info = COUPON_TYPES[coupon_type]
    print("\n" + "=" * 60)
    print(f"아디다스 쿠폰 발급 (Playwright CDP + API) - {coupon_info['name']}")
    print(f"필요 포인트: {coupon_info['points']}P")
    print("=" * 60)
    print(f"이메일: {email}")

    chrome_proc = None
    playwright_inst = None
    browser = None
    context = None
    access_token = None

    try:
        print("\n[1/5] Chrome 브라우저 시작 (CDP)...")

        chrome_path = _find_chrome_path()
        if not chrome_path:
            print("  [ERROR] Chrome을 찾을 수 없습니다")
            return {"success": False, "error": "CHROME_NOT_FOUND"}

        debug_port = _find_free_port()
        tmp_dir = tempfile.mkdtemp(prefix='pw_cdp_coupon_')

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
                return {"success": False, "error": "IP_BLOCKED"}
        except Exception:
            pass

        login_timeout = 30000 if proxy else 15000
        page.wait_for_selector('input[name="email"], input[type="email"]', timeout=login_timeout)
        print("  완료")

        # 쿠키 동의 처리
        cookie_consent_selectors = [
            '#glass-gdpr-default-consent-accept-button',
            'button[data-auto-id="consent-modal-accept-btn"]',
            '#onetrust-accept-btn-handler',
        ]
        for selector in cookie_consent_selectors:
            try:
                btn = page.query_selector(selector)
                if btn and btn.is_visible():
                    btn.click()
                    print("  쿠키 동의 클릭")
                    page.wait_for_timeout(1000)
                    break
            except Exception:
                continue

        # 이메일/비밀번호 입력
        print("[3/5] 로그인 정보 입력...")
        email_input = page.wait_for_selector('input[name="email"], input[type="email"]', timeout=10000)
        email_input.fill('')
        email_input.type(email, delay=50)

        password_input = page.query_selector('input[name="password"], input[type="password"]')
        password_input.fill('')
        password_input.type(password, delay=50)

        login_btn = page.query_selector('button[type="submit"]')
        login_btn.click()
        print("  완료")

        # 로그인 결과 대기
        page.wait_for_timeout(3000)

        # 토큰 대기
        print("\n[4/5] 토큰 획득 중...")
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            # CDN 차단 감지
            try:
                content = page.content()
                if 'd3r3itx' in content or ('cloudfront.net' in content and '사용자' in content):
                    print(f"  [ERROR] API_BLOCKED: CDN 인증 요청 감지")
                    return {"success": False, "error": "API_BLOCKED"}
            except Exception:
                pass

            # 에러 메시지 확인
            login_error = None
            error_selectors = [
                '#password--error',
                '.gl-form-notice__error',
                '.gl-form-hint--error',
                '[data-auto-id="login-error"]',
                'p[class*="_error_"]',
            ]

            for selector in error_selectors:
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
                if any(keyword in login_error for keyword in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                    print(f"  [ERROR] PASSWORD_WRONG: {login_error}")
                    return {"success": False, "error": "PASSWORD_WRONG"}
                elif any(keyword in login_error for keyword in ['오류가 발생했습니다', '다시 시도하세요', 'error occurred', 'try again']):
                    print(f"  [ERROR] BOT_BLOCKED: {login_error}")
                    return {"success": False, "error": f"BOT_BLOCKED:{login_error}"}
                else:
                    print(f"  [ERROR] LOGIN_FAILED: {login_error}")
                    return {"success": False, "error": "LOGIN_FAILED"}

            # 쿠키에서 토큰 확인 (CDP 세션으로 조회 - context.cookies()는 CDP 모드에서 빈 배열 반환)
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
            print("  [ERROR] 토큰 획득 실패")
            return {"success": False, "error": "TOKEN_FAILED"}

        # ========== 계정 정보 조회 ==========
        print("\n[5/6] 계정 정보 조회 중...")
        profile = get_account_profile(access_token)
        barcode = get_account_barcode(access_token)
        level = get_account_level(access_token)
        account_info = {}
        if profile.get('name'):
            account_info['name'] = profile['name']
            print(f"  이름: {profile['name']}")
        if profile.get('phone'):
            account_info['phone'] = profile['phone']
        if profile.get('birthday'):
            account_info['birthday'] = profile['birthday']
        if barcode:
            account_info['barcode'] = barcode
            print(f"  바코드: {barcode}")
        if level:
            account_info['level'] = level
            print(f"  레벨: {level}")

        # ========== API 기반 쿠폰 발급 ==========
        print("\n[6/6] API로 쿠폰 발급 중...")

        current_points = get_account_points(access_token)
        print(f"  현재 포인트: {current_points}P")

        print("  상품권 목록 조회 중...")
        offers = get_available_voucher_offers(access_token)

        if not offers:
            print("  [ERROR] 상품권 목록 조회 실패")
            return {"success": False, "error": "OFFERS_NOT_FOUND", "remaining_points": current_points, **account_info}

        target_offer = find_voucher_offer(offers, coupon_info['value'])

        if not target_offer:
            print(f"  [WARN] {coupon_info['name']} 상품권 1달 미경과")
            vouchers = get_account_vouchers(access_token)
            coupon_list = parse_vouchers(vouchers)
            print(f"  현재 보유 쿠폰: {len(coupon_list)}개")
            return {
                "success": False,
                "error": "COOLDOWN_PERIOD",
                "message": "1달 미경과",
                "remaining_points": current_points,
                "vouchers": coupon_list,
                **account_info
            }

        print(f"  상품권 발견: {target_offer['name']}")
        print(f"  offerId: {target_offer['offerId']}, rewardId: {target_offer['rewardId']}")
        print(f"  필요 포인트: {target_offer['priceInPoints']}P")
        print(f"  교환 가능: {target_offer['eligible']}")

        if not target_offer['eligible']:
            reasons = target_offer.get('eligibilityReasons', [])
            if reasons:
                reason_parts = []
                for r in reasons:
                    if isinstance(r, dict):
                        reason_parts.append(r.get('reason', r.get('message', str(r))))
                    else:
                        reason_parts.append(str(r))
                reason_str = ', '.join(reason_parts)
            else:
                reason_str = '알 수 없음'
            print(f"  [ERROR] 교환 불가: {reason_str}")

            if current_points < target_offer['priceInPoints']:
                return {
                    "success": False,
                    "error": "INSUFFICIENT_POINTS",
                    "current_points": current_points,
                    "required_points": target_offer['priceInPoints'],
                    "remaining_points": current_points,
                    **account_info
                }
            return {
                "success": False,
                "error": f"NOT_ELIGIBLE:{reason_str}",
                "remaining_points": current_points,
                **account_info
            }

        print("  쿠폰 발급 API 호출 중...")
        claim_result = claim_voucher(access_token, target_offer['offerId'], target_offer['rewardId'])

        if not claim_result['success']:
            error_msg = claim_result.get('error', 'UNKNOWN_ERROR')
            print(f"  [ERROR] 쿠폰 발급 실패: {error_msg}")
            return {"success": False, "error": f"CLAIM_FAILED:{error_msg}", "remaining_points": current_points, **account_info}

        claim_data = claim_result.get('data', {})
        coupon_code = claim_data.get('code', '')
        print(f"  쿠폰 발급 성공!")
        print(f"  쿠폰 코드: {coupon_code}")

        time.sleep(2)
        new_points = get_account_points(access_token)
        vouchers = get_account_vouchers(access_token)
        coupon_list = parse_vouchers(vouchers)

        if coupon_code and not any(c.get('code') == coupon_code for c in coupon_list):
            print(f"  새 쿠폰({coupon_code})이 목록에 없음, 2초 후 재조회...")
            time.sleep(2)
            vouchers = get_account_vouchers(access_token)
            coupon_list = parse_vouchers(vouchers)

        points_used = current_points - new_points

        print("\n" + "=" * 60)
        print(f"쿠폰 발급 완료! [Playwright]")
        print(f"  발급 쿠폰: {coupon_info['name']}")
        print(f"  쿠폰 코드: {coupon_code}")
        print(f"  사용 포인트: {points_used}P")
        print(f"  잔여 포인트: {new_points}P")
        print(f"  보유 쿠폰: {len(coupon_list)}개")
        print("=" * 60)

        return {
            "success": True,
            "coupon_type": coupon_type,
            "coupon_name": coupon_info['name'],
            "coupon_code": coupon_code,
            "points_used": points_used,
            "remaining_points": new_points,
            "vouchers": coupon_list,
            **account_info
        }

    except Exception as e:
        print(f"쿠폰 발급 오류: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

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
        print("\n브라우저 종료")


def main():
    parser = argparse.ArgumentParser(description='아디다스 쿠폰 발급 (Playwright)')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('coupon_type', nargs='?',
                        help='쿠폰 타입: 10000(1만원), 30000(3만원), 50000(5만원), 100000(10만원)')
    parser.add_argument('--incognito', action='store_true', default=False,
                        help='시크릿(incognito) 모드로 브라우저 실행')
    parser.add_argument('--headless', action='store_true', default=False,
                        help='백그라운드(headless) 모드로 브라우저 실행')
    parser.add_argument('--proxy', type=str, default=None,
                        help='프록시 서버 (IP:PORT 형식)')

    args = parser.parse_args()

    if not args.email or not args.password or not args.coupon_type:
        print("사용법:")
        print("  python issue_coupon_pw.py <email> <password> <coupon_type>")
        print("")
        print("쿠폰 타입:")
        print("  10000  - 1만원 상품권 (1500P)")
        print("  30000  - 3만원 상품권 (3000P)")
        print("  50000  - 5만원 상품권 (4000P)")
        print("  100000 - 10만원 상품권 (6000P)")
        return

    result = web_login_and_issue_coupon(args.email, args.password, args.coupon_type, args.incognito, args.headless, args.proxy)

    import json
    print("\n[RESULT]")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
