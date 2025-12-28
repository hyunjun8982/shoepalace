"""
아디다스 쿠폰 발급 - 모바일 버전 (Appium + API 방식)
- adiCLUB 포인트를 사용하여 상품권 교환
- 로그인 후 API 직접 호출로 쿠폰 발급 (UI 조작 대신)
- 쿠폰 종류: 1500P→10,000원, 3000P→30,000원, 4000P→50,000원, 6000P→100,000원

사용법:
    python issue_coupon_mobile.py <email> <password> <coupon_type>
    python issue_coupon_mobile.py --batch <batch_json_path>

    coupon_type:
        10000  - 1만원 상품권 (1500P)
        30000  - 3만원 상품권 (3000P)
        50000  - 5만원 상품권 (4000P)
        100000 - 10만원 상품권 (6000P)
"""
import sys
import os
import time
import json
import argparse
import requests

# stdout 버퍼링 비활성화 (실시간 로그 출력)
sys.stdout.reconfigure(line_buffering=True)

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# 쿠폰 타입별 정보
COUPON_TYPES = {
    '10000': {'name': '1만원 상품권', 'points': 1500, 'text': '₩10000', 'value': '10000'},
    '30000': {'name': '3만원 상품권', 'points': 3000, 'text': '₩30000', 'value': '30000'},
    '50000': {'name': '5만원 상품권', 'points': 4000, 'text': '₩50000', 'value': '50000'},
    '100000': {'name': '10만원 상품권', 'points': 6000, 'text': '₩100000', 'value': '100000'},
}


# ==================== API 함수들 ====================
def get_api_headers():
    """API 기본 헤더"""
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'origin': 'https://www.adidas.co.kr',
        'referer': 'https://www.adidas.co.kr/my-account',
    }


def get_account_points(access_token: str) -> int:
    """토큰으로 현재 포인트 조회"""
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('availablePoints', 0)
    except Exception as e:
        print(f"  포인트 조회 오류: {e}")
    return 0


def get_account_vouchers(access_token: str) -> list:
    """토큰으로 보유 쿠폰 목록 조회"""
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
        print(f"  쿠폰 목록 조회 오류: {e}")
    return []


def parse_vouchers(vouchers: list) -> list:
    """API 응답에서 쿠폰 정보 파싱"""
    import re
    coupon_list = []
    for v in vouchers:
        # 쿠폰 이름 - couponLabel 우선, 없으면 name
        raw_name = v.get('couponLabel') or v.get('name', '')

        # 금액 추출 - API 응답의 value 필드 우선 사용
        value = v.get('value', '')

        # value가 없거나 이상하면 name에서 추출
        if not value or not str(value).isdigit():
            # 코드명에서 금액 추출 (예: "100K_KRW" -> 100000, "10K_KRW" -> 10000)
            match = re.search(r'(\d+)K[_\s]?KRW', raw_name, re.IGNORECASE)
            if match:
                value = str(int(match.group(1)) * 1000)
            else:
                # "₩100,000" 형식에서 추출
                match = re.search(r'[\d,]+', raw_name)
                if match:
                    value = match.group().replace(',', '')

        # 사람이 읽을 수 있는 이름으로 변환
        display_name = raw_name
        if value and str(value).isdigit():
            amount = int(value)
            if amount >= 10000:
                display_name = f"{amount // 10000}만원 상품권"
            else:
                display_name = f"{amount}원 상품권"

        # 유효기간 - available.to에서 가져오기
        available = v.get('available', {})
        expiry = available.get('to', '')
        # 날짜 형식 변환 (2026-01-05T01:33:25Z -> 2026-01-05)
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
    """교환 가능한 상품권 목록 조회"""
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
        print(f"  상품권 목록 조회 오류: {e}")
    return []


def find_voucher_offer(offers: list, coupon_value: str) -> dict:
    """상품권 목록에서 해당 금액의 상품권 찾기"""
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
    """상품권 발급 API 호출"""
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


