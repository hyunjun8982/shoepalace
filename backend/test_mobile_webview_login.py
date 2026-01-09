"""
Adidas 모바일 앱 웹뷰 로그인 테스트
- Appium으로 모바일 앱 실행
- 웹뷰 컨텍스트로 전환하여 로그인
- 쿠키에서 access_token 추출
- API로 계정 정보 조회

사용법:
    python test_mobile_webview_login.py <email> <password>
"""
import sys
import os
import time
import argparse
import requests
from typing import Optional, Dict, Any

# ANDROID_HOME 환경변수 설정 (platform-tools가 C:\platform-tools에 있는 경우)
# 기존 환경변수에서 공백 제거
if os.environ.get('ANDROID_HOME'):
    os.environ['ANDROID_HOME'] = os.environ['ANDROID_HOME'].strip()
if os.environ.get('ANDROID_SDK_ROOT'):
    os.environ['ANDROID_SDK_ROOT'] = os.environ['ANDROID_SDK_ROOT'].strip()

if not os.environ.get('ANDROID_HOME') and not os.environ.get('ANDROID_SDK_ROOT'):
    # platform-tools 경로로 ANDROID_HOME 설정
    if os.path.exists('C:\\platform-tools\\adb.exe'):
        os.environ['ANDROID_HOME'] = 'C:\\platform-tools'
        os.environ['ANDROID_SDK_ROOT'] = 'C:\\platform-tools'
        os.environ['PATH'] = 'C:\\platform-tools;' + os.environ.get('PATH', '')
        print("[환경설정] ANDROID_HOME = C:\\platform-tools")

try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options
    from appium.webdriver.common.appiumby import AppiumBy
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.by import By
    APPIUM_AVAILABLE = True
except ImportError:
    APPIUM_AVAILABLE = False
    print("Appium 라이브러리가 설치되지 않았습니다.")
    print("설치: pip install Appium-Python-Client")


def get_connected_device():
    """연결된 Android 디바이스 UDID 가져오기"""
    import subprocess
    try:
        result = subprocess.run(
            ['adb', 'devices'],
            capture_output=True, text=True, timeout=10
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
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers, cookies=cookies, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['vouchers'] = data
            if isinstance(data, list):
                print(f"  쿠폰 수: {len(data)}개")
                for v in data:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    expire = v.get('available', {}).get('to', 'N/A')
                    if expire != 'N/A':
                        expire = expire[:10]
                    print(f"    - {name}: {code} (만료: {expire})")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    return results


def mobile_webview_login(email: str, password: str, device_udid: str = None) -> Optional[str]:
    """
    모바일 앱 웹뷰에서 로그인 후 access_token 추출
    """
    if not APPIUM_AVAILABLE:
        print("Appium이 설치되지 않았습니다.")
        return None

    # 디바이스 확인
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

        # ANDROID_HOME 명시적 지정 (공백 제거)
        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)

        # 크롬드라이버 자동 다운로드 활성화 (웹뷰용)
        options.set_capability('appium:chromedriverAutodownload', True)
        options.set_capability('autoWebview', False)

        print("\n[1/6] Appium 연결 중...")
        # Appium 2.x는 /wd/hub 없이 사용
        driver = webdriver.Remote('http://localhost:4723', options=options)
        print("  Appium 연결 성공")

        # 앱 실행
        print("\n[2/6] 아디다스 앱 실행...")
        driver.activate_app('com.adidas.app')
        time.sleep(3)

        # 현재 컨텍스트 확인
        print("\n[3/6] 컨텍스트 확인...")
        contexts = driver.contexts
        print(f"  사용 가능한 컨텍스트: {contexts}")

        # 로그인 버튼 찾기 (네이티브)
        print("\n[4/6] 로그인 화면으로 이동...")

        # 프로필/계정 탭으로 이동 시도
        try:
            # 하단 탭바에서 프로필/계정 아이콘 찾기
            profile_selectors = [
                '//android.widget.ImageView[@content-desc="프로필" or @content-desc="Profile" or @content-desc="계정"]',
                '//android.view.View[@content-desc="프로필" or @content-desc="Profile"]',
                '//android.widget.TextView[@text="프로필" or @text="Profile"]',
                '//*[contains(@content-desc, "profile") or contains(@content-desc, "Profile")]',
            ]

            profile_clicked = False
            for selector in profile_selectors:
                try:
                    elem = driver.find_element(AppiumBy.XPATH, selector)
                    elem.click()
                    print(f"  프로필 탭 클릭: {selector}")
                    profile_clicked = True
                    time.sleep(2)
                    break
                except:
                    continue

            if not profile_clicked:
                print("  프로필 탭을 찾지 못함 - 현재 화면에서 진행")
        except Exception as e:
            print(f"  프로필 탭 이동 실패: {e}")

        # 로그인 버튼 찾기
        login_selectors = [
            '//android.widget.Button[@text="로그인" or @text="Login" or @text="LOG IN"]',
            '//android.widget.TextView[@text="로그인" or @text="Login"]',
            '//android.view.View[@content-desc="로그인" or @content-desc="Login"]',
            '//*[contains(@text, "로그인") or contains(@text, "Login")]',
        ]

        login_clicked = False
        for selector in login_selectors:
            try:
                elem = driver.find_element(AppiumBy.XPATH, selector)
                elem.click()
                print(f"  로그인 버튼 클릭: {selector}")
                login_clicked = True
                time.sleep(3)
                break
            except:
                continue

        if not login_clicked:
            # 이미 로그인 화면일 수 있음
            print("  로그인 버튼을 찾지 못함 - 웹뷰 확인 진행")

        # 웹뷰 컨텍스트 확인
        print("\n[5/6] 웹뷰 전환 시도...")
        time.sleep(2)
        contexts = driver.contexts
        print(f"  현재 컨텍스트: {contexts}")

        webview_context = None
        for ctx in contexts:
            if 'WEBVIEW' in ctx:
                webview_context = ctx
                break

        if not webview_context:
            print("  웹뷰 컨텍스트를 찾을 수 없습니다.")
            print("  현재 화면 스크린샷 저장 중...")
            driver.save_screenshot('mobile_no_webview.png')

            # 페이지 소스 저장
            with open('mobile_page_source.xml', 'w', encoding='utf-8') as f:
                f.write(driver.page_source)
            print("  페이지 소스 저장: mobile_page_source.xml")
            return None

        # 웹뷰로 전환
        print(f"  웹뷰 전환: {webview_context}")
        driver.switch_to.context(webview_context)

        # 웹뷰에서 로그인 수행
        print("\n[6/6] 웹뷰에서 로그인...")

        # 이메일 입력
        try:
            email_input = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
            )
            email_input.clear()
            email_input.send_keys(email)
            print(f"  이메일 입력 완료")
        except Exception as e:
            print(f"  이메일 필드 찾기 실패: {e}")
            # 이미 로그인되어 있을 수 있음 - 쿠키 확인
            cookies = driver.get_cookies()
            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    print("  이미 로그인됨 - 토큰 발견!")
                    return cookie['value']
            return None

        # 비밀번호 입력
        try:
            password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
            password_input.clear()
            password_input.send_keys(password)
            print(f"  비밀번호 입력 완료")
        except Exception as e:
            print(f"  비밀번호 필드 찾기 실패: {e}")
            return None

        # 로그인 버튼 클릭
        try:
            login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
            login_btn.click()
            print(f"  로그인 버튼 클릭")
        except Exception as e:
            print(f"  로그인 버튼 클릭 실패: {e}")
            return None

        # 토큰 대기
        print("\n  토큰 대기 중...")
        access_token = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            try:
                cookies = driver.get_cookies()
                for cookie in cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        print(f"  토큰 획득 성공!")
                        break
            except:
                pass
            if access_token:
                break
            time.sleep(0.5)

        if not access_token:
            print(f"  토큰 획득 실패 (타임아웃)")
            return None

        # 로그아웃 진행
        print("\n[7/7] 로그아웃 진행...")
        try:
            # 네이티브로 복귀
            driver.switch_to.context('NATIVE_APP')
            time.sleep(1)

            # 하단으로 스크롤 (여러 번)
            screen_size = driver.get_window_size()
            start_x = screen_size['width'] // 2
            start_y = int(screen_size['height'] * 0.8)
            end_y = int(screen_size['height'] * 0.2)

            for i in range(5):  # 최대 5번 스크롤
                driver.swipe(start_x, start_y, start_x, end_y, 500)
                time.sleep(0.5)

                # 로그아웃 버튼 찾기
                logout_selectors = [
                    '//*[@text="로그아웃"]',
                    '//*[@text="Logout"]',
                    '//*[@text="LOG OUT"]',
                    '//*[contains(@text, "로그아웃")]',
                ]
                for selector in logout_selectors:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, selector)
                        if logout_btn.is_displayed():
                            logout_btn.click()
                            print(f"  로그아웃 버튼 클릭")
                            time.sleep(2)
                            print(f"  로그아웃 완료!")
                            break
                    except:
                        continue
                else:
                    continue
                break
            else:
                print(f"  로그아웃 버튼을 찾지 못함 (스크롤 5회 후)")
        except Exception as e:
            print(f"  로그아웃 실패: {e}")

        return access_token

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        if driver:
            try:
                # 네이티브로 복귀
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            driver.quit()
            print("\nAppium 세션 종료")


