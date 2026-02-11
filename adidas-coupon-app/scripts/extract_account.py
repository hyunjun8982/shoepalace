"""
Adidas 모바일 앱 로그인 및 정보 추출
- Appium으로 네이티브 앱에서 직접 로그인
- 토큰 추출 후 API로 계정 정보 조회

사용법:
    단일 계정: python extract_account.py <email> <password>
    배치 모드: python extract_account.py --batch accounts.json

배치 모드 JSON 형식:
    [{"email": "test@test.com", "password": "1234", "id": 1}, ...]
"""
import sys
import os
import time
import argparse
import requests
import json
from typing import Optional, Dict, Any, List

# ANDROID_HOME 환경변수 설정
if os.environ.get('ANDROID_HOME'):
    os.environ['ANDROID_HOME'] = os.environ['ANDROID_HOME'].strip()
if os.environ.get('ANDROID_SDK_ROOT'):
    os.environ['ANDROID_SDK_ROOT'] = os.environ['ANDROID_SDK_ROOT'].strip()

if not os.environ.get('ANDROID_HOME') and not os.environ.get('ANDROID_SDK_ROOT'):
    if os.path.exists('C:\\platform-tools\\adb.exe'):
        os.environ['ANDROID_HOME'] = 'C:\\platform-tools'
        os.environ['ANDROID_SDK_ROOT'] = 'C:\\platform-tools'
        os.environ['PATH'] = 'C:\\platform-tools;' + os.environ.get('PATH', '')

try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options
    from appium.webdriver.common.appiumby import AppiumBy
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.by import By
    APPIUM_AVAILABLE = True

    # 공통 로그인 모듈 임포트
    from adidas_login import (
        login_with_driver,
        logout_with_driver,
        clear_webview_cookies,
        get_token_from_webview,
        wait_for_element,
        InstanceManager,
    )
except ImportError as e:
    APPIUM_AVAILABLE = False
    print(f"모듈 임포트 오류: {e}")
    print("Appium 라이브러리가 설치되지 않았습니다.")
    print("설치: pip install Appium-Python-Client")


def get_connected_device():
    """연결된 Android 디바이스 UDID 가져오기"""
    import subprocess
    import sys
    try:
        # Windows에서 콘솔 창 숨기기
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(
            ['adb', 'devices'],
            capture_output=True, text=True, timeout=10,
            creationflags=creationflags
        )
        lines = result.stdout.strip().split('\n')[1:]
        for line in lines:
            if '\tdevice' in line:
                return line.split('\t')[0]
    except Exception as e:
        print(f"ADB 오류: {e}")
    return None


