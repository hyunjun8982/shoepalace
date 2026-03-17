"""
아디다스 API 차단 상태 테스트
- 모바일 앱에서 로그인 후 토큰 획득
- 획득한 토큰으로 각 API 호출 테스트
"""
import sys
import time
import requests
import argparse

# Appium 관련 import
try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options
    APPIUM_AVAILABLE = True
except ImportError:
    APPIUM_AVAILABLE = False
    print("[경고] Appium 미설치 - 토큰 직접 입력 필요")

# 공통 로그인 모듈
try:
    from adidas_login import login_with_driver, logout_with_driver
    LOGIN_MODULE_AVAILABLE = True
except ImportError:
    LOGIN_MODULE_AVAILABLE = False
    print("[경고] adidas_login 모듈 없음")


def get_api_headers():
    """API 헤더"""
    return {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }


def test_api(name: str, url: str, token: str, method: str = 'GET', json_data: dict = None) -> dict:
    """단일 API 테스트"""
    headers = get_api_headers()
    cookies = {'account.grant.accessToken': token}

    try:
        if method == 'GET':
            resp = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        else:
            resp = requests.post(url, headers=headers, cookies=cookies, json=json_data, timeout=10)

        status = resp.status_code

        if status == 200:
            return {'name': name, 'status': status, 'success': True, 'data': resp.json()}
        elif status == 403:
            return {'name': name, 'status': status, 'success': False, 'error': 'FORBIDDEN (차단됨)'}
        elif status == 401:
            return {'name': name, 'status': status, 'success': False, 'error': 'UNAUTHORIZED (토큰 만료/무효)'}
        else:
            return {'name': name, 'status': status, 'success': False, 'error': f'HTTP {status}'}
    except Exception as e:
        return {'name': name, 'status': 0, 'success': False, 'error': str(e)}


def test_all_apis(token: str):
    """모든 API 테스트"""
    print("\n" + "=" * 70)
    print("아디다스 API 상태 테스트")
    print("=" * 70)
    print(f"토큰: {token[:50]}...")
    print()

    apis = [
        ('프로필 조회', 'https://www.adidas.co.kr/api/account/profile', 'GET'),
        ('바코드/멤버ID', 'https://www.adidas.co.kr/api/account/loyalty/memberid', 'GET'),
        ('포인트 조회', 'https://www.adidas.co.kr/api/account/loyalty/wallet', 'GET'),
        ('쿠폰 목록', 'https://www.adidas.co.kr/api/account/loyalty/vouchers', 'GET'),
        ('상품권 오퍼', 'https://www.adidas.co.kr/api/account/loyalty/offers', 'GET'),
        ('거래 내역', 'https://www.adidas.co.kr/api/account/loyalty/transactions', 'GET'),
    ]

    results = []
    success_count = 0
    forbidden_count = 0

    for name, url, method in apis:
        print(f"[테스트] {name}...", end=' ')
        result = test_api(name, url, token, method)
        results.append(result)

        if result['success']:
            success_count += 1
            print(f"✓ 성공 (HTTP {result['status']})")
            # 간단한 데이터 출력
            data = result.get('data', {})
            if name == '프로필 조회' and 'profile' in data:
                profile = data['profile']
                print(f"         이메일: {profile.get('email', 'N/A')}")
                print(f"         이름: {profile.get('firstName', 'N/A')}")
            elif name == '포인트 조회':
                print(f"         포인트: {data.get('availablePoints', 'N/A')}")
            elif name == '쿠폰 목록':
                vouchers = data if isinstance(data, list) else []
                print(f"         쿠폰 수: {len(vouchers)}개")
        else:
            if result['status'] == 403:
                forbidden_count += 1
            print(f"✗ 실패 - {result['error']}")

    # 결과 요약
    print("\n" + "-" * 70)
    print("결과 요약")
    print("-" * 70)
    print(f"  총 API: {len(apis)}개")
    print(f"  성공: {success_count}개")
    print(f"  403 차단: {forbidden_count}개")
    print(f"  기타 실패: {len(apis) - success_count - forbidden_count}개")

    if forbidden_count == len(apis):
        print("\n[결론] 모든 API가 403 차단됨 - IP 또는 계정이 차단된 상태")
    elif forbidden_count > 0:
        print("\n[결론] 일부 API 차단됨 - 특정 API에 대한 제한 있음")
    elif success_count == len(apis):
        print("\n[결론] 모든 API 정상 - 차단 없음")
    else:
        print("\n[결론] 일부 API 오류 - 토큰 문제 또는 네트워크 문제")

    return results


def get_token_from_mobile(email: str, password: str) -> str:
    """모바일 앱에서 토큰 획득"""
    if not APPIUM_AVAILABLE or not LOGIN_MODULE_AVAILABLE:
        print("[오류] Appium 또는 로그인 모듈이 없습니다")
        return None

    print("\n" + "=" * 70)
    print("모바일 앱 로그인으로 토큰 획득")
    print("=" * 70)
    print(f"계정: {email}")

    driver = None
    try:
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
        options.set_capability('appium:skipServerInstallation', True)

        print("\n[Appium] 연결 중...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("[Appium] 연결 성공")

        driver.activate_app('com.adidas.app')
        time.sleep(2)

        print("\n[로그인] 시작...")
        login_success, access_token = login_with_driver(driver, email, password)

        if login_success and access_token:
            print(f"\n[성공] 토큰 획득!")
            # 로그아웃
            logout_with_driver(driver)
            return access_token
        else:
            print(f"\n[실패] 로그인 실패 또는 토큰 없음")
            if access_token in ['PASSWORD_WRONG', 'BOT_BLOCKED']:
                print(f"  오류 코드: {access_token}")
            return None

    except Exception as e:
        print(f"\n[오류] {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
            print("\n[Appium] 세션 종료")


def main():
    parser = argparse.ArgumentParser(description='아디다스 API 차단 상태 테스트')
    parser.add_argument('--token', '-t', help='직접 토큰 입력 (로그인 생략)')
    parser.add_argument('--email', '-e', help='로그인 이메일')
    parser.add_argument('--password', '-p', help='로그인 비밀번호')
    parser.add_argument('--token-file', '-f', help='토큰 파일 경로')

    args = parser.parse_args()

    token = None

    # 토큰 획득 방법 결정
    if args.token:
        token = args.token
        print(f"[입력] 직접 입력된 토큰 사용")
    elif args.token_file:
        try:
            with open(args.token_file, 'r') as f:
                content = f.read()
                if 'access_token=' in content:
                    token = content.split('access_token=')[1].split('\n')[0].strip()
                else:
                    token = content.strip()
            print(f"[입력] 파일에서 토큰 로드: {args.token_file}")
        except Exception as e:
            print(f"[오류] 토큰 파일 읽기 실패: {e}")
            return
    elif args.email and args.password:
        token = get_token_from_mobile(args.email, args.password)
        if not token:
            print("\n토큰 획득 실패. 종료합니다.")
            return
    else:
        print("사용법:")
        print("  1. 토큰 직접 입력:")
        print("     python test_adidas_api_status.py --token <토큰>")
        print()
        print("  2. 토큰 파일 사용:")
        print("     python test_adidas_api_status.py --token-file adidas_mobile_token.txt")
        print()
        print("  3. 모바일 로그인으로 토큰 획득:")
        print("     python test_adidas_api_status.py --email <이메일> --password <비밀번호>")
        return

    # API 테스트 실행
    test_all_apis(token)


if __name__ == "__main__":
    main()
