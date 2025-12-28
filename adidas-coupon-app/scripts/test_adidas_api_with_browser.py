"""
아디다스 API 직접 호출 테스트 (브라우저 로그인 후)
- Selenium으로 로그인하여 쿠키/토큰 획득
- 획득한 인증 정보로 쿠폰 발급 API 직접 호출 테스트
"""

import requests
import json
import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

# 테스트용 계정
EMAIL = sys.argv[1] if len(sys.argv) > 1 else ""
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else ""
COUPON_TYPE = sys.argv[3] if len(sys.argv) > 3 else "10000"

def get_browser_session():
    """Selenium으로 로그인하고 쿠키와 토큰 획득"""
    print("\n[1] 브라우저로 로그인 중...")

    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': '''
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        '''
    })

    try:
        # 로그인 페이지로 이동
        driver.get('https://www.adidas.co.kr/account-login')
        time.sleep(3)

        # 이메일 입력
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"], input[name="email"]'))
        )
        email_input.clear()
        email_input.send_keys(EMAIL)
        print(f"  이메일 입력: {EMAIL}")

        # 다음 버튼 클릭
        try:
            continue_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
            continue_btn.click()
            time.sleep(2)
        except:
            pass

        # 비밀번호 입력
        password_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="password"]'))
        )
        password_input.clear()
        password_input.send_keys(PASSWORD)
        print("  비밀번호 입력 완료")

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        print("  로그인 버튼 클릭")

        time.sleep(5)

        # 쿠키 가져오기
        cookies = driver.get_cookies()
        print(f"  획득한 쿠키 수: {len(cookies)}")

        # localStorage에서 토큰 가져오기
        access_token = driver.execute_script("return localStorage.getItem('access_token')")
        print(f"  access_token: {access_token[:50] if access_token else 'None'}...")

        # 쿠폰 교환 페이지로 이동
        print("\n[2] 쿠폰 교환 페이지 이동...")
        driver.get('https://www.adidas.co.kr/adiclub')
        time.sleep(3)

        # 네트워크 요청 캡처를 위해 Performance Log 활성화
        # (이미 실행 중이므로 쿠키만 가져옴)

        return {
            'cookies': {c['name']: c['value'] for c in cookies},
            'access_token': access_token,
            'driver': driver
        }

    except Exception as e:
        print(f"  로그인 실패: {e}")
        driver.quit()
        return None


def test_api_with_auth(auth_info):
    """인증 정보로 API 직접 호출 테스트"""
    print("\n[3] 인증 정보로 API 호출 테스트...")

    cookies = auth_info['cookies']
    access_token = auth_info['access_token']

    session = requests.Session()
    session.cookies.update(cookies)

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.adidas.co.kr',
        'Referer': 'https://www.adidas.co.kr/adiclub',
    }

    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'

    # 포인트 조회
    print("\n  [3-1] 포인트 조회")
    try:
        resp = session.get('https://www.adidas.co.kr/api/account/loyalty/points', headers=headers, timeout=10)
        print(f"    상태: {resp.status_code}")
        if resp.status_code == 200:
            print(f"    응답: {resp.text[:500]}")
    except Exception as e:
        print(f"    오류: {e}")

    # 바우처 목록 조회
    print("\n  [3-2] 바우처 목록 조회")
    try:
        resp = session.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, timeout=10)
        print(f"    상태: {resp.status_code}")
        if resp.status_code == 200:
            print(f"    응답: {resp.text[:500]}")
    except Exception as e:
        print(f"    오류: {e}")

    # 쿠폰 발급 API 테스트
    print("\n  [3-3] 쿠폰 발급 API 테스트")

    # 다양한 엔드포인트 시도
    redeem_endpoints = [
        ('POST', 'https://www.adidas.co.kr/api/account/loyalty/vouchers', {'type': 'GIFT_CARD', 'amount': int(COUPON_TYPE)}),
        ('POST', 'https://www.adidas.co.kr/api/account/loyalty/redeem', {'points': 6000, 'voucherId': 'GIFT_CARD_10000'}),
        ('POST', 'https://www.adidas.co.kr/api/loyalty/voucher/claim', {'voucherType': f'GIFT_CARD_{COUPON_TYPE}'}),
    ]

    for method, endpoint, payload in redeem_endpoints:
        try:
            print(f"\n    {method} {endpoint}")
            print(f"    payload: {payload}")
            if method == 'POST':
                resp = session.post(endpoint, json=payload, headers=headers, timeout=10)
            else:
                resp = session.get(endpoint, headers=headers, timeout=10)
            print(f"    상태: {resp.status_code}")
            print(f"    응답: {resp.text[:300]}")
        except Exception as e:
            print(f"    오류: {e}")


def capture_network_requests(driver):
    """브라우저에서 쿠폰 발급 시 네트워크 요청 캡처"""
    print("\n[4] 쿠폰 발급 과정 네트워크 캡처...")
    print("    (브라우저에서 수동으로 쿠폰 발급 버튼을 클릭하면 네트워크 요청이 캡처됩니다)")

    # DevTools Protocol로 네트워크 모니터링
    driver.execute_cdp_cmd('Network.enable', {})

    # 쿠폰 교환 페이지에서 버튼 클릭 시뮬레이션
    try:
        # 1만원 쿠폰 버튼 찾기
        coupon_buttons = driver.find_elements(By.CSS_SELECTOR, 'button[data-auto-id="feed-buy-voucher-cta"]')
        print(f"    발견한 쿠폰 버튼: {len(coupon_buttons)}개")

        if coupon_buttons:
            # 클릭하기 전 네트워크 요청 캡처 준비
            print("    첫 번째 쿠폰 버튼 클릭 시도...")

            # 성능 로그 가져오기
            logs = driver.get_log('performance')
            print(f"    캡처된 로그: {len(logs)}개")

            # API 요청 필터링
            for log in logs[-50:]:
                message = json.loads(log['message'])['message']
                if message.get('method') == 'Network.requestWillBeSent':
                    url = message.get('params', {}).get('request', {}).get('url', '')
                    if 'api' in url.lower() and ('voucher' in url.lower() or 'loyalty' in url.lower() or 'redeem' in url.lower()):
                        print(f"\n    발견된 API: {url}")
                        print(f"    Method: {message.get('params', {}).get('request', {}).get('method')}")
                        print(f"    Headers: {message.get('params', {}).get('request', {}).get('headers', {})}")

    except Exception as e:
        print(f"    캡처 중 오류: {e}")


if __name__ == '__main__':
    if not EMAIL or not PASSWORD:
        print("사용법: python test_adidas_api_with_browser.py <email> <password> [coupon_type]")
        sys.exit(1)

    print("=" * 60)
    print("아디다스 API 직접 호출 테스트 (브라우저 세션 활용)")
    print("=" * 60)

    auth_info = get_browser_session()

    if auth_info:
        test_api_with_auth(auth_info)
        # capture_network_requests(auth_info['driver'])
        auth_info['driver'].quit()
    else:
        print("인증 정보 획득 실패")
