"""
Adidas 웹 로그인 테스트 (undetected-chromedriver 버전)
- Akamai Bot Manager 우회 시도
- 봇 감지 회피에 특화된 라이브러리 사용
- API 호출로 계정 정보 추출

설치:
    pip install undetected-chromedriver selenium requests

사용법:
    python test_uc_login.py <email> <password>
    python test_uc_login.py <email> <password> --headless  # 백그라운드 실행
    python test_uc_login.py --api-test <access_token>  # API만 테스트
"""
import sys
import time
import argparse
import requests
import json

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("필수 라이브러리가 설치되지 않았습니다.")
    print("설치 명령어: pip install undetected-chromedriver selenium requests")
    sys.exit(1)


def test_api_with_token(access_token: str):
    """
    Access Token을 사용하여 아디다스 API 호출 테스트
    """
    print("=" * 60)
    print("Adidas API 테스트")
    print("=" * 60)

    headers = {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'referer': 'https://www.adidas.co.kr/my-account',
    }

    cookies = {
        'account.grant.accessToken': access_token,
    }

    results = {}

    # 1. 프로필 정보 (이름, 이메일, 생일, 전화번호)
    print("\n[1/4] 프로필 조회...")
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
            results['profile'] = profile
            print(f"  이름: {profile.get('firstName', 'N/A')}")
            print(f"  이메일: {profile.get('email', 'N/A')}")
            print(f"  생일: {profile.get('dateOfBirth', 'N/A')}")
            print(f"  전화번호: {profile.get('mobileNumber', 'N/A')}")
            print(f"  ACID: {profile.get('acid', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 2. 멤버 ID (바코드)
    print("\n[2/4] 바코드 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/memberid',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['member'] = data
            print(f"  바코드: {data.get('memberId', 'N/A')}")
            print(f"  가입일: {data.get('loyaltySignup', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 3. 포인트 (wallet)
    print("\n[3/4] 포인트 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/wallet',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['wallet'] = data
            print(f"  포인트: {data.get('availablePoints', 'N/A')}")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 4. 쿠폰 정보
    print("\n[4/4] 쿠폰 조회...")
    try:
        resp = requests.get(
            'https://www.adidas.co.kr/api/account/loyalty/vouchers',
            headers=headers,
            cookies=cookies,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            results['vouchers'] = data
            if isinstance(data, list):
                print(f"  쿠폰 수: {len(data)}개")
                for v in data:
                    name = v.get('couponLabel') or v.get('name', 'N/A')
                    code = v.get('code', 'N/A')
                    available = v.get('available', {})
                    expire_date = available.get('to', 'N/A')
                    if expire_date != 'N/A':
                        expire_date = expire_date[:10]  # YYYY-MM-DD만 표시
                    print(f"    - {name}: {code} (만료: {expire_date})")
            else:
                print(f"  데이터: {json.dumps(data, ensure_ascii=False)[:200]}...")
        else:
            print(f"  실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  오류: {e}")

    # 등급 조회 (비활성화)
    # print("\n[5/5] 등급 조회...")
    # try:
    #     resp = requests.get(
    #         'https://www.adidas.co.kr/api/account/loyalty/status',
    #         headers=headers,
    #         cookies=cookies,
    #         timeout=10
    #     )
    #     if resp.status_code == 200:
    #         data = resp.json()
    #         results['loyalty'] = data
    #         tier_id = data.get('tierId', 0)
    #         tier_names = {1: 'Challenger', 2: 'Playmaker', 3: 'Gamechanger', 4: 'Icon'}
    #         tier_name = tier_names.get(tier_id, f'Tier {tier_id}')
    #         print(f"  등급: {tier_name} (tierId: {tier_id})")
    #         print(f"  총 포인트: {data.get('totalPoints', 'N/A')}")
    #     else:
    #         print(f"  실패: HTTP {resp.status_code}")
    # except Exception as e:
    #     print(f"  오류: {e}")

    # 요약
    print("\n" + "=" * 60)
    print("요약")
    print("=" * 60)
    if results.get('profile'):
        p = results['profile']
        print(f"  이름: {p.get('firstName', 'N/A')}")
        print(f"  이메일: {p.get('email', 'N/A')}")
        print(f"  생일: {p.get('dateOfBirth', 'N/A')}")
        print(f"  전화번호: {p.get('mobileNumber', 'N/A')}")
    if results.get('member'):
        print(f"  바코드: {results['member'].get('memberId', 'N/A')}")
    if results.get('wallet'):
        print(f"  포인트: {results['wallet'].get('availablePoints', 'N/A')}")
    if results.get('vouchers') and isinstance(results['vouchers'], list):
        print(f"  쿠폰: {len(results['vouchers'])}개")

    return results


def test_adidas_login(email: str, password: str, headless: bool = False):
    """
    undetected-chromedriver로 아디다스 로그인 테스트
    """
    print("=" * 60)
    print("Adidas 웹 로그인 테스트 (undetected-chromedriver)")
    print("=" * 60)
    print(f"이메일: {email}")
    print(f"Headless: {headless}")
    print()

    driver = None
    login_start_time = time.time()
    step_times = {}

    try:
        # Chrome 옵션 설정
        options = uc.ChromeOptions()

        if headless:
            options.add_argument('--headless=new')

        options.add_argument('--window-size=1920,1080')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')

        # undetected-chromedriver 시작
        step_start = time.time()
        print("[1/6] 브라우저 시작 중...")
        driver = uc.Chrome(options=options, use_subprocess=True)
        driver.implicitly_wait(10)
        step_times['브라우저 시작'] = time.time() - step_start
        print(f"  완료 ({step_times['브라우저 시작']:.2f}초)")

        step_start = time.time()
        print("[2/6] 로그인 페이지 이동 중...")
        driver.get("https://www.adidas.co.kr/account-login")

        # 페이지 로드 대기 - 이메일 입력 필드가 나타날 때까지
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        step_times['페이지 로드'] = time.time() - step_start
        print(f"  완료 ({step_times['페이지 로드']:.2f}초)")

        # 현재 URL 확인 (봇 차단 페이지인지 확인)
        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # 403 에러 페이지 확인 (Akamai 차단 페이지 특징으로 판단)
        page_source = driver.page_source
        page_title = driver.title

        # Akamai 차단 페이지 특징: "Reference Error", "unable to give you access", "HTTP 403"
        is_blocked = (
            "Reference Error" in page_source or
            "unable to give you access" in page_source or
            "HTTP 403" in page_source or
            "Access Denied" in page_title
        )

        if is_blocked:
            print("\n[!] 봇 감지 - Akamai 차단 페이지 감지됨")
            print("  페이지 타이틀:", page_title)

            # 스크린샷 저장
            driver.save_screenshot("error_403_uc.png")
            print("  스크린샷 저장: error_403_uc.png")
            return False

        print("  봇 차단 없음 - 정상 페이지")

        # 쿠키 동의 처리 (있는 경우) - 빠른 체크
        step_start = time.time()
        print("[2.5/6] 쿠키 동의 팝업 확인 중...")

        # implicit wait 일시적으로 비활성화 (빠른 체크를 위해)
        driver.implicitly_wait(0)

        cookie_consent_selectors = [
            '#glass-gdpr-default-consent-accept-button',  # 가장 자주 나오는 것 먼저
            'button[data-auto-id="consent-modal-accept-btn"]',
            '#onetrust-accept-btn-handler',
        ]

        consent_clicked = False
        for selector in cookie_consent_selectors:
            try:
                consent_btn = driver.find_element(By.CSS_SELECTOR, selector)
                if consent_btn.is_displayed():
                    consent_btn.click()
                    print(f"  쿠키 동의 클릭 완료: {selector}")
                    consent_clicked = True
                    # 버튼이 사라질 때까지 대기 (최대 1초)
                    try:
                        WebDriverWait(driver, 1).until(
                            EC.invisibility_of_element(consent_btn)
                        )
                    except:
                        pass  # 버튼이 이미 사라졌거나 타임아웃
                    break
            except NoSuchElementException:
                continue

        # implicit wait 복원
        driver.implicitly_wait(10)

        if not consent_clicked:
            print("  쿠키 동의 팝업 없음")
        step_times['쿠키 동의'] = time.time() - step_start

        # 이메일 입력
        step_start = time.time()
        print("[3/6] 이메일 입력 중...")
        try:
            email_input = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
            )
            email_input.clear()
            email_input.send_keys(email)
            print("  이메일 입력 완료")
        except TimeoutException:
            print("  [!] 이메일 입력 필드를 찾을 수 없습니다")
            driver.save_screenshot("error_no_email_uc.png")
            return False
        step_times['이메일 입력'] = time.time() - step_start

        # 비밀번호 입력
        step_start = time.time()
        print("[4/6] 비밀번호 입력 중...")
        try:
            password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
            password_input.clear()
            password_input.send_keys(password)
            print("  비밀번호 입력 완료")
        except NoSuchElementException:
            print("  [!] 비밀번호 입력 필드를 찾을 수 없습니다")
            return False
        step_times['비밀번호 입력'] = time.time() - step_start

        # 로그인 버튼 클릭
        step_start = time.time()
        print("[5/6] 로그인 버튼 클릭...")
        try:
            login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
            login_btn.click()
            print("  로그인 버튼 클릭 완료")
        except NoSuchElementException:
            print("  [!] 로그인 버튼을 찾을 수 없습니다")
            return False
        step_times['로그인 버튼'] = time.time() - step_start

        # 로그인 결과 대기 (토큰 쿠키 생성까지 동적 대기)
        step_start = time.time()
        print("[6/6] 로그인 결과 대기 중 (토큰 쿠키 확인)...")

        access_token = None
        refresh_token = None
        max_wait = 15  # 최대 15초 대기
        poll_interval = 0.3  # 0.3초 간격으로 체크

        while time.time() - step_start < max_wait:
            cookies = driver.get_cookies()
            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    access_token = cookie['value']
                elif cookie['name'] == 'account.grant.refreshToken':
                    refresh_token = cookie['value']

            if access_token:
                print(f"  토큰 쿠키 발견!")
                break

            # 짧은 대기 후 다시 체크 (WebDriverWait 사용)
            try:
                WebDriverWait(driver, poll_interval).until(
                    lambda d: False  # 항상 실패하여 poll_interval만큼 대기
                )
            except:
                pass  # 타임아웃은 정상 동작

        step_times['로그인 대기'] = time.time() - step_start

        # 결과 확인
        current_url = driver.current_url
        print(f"\n  결과 URL: {current_url}")

        # 로그인 성공 확인 (토큰 존재 여부로 판단)
        if access_token:
            total_login_time = time.time() - login_start_time
            print("\n" + "=" * 60)
            print("로그인 성공!")
            print("=" * 60)

            # 단계별 시간 출력
            print("\n[시간 측정]")
            for step_name, step_time in step_times.items():
                print(f"  {step_name}: {step_time:.2f}초")
            print(f"  ----------------------")
            print(f"  총 로그인 시간: {total_login_time:.2f}초")

            print(f"\nAccess Token: {access_token[:50]}...")
            if refresh_token:
                print(f"Refresh Token: {refresh_token[:50]}...")

            # 토큰을 파일로 저장
            with open("adidas_token.txt", "w") as f:
                f.write(f"access_token={access_token}\n")
                if refresh_token:
                    f.write(f"refresh_token={refresh_token}\n")
            print("\n토큰이 adidas_token.txt에 저장되었습니다.")

            # API 테스트 실행
            print("\n")
            test_api_with_token(access_token)

            return True
        else:
            # 에러 메시지 확인
            print("\n" + "=" * 60)
            print("로그인 실패!")
            print("=" * 60)

            error_selectors = [
                '[data-auto-id="login-error-message"]',
                '.error-message',
                '.login-error',
            ]

            for selector in error_selectors:
                try:
                    error_elem = driver.find_element(By.CSS_SELECTOR, selector)
                    if error_elem.text:
                        print(f"에러 메시지: {error_elem.text}")
                        break
                except NoSuchElementException:
                    continue

            driver.save_screenshot("error_login_failed_uc.png")
            print("스크린샷 저장: error_login_failed_uc.png")
            return False

    except Exception as e:
        print(f"\n[!] 오류 발생: {e}")
        import traceback
        traceback.print_exc()

        if driver:
            driver.save_screenshot("error_exception_uc.png")
            print("스크린샷 저장: error_exception_uc.png")
        return False

    finally:
        if driver:
            print("\n브라우저 종료 중...")
            driver.quit()


def main():
    parser = argparse.ArgumentParser(description='Adidas 로그인 테스트 (undetected-chromedriver)')
    parser.add_argument('email', nargs='?', help='아디다스 계정 이메일')
    parser.add_argument('password', nargs='?', help='아디다스 계정 비밀번호')
    parser.add_argument('--headless', action='store_true', help='헤드리스 모드 (백그라운드 실행)')
    parser.add_argument('--api-test', metavar='TOKEN', help='API만 테스트 (기존 토큰 사용)')

    args = parser.parse_args()

    # API만 테스트하는 경우
    if args.api_test:
        test_api_with_token(args.api_test)
        return

    # 로그인 테스트
    if not args.email or not args.password:
        print("사용법:")
        print("  python test_uc_login.py <email> <password>")
        print("  python test_uc_login.py <email> <password> --headless")
        print("  python test_uc_login.py --api-test <access_token>")
        sys.exit(1)

    success = test_adidas_login(args.email, args.password, args.headless)

    print("\n" + "=" * 60)
    if success:
        print("테스트 결과: 성공 ✓")
    else:
        print("테스트 결과: 실패 ✗")
    print("=" * 60)


if __name__ == "__main__":
    main()
