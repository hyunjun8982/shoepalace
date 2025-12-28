"""
아디다스 쿠폰 발급 API 직접 호출 테스트
- 이미 로그인된 토큰을 사용하여 쿠폰 발급 API 엔드포인트 탐색
- 네트워크 탭에서 캡처한 API 정보 기반

사용법:
    python test_coupon_api.py <access_token>
"""

import requests
import json
import sys

def test_coupon_api(access_token: str):
    """토큰으로 쿠폰 관련 API 테스트"""

    print("=" * 60)
    print("아디다스 쿠폰 발급 API 테스트")
    print("=" * 60)

    headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'origin': 'https://www.adidas.co.kr',
        'referer': 'https://www.adidas.co.kr/adiclub',
    }
    cookies = {'account.grant.accessToken': access_token}

    # 1. 포인트 조회 (wallet)
    print("\n[1] 포인트 조회 (wallet)")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/wallet',
            headers=headers, cookies=cookies, timeout=10
        )
        print(f"  상태: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  포인트: {data.get('availablePoints', 'N/A')}P")
        else:
            print(f"  응답: {resp.text[:200]}")
    except Exception as e:
        print(f"  오류: {e}")

    # 2. 쿠폰 목록 조회
    print("\n[2] 쿠폰 목록 조회")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers, cookies=cookies, timeout=10
        )
        print(f"  상태: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  쿠폰 수: {len(data) if isinstance(data, list) else 'N/A'}개")
        else:
            print(f"  응답: {resp.text[:200]}")
    except Exception as e:
        print(f"  오류: {e}")

    # 3. 쿠폰 상품 목록 조회 (교환 가능한 쿠폰 목록)
    print("\n[3] 교환 가능한 쿠폰 상품 목록 조회")
    voucher_endpoints = [
        'https://www.adidas.co.kr/api/account/loyalty/voucher-offers',
        'https://www.adidas.co.kr/api/loyalty/voucher-offers',
        'https://www.adidas.co.kr/api/account/loyalty/offers',
        'https://www.adidas.co.kr/api/loyalty/offers',
        'https://www.adidas.co.kr/api/account/loyalty/rewards',
    ]

    for endpoint in voucher_endpoints:
        try:
            resp = requests.get(endpoint, headers=headers, cookies=cookies, timeout=10)
            print(f"  {endpoint.split('/')[-1]}: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"    응답: {json.dumps(data, ensure_ascii=False)[:300]}")
        except Exception as e:
            print(f"    오류: {e}")

    # 4. 쿠폰 발급 API 테스트 (POST)
    print("\n[4] 쿠폰 발급 API 테스트")

    # 가능한 쿠폰 발급 엔드포인트들
    redeem_tests = [
        # (endpoint, payload, description)
        (
            'https://www.adidas.co.kr/api/account/loyalty/voucher-offers/redeem',
            {'offerId': 'GIFT_CARD_10000', 'points': 6000},
            '포인트로 1만원 상품권 교환'
        ),
        (
            'https://www.adidas.co.kr/api/account/loyalty/redeem',
            {'voucherType': 'GIFT_CARD_10000', 'points': 6000},
            '쿠폰 타입으로 교환'
        ),
        (
            'https://www.adidas.co.kr/api/loyalty/vouchers/claim',
            {'offerId': '10000_gift_card'},
            '쿠폰 클레임'
        ),
        (
            'https://www.adidas.co.kr/api/account/loyalty/purchase',
            {'productId': 'voucher_10000', 'quantity': 1},
            '쿠폰 구매'
        ),
    ]

    for endpoint, payload, desc in redeem_tests:
        print(f"\n  [{desc}]")
        print(f"  POST {endpoint}")
        print(f"  payload: {payload}")
        try:
            resp = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                cookies=cookies,
                timeout=10
            )
            print(f"  상태: {resp.status_code}")
            print(f"  응답: {resp.text[:300]}")
        except Exception as e:
            print(f"  오류: {e}")

    # 5. GraphQL API 테스트 (일부 사이트는 GraphQL 사용)
    print("\n[5] GraphQL API 테스트")
    graphql_endpoints = [
        'https://www.adidas.co.kr/api/graphql',
        'https://www.adidas.co.kr/graphql',
    ]

    graphql_query = {
        'query': '''
            query GetVoucherOffers {
                voucherOffers {
                    id
                    name
                    points
                }
            }
        ''',
        'variables': {}
    }

    for endpoint in graphql_endpoints:
        try:
            resp = requests.post(
                endpoint,
                json=graphql_query,
                headers=headers,
                cookies=cookies,
                timeout=10
            )
            print(f"  {endpoint}: {resp.status_code}")
            if resp.status_code == 200:
                print(f"    응답: {resp.text[:200]}")
        except Exception as e:
            print(f"    오류: {e}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python test_coupon_api.py <access_token>")
        print("")
        print("토큰 획득 방법:")
        print("1. 브라우저에서 아디다스 로그인")
        print("2. 개발자 도구(F12) > Application > Cookies")
        print("3. 'account.grant.accessToken' 값 복사")
        sys.exit(1)

    access_token = sys.argv[1]
    test_coupon_api(access_token)
