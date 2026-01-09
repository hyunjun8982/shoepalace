"""
Adidas 웹 크롤링 정보 추출 서비스
- undetected-chromedriver를 사용하여 Akamai 봇 감지 우회
- 로그인 후 API를 통해 계정 정보 추출
- Xvfb (가상 디스플레이)를 사용하여 headless 탐지 우회
"""
import os
import time
import subprocess
import requests
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    UC_AVAILABLE = True
except ImportError:
    UC_AVAILABLE = False


# Xvfb 관리 클래스
class XvfbManager:
    """Xvfb 가상 디스플레이 관리"""
    _instance = None
    _display = None
    _process = None

    @classmethod
    def start(cls, display_num: int = 99):
        """Xvfb 시작 (싱글톤)"""
        if cls._process is not None:
            return cls._display

        # Xvfb 사용 가능 여부 확인
        try:
            result = subprocess.run(['which', 'Xvfb'], capture_output=True, text=True)
            if result.returncode != 0:
                print("[Xvfb] Xvfb가 설치되지 않음 - headless 모드로 폴백")
                return None
        except Exception:
            return None

        # 이미 실행 중인 Xvfb 확인
        display = f":{display_num}"
        try:
            # Xvfb 시작
            cls._process = subprocess.Popen(
                ['Xvfb', display, '-screen', '0', '1920x1080x24', '-ac'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            time.sleep(1)  # Xvfb 시작 대기

            # DISPLAY 환경변수 설정
            os.environ['DISPLAY'] = display
            cls._display = display
            print(f"[Xvfb] 가상 디스플레이 시작: {display}")
            return display
        except Exception as e:
            print(f"[Xvfb] 시작 실패: {e}")
            return None

    @classmethod
    def stop(cls):
        """Xvfb 종료"""
        if cls._process is not None:
            cls._process.terminate()
            cls._process.wait()
            cls._process = None
            cls._display = None
            print("[Xvfb] 가상 디스플레이 종료")

    @classmethod
    def is_running(cls) -> bool:
        """Xvfb 실행 중 여부"""
        return cls._process is not None and cls._process.poll() is None


# 쿠폰 이름 한글 매핑
COUPON_NAME_MAP = {
    # 파트너 바우처
    "Naver Membership": "네이버 멤버십",
    "KR_STARBUCKS": "스타벅스",
    "KR_SAMSUNG": "삼성",
    "KR_HYUNDAI": "현대카드",
    "KR_SHINHAN": "신한카드",
    "KR_KB": "KB국민카드",
    "KR_LOTTE": "롯데카드",
    "KR_NH": "NH농협카드",
    "KR_HANA": "하나카드",
    "KR_WOORI": "우리카드",
    "KR_BC": "BC카드",
    "KR_CITI": "씨티카드",
    # 등급 쿠폰
    "ADI_KR_Tier1_5%_90days": "5% 쿠폰",
    "ADI_KR_Tier2_10%_90days": "10% 쿠폰",
    "ADI_KR_Tier3_15%_90days": "15% 쿠폰",
    "ADI_KR_Tier4_20%_90days": "20% 쿠폰",
    # 생일 쿠폰
    "ADI_KR_Birthday_15%": "생일 15% 쿠폰",
    "ADI_KR_Birthday_20%": "생일 20% 쿠폰",
    # 웰컴 쿠폰
    "ADI_KR_Welcome_10%": "웰컴 10% 쿠폰",
    "ADI_KR_Welcome_15%": "웰컴 15% 쿠폰",
}


def get_korean_coupon_name(coupon_label: str) -> str:
    """쿠폰 영문명을 한글명으로 변환"""
    if not coupon_label:
        return "알 수 없음"

    # 정확한 매칭 시도
    if coupon_label in COUPON_NAME_MAP:
        return COUPON_NAME_MAP[coupon_label]

    # 부분 매칭 시도
    for eng, kor in COUPON_NAME_MAP.items():
        if eng.lower() in coupon_label.lower():
            return kor

    # 퍼센트 패턴 추출 (예: "10%" -> "10% 쿠폰")
    import re
    percent_match = re.search(r'(\d+)%', coupon_label)
    if percent_match:
        return f"{percent_match.group(1)}% 쿠폰"

    return coupon_label  # 매핑 없으면 원본 반환


@dataclass
class WebExtractionResult:
    """웹 추출 결과"""
    success: bool
    email: str
    name: Optional[str] = None
    birthday: Optional[str] = None
    phone: Optional[str] = None
    barcode: Optional[str] = None
    points: Optional[int] = None
    coupons: Optional[List[Dict[str, str]]] = None
    error: Optional[str] = None
    login_time: Optional[float] = None
    api_time: Optional[float] = None
    total_time: Optional[float] = None


class BotBlockedError(Exception):
    """봇 차단 예외"""
    pass


def web_login(driver, email: str, password: str) -> Optional[str]:
    """
    웹 로그인 후 access token 반환

    Returns:
        access_token if successful, None otherwise
    Raises:
        BotBlockedError: Akamai 봇 감지로 차단된 경우
    """
    try:
        # 로그인 페이지 이동
        print(f"[웹 로그인] {email} - 로그인 페이지 이동 중...")
        driver.get("https://www.adidas.co.kr/account-login")

        # 잠시 대기 후 봇 차단 먼저 확인
        import time
        time.sleep(3)

        # 현재 URL 확인
        current_url = driver.current_url
        print(f"[웹 로그인] 현재 URL: {current_url}")

        # 봇 차단 확인 (페이지 로드 전에 먼저 체크)
        page_source = driver.page_source
        if "Reference Error" in page_source or "unable to give you access" in page_source or "HTTP 403" in page_source:
            raise BotBlockedError("Akamai 봇 감지로 차단됨 (컨테이너 IP 차단)")

        # 페이지 로드 대기
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
            )
            print(f"[웹 로그인] 로그인 폼 발견")
        except TimeoutException:
            # 타임아웃 시 다시 봇 차단 확인
            page_source = driver.page_source
            print(f"[웹 로그인] 페이지 소스 길이: {len(page_source)}")
            if "Reference Error" in page_source or "unable to give you access" in page_source or "HTTP 403" in page_source:
                raise BotBlockedError("Akamai 봇 감지로 차단됨 (컨테이너 IP 차단)")
            # 페이지 제목 확인
            print(f"[웹 로그인] 페이지 제목: {driver.title}")
            raise

        # 쿠키 동의 처리
        driver.implicitly_wait(0)
        cookie_selectors = [
            '#glass-gdpr-default-consent-accept-button',
            'button[data-auto-id="consent-modal-accept-btn"]',
            '#onetrust-accept-btn-handler',
        ]

        for selector in cookie_selectors:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, selector)
                if btn.is_displayed():
                    btn.click()
                    print(f"[웹 로그인] 쿠키 동의 버튼 클릭")
                    try:
                        WebDriverWait(driver, 1).until(EC.invisibility_of_element(btn))
                    except:
                        pass
                    break
            except NoSuchElementException:
                continue

        driver.implicitly_wait(10)

        # 이메일 입력 (자연스럽게)
        import random
        time.sleep(random.uniform(0.5, 1.5))

        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.click()
        time.sleep(random.uniform(0.3, 0.7))
        email_input.clear()

        # 글자별 타이핑 (자연스럽게)
        for char in email:
            email_input.send_keys(char)
            time.sleep(random.uniform(0.02, 0.08))
        print(f"[웹 로그인] 이메일 입력 완료")

        time.sleep(random.uniform(0.5, 1.0))

        # 비밀번호 입력 (자연스럽게)
        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.click()
        time.sleep(random.uniform(0.3, 0.7))
        password_input.clear()

        for char in password:
            password_input.send_keys(char)
            time.sleep(random.uniform(0.02, 0.08))
        print(f"[웹 로그인] 비밀번호 입력 완료")

        time.sleep(random.uniform(0.5, 1.5))

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        print(f"[웹 로그인] 로그인 버튼 클릭")

        # 로그인 결과 대기
        time.sleep(5)

        # 에러 메시지 확인 (더 많은 셀렉터 추가)
        driver.implicitly_wait(0)
        error_selectors = [
            '.gl-form-hint--error',
            '[data-auto-id="login-error"]',
            '.error-message',
            '.gl-callout--error',
            '[class*="error"]',
            '[class*="Error"]',
            '.gl-alert--error',
            '[data-testid="error-message"]',
        ]
        login_error_found = None
        for selector in error_selectors:
            try:
                error_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for error_elem in error_elems:
                    if error_elem.is_displayed():
                        error_text = error_elem.text.strip()
                        if error_text and len(error_text) > 3:
                            print(f"[웹 로그인] 로그인 오류 메시지 발견: {error_text}")
                            login_error_found = error_text
            except:
                continue
        driver.implicitly_wait(10)

        # URL 변경 확인
        new_url = driver.current_url
        print(f"[웹 로그인] 로그인 후 URL: {new_url}")

        # 로그인 실패 시 오류 메시지 반환용 전역 변수 설정
        if login_error_found and 'account-login' in new_url:
            # 로그인 페이지에 그대로 있으면서 에러 메시지가 있으면 실패
            raise Exception(f"로그인 실패: {login_error_found}")

        # 토큰 쿠키 대기
        access_token = None
        start = time.time()
        max_wait = 15

        while time.time() - start < max_wait:
            cookies = driver.get_cookies()
            cookie_names = [c['name'] for c in cookies]

            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    access_token = cookie['value']
                    print(f"[웹 로그인] 토큰 획득 성공!")
                    return access_token

            # 3초마다 쿠키 목록 출력
            if int(time.time() - start) % 3 == 0:
                token_cookies = [n for n in cookie_names if 'token' in n.lower() or 'account' in n.lower()]
                if token_cookies:
                    print(f"[웹 로그인] 관련 쿠키: {token_cookies}")

            try:
                WebDriverWait(driver, 0.5).until(lambda d: False)
            except:
                pass

        # 최종 쿠키 목록 출력
        final_cookies = [c['name'] for c in driver.get_cookies()]
        print(f"[웹 로그인] 토큰 없음. 최종 쿠키: {final_cookies[:10]}...")
        return None

    except BotBlockedError:
        raise
    except Exception as e:
        print(f"[웹 로그인 오류] {email}: {e}")
        import traceback
        traceback.print_exc()
        return None


