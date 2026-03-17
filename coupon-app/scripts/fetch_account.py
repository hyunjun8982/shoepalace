"""
아디다스 계정 정보 조회 (셀레니움)
- undetected-chromedriver로 로그인 후 API 토큰 획득
- 프로필, 포인트, 쿠폰 정보 추출
- 결과를 JSON으로 stdout 출력 (마지막 줄)

Usage: python fetch_account.py <email> <password>
"""
import sys
import os
import time
import json
import random
import requests

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print(json.dumps({"success": False, "error": "undetected-chromedriver 미설치"}))
    sys.exit(0)


COUPON_NAME_MAP = {
    "Naver Membership": "네이버 멤버십",
    "KR_STARBUCKS": "스타벅스",
    "ADI_KR_Tier1_5%_90days": "5% 쿠폰",
    "ADI_KR_Tier2_10%_90days": "10% 쿠폰",
    "ADI_KR_Tier3_15%_90days": "15% 쿠폰",
    "ADI_KR_Tier4_20%_90days": "20% 쿠폰",
    "ADI_KR_Birthday_15%": "생일 15% 쿠폰",
    "ADI_KR_Birthday_20%": "생일 20% 쿠폰",
    "ADI_KR_Welcome_10%": "웰컴 10% 쿠폰",
    "ADI_KR_Welcome_15%": "웰컴 15% 쿠폰",
}


def get_korean_name(label):
    if not label:
        return "알 수 없음"
    if label in COUPON_NAME_MAP:
        return COUPON_NAME_MAP[label]
    for eng, kor in COUPON_NAME_MAP.items():
        if eng.lower() in label.lower():
            return kor
    import re
    m = re.search(r'(\d+)%', label)
    if m:
        return f"{m.group(1)}% 쿠폰"
    return label


def web_login(driver, email, password):
    """웹 로그인 후 access_token 반환"""
    print(f"[로그인] {email}", file=sys.stderr)
    driver.get("https://www.adidas.co.kr/account-login")
    time.sleep(3)

    # 봇 차단 확인
    src = driver.page_source
    if "Reference Error" in src or "unable to give you access" in src or "HTTP 403" in src:
        raise Exception("봇 차단됨 (IP 차단)")

    # 로그인 폼 대기
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
    except TimeoutException:
        src = driver.page_source
        if "Reference Error" in src or "unable to give you access" in src:
            raise Exception("봇 차단됨")
        raise Exception("로그인 폼 타임아웃")

    # 쿠키 동의
    driver.implicitly_wait(0)
    for sel in ['#glass-gdpr-default-consent-accept-button', 'button[data-auto-id="consent-modal-accept-btn"]']:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, sel)
            if btn.is_displayed():
                btn.click()
                break
        except NoSuchElementException:
            continue
    driver.implicitly_wait(10)

    # 이메일
    time.sleep(random.uniform(0.5, 1.5))
    email_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
    )
    email_input.click()
    time.sleep(0.3)
    email_input.clear()
    for c in email:
        email_input.send_keys(c)
        time.sleep(random.uniform(0.02, 0.08))

    time.sleep(random.uniform(0.5, 1.0))

    # 비밀번호
    pw_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
    pw_input.click()
    time.sleep(0.3)
    pw_input.clear()
    for c in password:
        pw_input.send_keys(c)
        time.sleep(random.uniform(0.02, 0.08))

    time.sleep(random.uniform(0.5, 1.5))

    # 로그인
    driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    time.sleep(5)

    # 에러 확인
    driver.implicitly_wait(0)
    for sel in ['.gl-form-hint--error', '[data-auto-id="login-error"]', '.error-message']:
        try:
            elems = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in elems:
                if el.is_displayed():
                    txt = el.text.strip()
                    if txt and len(txt) > 3:
                        raise Exception(f"로그인 실패: {txt}")
        except NoSuchElementException:
            continue
    driver.implicitly_wait(10)

    # 토큰 대기
    start = time.time()
    while time.time() - start < 15:
        for cookie in driver.get_cookies():
            if cookie['name'] == 'account.grant.accessToken':
                return cookie['value']
        time.sleep(0.5)

    return None


def fetch_info(token):
    """API로 계정 정보 조회"""
    headers = {
        'accept': '*/*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }
    cookies = {'account.grant.accessToken': token}
    result = {'name': None, 'birthday': None, 'phone': None, 'barcode': None, 'points': None, 'coupons': []}

    # 프로필
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/profile', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            p = r.json().get('profile', {})
            result['name'] = p.get('firstName')
            result['birthday'] = p.get('dateOfBirth')
            result['phone'] = p.get('mobileNumber')
    except Exception as e:
        print(f"[프로필 오류] {e}", file=sys.stderr)

    # 바코드
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            result['barcode'] = r.json().get('memberId')
    except Exception as e:
        print(f"[바코드 오류] {e}", file=sys.stderr)

    # 포인트
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            result['points'] = r.json().get('availablePoints', 0)
    except Exception as e:
        print(f"[포인트 오류] {e}", file=sys.stderr)

    # 쿠폰
    try:
        r = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, cookies=cookies, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                for v in data:
                    label = v.get('couponLabel') or v.get('name', '')
                    code = v.get('code', '')
                    avail = v.get('available', {})
                    exp = (avail.get('to') or '')[:10]
                    result['coupons'].append({
                        'name': get_korean_name(label),
                        'original_name': label,
                        'code': code,
                        'expire_date': exp,
                    })
    except Exception as e:
        print(f"[쿠폰 오류] {e}", file=sys.stderr)

    return result


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "사용법: python fetch_account.py <email> <password>"}))
        sys.exit(0)

    email = sys.argv[1]
    password = sys.argv[2]
    total_start = time.time()
    driver = None

    try:
        # Xvfb (Linux)
        use_xvfb = os.name != 'nt'
        if use_xvfb:
            import subprocess
            try:
                subprocess.run(['which', 'Xvfb'], capture_output=True, check=True)
                proc = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1920x1080x24', '-ac'],
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(1)
                os.environ['DISPLAY'] = ':99'
            except Exception:
                use_xvfb = False

        # Chrome 옵션
        options = uc.ChromeOptions()
        if not use_xvfb:
            options.add_argument('--headless=new')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')

        chrome_bin = os.environ.get('CHROME_BIN', '/usr/bin/google-chrome')
        if os.path.exists(chrome_bin):
            options.binary_location = chrome_bin

        driver = uc.Chrome(options=options, use_subprocess=True,
                           browser_executable_path=chrome_bin if os.path.exists(chrome_bin) else None)
        driver.implicitly_wait(10)

        # 로그인
        token = web_login(driver, email, password)
        if not token:
            print(json.dumps({"success": False, "error": "로그인 실패 (토큰 없음)", "total_time": time.time() - total_start}))
            return

        # 정보 조회
        info = fetch_info(token)
        total_time = time.time() - total_start

        print(json.dumps({
            "success": True,
            "name": info['name'],
            "birthday": info['birthday'],
            "phone": info['phone'],
            "barcode": info['barcode'],
            "points": info['points'],
            "coupons": info['coupons'],
            "total_time": round(total_time, 1),
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "total_time": round(time.time() - total_start, 1),
        }))
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


if __name__ == '__main__':
    main()