def main():
    parser = argparse.ArgumentParser(description='Adidas 모바일 웹뷰 로그인 테스트')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--device', '-d', help='디바이스 UDID (생략시 자동 감지)')
    parser.add_argument('--check-contexts', '-c', action='store_true',
                        help='컨텍스트만 확인 (로그인 없이)')

    args = parser.parse_args()

    print("=" * 60)
    print("Adidas 모바일 웹뷰 로그인 테스트")
    print("=" * 60)

    # 컨텍스트만 확인 모드
    if args.check_contexts:
        device = args.device or get_connected_device()
        if not device:
            print("연결된 디바이스가 없습니다.")
            return

        print(f"\n디바이스: {device}")
        print("컨텍스트 확인 중...\n")

        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.udid = device
        options.device_name = device
        options.app_package = 'com.adidas.app'
        options.no_reset = True

        # Appium 2.x는 /wd/hub 없이 사용
        driver = webdriver.Remote('http://localhost:4723', options=options)

        try:
            driver.activate_app('com.adidas.app')
            time.sleep(3)

            contexts = driver.contexts
            print(f"사용 가능한 컨텍스트:")
            for ctx in contexts:
                print(f"  - {ctx}")

            # 페이지 소스 저장
            with open('mobile_page_source.xml', 'w', encoding='utf-8') as f:
                f.write(driver.page_source)
            print(f"\n페이지 소스 저장됨: mobile_page_source.xml")

        finally:
            driver.quit()
        return

    # 로그인 테스트
    if not args.email or not args.password:
        print("\n사용법:")
        print("  python test_mobile_webview_login.py <email> <password>")
        print("  python test_mobile_webview_login.py --check-contexts  # 컨텍스트만 확인")
        return

    print(f"\n이메일: {args.email}")

    access_token = mobile_webview_login(args.email, args.password, args.device)

    if access_token:
        print("\n" + "=" * 60)
        print("로그인 성공!")
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
        print("로그인 실패!")
        print("=" * 60)


if __name__ == "__main__":
    main()
