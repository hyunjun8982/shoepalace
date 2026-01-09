"""
슈팔라스 로컬 웹 크롤링 트레이 앱
- 시스템 트레이에서 실행
- 백그라운드에서 웹 크롤링 API 서버 제공
- 로컬 GUI 모드로 Chrome 실행 (봇 차단 우회)
"""
import sys
import os
import threading
import webbrowser
import time
import requests

# 현재 디렉토리를 PATH에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import pystray
    from pystray import MenuItem as item
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False
    print("트레이 앱을 실행하려면 다음 패키지를 설치하세요:")
    print("  pip install pystray pillow")

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    UC_AVAILABLE = True
except ImportError:
    UC_AVAILABLE = False
    print("웹 크롤링을 위해 다음 패키지를 설치하세요:")
    print("  pip install undetected-chromedriver selenium")

import uvicorn
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# 스레드풀 (동기 함수 실행용)
executor = ThreadPoolExecutor(max_workers=2)


# ============================================================
# 로컬 GUI 전용 웹 로그인/추출 함수 (test_uc_login.py 방식)
# - 최소한의 Chrome 옵션만 사용 (봇 탐지 우회)
# - Docker용 옵션 제거
# ============================================================

def local_web_login(email: str, password: str) -> Optional[str]:
    """
    로컬 GUI 모드로 웹 로그인 후 access token 반환
    test_uc_login.py와 동일한 방식 사용
    """
    if not UC_AVAILABLE:
        print("[오류] undetected-chromedriver가 설치되지 않았습니다")
        return None

    driver = None
    try:
        # 최소한의 Chrome 옵션만 사용 (test_uc_login.py와 동일)
        options = uc.ChromeOptions()
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        # 기존 Chrome 프로세스 재사용 방지 (새 프로필)
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')

        # 브라우저 시작 (최소 옵션, 바이너리 경로 지정 안함)
        print(f"[로컬 로그인] {email} - 브라우저 시작...")
        driver = uc.Chrome(options=options, use_subprocess=True)
        driver.implicitly_wait(10)

        # 로그인 페이지 이동
        print(f"[로컬 로그인] 로그인 페이지 이동...")
        driver.get("https://www.adidas.co.kr/account-login")

        # 페이지 로드 대기
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )

        # 봇 차단 확인
        page_source = driver.page_source
        if "Reference Error" in page_source or "unable to give you access" in page_source:
            print("[로컬 로그인] 봇 차단 감지!")
            return None

        print("[로컬 로그인] 정상 페이지 로드됨")

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
                    print("[로컬 로그인] 쿠키 동의 클릭")
                    time.sleep(0.5)
                    break
            except NoSuchElementException:
                continue
        driver.implicitly_wait(10)

        # 이메일 입력 (한번에 - test_uc_login.py 방식)
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.clear()
        email_input.send_keys(email)
        print("[로컬 로그인] 이메일 입력 완료")

        # 비밀번호 입력 (한번에)
        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.clear()
        password_input.send_keys(password)
        print("[로컬 로그인] 비밀번호 입력 완료")

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        print("[로컬 로그인] 로그인 버튼 클릭")

        # 토큰 쿠키 대기
        access_token = None
        start = time.time()
        max_wait = 15

        while time.time() - start < max_wait:
            cookies = driver.get_cookies()
            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    access_token = cookie['value']
                    print("[로컬 로그인] 토큰 획득 성공!")
                    return access_token
            time.sleep(0.3)

        print("[로컬 로그인] 토큰 획득 실패 (타임아웃)")
        return None

    except Exception as e:
        print(f"[로컬 로그인 오류] {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def fetch_account_info_api(access_token: str) -> Dict[str, Any]:
    """API를 통해 계정 정보 추출"""
    headers = {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }
    cookies = {'account.grant.accessToken': access_token}

    result = {
        'name': None, 'email': None, 'birthday': None,
        'phone': None, 'barcode': None, 'points': None, 'coupons': []
    }

    # 프로필
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/profile',
                           headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            result['name'] = profile.get('firstName')
            result['email'] = profile.get('email')
            result['birthday'] = profile.get('dateOfBirth')
            result['phone'] = profile.get('mobileNumber')
    except Exception as e:
        print(f"[API] 프로필 조회 오류: {e}")

    # 바코드
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/memberid',
                           headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            result['barcode'] = resp.json().get('memberId')
    except Exception as e:
        print(f"[API] 바코드 조회 오류: {e}")

    # 포인트
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet',
                           headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            result['points'] = resp.json().get('availablePoints', 0)
    except Exception as e:
        print(f"[API] 포인트 조회 오류: {e}")

    # 쿠폰
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers',
                           headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                for v in data:
                    coupon_name = v.get('couponLabel') or v.get('name', '')
                    expire_date = v.get('available', {}).get('to', '')[:10] if v.get('available', {}).get('to') else ''
                    result['coupons'].append({
                        'name': coupon_name,
                        'code': v.get('code', ''),
                        'expire_date': expire_date,
                    })
    except Exception as e:
        print(f"[API] 쿠폰 조회 오류: {e}")

    return result


# FastAPI 앱
app = FastAPI(title="슈팔라스 로컬 웹 크롤링 서버")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractRequest(BaseModel):
    email: str
    password: str


class ExtractResponse(BaseModel):
    success: bool
    email: str
    name: Optional[str] = None
    birthday: Optional[str] = None
    phone: Optional[str] = None
    barcode: Optional[str] = None
    points: Optional[int] = None
    coupons: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    total_time: Optional[float] = None


# 서버 상태
server_status = {
    "running": False,
    "requests_count": 0,
    "last_request": None,
}


@app.get("/")
async def root():
    return {"status": "running", "service": "슈팔라스 로컬 웹 크롤링 서버"}


@app.get("/health")
async def health():
    return {"status": "healthy", "requests_count": server_status["requests_count"]}


def _extract_sync(email: str, password: str) -> dict:
    """동기 추출 함수 (스레드에서 실행)"""
    total_start = time.time()

    print(f"\n{'='*50}")
    print(f"[추출 요청] {email}")
    print(f"{'='*50}")

    access_token = local_web_login(email, password)

    if not access_token:
        return {
            "success": False,
            "email": email,
            "error": "로그인 실패 (토큰 없음)",
            "total_time": time.time() - total_start
        }

    # API로 정보 추출
    print("[추출] API로 정보 조회 중...")
    info = fetch_account_info_api(access_token)

    total_time = time.time() - total_start
    print(f"[추출 완료] {email} - {total_time:.1f}초")
    print(f"  이름: {info.get('name')}, 포인트: {info.get('points')}, 쿠폰: {len(info.get('coupons', []))}개")

    return {
        "success": True,
        "email": email,
        "name": info.get('name'),
        "birthday": info.get('birthday'),
        "phone": info.get('phone'),
        "barcode": info.get('barcode'),
        "points": info.get('points'),
        "coupons": info.get('coupons', []),
        "total_time": total_time
    }


@app.post("/extract", response_model=ExtractResponse)
async def extract_account_info(request: ExtractRequest):
    """계정 정보 추출 (로컬 GUI Chrome - test_uc_login.py 방식)"""
    server_status["requests_count"] += 1
    server_status["last_request"] = time.strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 동기 함수를 스레드풀에서 실행 (이벤트 루프 블로킹 방지)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            _extract_sync,
            request.email,
            request.password
        )
        return ExtractResponse(**result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return ExtractResponse(
            success=False,
            email=request.email,
            error=str(e)
        )


def create_tray_icon():
    """트레이 아이콘 이미지 생성"""
    # 64x64 아이콘 생성
    width = 64
    height = 64
    image = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)

    # 아디다스 스타일 3줄 그리기
    draw.rectangle([10, 20, 54, 28], fill=(0, 0, 0))
    draw.rectangle([10, 32, 54, 40], fill=(0, 0, 0))
    draw.rectangle([10, 44, 54, 52], fill=(0, 0, 0))

    return image


