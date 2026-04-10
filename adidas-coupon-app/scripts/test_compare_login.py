"""
Selenium vs Playwright 로그인 비교 테스트
- 동일한 계정으로 두 방식의 로그인 + 토큰 추출을 비교
- 각 단계별 소요 시간과 결과를 출력

사용법:
    python test_compare_login.py <email> <password> [--mode selenium|playwright|both]
"""
import sys
import os
import time
import argparse

sys.stdout.reconfigure(line_buffering=True)


def test_selenium_login(email, password, incognito=True):
    """Selenium(undetected-chromedriver) 로그인 테스트"""
    print("\n" + "=" * 60)
    print("  Selenium 로그인 테스트" + (" (시크릿)" if incognito else ""))
    print("=" * 60)

    timings = {}
    total_start = time.time()

    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import TimeoutException, NoSuchElementException
    except ImportError as e:
        print(f"[SKIP] Selenium 라이브러리 없음: {e}")
        return None

    driver = None
    try:
        # 1. 브라우저 시작
        t = time.time()
        print("[1] 브라우저 시작...")
        options = uc.ChromeOptions()
        if incognito:
            options.add_argument('--incognito')
        options.add_argument('--window-size=1280,900')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')
        options.add_argument('--disable-popup-blocking')
        options.add_argument('--log-level=3')
        options.add_argument('--silent')

        driver = uc.Chrome(options=options, use_subprocess=True, driver_executable_path=None)
        time.sleep(2)
        _ = driver.current_window_handle
        timings['브라우저 시작'] = time.time() - t
        print(f"    완료 ({timings['브라우저 시작']:.1f}s)")

        driver.implicitly_wait(10)

        # 2. 페이지 이동
        t = time.time()
        print("[2] 로그인 페이지 이동...")
        driver.get("https://www.adidas.co.kr/account-login")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        timings['페이지 로드'] = time.time() - t
        print(f"    완료 ({timings['페이지 로드']:.1f}s)")

        # 2.5 쿠키 동의
        driver.implicitly_wait(0)
        for selector in ['#glass-gdpr-default-consent-accept-button', 'button[data-auto-id="consent-modal-accept-btn"]', '#onetrust-accept-btn-handler']:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, selector)
                if btn.is_displayed():
                    btn.click()
                    print("    쿠키 동의 클릭")
                    time.sleep(1)
                    break
            except NoSuchElementException:
                continue
        driver.implicitly_wait(10)

        # 3. 로그인 입력
        t = time.time()
        print("[3] 로그인 정보 입력...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
        )
        email_input.clear()
        email_input.send_keys(email)

        password_input = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
        password_input.clear()
        password_input.send_keys(password)

        login_btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_btn.click()
        timings['로그인 입력'] = time.time() - t
        print(f"    완료 ({timings['로그인 입력']:.1f}s)")

        # 4. 토큰 대기
        t = time.time()
        print("[4] 토큰 대기...")
        time.sleep(3)

        access_token = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            driver.implicitly_wait(0)

            # 에러 체크
            error_selectors = ['#password--error', '.gl-form-notice__error', '.gl-form-hint--error', '[data-auto-id="login-error"]', 'p[class*="_error_"]']
            login_error = None
            for sel in error_selectors:
                try:
                    elems = driver.find_elements(By.CSS_SELECTOR, sel)
                    for elem in elems:
                        if elem.is_displayed():
                            txt = elem.text.strip()
                            if txt:
                                login_error = txt
                                break
                    if login_error:
                        break
                except:
                    continue

            if login_error:
                driver.implicitly_wait(10)
                timings['토큰 대기'] = time.time() - t
                print(f"    [ERROR] {login_error} ({timings['토큰 대기']:.1f}s)")
                return {'success': False, 'error': login_error, 'timings': timings, 'total': time.time() - total_start}

            driver.implicitly_wait(10)

            # 쿠키에서 토큰 확인
            try:
                cookies = driver.get_cookies()
                for cookie in cookies:
                    if cookie['name'] == 'account.grant.accessToken':
                        access_token = cookie['value']
                        break
            except:
                pass

            if access_token:
                break
            time.sleep(0.5)

        timings['토큰 대기'] = time.time() - t

        if access_token:
            print(f"    토큰 발견! ({timings['토큰 대기']:.1f}s)")
            print(f"    토큰: {access_token[:40]}...")
            total = time.time() - total_start
            timings['총 소요'] = total
            return {'success': True, 'token': access_token, 'timings': timings, 'total': total}
        else:
            print(f"    [ERROR] 토큰 없음 ({timings['토큰 대기']:.1f}s)")
            total = time.time() - total_start
            timings['총 소요'] = total
            return {'success': False, 'error': 'TOKEN_NOT_FOUND', 'timings': timings, 'total': total}

    except Exception as e:
        print(f"    [ERROR] {e}")
        import traceback
        traceback.print_exc()
        total = time.time() - total_start
        return {'success': False, 'error': str(e), 'timings': timings, 'total': total}

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
            print("    브라우저 종료")


