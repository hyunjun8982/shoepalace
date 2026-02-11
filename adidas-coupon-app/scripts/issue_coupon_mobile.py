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

# 공통 로그인 모듈 임포트
from adidas_login import (
    login_with_driver,
    logout_with_driver,
    clear_webview_cookies,
    get_token_from_webview,
    wait_for_element,
    InstanceManager,
)

# 쿠폰 타입별 정보
COUPON_TYPES = {
    '10000': {'name': '1만원 상품권', 'points': 1500, 'text': '₩10000', 'value': '10000'},
    '30000': {'name': '3만원 상품권', 'points': 3000, 'text': '₩30000', 'value': '30000'},
    '50000': {'name': '5만원 상품권', 'points': 4000, 'text': '₩50000', 'value': '50000'},
    '100000': {'name': '10만원 상품권', 'points': 6000, 'text': '₩100000', 'value': '100000'},
}


# ==================== 프록시 관리 ====================
import subprocess

# 프록시 상태 관리
proxy_state = {
    'list': [],           # 프록시 목록
    'current_index': 0,   # 현재 프록시 인덱스
    'enabled': False,     # 프록시 사용 여부
    'current': None,      # 현재 적용된 프록시 (ip:port)
    'fail_count': 0,      # 연속 실패 횟수
}

