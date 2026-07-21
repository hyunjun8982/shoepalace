"""
아디다스 10만원권 API 응답 테스트
- get_available_voucher_offers() API 응답 분석
- 10만원권 데이터 확인
"""
import sys
import json
import requests

def get_api_headers():
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'origin': 'https://www.adidas.co.kr',
        'referer': 'https://www.adidas.co.kr/my-account',
    }


def test_available_voucher_offers(access_token: str):
    """상품권 목록 조회 API 테스트"""
    print("\n" + "="*70)
    print("🔍 아디다스 상품권 목록 조회 API 테스트")
    print("="*70)

    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}

        url = 'https://www.adidas.co.kr/api/account/loyalty/offer/voucher/personal?locale=ko_KR'
        print(f"\n📡 API 요청: GET {url}")
        print(f"🔐 토큰: {access_token[:20]}...")

        resp = requests.get(url, headers=headers, cookies=cookies, timeout=10)

        print(f"\n📊 응답 상태: {resp.status_code}")
        print(f"📏 응답 크기: {len(resp.text)} bytes")

        # 응답 JSON 파싱
        try:
            data = resp.json()
            print(f"\n✅ JSON 파싱 성공")
            print(f"📋 응답 타입: {type(data).__name__}")

            # 전체 응답 저장
            with open('test_coupon_response.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"💾 응답 저장: test_coupon_response.json")

            # 응답 구조 분석
            if isinstance(data, list):
                print(f"\n📦 총 상품권 개수: {len(data)}")

                if len(data) == 0:
                    print("⚠️  상품권 목록이 비어있습니다!")
                    return

                # 각 상품권 분석
                print("\n" + "-"*70)
                print("📌 상품권 목록:")
                print("-"*70)

                for idx, offer in enumerate(data, 1):
                    print(f"\n[{idx}] 상품권")
                    print(f"  ID: {offer.get('id')}")
                    print(f"  이름: {offer.get('name')}")
                    print(f"  설명: {offer.get('description')}")
                    print(f"  포인트: {offer.get('priceInPoints')}P")
                    print(f"  이용 가능: {offer.get('eligible')}")
                    print(f"  이용 불가 사유: {offer.get('eligibilityReasons', [])}")

                    # Rewards 분석
                    rewards = offer.get('rewards', [])
                    print(f"  보상 개수: {len(rewards)}")
                    for r_idx, reward in enumerate(rewards, 1):
                        print(f"    [{r_idx}] ID: {reward.get('id')}, 가치: {reward.get('value')}")

                # 10만원권 찾기
                print("\n" + "-"*70)
                print("🔎 10만원권 검색:")
                print("-"*70)

                found_100k = False
                for offer in data:
                    rewards = offer.get('rewards', [])
                    for reward in rewards:
                        if reward.get('value') == '100000':
                            found_100k = True
                            print(f"✅ 찾음!")
                            print(f"  Offer ID: {offer.get('id')}")
                            print(f"  Reward ID: {reward.get('id')}")
                            print(f"  가격: {offer.get('priceInPoints')}P")
                            print(f"  이용 가능: {offer.get('eligible')}")

                            if not offer.get('eligible'):
                                reasons = offer.get('eligibilityReasons', [])
                                print(f"  이용 불가 사유: {reasons}")

                if not found_100k:
                    print("❌ 10만원권을 찾을 수 없습니다!")
                    print("\n가능한 원인:")
                    print("  1. 쿠폰 쿨다운 기간 (1달 미경과)")
                    print("  2. 포인트 부족 (6000P 필요)")
                    print("  3. 계정 제한")

            elif isinstance(data, dict):
                print(f"\n⚠️  응답이 딕셔너리 형태입니다 (리스트 예상)")
                print(f"내용: {json.dumps(data, indent=2, ensure_ascii=False)}")
            else:
                print(f"\n⚠️  예상하지 못한 응답 형식: {type(data)}")

        except json.JSONDecodeError as e:
            print(f"\n❌ JSON 파싱 실패: {e}")
            print(f"응답 텍스트: {resp.text[:500]}")

    except requests.exceptions.Timeout:
        print("❌ 요청 타임아웃 (10초 초과)")
    except requests.exceptions.RequestException as e:
        print(f"❌ 요청 실패: {e}")
    except Exception as e:
        print(f"❌ 오류 발생: {e}")


def test_account_points(access_token: str):
    """계정 포인트 조회 테스트"""
    print("\n" + "="*70)
    print("💰 계정 포인트 조회 테스트")
    print("="*70)

    try:
        headers = get_api_headers()
        cookies = {'account.grant.accessToken': access_token}

        url = 'https://www.adidas.co.kr/api/account/loyalty/wallet'
        resp = requests.get(url, headers=headers, cookies=cookies, timeout=10)

        print(f"📊 응답 상태: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            available_points = data.get('availablePoints', 0)
            total_points = data.get('totalPoints', 0)

            print(f"✅ 보유 포인트: {available_points}P")
            print(f"   누적 포인트: {total_points}P")
            print(f"\n📌 10만원권 발급 필요 포인트: 6000P")
            print(f"   {'✅ 발급 가능' if available_points >= 6000 else '❌ 포인트 부족'}")
        else:
            print(f"❌ 응답 실패: {resp.text}")

    except Exception as e:
        print(f"❌ 오류: {e}")


def main():
    if len(sys.argv) < 2:
        print("사용법: python test_coupon_api_100k.py <access_token>")
        print("\n예시:")
        print("  python test_coupon_api_100k.py 'your-access-token-here'")
        print("\n토큰 얻기:")
        print("  1. issue_coupon_pw.py를 실행해서 로그인")
        print("  2. 브라우저 개발자 도구 (F12) → Application → Cookies")
        print("  3. account.grant.accessToken 값 복사")
        return

    access_token = sys.argv[1]

    if len(access_token) < 50:
        print("❌ 토큰이 너무 짧습니다")
        return

    print(f"🔐 토큰 확인: {access_token[:20]}... (길이: {len(access_token)})")

    # 테스트 실행
    test_account_points(access_token)
    test_available_voucher_offers(access_token)

    print("\n" + "="*70)
    print("✅ 테스트 완료")
    print("="*70)


if __name__ == "__main__":
    main()
