"""
슈팔라스 로컬 에이전트 API 테스트
- 로컬 에이전트(8002)에 계정 추출 요청
- Appium을 통해 모바일 자동화 수행

사용법:
    python test_agent_api.py <email> <password>
"""
import sys
import requests
import json
import time

AGENT_URL = "http://localhost:8002"


def check_agent_status():
    """에이전트 상태 확인"""
    try:
        resp = requests.get(f"{AGENT_URL}/health", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            print(f"[에이전트 상태]")
            print(f"  상태: {data.get('status')}")
            print(f"  처리된 요청: {data.get('stats', {}).get('requestCount', 0)}개")
            print(f"  처리 중: {data.get('stats', {}).get('isProcessing', False)}")
            return True
        else:
            print(f"[오류] 에이전트 응답 코드: {resp.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("[오류] 에이전트에 연결할 수 없습니다.")
        print("  슈팔라스 로컬 에이전트가 실행 중인지 확인하세요.")
        return False
    except Exception as e:
        print(f"[오류] {e}")
        return False


def extract_account_info(email: str, password: str):
    """계정 정보 추출 요청"""
    print(f"\n{'='*50}")
    print(f"[계정 추출 요청] {email}")
    print(f"{'='*50}")

    try:
        start_time = time.time()

        resp = requests.post(
            f"{AGENT_URL}/extract",
            json={"email": email, "password": password},
            timeout=120  # 최대 2분 대기
        )

        elapsed = time.time() - start_time

        if resp.status_code == 200:
            data = resp.json()

            if data.get('success'):
                print(f"\n[성공] 계정 정보 추출 완료 ({elapsed:.1f}초)")
                print(f"\n{'='*50}")
                print(f"  이름: {data.get('name')}")
                print(f"  이메일: {data.get('email')}")
                print(f"  생년월일: {data.get('birthday')}")
                print(f"  전화번호: {data.get('phone')}")
                print(f"  바코드: {data.get('barcode')}")
                print(f"  포인트: {data.get('points')}")
                print(f"\n  쿠폰 ({len(data.get('coupons', []))}개):")
                for coupon in data.get('coupons', []):
                    print(f"    - {coupon.get('name')} (만료: {coupon.get('expireDate', 'N/A')})")
                print(f"{'='*50}")
            else:
                print(f"\n[실패] {data.get('error')}")

            return data

        elif resp.status_code == 429:
            print("[오류] 다른 요청이 처리 중입니다. 잠시 후 다시 시도하세요.")
            return None
        else:
            print(f"[오류] HTTP {resp.status_code}: {resp.text}")
            return None

    except requests.exceptions.Timeout:
        print("[오류] 요청 시간 초과 (2분)")
        return None
    except requests.exceptions.ConnectionError:
        print("[오류] 에이전트 연결 실패")
        return None
    except Exception as e:
        print(f"[오류] {e}")
        return None


def main():
    if len(sys.argv) < 3:
        print("사용법: python test_agent_api.py <email> <password>")
        print("\n예시:")
        print("  python test_agent_api.py test@example.com mypassword123")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    print("\n" + "="*50)
    print("  슈팔라스 로컬 에이전트 API 테스트")
    print("="*50)

    # 1. 에이전트 상태 확인
    print("\n[1] 에이전트 상태 확인...")
    if not check_agent_status():
        sys.exit(1)

    # 2. 계정 정보 추출
    print("\n[2] 계정 정보 추출 요청...")
    print("    (Appium이 모바일 앱을 자동화합니다. 잠시 기다려주세요...)")

    result = extract_account_info(email, password)

    if result and result.get('success'):
        print("\n테스트 완료!")
    else:
        print("\n테스트 실패. 로그를 확인하세요.")


if __name__ == "__main__":
    main()