def load_proxy_list(proxy_file_path: str = None) -> list:
    """프록시 목록 파일 로드"""
    if proxy_file_path is None:
        # 기본 경로: 스크립트와 같은 폴더의 상위 폴더
        script_dir = os.path.dirname(os.path.abspath(__file__))
        proxy_file_path = os.path.join(os.path.dirname(script_dir), 'proxy_list.txt')

    proxies = []
    try:
        if os.path.exists(proxy_file_path):
            with open(proxy_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and ':' in line:
                        proxies.append(line)
            print(f"[프록시] {len(proxies)}개 프록시 로드됨: {proxy_file_path}")
        else:
            print(f"[프록시] 프록시 파일 없음: {proxy_file_path}")
    except Exception as e:
        print(f"[프록시] 프록시 파일 로드 오류: {e}")

    proxy_state['list'] = proxies
    proxy_state['enabled'] = len(proxies) > 0
    return proxies

def set_android_proxy(proxy: str) -> bool:
    """ADB를 통해 Android에 프록시 설정"""
    try:
        if not proxy or ':' not in proxy:
            print(f"[프록시] 잘못된 프록시 형식: {proxy}")
            return False

        ip, port = proxy.split(':')
        adb_path = 'C:\\platform-tools\\adb.exe'

        # 프록시 설정
        cmd = [adb_path, 'shell', 'settings', 'put', 'global', 'http_proxy', f'{ip}:{port}']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 0:
            proxy_state['current'] = proxy
            print(f"[프록시] 설정됨: {proxy}")
            return True
        else:
            print(f"[프록시] 설정 실패: {result.stderr}")
            return False
    except Exception as e:
        print(f"[프록시] 설정 오류: {e}")
        return False

def clear_android_proxy() -> bool:
    """Android 프록시 설정 해제"""
    try:
        adb_path = 'C:\\platform-tools\\adb.exe'

        # 프록시 해제 (빈 값으로 설정)
        cmd = [adb_path, 'shell', 'settings', 'put', 'global', 'http_proxy', ':0']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 0:
            proxy_state['current'] = None
            print("[프록시] 해제됨")
            return True
        else:
            print(f"[프록시] 해제 실패: {result.stderr}")
            return False
    except Exception as e:
        print(f"[프록시] 해제 오류: {e}")
        return False

def get_next_proxy() -> str:
    """다음 프록시 가져오기 (순환)"""
    if not proxy_state['list']:
        return None

    proxy_state['current_index'] = (proxy_state['current_index'] + 1) % len(proxy_state['list'])
    return proxy_state['list'][proxy_state['current_index']]

def switch_to_next_proxy() -> bool:
    """다음 프록시로 전환"""
    if not proxy_state['enabled'] or not proxy_state['list']:
        return False

    next_proxy = get_next_proxy()
    if next_proxy:
        print(f"[프록시] 전환 중... ({proxy_state['current_index'] + 1}/{len(proxy_state['list'])})")
        return set_android_proxy(next_proxy)
    return False

def init_proxy_for_batch() -> bool:
    """배치 시작 시 프록시 초기화 및 첫 프록시 설정"""
    load_proxy_list()

    if proxy_state['enabled'] and proxy_state['list']:
        # 첫 번째 프록시 설정
        first_proxy = proxy_state['list'][0]
        proxy_state['current_index'] = 0
        return set_android_proxy(first_proxy)
    return False

def handle_proxy_failure() -> bool:
    """프록시 실패 처리 - 다음 프록시로 전환"""
    proxy_state['fail_count'] += 1

    if proxy_state['fail_count'] >= len(proxy_state['list']):
        print(f"[프록시] 모든 프록시 실패 ({proxy_state['fail_count']}회)")
        return False

    return switch_to_next_proxy()


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
        print(f"  [DEBUG] 상품권 API 응답 코드: {resp.status_code}", flush=True)
        if resp.status_code == 200:
            offers = resp.json()
            # 첫 번째 상품권 원본 데이터 확인 (디버깅용)
            if offers and len(offers) > 0:
                print(f"  [DEBUG] 첫 번째 상품권 원본: {str(offers[0])[:500]}", flush=True)
            if isinstance(offers, list):
                return offers
        else:
            print(f"  [DEBUG] 상품권 API 응답: {resp.text[:300]}", flush=True)
    except Exception as e:
        print(f"  상품권 목록 조회 오류: {e}")
    return []


def find_voucher_offer(offers: list, coupon_value: str) -> dict:
    """상품권 목록에서 해당 금액의 상품권 찾기"""
    # coupon_value를 문자열과 숫자 모두로 비교
    coupon_value_str = str(coupon_value)
    coupon_value_int = int(coupon_value) if coupon_value.isdigit() else 0

    for offer in offers:
        rewards = offer.get('rewards', [])
        for reward in rewards:
            reward_value = reward.get('value', '')
            # 문자열 비교 또는 숫자 비교
            if str(reward_value) == coupon_value_str or reward_value == coupon_value_int:
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


def get_coupon_name(coupon_type: str) -> str:
    """쿠폰 타입을 사람이 읽기 쉬운 이름으로 변환"""
    names = {
        '10000': '1만원권',
        '30000': '3만원권',
        '50000': '5만원권',
        '100000': '10만원권',
    }
    return names.get(coupon_type, f'{coupon_type}원권')


def issue_multiple_coupons_via_api(access_token: str, coupon_types: list, login_email: str = None) -> dict:
    """
    여러 쿠폰 타입을 순차적으로 발급 (최적화 버전)
    - API 호출 최소화: 포인트/상품권목록은 처음 1회, 쿠폰목록은 마지막 1회만 조회

    Args:
        access_token: 액세스 토큰
        coupon_types: 쿠폰 타입 리스트 (예: ["100000", "50000"])
        login_email: 로그인 이메일 (로깅용)

    Returns:
        {
            "success": True/False (하나라도 성공하면 True),
            "results": [{"coupon_type": "100000", "success": True, "message": "발급 완료"}, ...],
            "message": "10만원권 발급 완료, 5만원권 포인트 부족",
            "remaining_points": 1234,
            "vouchers": [...]
        }
    """
    results = []
    any_success = False

    print(f"[다중 쿠폰 발급] {len(coupon_types)}개 쿠폰 타입: {coupon_types}", flush=True)
    if login_email:
        print(f"[API] 로그인 계정: {login_email}", flush=True)

    # ========== 1. 초기 정보 조회 (1회) ==========
    print("  [1/3] 현재 포인트 조회...", flush=True)
    current_points = get_account_points(access_token)
    print(f"        포인트: {current_points}P", flush=True)

    print("  [2/3] 상품권 목록 조회...", flush=True)
    offers = get_available_voucher_offers(access_token)
    if not offers:
        return {"success": False, "message": "상품권 목록 조회 실패", "remaining_points": current_points, "results": [], "vouchers": []}

    # 디버그: 상품권 목록 출력
    print(f"  [DEBUG] 상품권 목록 {len(offers)}개:", flush=True)
    for idx, offer in enumerate(offers[:5]):  # 처음 5개만 출력
        offer_id = offer.get('id')
        offer_name = offer.get('name', 'N/A')
        price = offer.get('priceInPoints', 0)
        eligible = offer.get('eligible', False)
        rewards = offer.get('rewards', [])
        # value와 name을 함께 표시 (할인권 vs 상품권 구분용)
        reward_info = [f"{r.get('value')}({r.get('name', '?')[:20]})" for r in rewards]
        print(f"    [{idx+1}] {offer_name}, {price}P, eligible={eligible}, rewards={reward_info}", flush=True)

    # ========== 2. 각 쿠폰 타입별 발급 (claim만 호출) ==========
    print("  [3/3] 쿠폰 발급 진행...", flush=True)
    for i, coupon_type in enumerate(coupon_types):
        coupon_info = COUPON_TYPES.get(coupon_type, COUPON_TYPES['100000'])
        coupon_name = get_coupon_name(coupon_type)
        print(f"\n    [{i+1}/{len(coupon_types)}] {coupon_name} 발급 시도...", flush=True)

        # 해당 금액의 상품권 찾기
        target_offer = find_voucher_offer(offers, coupon_info['value'])

        if not target_offer:
            # 상품권을 찾지 못함 - 디버그 정보 출력
            print(f"      → {coupon_name}: 상품권 미발견 (찾는 value: {coupon_info['value']})", flush=True)
            # 실제 상품권 목록의 value들 확인
            all_values = []
            for o in offers:
                for r in o.get('rewards', []):
                    all_values.append(r.get('value'))
            print(f"      [DEBUG] 상품권 목록의 모든 value: {all_values}", flush=True)
            # 원인 판별: 목록에 없으면 1달 미경과, 있는데 못 찾으면 형식 문제
            if coupon_info['value'] in all_values:
                print(f"      [DEBUG] value가 존재하는데 찾지 못함 - 로직 오류", flush=True)
            else:
                print(f"      → {coupon_name}: 1달 미경과 (상품권 목록에 없음)", flush=True)
            results.append({
                'coupon_type': coupon_type,
                'coupon_name': coupon_name,
                'success': False,
                'message': '1달 미경과',
                'error_type': 'cooldown_period',
                'coupon_code': None
            })
            continue

        # 교환 가능 여부 확인
        if not target_offer['eligible']:
            required_points = target_offer.get('priceInPoints', 0)
            if current_points < required_points:
                print(f"      → {coupon_name}: 포인트 부족 ({current_points}P < {required_points}P)", flush=True)
                results.append({
                    'coupon_type': coupon_type,
                    'coupon_name': coupon_name,
                    'success': False,
                    'message': '포인트 부족',
                    'error_type': 'insufficient_points',
                    'coupon_code': None
                })
            else:
                reasons = target_offer.get('eligibilityReasons', [])
                reason_str = ', '.join([r.get('reason', str(r)) if isinstance(r, dict) else str(r) for r in reasons]) if reasons else '알 수 없음'
                print(f"      → {coupon_name}: 교환 불가 ({reason_str})", flush=True)
                results.append({
                    'coupon_type': coupon_type,
                    'coupon_name': coupon_name,
                    'success': False,
                    'message': f'교환 불가: {reason_str}',
                    'error_type': 'not_eligible',
                    'coupon_code': None
                })
            continue

        # 쿠폰 발급 API 호출
        claim_result = claim_voucher(access_token, target_offer['offerId'], target_offer['rewardId'])
        if claim_result['success']:
            coupon_code = claim_result.get('data', {}).get('code', '')
            points_used = target_offer.get('priceInPoints', 0)
            current_points -= points_used  # 로컬에서 포인트 차감 (API 호출 최소화)
            print(f"      → {coupon_name}: 발급 완료! (코드: {coupon_code}, 사용: {points_used}P)", flush=True)
            results.append({
                'coupon_type': coupon_type,
                'coupon_name': coupon_name,
                'success': True,
                'message': '발급 완료',
                'error_type': None,
                'coupon_code': coupon_code
            })
            any_success = True

            # 발급 성공 시 offers 목록에서 해당 상품권 제거 (다음 발급 시 중복 방지)
            offers = [o for o in offers if o.get('id') != target_offer['offerId']]
        else:
            error_msg = claim_result.get('error', 'UNKNOWN')
            print(f"      → {coupon_name}: 발급 실패 ({error_msg})", flush=True)
            results.append({
                'coupon_type': coupon_type,
                'coupon_name': coupon_name,
                'success': False,
                'message': f'발급 실패: {error_msg}',
                'error_type': 'claim_failed',
                'coupon_code': None
            })

    # ========== 3. 최종 정보 조회 (1회) ==========
    print("\n  최종 정보 조회...", flush=True)
    final_points = get_account_points(access_token)
    vouchers = get_account_vouchers(access_token)
    final_vouchers = parse_vouchers(vouchers)
    print(f"  잔여 포인트: {final_points}P, 보유 쿠폰: {len(final_vouchers)}개", flush=True)

    # ========== 4. 종합 메시지 생성 ==========
    message_parts = []
    for r in results:
        if r['success']:
            message_parts.append(f"{r['coupon_name']} 발급 완료")
        else:
            error_msg = r.get('message', '실패')
            if '1달 미경과' in error_msg or r.get('error_type') == 'cooldown_period':
                message_parts.append(f"{r['coupon_name']} 1달 미경과")
            elif '포인트 부족' in error_msg or r.get('error_type') == 'insufficient_points':
                message_parts.append(f"{r['coupon_name']} 포인트 부족")
            else:
                message_parts.append(f"{r['coupon_name']} {error_msg}")

    combined_message = ', '.join(message_parts)
    print(f"[다중 쿠폰 발급 완료] 종합 메시지: {combined_message}", flush=True)

    return {
        'success': any_success,
        'results': results,
        'message': combined_message,
        'remaining_points': final_points,
        'vouchers': final_vouchers
    }


def issue_coupon_via_api(access_token: str, coupon_type: str, login_email: str = None) -> dict:
    """API를 통해 단일 쿠폰 발급"""
    coupon_info = COUPON_TYPES.get(coupon_type, COUPON_TYPES['100000'])

    # 토큰 유효성 확인 (프로필 API가 403이어도 다른 API는 동작할 수 있음)
    token_prefix = access_token[:30] if access_token else 'None'
    print(f"[API] 토큰으로 쿠폰 발급 시도 (token:{token_prefix}...)", flush=True)
    if login_email:
        print(f"[API] 로그인 계정: {login_email}", flush=True)

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


def wait_for_page_source_contains(driver, text, timeout=10):
    """페이지에 특정 텍스트가 나타날 때까지 대기"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if text in driver.page_source:
            return True
        time.sleep(0.3)
    return False


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
            # 오류 유형 확인
            if access_token == "PASSWORD_WRONG":
                return {"success": False, "message": "비밀번호 틀림", "error_type": "password_wrong"}
            elif access_token == "BOT_BLOCKED":
                return {"success": False, "message": "봇 차단 (오류 발생)", "error_type": "bot_blocked"}
            return {"success": False, "message": "로그인 실패"}

        # 토큰이 없으면 추가 시도
        if not access_token:
            print("\n[!] 토큰 없음 - 프로필 화면에서 재시도...")
            access_token = get_token_from_webview(driver)

        # 쿠폰 발급 - API 방식만 사용
        if access_token:
            print("\n[API 모드] 토큰으로 쿠폰 발급 시도")
            result = issue_coupon_via_api(access_token, coupon_type, login_email=email)
        else:
            print("\n[ERROR] 토큰 추출 최종 실패 - 쿠폰 발급 불가")
            result = {"success": False, "message": "토큰 추출 실패"}

        # 로그아웃 시도
        logout_success = logout_with_driver(driver)

        # 실패 시 웹뷰 쿠키 삭제 (다음 계정에 영향 방지)
        if not logout_success:
            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
            clear_webview_cookies(driver)

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
    print(f"[배치 시작] JSON 경로: {batch_json_path}", flush=True)
    driver = None
    instance_manager = None
    results = []

    try:
        # 프록시 초기화 (proxy_list.txt가 있으면 자동 적용)
        init_proxy_for_batch()

        # JSON 파일에서 계정 목록 로드
        print(f"[배치] JSON 파일 로드 시도...", flush=True)
        with open(batch_json_path, 'r', encoding='utf-8') as f:
            batch_data = json.load(f)
        print(f"[배치] JSON 로드 성공", flush=True)

        # 서버에서 보내는 형식: { coupon_types: [...], accounts: [...] } 또는 { coupon_type: "...", accounts: [...] }
        if isinstance(batch_data, dict):
            accounts = batch_data.get('accounts', [])
            # 여러 쿠폰 타입 지원 (coupon_types 배열 우선, 없으면 coupon_type 단일값)
            if 'coupon_types' in batch_data:
                default_coupon_types = batch_data.get('coupon_types', ['100000'])
                if isinstance(default_coupon_types, str):
                    default_coupon_types = [default_coupon_types]
            else:
                default_coupon_types = [batch_data.get('coupon_type', '100000')]
        else:
            # 이전 형식 호환: 배열만 있는 경우
            accounts = batch_data
            default_coupon_types = ['100000']

        if not accounts:
            print("[ERROR] 계정 목록이 비어있습니다")
            return

        coupon_types_str = ', '.join([get_coupon_name(ct) for ct in default_coupon_types])
        print(f"\n[배치] {len(accounts)}개 계정 쿠폰 발급 ({coupon_types_str})")

        # 첫 번째 계정을 "Appium 연결 중..." 상태로 표시
        first_acc_id = accounts[0].get('id') if accounts else None
        if first_acc_id:
            print(f'[PROGRESS] {{"id": {first_acc_id}, "status": "processing", "message": "Appium 연결 중..."}}', flush=True)

        # 멀티 인스턴스 매니저로 Appium 연결
        instance_manager = InstanceManager()
        driver, device_udid = instance_manager.create_driver()
        print("[Appium] 연결됨", flush=True)

        # 각 계정 순차 처리
        i = 0
        while i < len(accounts):
            account = accounts[i]
            email = account.get('email')
            password = account.get('password')
            acc_id = account.get('id')
            # 계정별 쿠폰 타입 또는 기본 쿠폰 타입 사용
            if 'coupon_types' in account:
                coupon_types = account.get('coupon_types', default_coupon_types)
                if isinstance(coupon_types, str):
                    coupon_types = [coupon_types]
            elif 'coupon_type' in account:
                coupon_types = [account.get('coupon_type')]
            else:
                coupon_types = default_coupon_types

            is_continuation = (i > 0)

            # 진행 상태 출력 (정보 조회와 동일한 패턴 + PROGRESS JSON)
            coupon_types_str = ', '.join([get_coupon_name(ct) for ct in coupon_types])
            print(f"\n[{i+1}/{len(accounts)}] 발급 중: {email}", flush=True)
            progress_data = {'id': acc_id, 'status': 'processing', 'message': f'{coupon_types_str} 발급 중...'}
            print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}", flush=True)

            account_result = {
                'id': acc_id,
                'email': email,
                'success': False,
                'message': None
            }

            try:
                # 앱 상태 확인 (정보 조회와 동일한 패턴)
                current_pkg = driver.current_package
                if current_pkg != "com.adidas.app":
                    print(f"  [!] 앱 패키지 불일치: {current_pkg} → 앱 재활성화")
                    driver.activate_app("com.adidas.app")
                    time.sleep(2)

                # 로그인 (토큰 추출 포함)
                print(f"  [로그인 시작] {email}", flush=True)
                login_success, access_token = login_with_driver(driver, email, password, is_continuation)
                print(f"  [로그인 결과] success={login_success}, token={'있음' if access_token and access_token not in ['PASSWORD_WRONG', 'BOT_BLOCKED'] else access_token}", flush=True)
                if not login_success:
                    # 비밀번호 오류인 경우 구분 (정보 조회와 동일)
                    if access_token == "PASSWORD_WRONG":
                        account_result['message'] = '비밀번호 오류'
                        account_result['error_type'] = 'password_wrong'
                        progress_data = {'id': acc_id, 'status': 'password_wrong', 'message': 'PASSWORD_WRONG'}
                        print(f"\n비밀번호 오류: {email}")
                    elif access_token == "BOT_BLOCKED":
                        print(f"\n[BATCH_STOPPED] 봇 차단 감지 - 배치 즉시 중단: {email}")
                        account_result['message'] = '봇 차단'
                        account_result['error_type'] = 'bot_blocked'
                        progress_data = {'id': acc_id, 'status': 'error', 'message': '봇 차단 - 배치 중단'}
                        print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                        sys.stdout.flush()
                        results.append(account_result)

                        # 나머지 계정을 모두 스킵 처리
                        for j in range(i + 1, len(accounts)):
                            skip_acc = accounts[j]
                            skip_result = {
                                'id': skip_acc.get('id'),
                                'email': skip_acc.get('email'),
                                'success': False,
                                'message': '봇 차단으로 배치 중단됨',
                                'error_type': 'batch_stopped'
                            }
                            skip_progress = {'id': skip_acc.get('id'), 'status': 'error', 'message': '봇 차단으로 배치 중단됨'}
                            print(f"[PROGRESS] {json.dumps(skip_progress, ensure_ascii=False)}")
                            results.append(skip_result)
                        sys.stdout.flush()
                        break  # 배치 즉시 중단
                    else:
                        account_result['message'] = '로그인 실패'
                        account_result['error_type'] = 'login_failed'
                        progress_data = {'id': acc_id, 'status': 'error', 'message': '로그인 실패'}
                        print(f"\n로그인 실패: {email}")
                    print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                    sys.stdout.flush()
                else:
                    # 로그인 성공 → 연속 BOT_BLOCKED 카운터 리셋
                    consecutive_bot_blocked = 0

                    # 토큰이 없으면 추가 시도
                    if not access_token:
                        print("  [!] 토큰 없음 - 프로필 화면에서 재시도...")
                        access_token = get_token_from_webview(driver)

                    # 쿠폰 발급 - API 방식 (여러 쿠폰 타입 순차 발급)
                    if access_token:
                        result = issue_multiple_coupons_via_api(access_token, coupon_types, login_email=email)
                    else:
                        print("  [!] 토큰 추출 최종 실패")
                        result = {"success": False, "message": "토큰 추출 실패"}
                        # 토큰 실패 시에도 로그아웃
                        logout_success = logout_with_driver(driver)

                        if not logout_success:
                            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
                            clear_webview_cookies(driver)

                    account_result['success'] = result.get('success', False)
                    # 디버그: result에서 message 추출 전 확인
                    raw_message = result.get('message')
                    print(f"  [DEBUG] result.get('message') = '{raw_message}'", flush=True)
                    account_result['message'] = raw_message or '발급 완료'
                    account_result['coupon_results'] = result.get('results', [])  # 개별 쿠폰 결과
                    account_result['remaining_points'] = result.get('remaining_points')
                    account_result['vouchers'] = result.get('vouchers')

                    # 디버그: 결과 메시지 확인
                    print(f"  [결과 메시지] {account_result['message']}", flush=True)

                    # 진행 결과 출력 (포인트/쿠폰 정보 포함)
                    # vouchers는 별도 라인으로 출력 (JSON 길이 제한 방지)
                    vouchers = result.get('vouchers', [])
                    remaining_points = result.get('remaining_points', 0)
                    coupon_results = result.get('results', [])

                    if account_result['success']:
                        progress_data = {
                            'id': acc_id,
                            'status': 'success',
                            'message': account_result['message'],  # 일관성을 위해 account_result 사용
                            'data': {
                                'remaining_points': remaining_points,
                                'voucher_count': len(vouchers),
                                'vouchers': vouchers,  # 전체 목록 포함 (서버에서 대체용)
                                'coupon_results': coupon_results
                            }
                        }
                    else:
                        # 실패해도 포인트/쿠폰 정보가 있으면 포함 (대기 기간, 포인트 부족 등)
                        # 개별 결과 중 하나라도 cooldown/insufficient면 warning
                        has_warning = any(
                            r.get('error_type') in ['cooldown_period', 'insufficient_points']
                            for r in coupon_results
                        )
                        status = 'warning' if has_warning else 'error'
                        progress_data = {
                            'id': acc_id,
                            'status': status,
                            'message': account_result['message'],
                            'data': {
                                'remaining_points': remaining_points,
                                'voucher_count': len(vouchers),
                                'vouchers': vouchers,  # 전체 목록 포함 (서버에서 대체용)
                                'coupon_results': coupon_results
                            }
                        }
                    print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                    sys.stdout.flush()

                    # 로그아웃 시도
                    logout_success = logout_with_driver(driver)

                    # 실패 시 웹뷰 쿠키 삭제 (다음 계정에 영향 방지)
                    if not logout_success:
                        print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
                        clear_webview_cookies(driver)

            except Exception as e:
                account_result['message'] = str(e)
                progress_data = {'id': acc_id, 'status': 'error', 'message': str(e)}
                print(f"[PROGRESS] {json.dumps(progress_data, ensure_ascii=False)}")
                sys.stdout.flush()

            results.append(account_result)

            # 계정 간 대기
            if i < len(accounts) - 1:
                time.sleep(1)

            i += 1  # 다음 계정으로

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
        # 프록시 해제 (설정된 경우)
        if proxy_state['enabled']:
            clear_android_proxy()

        if instance_manager:
            instance_manager.cleanup()
        elif driver:
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
    print("[스크립트 시작] issue_coupon_mobile.py", flush=True)

    try:
        parser = argparse.ArgumentParser(description='아디다스 모바일 쿠폰 발급')
        parser.add_argument('email', nargs='?', help='이메일')
        parser.add_argument('password', nargs='?', help='비밀번호')
        parser.add_argument('coupon_type', nargs='?', default='100000', help='쿠폰 타입 (10000/30000/50000/100000)')
        parser.add_argument('--batch', help='배치 모드용 JSON 파일 경로')
        parser.add_argument('--use-session', action='store_true', help='세션 서버 사용 (Appium 연결 재사용)')

        args = parser.parse_args()
        print(f"[인자 파싱 완료] batch={args.batch}", flush=True)

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
    except Exception as e:
        print(f"[FATAL ERROR] {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