def test_api_with_token(access_token: str) -> Dict[str, Any]:
    """Access Token으로 API 호출 테스트"""
    print("\n" + "=" * 60)
    print("Adidas API 테스트")
    print("=" * 60)

    headers = {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }
    cookies = {'account.grant.accessToken': access_token}
    results = {}

    # 1. 프로필
    print("\n[1/4] 프로필 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/profile',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            profile = resp.json().get('profile', {})
            results['profile'] = profile
            print(f"  이름: {profile.get('firstName', 'N/A')}")
            print(f"  이메일: {profile.get('email', 'N/A')}")
            print(f"  생일: {profile.get('dateOfBirth', 'N/A')}")
            print(f"  전화번호: {profile.get('mobileNumber', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 2. 바코드
    print("\n[2/4] 바코드 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/memberid',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['member'] = data
            print(f"  바코드: {data.get('memberId', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 3. 포인트
    print("\n[3/4] 포인트 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/wallet',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['wallet'] = data
            print(f"  포인트: {data.get('availablePoints', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 4. 쿠폰
    print("\n[4/4] 쿠폰 조회...")
    results['vouchers'] = []  # 기본값: 빈 배열
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                results['vouchers'] = data
                print(f"  쿠폰 수: {len(data)}개")
                for v in data:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    expire = v.get('available', {}).get('to', 'N/A')
                    if expire != 'N/A':
                        expire = expire[:10]
                    print(f"    - {name}: {code} (만료: {expire})")
            else:
                print(f"  쿠폰 수: 0개")
        else:
            print(f"  실패: HTTP {resp.status_code} (쿠폰 0개로 처리)")
    except Exception as e:
        print(f"  오류: {e} (쿠폰 0개로 처리)")

    return results


def check_and_handle_error_screen(driver) -> bool:
    """
    아디다스 앱의 에러 화면 감지 및 처리
    - generic_error_icon, generic_error_title_text 등으로 에러 화면 감지
    - "다시 시도하세요" 버튼 클릭하여 복구

    Returns: True if error was detected and handled, False otherwise
    """
    try:
        page_source = driver.page_source

        # 에러 화면 감지 (resource-id 또는 텍스트로)
        error_indicators = [
            'generic_error_icon',
            'generic_error_title_text',
            'generic_error_description_text',
            'generic_error_button',
        ]

        is_error_screen = any(indicator in page_source for indicator in error_indicators)

        if not is_error_screen:
            # 텍스트로도 확인
            if '오류가 발생했습니다' in page_source and '다시 시도' in page_source:
                is_error_screen = True

        if is_error_screen:
            print("\n[ERROR] BOT_BLOCKED:앱에서 오류 화면 감지됨 (계정 차단 의심)")
            print("  - 오류가 발생했습니다")
            print("  - 죄송합니다. 요청 처리 과정에서 문제가 발생했습니다.")

            # "다시 시도하세요" 버튼 클릭하여 로그인 웹뷰로 복구
            retry_clicked = False

            # 1순위: resource-id로 찾기
            try:
                retry_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='generic_error_button']")
                retry_btn.click()
                print("  '다시 시도하세요' 버튼 클릭 (resource-id)")
                retry_clicked = True
            except:
                pass

            # 2순위: 텍스트로 찾기
            if not retry_clicked:
                try:
                    retry_btn = driver.find_element(AppiumBy.XPATH, "//*[@text='다시 시도하세요']")
                    retry_btn.click()
                    print("  '다시 시도하세요' 버튼 클릭 (text)")
                    retry_clicked = True
                except:
                    pass

            # 3순위: contains로 찾기
            if not retry_clicked:
                try:
                    retry_btn = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '다시 시도')]")
                    retry_btn.click()
                    print("  '다시 시도' 버튼 클릭 (contains)")
                    retry_clicked = True
                except:
                    pass

            if retry_clicked:
                time.sleep(2)  # 웹뷰 로딩 대기
                print("  로그인 웹뷰로 복구됨")

            return True

        return False

    except Exception as e:
        print(f"  에러 화면 체크 중 예외: {e}")
        return False


def login_native_fallback(driver, email: str, password: str) -> tuple:
    """
    웹뷰 전환 실패 시 네이티브 방식으로 로그인 (토큰 없이)
    """
    print("\n[폴백] 네이티브 방식으로 로그인 시도")

    try:
        # 이메일 입력
        email_entered = False
        for xpath in [
            "//android.widget.EditText[@resource-id='login.email.input']",
            "//android.webkit.WebView//android.widget.EditText[@resource-id='login.email.input']",
            "(//android.webkit.WebView//android.widget.EditText)[1]"
        ]:
            try:
                email_field = driver.find_element(AppiumBy.XPATH, xpath)
                email_field.clear()
                email_field.send_keys(email)
                print(f"  이메일 입력 완료")
                email_entered = True
                break
            except:
                pass

        if not email_entered:
            return (False, None)

        time.sleep(0.5)

        # 비밀번호 입력
        password_entered = False
        for xpath in [
            "//android.widget.EditText[@resource-id='login.password.input']",
            "//android.webkit.WebView//android.widget.EditText[@resource-id='login.password.input']",
            "(//android.webkit.WebView//android.widget.EditText)[2]"
        ]:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH, xpath)
                pwd_field.clear()
                pwd_field.send_keys(password)
                print(f"  비밀번호 입력 완료")
                password_entered = True
                break
            except:
                pass

        if not password_entered:
            return (False, None)

        time.sleep(0.5)

        # 로그인 버튼 클릭
        submit_clicked = False
        for xpath in [
            "//android.widget.Button[@resource-id='login-submit-button']",
            "//android.widget.Button[@text='로그인하기']",
            "//android.widget.Button[@text='LOG IN']"
        ]:
            try:
                submit_btn = driver.find_element(AppiumBy.XPATH, xpath)
                submit_btn.click()
                print(f"  로그인 버튼 클릭")
                submit_clicked = True
                break
            except:
                pass

        if not submit_clicked:
            return (False, None)

        # 결과 대기
        time.sleep(5)
        page_source = driver.page_source

        if any(err in page_source for err in ['잘못된', 'Invalid', '실패']):
            return (False, None)

        # 로그인 성공 (토큰 없음)
        return (True, None)

    except Exception as e:
        print(f"  폴백 로그인 오류: {e}")
        return (False, None)


def mobile_login_and_extract(email: str, password: str, device_udid: str = None) -> Optional[str]:
    """
    모바일 앱에서 로그인 후 토큰 추출
    """
    if not APPIUM_AVAILABLE:
        print("Appium이 설치되지 않았습니다.")
        return None

    if not device_udid:
        device_udid = get_connected_device()
    if not device_udid:
        print("연결된 디바이스가 없습니다.")
        return None

    print(f"디바이스: {device_udid}")

    driver = None
    try:
        # Appium 옵션 설정
        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.udid = device_udid
        options.device_name = device_udid
        options.app_package = 'com.adidas.app'
        options.no_reset = True
        options.new_command_timeout = 300

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)

        # ADB 타임아웃 증가 (기본 20초 → 60초)
        options.set_capability('appium:adbExecTimeout', 60000)

        # 웹뷰 디버깅을 위한 크롬드라이버 자동 다운로드
        options.set_capability('appium:chromedriverAutodownload', True)

        # UiAutomator2 서버 재설치 스킵 (apksigner 불필요)
        options.set_capability('appium:skipServerInstallation', True)

        print("\n[1/6] Appium 연결 중...")
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("  Appium 연결 성공")

        # 앱 실행
        print("\n[2/6] 아디다스 앱 실행...")
        driver.activate_app('com.adidas.app')
        time.sleep(3)

        # 로그인 (토큰도 함께 추출 시도)
        login_success, access_token = login_with_driver(driver, email, password)

        if not login_success:
            print("\n로그인 실패!")
            # 로그인 실패해도 로그아웃 시도
            try:
                logout_with_driver(driver)
            except:
                pass
            return None

        # 로그인 중 토큰을 못 가져왔으면 추가 시도
        if not access_token:
            print("\n[추가 토큰 추출] 프로필 화면에서 재시도...")
            access_token = get_token_from_webview(driver)

        if access_token:
            print(f"\n토큰 획득 성공!")
        else:
            print("\n토큰 획득 실패!")
            # 로그아웃 후 None 반환
            logout_with_driver(driver)
            return None

        # 로그아웃 시도
        logout_success = logout_with_driver(driver)

        # 실패 시 웹뷰 쿠키 삭제 (다음 계정에 영향 방지)
        if not logout_success:
            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
            clear_webview_cookies(driver)

        return access_token

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()

        # 오류 발생 시 로그아웃 시도
        if driver:
            try:
                logout_with_driver(driver)
            except:
                pass
        return None

    finally:
        if driver:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            try:
                driver.quit()
                print("\nAppium 세션 종료")
            except:
                pass


def process_single_account_with_driver(driver, email: str, password: str, is_batch_continuation: bool = False) -> Dict[str, Any]:
    """
    기존 Appium 드라이버를 사용하여 단일 계정 처리 (배치 모드용)
    드라이버 생성/종료를 하지 않고 로그인/추출/로그아웃만 수행

    Args:
        driver: Appium 드라이버
        email: 이메일
        password: 비밀번호
        is_batch_continuation: 배치에서 첫 번째 계정 이후인지 여부 (True면 대기 최소화)

    Returns: { success, token, api_result, error }
    """
    result = {
        'email': email,
        'success': False,
        'token': None,
        'api_result': None,
        'error': None
    }

    try:
        # 앱 실행 확인 및 활성화
        print(f"\n{'='*60}")
        print(f"계정 처리: {email}")
        print('='*60)

        current_pkg = driver.current_package
        if current_pkg != "com.adidas.app":
            driver.activate_app("com.adidas.app")
            time.sleep(2)

        # 로그인 (토큰도 함께 추출 시도)
        # 배치 연속 모드에서는 대기 시간 최소화
        login_success, access_token = login_with_driver(driver, email, password, is_batch_continuation)

        if not login_success:
            # 비밀번호 오류 / 봇 차단 구분
            if access_token == "PASSWORD_WRONG":
                result['error'] = 'PASSWORD_WRONG'
                print(f"\n비밀번호 오류: {email}")
            elif access_token == "BOT_BLOCKED":
                result['error'] = 'BOT_BLOCKED'
                print(f"\n봇 차단: {email}")
            else:
                result['error'] = 'LOGIN_FAILED'
                print(f"\n로그인 실패: {email}")
            return result

        # 로그인 중 토큰을 못 가져왔으면 추가 시도
        if not access_token:
            print("\n[추가 토큰 추출] 프로필 화면에서 재시도...")
            access_token = get_token_from_webview(driver)

        if access_token:
            result['token'] = access_token
            result['success'] = True
            print(f"\n토큰 획득 성공: {email}")

            # API 테스트
            api_result = test_api_with_token(access_token)
            result['api_result'] = api_result
        else:
            result['error'] = 'TOKEN_FAILED'
            print(f"\n토큰 획득 실패: {email}")

        # 로그아웃 시도
        logout_success = logout_with_driver(driver)

        # 실패 시 웹뷰 쿠키 삭제 (다음 계정에 영향 방지)
        if not logout_success:
            print("\n[경고] 로그아웃 실패 - 웹뷰 쿠키 삭제 진행...")
            clear_webview_cookies(driver)

        # 계정 간 짧은 대기 (안정성)
        time.sleep(1)

        return result

    except Exception as e:
        print(f"\n계정 처리 오류 ({email}): {e}")
        import traceback
        traceback.print_exc()
        result['error'] = str(e)

        # 오류 발생 시 쿠키 삭제 시도
        try:
            clear_webview_cookies(driver)
        except:
            pass

        return result


def mobile_batch_extract(accounts: List[Dict], device_udid: str = None) -> List[Dict]:
    """
    배치 모드: 여러 계정을 멀티 인스턴스로 처리
    BOT_BLOCKED 시 자동으로 다른 인스턴스로 전환

    Args:
        accounts: [{"email": "...", "password": "...", "id": ...}, ...]
        device_udid: 디바이스 UDID (생략시 InstanceManager 사용)

    Returns:
        [{"id": ..., "email": ..., "success": ..., "api_result": ..., "error": ...}, ...]
    """
    if not APPIUM_AVAILABLE:
        print("[ERROR] Appium이 설치되지 않았습니다.")
        return [{'id': acc.get('id'), 'email': acc.get('email'), 'success': False, 'error': 'APPIUM_NOT_AVAILABLE'} for acc in accounts]

    print(f"\n{'='*60}")
    print(f"배치 모드 시작 - {len(accounts)}개 계정 (단일 인스턴스)")
    print('='*60)

    results = []
    driver = None
    instance_manager = None

    try:
        # 인스턴스 매니저로 Appium 연결
        instance_manager = InstanceManager()
        driver, device_udid = instance_manager.create_driver()
        print(f"[Appium] 연결 성공 - {device_udid}")

        # 각 계정 순차 처리
        i = 0
        while i < len(accounts):
            account = accounts[i]
            email = account.get('email')
            password = account.get('password')
            acc_id = account.get('id')

            print(f"\n[{i+1}/{len(accounts)}] 처리 중: {email}")

            # 단일 계정 처리 (첫 번째 계정 이후에는 배치 연속 모드로 대기 시간 최소화)
            is_continuation = (i > 0)
            account_result = process_single_account_with_driver(driver, email, password, is_continuation)
            account_result['id'] = acc_id

            # BOT_BLOCKED → 배치 즉시 중단
            if account_result.get('error') == 'BOT_BLOCKED':
                print(f"\n[BATCH_STOPPED] 봇 차단 감지 - 배치 즉시 중단: {email}")
                print(f"\n[BATCH_RESULT] {json.dumps(account_result, ensure_ascii=False)}")
                results.append(account_result)

                # 나머지 계정을 모두 스킵 처리
                for j in range(i + 1, len(accounts)):
                    skip_acc = accounts[j]
                    skip_result = {
                        'id': skip_acc.get('id'),
                        'email': skip_acc.get('email'),
                        'success': False,
                        'error': 'BATCH_STOPPED',
                    }
                    print(f"\n[BATCH_RESULT] {json.dumps(skip_result, ensure_ascii=False)}")
                    results.append(skip_result)
                break  # 배치 즉시 중단

            # 결과 출력 (server.js에서 파싱용)
            print(f"\n[BATCH_RESULT] {json.dumps(account_result, ensure_ascii=False)}")

            results.append(account_result)

            # 다음 계정 전 대기 (로그아웃 후 화면 안정화) - 0.5초로 단축
            if i < len(accounts) - 1:
                print(f"\n다음 계정 준비 중... (0.5초 대기)")
                time.sleep(0.5)

            i += 1  # 다음 계정으로

        print(f"\n{'='*60}")
        print(f"배치 처리 완료 - 성공: {sum(1 for r in results if r['success'])}/{len(results)}")
        print('='*60)

        return results

    except Exception as e:
        print(f"\n[ERROR] 배치 처리 오류: {e}")
        import traceback
        traceback.print_exc()

        # 처리되지 않은 계정들은 에러로 마킹
        processed_ids = {r['id'] for r in results}
        for acc in accounts:
            if acc.get('id') not in processed_ids:
                results.append({
                    'id': acc.get('id'),
                    'email': acc.get('email'),
                    'success': False,
                    'error': f'BATCH_ERROR: {str(e)}'
                })

        return results

    finally:
        if instance_manager:
            instance_manager.cleanup()
            print("\n[Appium] 세션 종료")
        elif driver:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            driver.quit()
            print("\n[Appium] 세션 종료")


def main():
    print("[스크립트 시작] extract_account.py", flush=True)

    parser = argparse.ArgumentParser(description='Adidas 모바일 로그인 및 정보 추출')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--device', '-d', help='디바이스 UDID (생략시 자동 감지)')
    parser.add_argument('--batch', '-b', help='배치 모드: JSON 파일 경로 또는 JSON 문자열')

    args = parser.parse_args()
    print(f"[인자 파싱 완료] batch={args.batch}", flush=True)

    print("=" * 60)
    print("Adidas 모바일 로그인 테스트")
    print("=" * 60)

    # 배치 모드
    if args.batch:
        print(f"[배치 시작] JSON 경로: {args.batch}", flush=True)
        print("\n[배치 모드] 활성화")

        # JSON 파일 또는 JSON 문자열 파싱
        accounts = []
        try:
            # 파일인지 확인
            if os.path.exists(args.batch):
                print(f"  JSON 파일: {args.batch}")
                with open(args.batch, 'r', encoding='utf-8') as f:
                    accounts = json.load(f)
            else:
                # JSON 문자열로 해석
                print("  JSON 문자열 파싱")
                accounts = json.loads(args.batch)
        except Exception as e:
            print(f"\n[ERROR] JSON 파싱 실패: {e}")
            return

        if not accounts:
            print("\n[ERROR] 처리할 계정이 없습니다.")
            return

        print(f"  계정 수: {len(accounts)}개")

        # 배치 처리 실행
        results = mobile_batch_extract(accounts, args.device)

        # 최종 결과 출력
        print(f"\n[BATCH_COMPLETE] {json.dumps({'total': len(results), 'success': sum(1 for r in results if r['success']), 'results': results}, ensure_ascii=False)}")
        return

    # 단일 계정 모드
    if not args.email or not args.password:
        print("\n사용법:")
        print("  단일: python extract_account.py <email> <password>")
        print("  배치: python extract_account.py --batch accounts.json")
        return

    print(f"\n이메일: {args.email}")

    access_token = mobile_login_and_extract(args.email, args.password, args.device)

    if access_token:
        print("\n" + "=" * 60)
        print("토큰 획득 성공!")
        print("=" * 60)
        print(f"\nAccess Token: {access_token[:50]}...")

        # 토큰 저장
        with open('adidas_mobile_token.txt', 'w') as f:
            f.write(f"access_token={access_token}\n")
        print("토큰 저장됨: adidas_mobile_token.txt")

        # API 테스트
        test_api_with_token(access_token)
    else:
        print("\n" + "=" * 60)
        print("로그인 실패 또는 토큰 추출 실패!")
        print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FATAL ERROR] {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
