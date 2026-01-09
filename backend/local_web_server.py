"""
로컬 Windows 웹 서버 (GUI Chrome 모드)

이 스크립트는 로컬 Windows에서 실행되며,
GUI 모드로 Chrome을 실행하여 Akamai 봇 차단을 우회합니다.

실행 방법:
    cd backend
    pip install fastapi uvicorn undetected-chromedriver selenium requests
    python local_web_server.py

Docker 컨테이너에서 이 서버로 요청을 보내 웹 크롤링을 수행합니다.
"""

import os
import sys
import time
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict

# FastAPI 서버
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# undetected-chromedriver
try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    UC_AVAILABLE = True
except ImportError:
    print("[오류] undetected-chromedriver가 설치되지 않았습니다.")
    print("설치: pip install undetected-chromedriver selenium")
    UC_AVAILABLE = False

import requests

app = FastAPI(title="Adidas Web Extraction Local Server", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 쿠폰 이름 한글 매핑
COUPON_NAME_MAP = {
    "Naver Membership": "네이버 멤버십",
    "KR_STARBUCKS": "스타벅스",
    "KR_SAMSUNG": "삼성",
    "KR_HYUNDAI": "현대카드",
    "ADI_KR_Tier1_5%_90days": "5% 쿠폰",
    "ADI_KR_Tier2_10%_90days": "10% 쿠폰",
    "ADI_KR_Tier3_15%_90days": "15% 쿠폰",
    "ADI_KR_Tier4_20%_90days": "20% 쿠폰",
    "ADI_KR_Birthday_15%": "생일 15% 쿠폰",
    "ADI_KR_Birthday_20%": "생일 20% 쿠폰",
    "ADI_KR_Welcome_10%": "웰컴 10% 쿠폰",
    "ADI_KR_Welcome_15%": "웰컴 15% 쿠폰",
}


def get_korean_coupon_name(coupon_label: str) -> str:
    """쿠폰 영문명을 한글명으로 변환"""
    if not coupon_label:
        return "알 수 없음"

    if coupon_label in COUPON_NAME_MAP:
        return COUPON_NAME_MAP[coupon_label]

    for eng, kor in COUPON_NAME_MAP.items():
        if eng.lower() in coupon_label.lower():
            return kor

    import re
    percent_match = re.search(r'(\d+)%', coupon_label)
    if percent_match:
        return f"{percent_match.group(1)}% 쿠폰"

    return coupon_label


class ExtractRequest(BaseModel):
    email: str
    password: str
    headless: bool = False  # 기본값: GUI 모드


class ExtractResponse(BaseModel):
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


def web_login(driver, email: str, password: str) -> Optional[str]:
    """
    웹 로그인 후 access token 반환
    """
    try:
        driver.get("https://www.adidas.co.kr/account-login")
        time.sleep(2)

        # 봇 차단 확인
        page_source = driver.page_source
        if "Reference Error" in page_source or "unable to give you access" in page_source:
            print(f"  [오류] Akamai 봇 차단 감지")
            return None

        # 페이지 로드 대기
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
            )
        except TimeoutException:
            page_source = driver.page_source
            if "Reference Error" in page_source:
                print(f"  [오류] Akamai 봇 차단 감지 (타임아웃)")
                return None
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
                    time.sleep(0.5)
                    break
            except NoSuchElementException:
                continue

        driver.implicitly_wait(10)

        # 이메일 입력
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

        # 토큰 쿠키 대기
        access_token = None
        start = time.time()
        max_wait = 15

        while time.time() - start < max_wait:
            cookies = driver.get_cookies()
            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    access_token = cookie['value']
                    return access_token
            time.sleep(0.3)

        return None

    except Exception as e:
        print(f"  [로그인 오류] {e}")
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
        print(f"  [API 오류] 프로필 조회: {e}")

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
        print(f"  [API 오류] 바코드 조회: {e}")

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
        print(f"  [API 오류] 포인트 조회: {e}")

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
                        expire_date = expire_date[:10]

                    result['coupons'].append({
                        'name': korean_name,
                        'original_name': coupon_label,
                        'code': code,
                        'expire_date': expire_date,
                    })
    except Exception as e:
        print(f"  [API 오류] 쿠폰 조회: {e}")

    return result


def extract_account_info(email: str, password: str, headless: bool = False) -> Dict[str, Any]:
    """
    계정 정보 추출 (GUI 모드)
    """
    if not UC_AVAILABLE:
        return {
            "success": False,
            "email": email,
            "error": "undetected-chromedriver가 설치되지 않았습니다"
        }

    total_start = time.time()
    driver = None

    try:
        print(f"\n[추출 시작] {email} (headless={headless})")

        # Chrome 옵션 설정
        options = uc.ChromeOptions()

        if headless:
            options.add_argument('--headless=new')

        options.add_argument('--window-size=1280,900')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')

        # 브라우저 시작
        driver = uc.Chrome(options=options, use_subprocess=True)
        driver.implicitly_wait(10)

        # 로그인
        login_start = time.time()
        access_token = web_login(driver, email, password)
        login_time = time.time() - login_start

        if not access_token:
            return {
                "success": False,
                "email": email,
                "error": "로그인 실패 (토큰 없음)",
                "login_time": login_time,
                "total_time": time.time() - total_start
            }

        print(f"  로그인 성공 ({login_time:.1f}초)")

        # API로 정보 추출
        api_start = time.time()
        info = fetch_account_info_via_api(access_token)
        api_time = time.time() - api_start

        total_time = time.time() - total_start
        print(f"  정보 추출 완료 - 이름: {info.get('name')}, 포인트: {info.get('points')}, 쿠폰: {len(info.get('coupons', []))}개 ({total_time:.1f}초)")

        return {
            "success": True,
            "email": email,
            "name": info.get('name'),
            "birthday": info.get('birthday'),
            "phone": info.get('phone'),
            "barcode": info.get('barcode'),
            "points": info.get('points'),
            "coupons": info.get('coupons', []),
            "login_time": login_time,
            "api_time": api_time,
            "total_time": total_time
        }

    except Exception as e:
        error_msg = str(e)
        print(f"  [오류] {error_msg}")
        return {
            "success": False,
            "email": email,
            "error": error_msg,
            "total_time": time.time() - total_start
        }
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


@app.get("/")
async def root():
    return {
        "message": "Adidas Web Extraction Local Server",
        "version": "1.0.0",
        "status": "running",
        "mode": "GUI (로컬 Windows)",
    }


@app.get("/health")
async def health_check():
    return {"status": "ok", "uc_available": UC_AVAILABLE}


@app.post("/extract", response_model=ExtractResponse)
async def extract_info(request: ExtractRequest):
    """
    계정 정보 추출 API

    Docker 컨테이너에서 이 API를 호출하여 로컬 Windows에서 Chrome GUI를 실행합니다.
    """
    if not UC_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="undetected-chromedriver가 설치되지 않았습니다. pip install undetected-chromedriver selenium"
        )

    result = extract_account_info(
        email=request.email,
        password=request.password,
        headless=request.headless
    )

    return ExtractResponse(**result)


if __name__ == "__main__":
    print("=" * 60)
    print("Adidas Web Extraction Local Server")
    print("=" * 60)
    print(f"undetected-chromedriver 사용 가능: {UC_AVAILABLE}")
    print("서버 시작: http://localhost:8002")
    print("=" * 60)
    print("\n[주의] 이 서버는 로컬 Windows에서만 실행하세요.")
    print("Docker 컨테이너의 백엔드에서 이 서버로 요청을 보냅니다.\n")

    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