def fetch_account_info_via_api(access_token: str) -> Dict[str, Any]:
    """
    API를 통해 계정 정보 추출
    """
    headers = {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }

    cookies = {
        'account.grant.accessToken': access_token,
    }

    result = {
        'name': None,
        'email': None,
        'birthday': None,
        'phone': None,
        'barcode': None,
        'points': None,
        'coupons': [],
    }

    # 1. 프로필 정보
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/profile',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            profile = data.get('profile', {})
            result['name'] = profile.get('firstName')
            result['email'] = profile.get('email')
            result['birthday'] = profile.get('dateOfBirth')
            result['phone'] = profile.get('mobileNumber')
    except Exception as e:
        print(f"[API 오류] 프로필 조회: {e}")

    # 2. 바코드
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/memberid',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            result['barcode'] = data.get('memberId')
    except Exception as e:
        print(f"[API 오류] 바코드 조회: {e}")

    # 3. 포인트
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/wallet',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            result['points'] = data.get('availablePoints', 0)
    except Exception as e:
        print(f"[API 오류] 포인트 조회: {e}")

    # 4. 쿠폰 정보
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                for v in data:
                    coupon_label = v.get('couponLabel') or v.get('name', '')
                    korean_name = get_korean_coupon_name(coupon_label)
                    code = v.get('code', '')
                    available = v.get('available', {})
                    expire_date = available.get('to', '')
                    if expire_date:
                        expire_date = expire_date[:10]  # YYYY-MM-DD만

                    result['coupons'].append({
                        'name': korean_name,
                        'original_name': coupon_label,
                        'code': code,
                        'expire_date': expire_date,
                    })
    except Exception as e:
        print(f"[API 오류] 쿠폰 조회: {e}")

    return result