def test_playwright_login(email, password, incognito=True):
    """Playwright 로그인 테스트"""
    print("\n" + "=" * 60)
    print("  Playwright 로그인 테스트" + (" (시크릿)" if incognito else ""))
    print("=" * 60)

    timings = {}
    total_start = time.time()

    try:
        from playwright.sync_api import sync_playwright
        from playwright_stealth import Stealth
    except ImportError as e:
        print(f"[SKIP] Playwright 라이브러리 없음: {e}")
        return None

    playwright_inst = None
    browser = None
    context = None

    try:
        # 1. 브라우저 시작
        t = time.time()
        print("[1] 브라우저 시작...")

        playwright_inst = sync_playwright().start()

        launch_args = [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-popup-blocking',
            '--disable-extensions',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-sandbox',
        ]

        context_opts = {
            'viewport': {'width': 1280, 'height': 900},
            'locale': 'ko-KR',
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        }

        if incognito:
            launch_args.append('--incognito')
            import tempfile
            tmp_dir = tempfile.mkdtemp(prefix='pw_test_')
            context = playwright_inst.chromium.launch_persistent_context(
                tmp_dir,
                headless=False,
                channel='chrome',
                args=launch_args,
                **context_opts,
            )
            browser = None
        else:
            browser = playwright_inst.chromium.launch(
                headless=False,
                channel='chrome',
                args=launch_args,
            )
            context = browser.new_context(**context_opts)

        if incognito and context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()

        # playwright-stealth 적용 (봇 탐지 우회)
        stealth = Stealth()
        stealth.apply_stealth_sync(page)

        timings['브라우저 시작'] = time.time() - t
        print(f"    완료 ({timings['브라우저 시작']:.1f}s)")

        # 2. 페이지 이동
        t = time.time()
        print("[2] 로그인 페이지 이동...")
        page.goto("https://www.adidas.co.kr/account-login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector('input[name="email"], input[type="email"]', timeout=15000)
        timings['페이지 로드'] = time.time() - t
        print(f"    완료 ({timings['페이지 로드']:.1f}s)")

        # 2.5 쿠키 동의
        for selector in ['#glass-gdpr-default-consent-accept-button', 'button[data-auto-id="consent-modal-accept-btn"]', '#onetrust-accept-btn-handler']:
            try:
                btn = page.query_selector(selector)
                if btn and btn.is_visible():
                    btn.click()
                    print("    쿠키 동의 클릭")
                    page.wait_for_timeout(1000)
                    break
            except Exception:
                continue

        # 3. 로그인 입력
        t = time.time()
        print("[3] 로그인 정보 입력...")
        email_input = page.wait_for_selector('input[name="email"], input[type="email"]', timeout=10000)
        email_input.fill('')
        email_input.type(email, delay=50)

        password_input = page.query_selector('input[name="password"], input[type="password"]')
        password_input.fill('')
        password_input.type(password, delay=50)

        login_btn = page.query_selector('button[type="submit"]')
        login_btn.click()
        timings['로그인 입력'] = time.time() - t
        print(f"    완료 ({timings['로그인 입력']:.1f}s)")

        # 4. 토큰 대기
        t = time.time()
        print("[4] 토큰 대기...")
        page.wait_for_timeout(3000)

        access_token = None
        start = time.time()
        max_wait = 20

        while time.time() - start < max_wait:
            # 에러 체크
            error_selectors = ['#password--error', '.gl-form-notice__error', '.gl-form-hint--error', '[data-auto-id="login-error"]', 'p[class*="_error_"]']
            login_error = None
            for sel in error_selectors:
                try:
                    elems = page.query_selector_all(sel)
                    for elem in elems:
                        if elem.is_visible():
                            txt = elem.inner_text().strip()
                            if txt:
                                login_error = txt
                                break
                    if login_error:
                        break
                except Exception:
                    continue

            if login_error:
                timings['토큰 대기'] = time.time() - t
                print(f"    [ERROR] {login_error} ({timings['토큰 대기']:.1f}s)")
                return {'success': False, 'error': login_error, 'timings': timings, 'total': time.time() - total_start}

            # 쿠키에서 토큰 확인
            cookies = context.cookies()
            for cookie in cookies:
                if cookie['name'] == 'account.grant.accessToken':
                    access_token = cookie['value']
                    break

            if access_token:
                break
            page.wait_for_timeout(500)

        timings['토큰 대기'] = time.time() - t

        if access_token:
            print(f"    토큰 발견! ({timings['토큰 대기']:.1f}s)")
            print(f"    토큰: {access_token[:40]}...")
            total = time.time() - total_start
            timings['총 소요'] = total
            return {'success': True, 'token': access_token, 'timings': timings, 'total': total}
        else:
            # 마지막으로 현재 URL과 페이지 상태 출력 (디버깅)
            try:
                print(f"    현재 URL: {page.url}")
                # 모든 쿠키 출력
                all_cookies = context.cookies()
                cookie_names = [c['name'] for c in all_cookies]
                print(f"    쿠키 목록 ({len(all_cookies)}개): {', '.join(cookie_names[:10])}{'...' if len(cookie_names) > 10 else ''}")
                # 페이지 타이틀
                print(f"    페이지 타이틀: {page.title()}")
            except Exception as de:
                print(f"    디버깅 정보 수집 실패: {de}")

            print(f"    [ERROR] 토큰 없음 ({timings['토큰 대기']:.1f}s)")
            total = time.time() - total_start
            timings['총 소요'] = total
            return {'success': False, 'error': 'TOKEN_NOT_FOUND', 'timings': timings, 'total': total}

    except Exception as e:
        print(f"    [ERROR] {e}")
        import traceback
        traceback.print_exc()
        total = time.time() - total_start
        return {'success': False, 'error': str(e), 'timings': timings, 'total': total}

    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        if playwright_inst:
            try:
                playwright_inst.stop()
            except Exception:
                pass
        print("    브라우저 종료")


def test_api_with_token(token, label=""):
    """토큰으로 API 호출 테스트"""
    import requests

    print(f"\n  [{label}] API 테스트:")
    headers = {'accept': '*/*', 'user-agent': 'Mozilla/5.0'}
    cookies = {'account.grant.accessToken': token}

    # 포인트 조회
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/wallet', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            points = resp.json().get('availablePoints', 'N/A')
            print(f"    포인트: {points}P")
        else:
            print(f"    포인트 조회 실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"    포인트 조회 오류: {e}")

    # 쿠폰 목록 조회
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/vouchers', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                available = [v for v in data if not v.get('redeemed') and v.get('status') != 'REDEEMED']
                print(f"    보유 쿠폰: {len(available)}개")
            else:
                print(f"    쿠폰 응답 형식 이상: {type(data)}")
        else:
            print(f"    쿠폰 조회 실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"    쿠폰 조회 오류: {e}")

    # 교환 가능 상품권 조회
    try:
        resp = requests.get('https://www.adidas.co.kr/api/account/loyalty/offer/voucher/personal?locale=ko_KR', headers=headers, cookies=cookies, timeout=10)
        if resp.status_code == 200:
            offers = resp.json()
            if isinstance(offers, list):
                print(f"    교환 가능 상품권: {len(offers)}개")
                for offer in offers:
                    rewards = offer.get('rewards', [])
                    for r in rewards:
                        print(f"      - {offer.get('name', 'N/A')} (value={r.get('value', '?')}, eligible={offer.get('eligible', '?')}, points={offer.get('priceInPoints', '?')})")
            else:
                print(f"    상품권 응답 형식 이상: {type(offers)}")
        else:
            print(f"    상품권 조회 실패: HTTP {resp.status_code}")
    except Exception as e:
        print(f"    상품권 조회 오류: {e}")


def print_comparison(sel_result, pw_result):
    """결과 비교 출력"""
    print("\n" + "=" * 60)
    print("  비교 결과")
    print("=" * 60)

    headers = f"{'단계':<15} {'Selenium':>12} {'Playwright':>12} {'차이':>10}"
    print(headers)
    print("-" * 52)

    all_keys = set()
    if sel_result and sel_result.get('timings'):
        all_keys.update(sel_result['timings'].keys())
    if pw_result and pw_result.get('timings'):
        all_keys.update(pw_result['timings'].keys())

    order = ['브라우저 시작', '페이지 로드', '로그인 입력', '토큰 대기', '총 소요']
    for key in order:
        if key not in all_keys:
            continue
        sel_t = sel_result['timings'].get(key, 0) if sel_result and sel_result.get('timings') else 0
        pw_t = pw_result['timings'].get(key, 0) if pw_result and pw_result.get('timings') else 0
        diff = pw_t - sel_t
        diff_str = f"{diff:+.1f}s"
        print(f"  {key:<13} {sel_t:>10.1f}s {pw_t:>10.1f}s {diff_str:>10}")

    print()
    sel_status = 'SUCCESS' if (sel_result and sel_result.get('success')) else 'FAIL'
    pw_status = 'SUCCESS' if (pw_result and pw_result.get('success')) else 'FAIL'
    print(f"  {'결과':<13} {sel_status:>12} {pw_status:>12}")

    if sel_result and not sel_result.get('success'):
        print(f"  Selenium 오류: {sel_result.get('error', '?')}")
    if pw_result and not pw_result.get('success'):
        print(f"  Playwright 오류: {pw_result.get('error', '?')}")


def main():
    parser = argparse.ArgumentParser(description='Selenium vs Playwright 로그인 비교 테스트')
    parser.add_argument('email', help='아디다스 계정 이메일')
    parser.add_argument('password', help='아디다스 계정 비밀번호')
    parser.add_argument('--mode', choices=['selenium', 'playwright', 'both'], default='both',
                        help='테스트 모드 (기본: both)')
    parser.add_argument('--no-incognito', action='store_true', help='시크릿 모드 비활성화')
    parser.add_argument('--api-test', action='store_true', help='토큰 획득 후 API 호출도 테스트')

    args = parser.parse_args()
    incognito = not args.no_incognito

    print(f"계정: {args.email}")
    print(f"시크릿 모드: {'ON' if incognito else 'OFF'}")
    print(f"테스트 모드: {args.mode}")

    sel_result = None
    pw_result = None

    if args.mode in ('selenium', 'both'):
        sel_result = test_selenium_login(args.email, args.password, incognito)
        if args.api_test and sel_result and sel_result.get('success'):
            test_api_with_token(sel_result['token'], 'Selenium')

    if args.mode in ('playwright', 'both'):
        pw_result = test_playwright_login(args.email, args.password, incognito)
        if args.api_test and pw_result and pw_result.get('success'):
            test_api_with_token(pw_result['token'], 'Playwright')

    if args.mode == 'both' and sel_result and pw_result:
        print_comparison(sel_result, pw_result)


if __name__ == "__main__":
    main()
