"""
아디다스 API 직접 호출 테스트 (undetected-chromedriver 사용)
- UC로 로그인하여 쿠키/토큰 획득
- 획득한 인증 정보로 쿠폰 발급 API 직접 호출 테스트
"""

import requests
import json
import sys
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# 테스트용 계정
EMAIL = sys.argv[1] if len(sys.argv) > 1 else ""
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else ""
COUPON_TYPE = sys.argv[3] if len(sys.argv) > 3 else "10000"


def get_browser_session():
    """UC로 로그인하고 쿠키와 토큰 획득"""
    print("\n[1] 브라우저로 로그인 중...")

    options = uc.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    driver = uc.Chrome(options=options)

    try:
        # 로그인 페이지로 이동
        print("  로그인 페이지 이동...")
        driver.get('https://www.adidas.co.kr/account-login')
        time.sleep(5)

        # 이메일 입력
        print("  이메일 입력 대기...")
        email_input = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"], input[name="email"]'))
        )
        email_input.clear()
        email_input.send_keys(EMAIL)
        print(f"  이메일 입력: {EMAIL}")
        time.sleep(1)

        # 계속 버튼 클릭
        try:
            continue_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[type="submit"]'))
            )
            continue_btn.click()
            print("  계속 버튼 클릭")
            time.sleep(3)
        except:
            pass

        # 비밀번호 입력
        print("  비밀번호 입력 대기...")
        password_input = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="password"]'))
        )
        password_input.clear()
        password_input.send_keys(PASSWORD)
        print("  비밀번호 입력 완료")
        time.sleep(1)

        # 로그인 버튼 클릭
        login_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[type="submit"]'))
        )
        login_btn.click()
        print("  로그인 버튼 클릭")

        time.sleep(8)

        # 로그인 성공 확인
        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # 쿠키 가져오기
        cookies = driver.get_cookies()
        print(f"  획득한 쿠키 수: {len(cookies)}")

        # 주요 쿠키 출력
        cookie_names = [c['name'] for c in cookies]
        print(f"  쿠키 목록: {cookie_names[:10]}...")

        # localStorage에서 토큰 가져오기
        access_token = driver.execute_script("return localStorage.getItem('access_token')")
        if access_token:
            print(f"  access_token: {access_token[:80]}...")
        else:
            print("  access_token: 없음 (다른 방식으로 저장될 수 있음)")

        # adiclub 페이지로 이동해서 API 테스트
        print("\n[2] adiclub 페이지 이동...")
        driver.get('https://www.adidas.co.kr/adiclub')
        time.sleep(5)

        # 페이지 소스에서 API 관련 정보 확인
        page_source = driver.page_source
        if 'adiclub' in page_source.lower() or '포인트' in page_source:
            print("  adiclub 페이지 로드 성공")

        return {
            'cookies': {c['name']: c['value'] for c in cookies},
            'access_token': access_token,
            'driver': driver
        }

    except Exception as e:
        print(f"  로그인 실패: {e}")
        import traceback
        traceback.print_exc()
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.adidas.co.kr',
        'Referer': 'https://www.adidas.co.kr/adiclub',
        'x-instana-t': cookies.get('x-instana-t', ''),
        'x-instana-s': cookies.get('x-instana-s', ''),
    }

    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'

    # 포인트 조회
    print("\n  [3-1] 포인트 조회")
    try:
        resp = session.get('https://www.adidas.co.kr/api/account/loyalty/points', headers=headers, timeout=10)
        print(f"    상태: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"    응답: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
        else:
            print(f"    응답: {resp.text[:300]}")
    except Exception as e:
        print(f"    오류: {e}")

    # 바우처 목록 조회
    print("\n  [3-2] 바우처 목록 조회")
    try:
        resp = session.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, timeout=10)
        print(f"    상태: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"    응답: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
        else:
            print(f"    응답: {resp.text[:300]}")
    except Exception as e:
        print(f"    오류: {e}")

    # 로열티 정보 조회 (다른 엔드포인트)
    print("\n  [3-3] 로열티 정보 조회")
    endpoints = [
        'https://www.adidas.co.kr/api/account/loyalty',
        'https://www.adidas.co.kr/api/loyalty',
        'https://www.adidas.co.kr/api/user/loyalty',
    ]
    for endpoint in endpoints:
        try:
            resp = session.get(endpoint, headers=headers, timeout=10)
            print(f"    {endpoint}")
            print(f"      상태: {resp.status_code}")
            if resp.status_code == 200:
                print(f"      응답: {resp.text[:200]}")
        except Exception as e:
            print(f"      오류: {e}")


if __name__ == '__main__':
    if not EMAIL or not PASSWORD:
        print("사용법: python test_adidas_api_uc.py <email> <password> [coupon_type]")
        sys.exit(1)

    print("=" * 60)
    print("아디다스 API 직접 호출 테스트 (UC 브라우저 세션)")
    print("=" * 60)

    auth_info = get_browser_session()

    if auth_info:
        test_api_with_auth(auth_info)
        auth_info['driver'].quit()
    else:
        print("인증 정보 획득 실패")
