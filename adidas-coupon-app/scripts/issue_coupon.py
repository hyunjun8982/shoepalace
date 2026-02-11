"""
아디다스 쿠폰 발급 - 웹 브라우저 버전 (API 기반)
- adiCLUB 포인트를 사용하여 상품권 교환
- 로그인 후 API 직접 호출로 쿠폰 발급 (버튼 클릭 방식 대신)
- 쿠폰 종류: 1500P→10,000원, 3000P→30,000원, 4000P→50,000원, 6000P→100,000원

사용법:
    python issue_coupon.py <email> <password> <coupon_type>

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
import requests

# 쿠폰 타입별 정보 (offerId, rewardId는 API에서 동적으로 조회)
COUPON_TYPES = {
    '10000': {'name': '1만원 상품권', 'points': 1500, 'value': '10000'},
    '30000': {'name': '3만원 상품권', 'points': 3000, 'value': '30000'},
    '50000': {'name': '5만원 상품권', 'points': 4000, 'value': '50000'},
    '100000': {'name': '10만원 상품권', 'points': 6000, 'value': '100000'},
}

# API 기본 헤더
def get_api_headers():
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
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
        print(f"포인트 조회 오류: {e}")
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
        print(f"쿠폰 목록 조회 오류: {e}")
    return []


def parse_vouchers(vouchers: list) -> list:
    """API 응답에서 쿠폰 정보 파싱 (사용된 쿠폰 제외)"""
    import re
    coupon_list = []
    for v in vouchers:
        # 사용된 쿠폰은 제외 (redeemed=true 또는 status가 'REDEEMED')
        if v.get('redeemed') == True or v.get('status') == 'REDEEMED':
            continue
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
            # 할인권 체크 (value가 1~20 범위이고, 이름에 할인/discount/% 포함)
            is_discount = amount <= 20 and ('할인' in raw_name.lower() or 'discount' in raw_name.lower() or '%' in raw_name)
            if is_discount:
                # 할인권은 원래 이름 유지 또는 퍼센트로 표시
                if '%' not in raw_name:
                    display_name = f"{amount * 5}% 할인권" if amount <= 2 else f"{amount}% 할인권"
                # else: 원래 이름 유지
            elif amount >= 10000:
                display_name = f"{amount // 10000}만원 상품권"
            elif amount >= 1000:
                display_name = f"{amount}원 상품권"
            else:
                # 1~999 범위인데 할인권이 아닌 경우 - 원래 이름 유지
                pass  # display_name = raw_name 유지

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
        print(f"상품권 목록 조회 오류: {e}")
    return []


def find_voucher_offer(offers: list, coupon_value: str) -> dict:
    """상품권 목록에서 해당 금액의 상품권 찾기"""
    for offer in offers:
        # value 필드에서 금액 확인 (예: "10000", "30000")
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


def web_login_and_issue_coupon(email: str, password: str, coupon_type: str):
    """
    웹 브라우저로 로그인하고 API로 쿠폰 발급
    1. 브라우저로 로그인하여 토큰 획득
    2. API로 교환 가능 여부 확인
    3. API로 쿠폰 발급
    4. 발급 완료 후 정보 조회
    """
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import TimeoutException, NoSuchElementException
    except ImportError:
        print("필요한 라이브러리가 없습니다.")
        print("설치: pip install undetected-chromedriver selenium")
        return {"success": False, "error": "LIBRARY_MISSING"}

    if coupon_type not in COUPON_TYPES:
        print(f"잘못된 쿠폰 타입: {coupon_type}")
        print(f"가능한 타입: {', '.join(COUPON_TYPES.keys())}")
        return {"success": False, "error": "INVALID_COUPON_TYPE"}

    coupon_info = COUPON_TYPES[coupon_type]
    print("\n" + "=" * 60)
    print(f"아디다스 쿠폰 발급 (API 방식) - {coupon_info['name']}")
    print(f"필요 포인트: {coupon_info['points']}P")
    print("=" * 60)
    print(f"이메일: {email}")

    driver = None
    access_token = None

    try:
        print("\n[1/5] 브라우저 시작...")
        # Chrome 옵션 설정 (최소한의 옵션으로 안정성 확보)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(f"  [시도 {attempt+1}/{max_retries}] Chrome 초기화 중...")
                options = uc.ChromeOptions()
                options.add_argument('--incognito')  # 시크릿 모드
                options.add_argument('--window-size=1280,900')
                options.add_argument('--lang=ko-KR')
                options.add_argument('--disable-blink-features=AutomationControlled')
                options.add_argument('--no-first-run')
                options.add_argument('--no-default-browser-check')
                options.add_argument('--disable-popup-blocking')

                # 로그 레벨 설정으로 Chrome 내부 오류 확인
                options.add_argument('--log-level=3')
                options.add_argument('--silent')

                print("  ChromeDriver 시작 중...")
                # driver_executable_path=None으로 설정하여 올바른 버전 자동 다운로드
                driver = uc.Chrome(
                    options=options,
                    use_subprocess=True,
                    driver_executable_path=None,
                    version_main=144  # Chrome 144 버전 명시
                )
                print("  ChromeDriver 시작 완료")

                time.sleep(2)  # 브라우저 안정화 대기

                # 윈도우 핸들 확인 (브라우저 살아있는지)
                print("  브라우저 핸들 확인 중...")
                for hc in range(5):
                    try:
                        handle = driver.current_window_handle
                        print(f"  브라우저 핸들 확인 성공: {handle[:20]}...")
                        break
                    except Exception as he:
                        if hc < 4:
                            print(f"    핸들 확인 재시도 {hc+1}/5...")
                            time.sleep(1)
                        else:
                            raise Exception(f"윈도우 핸들 확인 실패: {he}")

                print("  브라우저 초기화 성공")
                break  # 성공
            except Exception as e:
                print(f"  [오류] 드라이버 초기화 실패: {e}")
                import traceback
                traceback.print_exc()
                try:
                    if driver:
                        driver.quit()
                except:
                    pass
                driver = None
                if attempt < max_retries - 1:
                    print(f"  3초 후 재시도...")
                    time.sleep(3)
                else:
                    raise Exception(f"브라우저 시작 실패 ({max_retries}회 시도): {e}")

        if driver is None:
            raise Exception("브라우저 시작 실패")

        driver.implicitly_wait(10)
        print("  완료")

        print("[2/5] 로그인 페이지 이동...")
        # 페이지 이동 전 브라우저 상태 확인
        for plr in range(3):
            try:
                _ = driver.current_window_handle
                driver.get("https://www.adidas.co.kr/account-login")
                break
            except Exception as e:
                print(f"  페이지 이동 실패 ({plr+1}/3): {e}")
                if plr < 2:
                    time.sleep(2)
                else:
                    raise Exception(f"페이지 이동 실패: {e}")

        # 페이지 로드 대기
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        print("  완료")

        # 쿠키 동의 처리
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
                    print("  쿠키 동의 클릭")
                    time.sleep(1)
                    break
            except NoSuchElementException:
                continue
        driver.implicitly_wait(10)

        # 이메일 입력
        print("[3/5] 로그인 정보 입력...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.clear()
        email_input.send_keys(email)

        # 비밀번호 입력
        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.clear()
        password_input.send_keys(password)

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        print("  완료")

        # 로그인 결과 대기
        time.sleep(3)

        # 토큰 대기 및 에러 체크
        print("\n[4/5] 토큰 획득 중...")
        login_error = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            driver.implicitly_wait(0)
            try:
                # CDN 차단 감지
                try:
                    alert = driver.switch_to.alert
                    alert_text = alert.text if alert else ''
                    if alert_text and ('cloudfront' in alert_text.lower() or '로그인' in alert_text or '사용자' in alert_text):
                        print(f"  [ERROR] API_BLOCKED: CDN 인증 요청 감지")
                        try:
                            alert.dismiss()
                        except:
                            pass
                        return {"success": False, "error": "API_BLOCKED"}
                except:
                    pass

                # 페이지 내 CDN 차단 감지
                try:
                    page_source = driver.page_source
                    if 'd3r3itx' in page_source or ('cloudfront.net' in page_source and '사용자' in page_source):
                        print(f"  [ERROR] API_BLOCKED: 페이지 내 CDN 인증 요청 감지")
                        return {"success": False, "error": "API_BLOCKED"}
                except:
                    pass

                # 에러 메시지 확인
                error_selectors = [
                    '#password--error',
                    '.gl-form-notice__error',
                    '.gl-form-hint--error',
                    '[data-auto-id="login-error"]',
                    'p[class*="_error_"]',
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

                if login_error:
                    if any(keyword in login_error for keyword in ['오류가 발생했습니다', '다시 시도하세요', 'error occurred', 'try again']):
                        print(f"  [ERROR] BOT_BLOCKED: {login_error}")
                        return {"success": False, "error": f"BOT_BLOCKED:{login_error}"}
                    elif any(keyword in login_error for keyword in ['비밀번호', 'password', '잘못된', 'incorrect', '올바르지']):
                        print(f"  [ERROR] PASSWORD_WRONG: {login_error}")
                        return {"success": False, "error": "PASSWORD_WRONG"}
                    else:
                        print(f"  [ERROR] LOGIN_FAILED: {login_error}")
                        return {"success": False, "error": "LOGIN_FAILED"}

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

        if not access_token:
            print("  [ERROR] 토큰 획득 실패")
            return {"success": False, "error": "TOKEN_FAILED"}

        # ========== API 기반 쿠폰 발급 ==========
        print("\n[5/5] API로 쿠폰 발급 중...")

        # 5-1. 현재 포인트 조회
        current_points = get_account_points(access_token)
        print(f"  현재 포인트: {current_points}P")

        # 5-2. 교환 가능한 상품권 목록 조회
        print("  상품권 목록 조회 중...")
        offers = get_available_voucher_offers(access_token)

        if not offers:
            print("  [ERROR] 상품권 목록 조회 실패")
            return {"success": False, "error": "OFFERS_NOT_FOUND", "remaining_points": current_points}

        # 5-3. 해당 금액의 상품권 찾기
        target_offer = find_voucher_offer(offers, coupon_info['value'])

        if not target_offer:
            # 상품권이 목록에 없음 = 최근 발급으로 인한 대기 기간 (1달)
            print(f"  [WARN] {coupon_info['name']} 상품권 1달 미경과")

            # 현재 보유 쿠폰 조회해서 반환
            vouchers = get_account_vouchers(access_token)
            coupon_list = parse_vouchers(vouchers)
            print(f"  현재 보유 쿠폰: {len(coupon_list)}개")

            return {
                "success": False,
                "error": "COOLDOWN_PERIOD",
                "message": "1달 미경과",
                "remaining_points": current_points,
                "vouchers": coupon_list
            }

        print(f"  상품권 발견: {target_offer['name']}")
        print(f"  offerId: {target_offer['offerId']}, rewardId: {target_offer['rewardId']}")
        print(f"  필요 포인트: {target_offer['priceInPoints']}P")
        print(f"  교환 가능: {target_offer['eligible']}")

        # 5-4. 교환 가능 여부 확인
        if not target_offer['eligible']:
            reasons = target_offer.get('eligibilityReasons', [])
            # reasons가 딕셔너리 리스트일 수 있으므로 문자열로 변환
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

            # 포인트 부족 여부 확인
            if current_points < target_offer['priceInPoints']:
                return {
                    "success": False,
                    "error": "INSUFFICIENT_POINTS",
                    "current_points": current_points,
                    "required_points": target_offer['priceInPoints'],
                    "remaining_points": current_points
                }
            return {
                "success": False,
                "error": f"NOT_ELIGIBLE:{reason_str}",
                "remaining_points": current_points
            }

        # 5-5. 쿠폰 발급 API 호출
        print("  쿠폰 발급 API 호출 중...")
        claim_result = claim_voucher(access_token, target_offer['offerId'], target_offer['rewardId'])

        if not claim_result['success']:
            error_msg = claim_result.get('error', 'UNKNOWN_ERROR')
            print(f"  [ERROR] 쿠폰 발급 실패: {error_msg}")
            return {"success": False, "error": f"CLAIM_FAILED:{error_msg}", "remaining_points": current_points}

        # 5-6. 발급 결과 확인
        claim_data = claim_result.get('data', {})
        coupon_code = claim_data.get('code', '')
        print(f"  쿠폰 발급 성공!")
        print(f"  쿠폰 코드: {coupon_code}")

        # 5-7. 발급 후 정보 조회
        new_points = get_account_points(access_token)
        vouchers = get_account_vouchers(access_token)
        coupon_list = parse_vouchers(vouchers)

        points_used = current_points - new_points

        print("\n" + "=" * 60)
        print(f"쿠폰 발급 완료!")
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
            "vouchers": coupon_list
        }

    except Exception as e:
        print(f"쿠폰 발급 오류: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
            print("\n브라우저 종료")


def main():
    parser = argparse.ArgumentParser(description='아디다스 쿠폰 발급')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('coupon_type', nargs='?',
                        help='쿠폰 타입: 10000(1만원), 30000(3만원), 50000(5만원), 100000(10만원)')

    args = parser.parse_args()

    if not args.email or not args.password or not args.coupon_type:
        print("사용법:")
        print("  python issue_coupon.py <email> <password> <coupon_type>")
        print("")
        print("쿠폰 타입:")
        print("  10000  - 1만원 상품권 (1500P)")
        print("  30000  - 3만원 상품권 (3000P)")
        print("  50000  - 5만원 상품권 (4000P)")
        print("  100000 - 10만원 상품권 (6000P)")
        return

    result = web_login_and_issue_coupon(args.email, args.password, args.coupon_type)

    # 결과 출력 (JSON 형식)
    import json
    print("\n[RESULT]")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