def on_open_browser(icon, item):
    """브라우저에서 상태 페이지 열기"""
    webbrowser.open("http://localhost:8002/health")


def on_exit(icon, item):
    """앱 종료"""
    icon.stop()
    os._exit(0)


def run_server():
    """FastAPI 서버 실행"""
    server_status["running"] = True
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")


def run_tray_app():
    """트레이 앱 실행"""
    if not TRAY_AVAILABLE:
        print("트레이 모드를 사용할 수 없습니다. 콘솔 모드로 실행합니다.")
        run_server()
        return

    # 서버를 별도 스레드에서 실행
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # 트레이 아이콘 생성
    icon_image = create_tray_icon()

    menu = pystray.Menu(
        item('상태 확인', on_open_browser),
        item('종료', on_exit)
    )

    icon = pystray.Icon(
        "shoepalace_local",
        icon_image,
        "슈팔라스 로컬 서버 (8002)",
        menu
    )

    print("=" * 50)
    print("  슈팔라스 로컬 웹 크롤링 서버")
    print("=" * 50)
    print()
    print("  서버가 시스템 트레이에서 실행 중입니다.")
    print("  http://localhost:8002")
    print()
    print("  트레이 아이콘을 우클릭하여 종료할 수 있습니다.")
    print("=" * 50)

    icon.run()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="슈팔라스 로컬 웹 크롤링 서버")
    parser.add_argument("--console", action="store_true", help="콘솔 모드로 실행 (트레이 없이)")
    args = parser.parse_args()

    if args.console or not TRAY_AVAILABLE:
        print("콘솔 모드로 실행합니다...")
        run_server()
    else:
        run_tray_app()