def get_account_email_from_token(access_token: str) -> str:
    """토큰으로 계정 이메일 조회 (디버깅용)"""
    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}
        resp = requests.get('https://www.adidas.co.kr/api/account/profile',
                          headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            return profile.get('email', 'unknown')
    except:
        pass
    return 'unknown'


def issue_coupon_via_api(access_token: str, coupon_type: str, login_email: str = None) -> dict:
    """API를 통해 쿠폰 발급"""
    coupon_info = COUPON_TYPES.get(coupon_type, COUPON_TYPES['100000'])

    # 토큰 소유자 확인 (디버깅)
    token_email = get_account_email_from_token(access_token)
    token_prefix = access_token[:20] if access_token else 'None'

    # 로그인 이메일과 토큰 소유자 비교
    if login_email:
        if token_email.lower() == login_email.lower():
            print(f"[API] 토큰OK: {token_email} (일치)", flush=True)
        else:
            print(f"[API] *** 토큰 불일치! 로그인:{login_email} vs 토큰:{token_email} ***", flush=True)
            return {"success": False, "message": f"토큰 계정 불일치 (로그인:{login_email}, 토큰:{token_email})"}
    else:
        print(f"[API] 토큰확인: {token_email} (token:{token_prefix}...)", flush=True)

    # 1. 현재 포인트 조회
    current_points = get_account_points(access_token)
    print(f"  포인트: {current_points}P")

    # 2. 교환 가능한 상품권 목록 조회
    offers = get_available_voucher_offers(access_token)
    if not offers:
        return {"success": False, "message": "상품권 목록 조회 실패", "remaining_points": current_points}

    # 3. 해당 금액의 상품권 찾기
    target_offer = find_voucher_offer(offers, coupon_info['value'])
    if not target_offer:
        vouchers = get_account_vouchers(access_token)
        coupon_list = parse_vouchers(vouchers)
        print(f"  1달 미경과 (보유쿠폰: {len(coupon_list)}개)")
        return {
            "success": False, "message": "1달 미경과",
            "error_type": "cooldown_period", "remaining_points": current_points, "vouchers": coupon_list
        }

    # 4. 교환 가능 여부 확인
    if not target_offer['eligible']:
        reasons = target_offer.get('eligibilityReasons', [])
        if reasons:
            reason_parts = [r.get('reason', str(r)) if isinstance(r, dict) else str(r) for r in reasons]
            reason_str = ', '.join(reason_parts)
        else:
            reason_str = '알 수 없음'
        if current_points < target_offer['priceInPoints']:
            return {"success": False, "message": "포인트 부족", "error_type": "insufficient_points", "remaining_points": current_points}
        return {"success": False, "message": f"교환 불가: {reason_str}", "remaining_points": current_points}

    # 5. 쿠폰 발급 API 호출
    claim_result = claim_voucher(access_token, target_offer['offerId'], target_offer['rewardId'])
    if not claim_result['success']:
        return {"success": False, "message": f"발급 실패: {claim_result.get('error', 'UNKNOWN')}", "remaining_points": current_points}

    # 6. 발급 결과
    coupon_code = claim_result.get('data', {}).get('code', '')
    new_points = get_account_points(access_token)
    vouchers = get_account_vouchers(access_token)
    coupon_list = parse_vouchers(vouchers)
    print(f"  [OK] 발급완료: {coupon_code} (잔여: {new_points}P)")

    return {
        "success": True,
        "message": f"{coupon_info['name']} 쿠폰이 발급되었습니다",
        "coupon_code": coupon_code,
        "points_used": current_points - new_points,
        "remaining_points": new_points,
        "vouchers": coupon_list,
        "deduct_points": True
    }
# ==================== API 함수들 끝 ====================


def wait_for_element(driver, by, value, timeout=10, condition='presence'):
    """요소가 나타날 때까지 동적으로 대기"""
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


def wait_for_page_source_contains(driver, text, timeout=10):
    """페이지에 특정 텍스트가 나타날 때까지 대기"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if text in driver.page_source:
            return True
        time.sleep(0.3)
    return False


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


def login_with_driver(driver, email: str, password: str, is_batch_continuation: bool = False) -> tuple:
    """
    웹뷰 컨텍스트에서 로그인하여 토큰 추출
    Returns: (success: bool, access_token: Optional[str])
    """
    try:
        print(f"\n[로그인] {email}" + (" (배치계속)" if is_batch_continuation else ""))

        # [0단계] 항상 쿠키 삭제 (이전 계정 토큰 완전 제거)
        print("  쿠키삭제...")
        clear_webview_cookies(driver)
        time.sleep(0.5)
        # 한번 더 삭제 (확실하게)
        clear_webview_cookies(driver)

        # [1단계] 딥링크로 로그인 화면 이동
        driver.execute_script("mobile: deepLink", {"url": "adidas://login", "package": "com.adidas.app"})
        time.sleep(2)

        # 딥링크 이동 후 쿠키 다시 삭제 (WebView 새로 로드되면서 복원될 수 있음)
        clear_webview_cookies(driver)

        # 이미 로그인 상태면 로그아웃
        page_source = driver.page_source
        if 'login.email.input' not in page_source and 'login.password.input' not in page_source:
            if '프로필' in page_source or 'profile' in page_source.lower() or '로그아웃' in page_source:
                print("  [!] 이미 로그인 상태 - 로그아웃")
                logout_with_driver(driver)
                time.sleep(1)
                driver.execute_script("mobile: deepLink", {"url": "adidas://login", "package": "com.adidas.app"})
                time.sleep(2)
            else:
                # 로그인 화면도 아니고 프로필도 아닌 상태
                print(f"  [DEBUG] 알 수 없는 화면")
                if 'error' in page_source.lower() or '오류' in page_source:
                    print(f"  [DEBUG] 에러 화면")

        # [2단계] 이메일 입력
        email_field = wait_for_element(driver, AppiumBy.XPATH,
            "//android.widget.EditText[@resource-id='login.email.input']", timeout=10, condition='clickable')
        if not email_field:
            email_field = wait_for_element(driver, AppiumBy.XPATH,
                "(//android.webkit.WebView//android.widget.EditText)[1]", timeout=5, condition='clickable')
        if not email_field:
            print("  [ERROR] 이메일 입력란 없음")
            # 현재 화면 상태 디버깅
            page_source = driver.page_source
            if 'login' in page_source.lower():
                print("  [DEBUG] 로그인 관련 화면이지만 입력란 못찾음")
            return (False, None)

        email_field.clear()
        email_field.send_keys(email)

        # [3단계] 비밀번호 입력
        password_entered = False
        try:
            pwd_field = driver.find_element(AppiumBy.XPATH,
                "//android.widget.EditText[@resource-id='login.password.input']")
            pwd_field.clear()
            pwd_field.send_keys(password)
            password_entered = True
        except:
            pass

        if not password_entered:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH,
                    "(//android.webkit.WebView//android.widget.EditText)[2]")
                pwd_field.clear()
                pwd_field.send_keys(password)
                password_entered = True
            except:
                pass

        if not password_entered:
            print("  [ERROR] 비밀번호 입력란 없음")
            return (False, None)

        # [4단계] 로그인 버튼 클릭
        submit_clicked = False
        try:
            submit_btn = driver.find_element(AppiumBy.XPATH,
                "//android.widget.Button[@resource-id='login-submit-button']")
            submit_btn.click()
            submit_clicked = True
        except:
            pass

        if not submit_clicked:
            for text in ['로그인하기', 'LOG IN', '로그인']:
                try:
                    submit_btn = driver.find_element(AppiumBy.XPATH, f"//android.widget.Button[@text='{text}']")
                    submit_btn.click()
                    submit_clicked = True
                    break
                except:
                    pass

        if not submit_clicked:
            print("  [ERROR] 로그인 버튼 없음")
            return (False, None)

        # [5단계] 토큰 추출 (새 토큰만 수락)
        access_token = None
        start_time = time.time()
        max_wait = 15
        old_token = None  # 로그인 전 토큰 (있으면 무시해야 함)

        try:
            contexts = driver.contexts
            webview_context = None
            for ctx in contexts:
                if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                    webview_context = ctx
                    break

            if webview_context:
                driver.switch_to.context(webview_context)

                # 로그인 전 기존 토큰 확인 (이건 무시해야 함)
                try:
                    cookies = driver.get_cookies()
                    for cookie in cookies:
                        if cookie.get('name') == 'account.grant.accessToken':
                            old_token = cookie.get('value')
                            print(f"  [!] 기존토큰 발견 (무시예정): {old_token[:15]}...", flush=True)
                            # 기존 토큰 삭제 시도
                            driver.delete_cookie('account.grant.accessToken')
                            break
                except:
                    pass

                while time.time() - start_time < max_wait:
                    try:
                        cookies = driver.get_cookies()
                        for cookie in cookies:
                            if cookie.get('name') == 'account.grant.accessToken':
                                new_token = cookie.get('value')
                                # 기존 토큰과 다른 경우에만 수락
                                if old_token and new_token == old_token:
                                    continue  # 이전 토큰은 무시
                                access_token = new_token
                                break
                        if access_token:
                            print(f"  [OK] 새토큰 획득 ({int(time.time() - start_time)}초) token:{access_token[:20]}...", flush=True)
                            break

                        # 로그인 실패 확인 (5초 후)
                        if time.time() - start_time > 5:
                            page_source = driver.page_source
                            error_patterns = ['Invalid email or password', 'incorrect password',
                                            '이메일 또는 비밀번호가 잘못', '로그인에 실패']
                            if any(err.lower() in page_source.lower() for err in error_patterns):
                                print("  [FAIL] 비밀번호 오류")
                                driver.switch_to.context('NATIVE_APP')
                                return (False, None)
                    except:
                        break
                    time.sleep(0.5)

                driver.switch_to.context('NATIVE_APP')
        except Exception as e:
            print(f"  [ERROR] 토큰추출 오류: {e}")
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass

        if not access_token:
            # 토큰 없이 로그인 성공 여부 확인
            time.sleep(1.5)
            page_source = driver.page_source
            if 'login.email.input' in page_source or 'login-submit-button' in page_source:
                print("  [FAIL] 로그인 화면 유지됨")
                return (False, None)
            print("  [OK] 로그인 성공 (토큰없음)")

        # [6단계] 팝업 닫기
        for desc in ['Close', 'close', '닫기', 'X']:
            x_btn = wait_for_element(driver, AppiumBy.XPATH, f"//*[@content-desc='{desc}']", timeout=2, condition='clickable')
            if x_btn:
                x_btn.click()
                break

        return (True, access_token)

    except Exception as e:
        print(f"  [ERROR] 로그인 예외: {e}")
        return (False, None)


def issue_coupon_after_login(driver, email: str, coupon_type: str = "100000") -> dict:
    """
    로그인 완료 후 쿠폰 발급 수행
    (입출고관리시스템의 adidas_coupon_issuance_mobile.py에서 로그인 이후 로직 가져옴)
    """
    coupon_info = COUPON_TYPES.get(coupon_type, COUPON_TYPES['100000'])
    coupon_text = coupon_info['text']
    required_points = coupon_info['points']

    try:
        window_size = driver.get_window_size()
        width = window_size['width']
        height = window_size['height']

        # [7단계] 하단 메뉴에서 아디클럽 버튼 클릭 (원래 8단계 → 7단계)
        print("\n[7단계] 하단 메뉴에서 아디클럽 클릭")

        adiclub_clicked = False

        # 방법 1: resource-id로 찾기
        adiclub_btn = wait_for_element(driver, AppiumBy.XPATH,
            "//*[@resource-id='com.adidas.app:id/mainTabBarAdiClub']",
            timeout=5, condition='clickable')
        if adiclub_btn:
            adiclub_btn.click()
            print("  아디클럽 버튼 클릭 (resource-id)")
            adiclub_clicked = True

        # 방법 2: content-desc로 찾기
        if not adiclub_clicked:
            for desc in ['아디클럽', 'adiCLUB', 'ADICLUB']:
                try:
                    adiclub_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    adiclub_btn.click()
                    print(f"  아디클럽 버튼 클릭 (content-desc: {desc})")
                    adiclub_clicked = True
                    break
                except:
                    pass

        if not adiclub_clicked:
            return {"success": False, "message": "아디클럽 버튼을 찾을 수 없습니다"}

        # 아디클럽 페이지 로딩 대기
        print("  아디클럽 페이지 로딩 대기 중...")
        page_fully_loaded = False
        for i in range(30):
            page_source = driver.page_source
            has_toolbar = 'adiclub_toolbar' in page_source
            has_coupon_section = '상품권 쿠폰 받기' in page_source or '포인트 사용하기' in page_source

            if has_toolbar and has_coupon_section:
                print(f"  아디클럽 페이지 로딩 완료 ({(i+1)*0.5:.1f}초)")
                page_fully_loaded = True
                break
            time.sleep(0.5)

        if not page_fully_loaded:
            return {"success": False, "message": "아디클럽 페이지 로딩 실패"}

        # [8단계] 상품권 쿠폰 받기 섹션 찾기
        print("\n[8단계] '상품권 쿠폰 받기' 섹션 찾기")

        page_source = driver.page_source
        if '상품권 쿠폰 받기' not in page_source:
            print("  스크롤하여 찾는 중...")
            for i in range(3):
                driver.swipe(width // 2, height * 0.8, width // 2, height * 0.2, 400)
                time.sleep(0.5)
                page_source = driver.page_source
                if '상품권 쿠폰 받기' in page_source:
                    print(f"  '상품권 쿠폰 받기' 발견 (스크롤 {i+1}번)")
                    break
        else:
            print("  '상품권 쿠폰 받기' 섹션 발견")

        if '상품권 쿠폰 받기' not in page_source:
            return {"success": False, "message": "상품권 쿠폰 섹션을 찾을 수 없습니다"}

        # [9단계] 해당 금액 쿠폰 찾기 (가로 스크롤)
        print(f"\n[9단계] {coupon_text} 할인 쿠폰 찾기")

        # 쿠폰 영역 Y 좌표 찾기
        coupon_y = int(height * 0.85)
        try:
            first_coupon = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '₩') and contains(@text, '할인')]")
            coupon_location = first_coupon.location
            coupon_size = first_coupon.size
            coupon_y = coupon_location['y'] + coupon_size['height'] // 2
            print(f"  쿠폰 영역 Y 좌표: {coupon_y}")
        except:
            pass

        # 가로 스크롤로 쿠폰 찾기
        found_coupon = False
        for swipe_count in range(7):
            page_source = driver.page_source
            if coupon_text in page_source or f'{coupon_type} 할인' in page_source:
                print(f"  {coupon_text} 할인 쿠폰 발견 (스크롤 {swipe_count}번)")
                found_coupon = True
                break

            # 우측으로 가로 스크롤
            driver.swipe(int(width * 0.9), coupon_y, int(width * 0.1), coupon_y, 500)
            print(f"  우측으로 가로 스크롤 {swipe_count + 1}번")
            time.sleep(0.8)

        if not found_coupon:
            print(f"  [WARNING] {coupon_text} 쿠폰 미발견, 진행 시도")

        # [10단계] 쿠폰 버튼 클릭
        print(f"\n[10단계] {coupon_text} 할인 쿠폰 버튼 클릭")

        offer_clicked = False

        # 방법 1: 텍스트로 찾기
        try:
            coupon_elem = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{coupon_type}') and contains(@text, '할인')]")
            parent_view = coupon_elem.find_element(AppiumBy.XPATH, "..")
            if parent_view.get_attribute("clickable") == "true":
                parent_view.click()
                offer_clicked = True
            else:
                grandparent = parent_view.find_element(AppiumBy.XPATH, "..")
                if grandparent.get_attribute("clickable") == "true":
                    grandparent.click()
                    offer_clicked = True
            if offer_clicked:
                print(f"  {coupon_text} 쿠폰 클릭")
        except:
            pass

        if not offer_clicked:
            return {"success": False, "message": f"{coupon_text} 쿠폰 버튼을 찾을 수 없습니다"}

        # [11단계] 쿠폰 상세 페이지에서 하단 스크롤
        print("\n[11단계] 쿠폰 상세 페이지 - 하단 스크롤")
        wait_for_page_source_contains(driver, '변환', timeout=5)

        for i in range(2):
            driver.swipe(width // 2, height * 0.8, width // 2, height * 0.2, 400)
            time.sleep(0.3)

        # 에러 케이스 확인
        page_source = driver.page_source

        # 포인트 부족
        if '포인트가 부족합니다' in page_source or '죄송합니다' in page_source:
            print("  [에러] 포인트 부족")
            driver.press_keycode(4)  # 뒤로가기
            return {"success": False, "message": "포인트 부족", "error_type": "insufficient_points"}

        # 이미 발급됨
        if '교환 완료' in page_source:
            print("  [에러] 이미 쿠폰 발급됨")
            driver.press_keycode(4)
            return {"success": False, "message": "이미 쿠폰 발급됨", "error_type": "already_issued"}

        # [12단계] 상품권 변환하기 버튼 클릭
        print(f"\n[12단계] '{required_points} 포인트로 상품권 변환하기' 버튼 클릭")

        exchange_clicked = False

        try:
            exchange_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='voucher_offer_buy_button']")
            exchange_btn.click()
            print(f"  상품권 변환하기 버튼 클릭")
            exchange_clicked = True
        except:
            pass

        if not exchange_clicked:
            try:
                exchange_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{required_points}') and contains(@text, '변환')]")
                exchange_btn.click()
                print(f"  상품권 변환하기 버튼 클릭 (텍스트)")
                exchange_clicked = True
            except:
                pass

        if not exchange_clicked:
            for text in ['상품권 변환하기', '변환하기', '교환하기']:
                try:
                    exchange_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{text}')]")
                    exchange_btn.click()
                    print(f"  '{text}' 버튼 클릭")
                    exchange_clicked = True
                    break
                except:
                    pass

        if not exchange_clicked:
            return {"success": False, "message": "상품권 변환하기 버튼을 찾을 수 없습니다"}

        # [13단계] 상품권 변환 확정하기 버튼 클릭
        print("\n[13단계] '상품권 변환 확정하기' 버튼 클릭")
        wait_for_page_source_contains(driver, '확정', timeout=3)

        confirm_clicked = False

        try:
            confirm_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='redemption_points_confirmation_confirm_button']")
            confirm_btn.click()
            print(f"  상품권 변환 확정하기 버튼 클릭")
            confirm_clicked = True
        except:
            pass

        if not confirm_clicked:
            for text in ['상품권 변환 확정하기', '상품권 교환 확정하기', '확정하기', '확인']:
                try:
                    confirm_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{text}')]")
                    confirm_btn.click()
                    print(f"  '{text}' 버튼 클릭")
                    confirm_clicked = True
                    break
                except:
                    pass

        if not confirm_clicked:
            return {"success": False, "message": "상품권 변환 확정하기 버튼을 찾을 수 없습니다"}

        print("\n  [OK] 쿠폰 발급 완료!")

        # [14단계] 뒤로가기
        print("\n[14단계] 뒤로가기")
        try:
            back_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='app_bar_back_button']")
            back_btn.click()
        except:
            driver.press_keycode(4)

        return {"success": True, "message": f"{coupon_info['name']} 쿠폰이 발급되었습니다", "deduct_points": True}

    except Exception as e:
        print(f"\n[ERROR] 쿠폰 발급 중 예외: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"쿠폰 발급 실패: {str(e)}"}


def logout_with_driver(driver) -> bool:
    """로그아웃 수행 (딥링크 사용)"""
    try:
        window_size = driver.get_window_size()
        width = window_size['width']
        height = window_size['height']

        print("[로그아웃]")

        # 딥링크로 프로필 화면 이동
        driver.execute_script("mobile: deepLink", {"url": "adidas://profile", "package": "com.adidas.app"})
        time.sleep(1.5)

        page_source = driver.page_source
        if 'profile_login_button' in page_source or 'login.email.input' in page_source:
            print("  이미 로그아웃 상태")
            # 쿠키도 삭제
            clear_webview_cookies(driver)
            return True

        # 스크롤하여 로그아웃 찾기
        for i in range(5):
            if '로그아웃' in driver.page_source or 'LOGOUT' in driver.page_source:
                break
            driver.swipe(width // 2, int(height * 0.8), width // 2, int(height * 0.2), 400)
            time.sleep(0.3)

        # 로그아웃 버튼 클릭
        logout_clicked = False
        for text in ['로그아웃', 'LOGOUT', 'Log out']:
            try:
                driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']").click()
                logout_clicked = True
                break
            except:
                pass

        if not logout_clicked:
            for desc in ['로그아웃', 'logout', 'LOGOUT']:
                try:
                    driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']").click()
                    logout_clicked = True
                    break
                except:
                    pass

        if not logout_clicked:
            print("  [!] 로그아웃 버튼 없음")
            # 쿠키라도 삭제
            clear_webview_cookies(driver)
            return False

        # 확인 팝업
        time.sleep(0.5)
        for text in ['로그아웃', 'LOG OUT', '확인', 'Yes', 'OK']:
            try:
                driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']").click()
                break
            except:
                pass

        time.sleep(2)

        # 로그아웃 후 쿠키 삭제 (중요!)
        clear_webview_cookies(driver)

        print("  완료")
        return True

    except Exception as e:
        print(f"  [ERROR] {e}")
        # 실패해도 쿠키는 삭제 시도
        clear_webview_cookies(driver)
        return False


def issue_coupon_mobile(email: str, password: str, coupon_type: str = "100000") -> dict:
    """
    단일 계정 모바일 쿠폰 발급 (Appium 연결부터 종료까지)
    - 로그인 후 API로 쿠폰 발급 (토큰 획득 성공 시)
    - 토큰 획득 실패 시 UI 자동화로 폴백
    """
    driver = None
    try:
        # Appium 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.app_package = 'com.adidas.app'
        options.no_reset = True
        options.new_command_timeout = 300

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)
        options.set_capability('appium:adbExecTimeout', 60000)
        options.set_capability('appium:chromedriverAutodownload', True)

        print("\n[Appium] 연결 중...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("[Appium] 연결 성공")

        # 앱 실행
        driver.activate_app('com.adidas.app')
        time.sleep(2)

        # 로그인 (토큰도 함께 추출)
        login_success, access_token = login_with_driver(driver, email, password)
        if not login_success:
            return {"success": False, "message": "로그인 실패"}

        # 쿠폰 발급 - API 방식만 사용
        if access_token:
            print("\n[API 모드] 토큰으로 쿠폰 발급 시도")
            result = issue_coupon_via_api(access_token, coupon_type, login_email=email)
        else:
            print("\n[ERROR] 토큰 추출 실패 - 쿠폰 발급 불가")
            result = {"success": False, "message": "토큰 추출 실패"}

        # 로그아웃
        logout_with_driver(driver)

        return result

    except Exception as e:
        print(f"\n[ERROR] 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": str(e)}

    finally:
        if driver:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            driver.quit()
            print("\n[Appium] 세션 종료")


def process_batch_mode(batch_json_path: str):
    """
    배치 모드: 여러 계정 순차 처리 (Appium 1회 연결)
    """
    driver = None
    results = []

    try:
        # JSON 파일에서 계정 목록 로드
        with open(batch_json_path, 'r', encoding='utf-8') as f:
            batch_data = json.load(f)

        # 서버에서 보내는 형식: { coupon_type: "...", accounts: [...] }
        if isinstance(batch_data, dict):
            accounts = batch_data.get('accounts', [])
            default_coupon_type = batch_data.get('coupon_type', '100000')
        else:
            # 이전 형식 호환: 배열만 있는 경우
            accounts = batch_data
            default_coupon_type = '100000'

        if not accounts:
            print("[ERROR] 계정 목록이 비어있습니다")
            return

        print(f"\n[배치] {len(accounts)}개 계정 쿠폰 발급 ({default_coupon_type}원)")

        # 첫 번째 계정을 "Appium 연결 중..." 상태로 표시
        first_acc_id = accounts[0].get('id') if accounts else None
        if first_acc_id:
            print(f'[PROGRESS] {{"id": {first_acc_id}, "status": "processing", "message": "Appium 연결 중..."}}', flush=True)

        # Appium 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.app_package = 'com.adidas.app'
        options.no_reset = True
        options.new_command_timeout = 600

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)
        options.set_capability('appium:adbExecTimeout', 60000)
        options.set_capability('appium:chromedriverAutodownload', True)

        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("[Appium] 연결됨", flush=True)

        # 앱 실행
        driver.activate_app('com.adidas.app')
        time.sleep(2)

        # 각 계정 순차 처리
        for i, account in enumerate(accounts):
            email = account.get('email')
            password = account.get('password')
            acc_id = account.get('id')
            coupon_type = account.get('coupon_type', default_coupon_type)

            is_continuation = (i > 0)

            # 진행 상태 출력 (server.js에서 파싱용)
            progress_data = {'id': acc_id, 'status': 'processing', 'message': f'{coupon_type}원 발급 중...'}
            print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
            sys.stdout.flush()

            account_result = {
                'id': acc_id,
                'email': email,
                'success': False,
                'message': None
            }

            try:
                # 로그인 (토큰 추출 포함)
                login_success, access_token = login_with_driver(driver, email, password, is_continuation)
                if not login_success:
                    account_result['message'] = '로그인 실패'
                    progress_data = {'id': acc_id, 'status': 'error', 'message': '로그인 실패'}
                    print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                    sys.stdout.flush()
                    # 로그인 실패해도 로그아웃 시도
                    try:
                        logout_with_driver(driver)
                    except:
                        pass
                else:
                    # 쿠폰 발급 - API 방식
                    if access_token:
                        result = issue_coupon_via_api(access_token, coupon_type, login_email=email)
                    else:
                        print("  [!] 토큰 없음")
                        result = {"success": False, "message": "토큰 추출 실패"}

                    account_result['success'] = result.get('success', False)
                    account_result['message'] = result.get('message')
                    account_result['error_type'] = result.get('error_type')
                    account_result['coupon_code'] = result.get('coupon_code')
                    account_result['remaining_points'] = result.get('remaining_points')
                    account_result['vouchers'] = result.get('vouchers')

                    # 진행 결과 출력 (포인트/쿠폰 정보 포함)
                    # vouchers는 별도 라인으로 출력 (JSON 길이 제한 방지)
                    vouchers = result.get('vouchers', [])
                    remaining_points = result.get('remaining_points', 0)

                    if account_result['success']:
                        progress_data = {
                            'id': acc_id,
                            'status': 'success',
                            'message': f'{coupon_type}원 발급 완료',
                            'data': {
                                'remaining_points': remaining_points,
                                'voucher_count': len(vouchers)
                            }
                        }
                    else:
                        # 실패해도 포인트/쿠폰 정보가 있으면 포함 (대기 기간 등)
                        error_type = result.get('error_type', '')
                        status = 'warning' if error_type == 'cooldown_period' else 'error'
                        progress_data = {
                            'id': acc_id,
                            'status': status,
                            'message': account_result['message'],
                            'data': {
                                'remaining_points': remaining_points,
                                'voucher_count': len(vouchers)
                            }
                        }
                    print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                    sys.stdout.flush()

                    # 쿠폰 정보 개별 출력 (stdout 버퍼 제한으로 인한 잘림 방지)
                    for voucher in vouchers:
                        voucher_line = {
                            'id': acc_id,
                            'voucher': voucher
                        }
                        print(f"[VOUCHER] {json.dumps(voucher_line, ensure_ascii=False)}")
                        sys.stdout.flush()

                    # 로그아웃
                    logout_with_driver(driver)

            except Exception as e:
                account_result['message'] = str(e)
                progress_data = {'id': acc_id, 'status': 'error', 'message': str(e)}
                print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                sys.stdout.flush()

            results.append(account_result)

            # 계정 간 대기
            if i < len(accounts) - 1:
                time.sleep(1)

        # 완료 결과 출력
        complete_result = {
            'total': len(results),
            'success': sum(1 for r in results if r['success']),
            'failed': sum(1 for r in results if not r['success'])
        }
        print(f"\n[BATCH_COMPLETE] {json.dumps(complete_result)}")

    except Exception as e:
        print(f"[ERROR] 배치 처리 오류: {e}")

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def issue_via_session_server(email: str, password: str, coupon_type: str = "100000") -> dict:
    """세션 서버를 통한 쿠폰 발급 (Appium 연결 재사용)"""
    import requests

    try:
        resp = requests.post(
            'http://localhost:4780/issue',
            json={'email': email, 'password': password, 'coupon_type': coupon_type},
            timeout=120
        )
        return resp.json()
    except requests.exceptions.ConnectionError:
        return {'success': False, 'message': '세션 서버 연결 실패 (서버가 실행 중인지 확인)'}
    except Exception as e:
        return {'success': False, 'message': str(e)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='아디다스 모바일 쿠폰 발급')
    parser.add_argument('email', nargs='?', help='이메일')
    parser.add_argument('password', nargs='?', help='비밀번호')
    parser.add_argument('coupon_type', nargs='?', default='100000', help='쿠폰 타입 (10000/30000/50000/100000)')
    parser.add_argument('--batch', help='배치 모드용 JSON 파일 경로')
    parser.add_argument('--use-session', action='store_true', help='세션 서버 사용 (Appium 연결 재사용)')

    args = parser.parse_args()

    if args.batch:
        # 배치 모드
        process_batch_mode(args.batch)
    elif args.use_session and args.email and args.password:
        # 세션 서버 모드 (Appium 연결 재사용)
        print("[세션 모드] 세션 서버를 통한 쿠폰 발급")
        result = issue_via_session_server(args.email, args.password, args.coupon_type)
        print(f"\n[RESULT] {json.dumps(result, ensure_ascii=False)}")
    elif args.email and args.password:
        # 단일 계정 모드
        result = issue_coupon_mobile(args.email, args.password, args.coupon_type)
        print(f"\n[RESULT] {json.dumps(result, ensure_ascii=False)}")
    else:
        print("사용법:")
        print("  단일: python issue_coupon_mobile.py <email> <password> <coupon_type>")
        print("  배치: python issue_coupon_mobile.py --batch <batch_json_path>")
        sys.exit(1)