def extract_single_account_web(
    email: str,
    password: str,
    headless: bool = True,
    use_xvfb: bool = True
) -> WebExtractionResult:
    """
    단일 계정 웹 크롤링 정보 추출

    Args:
        email: 이메일
        password: 비밀번호
        headless: headless 모드 (Xvfb 사용 시 무시됨)
        use_xvfb: Xvfb 가상 디스플레이 사용 여부 (봇 탐지 우회)
    """
    if not UC_AVAILABLE:
        return WebExtractionResult(
            success=False,
            email=email,
            error="undetected-chromedriver가 설치되지 않았습니다"
        )

    total_start = time.time()
    driver = None
    xvfb_started = False

    try:
        # Xvfb 가상 디스플레이 시작 (headless 탐지 우회)
        if use_xvfb and not XvfbManager.is_running():
            display = XvfbManager.start()
            if display:
                xvfb_started = True
                print(f"[웹 추출] Xvfb 모드 사용 (DISPLAY={display})")
            else:
                print("[웹 추출] Xvfb 사용 불가 - headless 모드로 폴백")
                use_xvfb = False

        # Chrome 옵션 설정
        options = uc.ChromeOptions()

        # Xvfb 사용 시에는 headless 모드 사용하지 않음 (실제 GUI Chrome)
        if not use_xvfb and headless:
            options.add_argument('--headless=new')

        options.add_argument('--window-size=1920,1080')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        # Docker 컨테이너 환경용 추가 옵션
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-extensions')
        options.add_argument('--disable-setuid-sandbox')
        options.add_argument('--remote-debugging-port=9222')

        # Chrome 바이너리 경로 설정 (Docker 환경)
        chrome_bin = os.environ.get('CHROME_BIN', '/usr/bin/google-chrome')
        if os.path.exists(chrome_bin):
            options.binary_location = chrome_bin

        # 브라우저 시작
        driver = uc.Chrome(options=options, use_subprocess=True, browser_executable_path=chrome_bin if os.path.exists(chrome_bin) else None)
        driver.implicitly_wait(10)

        # 로그인
        login_start = time.time()
        access_token = web_login(driver, email, password)
        login_time = time.time() - login_start

        if not access_token:
            return WebExtractionResult(
                success=False,
                email=email,
                error="로그인 실패 (토큰 없음)",
                login_time=login_time,
                total_time=time.time() - total_start
            )

        # API로 정보 추출
        api_start = time.time()
        info = fetch_account_info_via_api(access_token)
        api_time = time.time() - api_start

        return WebExtractionResult(
            success=True,
            email=email,
            name=info.get('name'),
            birthday=info.get('birthday'),
            phone=info.get('phone'),
            barcode=info.get('barcode'),
            points=info.get('points'),
            coupons=info.get('coupons', []),
            login_time=login_time,
            api_time=api_time,
            total_time=time.time() - total_start
        )

    except BotBlockedError as e:
        return WebExtractionResult(
            success=False,
            email=email,
            error=str(e),
            total_time=time.time() - total_start
        )
    except Exception as e:
        error_msg = str(e)
        # 간략한 에러 메시지 생성
        if "no such element" in error_msg.lower():
            error_msg = "페이지 요소를 찾을 수 없음 (봇 차단 가능성)"
        elif "timeout" in error_msg.lower():
            error_msg = "페이지 로드 타임아웃"
        return WebExtractionResult(
            success=False,
            email=email,
            error=error_msg,
            total_time=time.time() - total_start
        )
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def extract_bulk_accounts_web(
    accounts: List[Dict[str, str]],  # [{"email": ..., "password": ...}, ...]
    headless: bool = True,
    use_xvfb: bool = True,
    on_progress: Optional[Callable[[int, int, str, WebExtractionResult], None]] = None,
    on_complete: Optional[Callable[[List[WebExtractionResult]], None]] = None
) -> List[WebExtractionResult]:
    """
    다중 계정 웹 크롤링 정보 추출 (세션 재사용)

    Args:
        accounts: 계정 목록 [{"email": ..., "password": ...}, ...]
        headless: headless 모드 여부 (Xvfb 사용 시 무시됨)
        use_xvfb: Xvfb 가상 디스플레이 사용 여부 (봇 탐지 우회)
        on_progress: 진행 콜백 (current, total, email, result)
        on_complete: 완료 콜백 (results)

    Returns:
        List[WebExtractionResult]
    """
    if not UC_AVAILABLE:
        return [WebExtractionResult(
            success=False,
            email=acc.get('email', 'unknown'),
            error="undetected-chromedriver가 설치되지 않았습니다"
        ) for acc in accounts]

    results = []
    total = len(accounts)

    # Xvfb 미리 시작 (첫 번째 계정에서 시작되면 이후 계정들도 재사용)
    if use_xvfb and not XvfbManager.is_running():
        XvfbManager.start()

    for idx, account in enumerate(accounts):
        email = account.get('email', '')
        password = account.get('password', '')

        print(f"\n[웹 정보조회] ({idx+1}/{total}) {email}")

        result = extract_single_account_web(email, password, headless, use_xvfb)
        results.append(result)

        if result.success:
            print(f"  성공 - 이름: {result.name}, 포인트: {result.points}, "
                  f"쿠폰: {len(result.coupons or [])}개, 소요시간: {result.total_time:.1f}초")
        else:
            print(f"  실패 - {result.error}")

        # 진행 콜백 호출
        if on_progress:
            on_progress(idx + 1, total, email, result)

    # 완료 콜백 호출
    if on_complete:
        on_complete(results)

    return results


# 테스트 코드
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("사용법: python adidas_web_extraction.py <email> <password>")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    headless = "--headless" in sys.argv

    print(f"테스트: {email} (headless: {headless})")

    result = extract_single_account_web(email, password, headless)

    print("\n결과:")
    print(f"  성공: {result.success}")
    print(f"  이메일: {result.email}")
    print(f"  이름: {result.name}")
    print(f"  생일: {result.birthday}")
    print(f"  전화번호: {result.phone}")
    print(f"  바코드: {result.barcode}")
    print(f"  포인트: {result.points}")
    print(f"  쿠폰: {result.coupons}")
    print(f"  로그인 시간: {result.login_time:.2f}초" if result.login_time else "")
    print(f"  API 시간: {result.api_time:.2f}초" if result.api_time else "")
    print(f"  총 시간: {result.total_time:.2f}초" if result.total_time else "")
    if result.error:
        print(f"  오류: {result.error}")
