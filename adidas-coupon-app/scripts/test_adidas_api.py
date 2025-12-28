"""
아디다스 API 직접 호출 테스트
- 로그인 후 쿠폰 발급 API 엔드포인트 탐색
"""

import requests
import json
import sys

# 테스트용 계정
EMAIL = sys.argv[1] if len(sys.argv) > 1 else ""
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else ""

def test_adidas_api():
    session = requests.Session()

    # 일반적인 브라우저 헤더
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.adidas.co.kr',
        'Referer': 'https://www.adidas.co.kr/',
    }

    print("=" * 60)
    print("아디다스 API 직접 호출 테스트")
    print("=" * 60)

    # 1. 로그인 API 테스트
    print("\n[1] 로그인 API 테스트")

    # 로그인 엔드포인트 후보들
    login_endpoints = [
        'https://www.adidas.co.kr/api/identity/login',
        'https://www.adidas.co.kr/api/auth/login',
        'https://api.adidas.co.kr/login',
        'https://www.adidas.co.kr/api/session/login',
    ]

    login_data = {
        'email': EMAIL,
        'password': PASSWORD,
    }

    for endpoint in login_endpoints:
        try:
            print(f"  시도: {endpoint}")
            resp = session.post(endpoint, json=login_data, headers=headers, timeout=10)
            print(f"    상태: {resp.status_code}")
            if resp.status_code == 200:
                print(f"    응답: {resp.text[:500]}")
                break
            elif resp.status_code != 404:
                print(f"    응답: {resp.text[:300]}")
        except Exception as e:
            print(f"    오류: {e}")

    # 2. 쿠폰/바우처 관련 API 엔드포인트 탐색
    print("\n[2] 쿠폰/바우처 관련 API 엔드포인트 탐색")

    voucher_endpoints = [
        # 조회 API
        'https://www.adidas.co.kr/api/account/loyalty/vouchers',
        'https://www.adidas.co.kr/api/loyalty/vouchers',
        'https://www.adidas.co.kr/api/vouchers',

        # 포인트 조회
        'https://www.adidas.co.kr/api/account/loyalty/points',
        'https://www.adidas.co.kr/api/loyalty/points',
        'https://www.adidas.co.kr/api/account/loyalty',

        # 바우처 교환/발급 (예상)
        'https://www.adidas.co.kr/api/loyalty/redeem',
        'https://www.adidas.co.kr/api/loyalty/exchange',
        'https://www.adidas.co.kr/api/vouchers/redeem',
        'https://www.adidas.co.kr/api/vouchers/claim',
        'https://www.adidas.co.kr/api/account/loyalty/redeem',
        'https://www.adidas.co.kr/api/account/loyalty/vouchers/redeem',
    ]

    for endpoint in voucher_endpoints:
        try:
            print(f"\n  GET {endpoint}")
            resp = session.get(endpoint, headers=headers, timeout=10)
            print(f"    상태: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json() if 'json' in resp.headers.get('content-type', '') else resp.text
                print(f"    응답: {str(data)[:300]}")
            elif resp.status_code not in [401, 403, 404]:
                print(f"    응답: {resp.text[:200]}")
        except Exception as e:
            print(f"    오류: {e}")

    # 3. 네트워크 탭에서 확인할 수 있는 패턴 기반 추측
    print("\n[3] 쿠폰 발급 API 추측 (POST)")

    redeem_endpoints = [
        ('https://www.adidas.co.kr/api/loyalty/vouchers/redeem', {'voucherType': 'GIFT_CARD_10000'}),
        ('https://www.adidas.co.kr/api/account/loyalty/vouchers/purchase', {'amount': 10000}),
        ('https://www.adidas.co.kr/api/loyalty/redeem', {'points': 6000, 'voucherType': 'GIFT_CARD_10000'}),
    ]

    for endpoint, payload in redeem_endpoints:
        try:
            print(f"\n  POST {endpoint}")
            print(f"    payload: {payload}")
            resp = session.post(endpoint, json=payload, headers=headers, timeout=10)
            print(f"    상태: {resp.status_code}")
            if resp.text:
                print(f"    응답: {resp.text[:300]}")
        except Exception as e:
            print(f"    오류: {e}")

if __name__ == '__main__':
    if not EMAIL or not PASSWORD:
        print("사용법: python test_adidas_api.py <email> <password>")
        sys.exit(1)
    test_adidas_api()
