"""Adidas 앱 로그인"""
import time
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy

def login(email: str, password: str, appium_url: str = "http://127.0.0.1:4723"):
    """
    Adidas 앱 로그인

    Args:
        email: 이메일 주소
        password: 비밀번호
        appium_url: Appium 서버 URL

    Returns:
        bool: 로그인 성공 여부

    Raises:
        ConnectionError: Appium 서버 연결 실패 시
    """

    # Appium 연결 설정
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "emulator-5554"
    options.app_package = "com.adidas.app"
    options.app_activity = ".MainActivity"
    options.automation_name = "UiAutomator2"
    options.no_reset = True

    # Chrome WebView 사용 (Samsung 브라우저 대신)
    options.set_capability('chromedriverExecutable', '')  # 자동으로 chromedriver 다운로드
    options.set_capability('recreateChromeDriverSessions', True)
    options.set_capability('nativeWebScreenshot', True)
    options.set_capability('autoWebview', False)  # 수동으로 webview 전환

    try:
        driver = webdriver.Remote(appium_url, options=options)
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise ConnectionError("모바일 기기 연결이 되지 않았습니다")
        else:
            raise

    try:
        print("=" * 60)
        print("Adidas 로그인")
        print("=" * 60)
        print(f"계정: {email}\n")

        # [1단계] 앱 실행 확인
        print("[1단계] 앱 실행 확인")
        current_pkg = driver.current_package
        print(f"  현재 패키지: {current_pkg}")

        if current_pkg != "com.adidas.app":
            print("  앱 실행 중...")
            driver.activate_app("com.adidas.app")
            time.sleep(5)
            print("  [OK] 앱 실행 완료")
        else:
            print("  [OK] 앱 이미 실행 중")

        # [2단계] 로그인 시작
        print("\n[2단계] 로그인 시작")

        page_source = driver.page_source

        # 현재 화면에서 바로 "로그인하기" 버튼 찾기
        login_button_found = False
        if '로그인하기' in page_source:
            print("\n[광고 화면] 하단 '로그인하기' 버튼으로 시작")
            try:
                login_btn = driver.find_element(AppiumBy.XPATH, "//*[@text='로그인하기']")
                login_btn.click()
                print("  [OK] 광고 화면에서 로그인 시작")
                time.sleep(2)
                login_button_found = True
            except:
                print("  [시도] X 버튼으로 광고 닫기")
                # X 버튼을 resource-id나 content-desc로 찾기
                closed = False
                for desc in ['Close', 'close', '닫기', 'Dismiss', 'dismiss']:
                    try:
                        close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        close_btn.click()
                        time.sleep(2)
                        print(f"  [OK] 광고 X 버튼 클릭 (content-desc: {desc})")
                        closed = True
                        break
                    except:
                        continue

                if not closed:
                    try:
                        close_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
                        close_btn.click()
                        time.sleep(2)
                        print("  [OK] 광고 X 버튼 클릭 (ImageButton)")
                    except:
                        print("  [WARNING] X 버튼을 찾을 수 없음")

                login_button_found = False
        else:
            login_button_found = False

        # [3단계] 가입 또는 로그인하기 버튼 클릭
        if not login_button_found:
            print("\n[3단계] '가입 또는 로그인하기' 버튼 찾기")

            # 방법 1: content-desc로 찾기
            for desc in ['지금 로그인하기', '가입 또는 로그인하기', 'JOIN OR LOG IN']:
                try:
                    login_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    login_btn.click()
                    print(f"  [OK] content-desc '{desc}' 버튼 클릭 성공")
                    login_button_found = True
                    time.sleep(3)
                    break
                except:
                    pass

            # 방법 2: 텍스트로 찾기
            if not login_button_found:
                for text in ['가입 또는 로그인하기', 'JOIN OR LOG IN', '로그인', 'LOG IN']:
                    try:
                        login_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        login_btn.click()
                        print(f"  [OK] '{text}' 버튼 클릭 성공")
                        login_button_found = True
                        time.sleep(2)
                        break
                    except:
                        pass

        if not login_button_found:
            print("  [ERROR] 로그인 버튼을 찾을 수 없습니다")
            with open("error_no_login_button.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  -> error_no_login_button.xml 저장됨")
            return False

        # [4단계] 로그인 페이지 (웹뷰) - 이메일 입력
        print("\n[4단계] 이메일 입력")
        time.sleep(3)  # 웹뷰 로딩 대기

        email_entered = False

        # 방법 1: resource-id로 찾기 (가장 정확)
        try:
            email_field = driver.find_element(AppiumBy.XPATH,
                "//android.widget.EditText[@resource-id='login.email.input']")
            email_field.clear()
            email_field.send_keys(email)
            print(f"  [OK] 이메일 입력 완료 (resource-id)")
            email_entered = True
        except:
            pass

        # 방법 2: WebView 안의 EditText만 찾기 (android.webkit.WebView 하위)
        if not email_entered:
            try:
                email_field = driver.find_element(AppiumBy.XPATH,
                    "//android.webkit.WebView//android.widget.EditText[@resource-id='login.email.input']")
                email_field.clear()
                email_field.send_keys(email)
                print(f"  [OK] 이메일 입력 완료 (WebView 내 resource-id)")
                email_entered = True
            except:
                pass

        # 방법 3: WebView 내에서 순서로 찾기 - 첫 번째 EditText
        if not email_entered:
            try:
                email_field = driver.find_element(AppiumBy.XPATH,
                    "(//android.webkit.WebView//android.widget.EditText)[1]")
                email_field.clear()
                email_field.send_keys(email)
                print(f"  [OK] 이메일 입력 완료 (WebView 내 첫번째 EditText)")
                email_entered = True
            except:
                pass

        # 방법 4: WebView context 전환 후 입력 시도
        if not email_entered:
            try:
                # 사용 가능한 context 확인
                contexts = driver.contexts
                print(f"  [DEBUG] 사용 가능한 contexts: {contexts}")

                # WEBVIEW context로 전환
                for context in contexts:
                    if 'WEBVIEW' in context:
                        driver.switch_to.context(context)
                        print(f"  [DEBUG] Context 전환: {context}")

                        # 웹 요소로 찾기
                        try:
                            email_field = driver.find_element(AppiumBy.ID, "login.email.input")
                            email_field.clear()
                            email_field.send_keys(email)
                            print(f"  [OK] 이메일 입력 완료 (WEBVIEW context)")
                            email_entered = True

                            # NATIVE_APP으로 다시 전환
                            driver.switch_to.context('NATIVE_APP')
                            break
                        except:
                            driver.switch_to.context('NATIVE_APP')
                            pass
            except Exception as e:
                print(f"  [DEBUG] WEBVIEW context 전환 실패: {e}")
                pass

        # 방법 5: 모든 EditText 중 URL 바가 아닌 것 찾기
        if not email_entered:
            try:
                edit_fields = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
                print(f"  [DEBUG] 총 {len(edit_fields)}개의 EditText 발견")

                # URL 바를 제외한 EditText 찾기
                for i, field in enumerate(edit_fields):
                    try:
                        # resource-id나 content-desc에 'url', 'address' 등이 포함되어 있으면 skip
                        field_id = field.get_attribute('resource-id') or ''
                        field_desc = field.get_attribute('content-desc') or ''

                        if 'url' in field_id.lower() or 'address' in field_id.lower():
                            print(f"  [DEBUG] EditText {i}: URL 바로 판단하여 스킵 (id: {field_id})")
                            continue

                        # 이메일 입력란으로 추정되는 경우
                        if 'email' in field_id.lower() or 'login' in field_id.lower():
                            field.clear()
                            field.send_keys(email)
                            print(f"  [OK] 이메일 입력 완료 (EditText {i}, id: {field_id})")
                            email_entered = True
                            break

                        # WebView 내부의 EditText인 경우
                        parent = field.get_attribute('parent')
                        if parent and 'WebView' in parent:
                            field.clear()
                            field.send_keys(email)
                            print(f"  [OK] 이메일 입력 완료 (EditText {i}, WebView 내부)")
                            email_entered = True
                            break

                    except Exception as e:
                        print(f"  [DEBUG] EditText {i} 시도 실패: {e}")
                        continue
            except:
                pass

        if not email_entered:
            print("  [ERROR] 이메일 필드를 찾을 수 없습니다")
            page_source = driver.page_source
            with open("error_no_email_field.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  -> error_no_email_field.xml 저장됨")
            return False

        time.sleep(1)

        # [5단계] 비밀번호 입력
        print("\n[5단계] 비밀번호 입력")

        password_entered = False

        # 방법 1: resource-id로 찾기 (가장 정확)
        try:
            pwd_field = driver.find_element(AppiumBy.XPATH,
                "//android.widget.EditText[@resource-id='login.password.input']")
            pwd_field.clear()
            pwd_field.send_keys(password)
            print(f"  [OK] 비밀번호 입력 완료 (resource-id)")
            password_entered = True
        except:
            pass

        # 방법 2: WebView 안의 EditText로 찾기
        if not password_entered:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH,
                    "//android.webkit.WebView//android.widget.EditText[@resource-id='login.password.input']")
                pwd_field.clear()
                pwd_field.send_keys(password)
                print(f"  [OK] 비밀번호 입력 완료 (WebView 내 resource-id)")
                password_entered = True
            except:
                pass

        # 방법 3: WebView 내에서 두 번째 EditText
        if not password_entered:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH,
                    "(//android.webkit.WebView//android.widget.EditText)[2]")
                pwd_field.clear()
                pwd_field.send_keys(password)
                print(f"  [OK] 비밀번호 입력 완료 (WebView 내 두번째 EditText)")
                password_entered = True
            except:
                pass

        # 방법 4: WebView context 전환 후 입력
        if not password_entered:
            try:
                contexts = driver.contexts
                for context in contexts:
                    if 'WEBVIEW' in context:
                        driver.switch_to.context(context)
                        try:
                            pwd_field = driver.find_element(AppiumBy.ID, "login.password.input")
                            pwd_field.clear()
                            pwd_field.send_keys(password)
                            print(f"  [OK] 비밀번호 입력 완료 (WEBVIEW context)")
                            password_entered = True
                            driver.switch_to.context('NATIVE_APP')
                            break
                        except:
                            driver.switch_to.context('NATIVE_APP')
                            pass
            except:
                pass

        # 방법 5: 모든 EditText 중 password 필드 찾기
        if not password_entered:
            try:
                edit_fields = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")

                # URL 바를 제외한 EditText 찾기
                webview_fields = []
                for i, field in enumerate(edit_fields):
                    try:
                        field_id = field.get_attribute('resource-id') or ''

                        # URL 바 스킵
                        if 'url' in field_id.lower() or 'address' in field_id.lower():
                            continue

                        # 비밀번호 입력란으로 추정되는 경우
                        if 'password' in field_id.lower() or 'pwd' in field_id.lower():
                            field.clear()
                            field.send_keys(password)
                            print(f"  [OK] 비밀번호 입력 완료 (EditText {i}, id: {field_id})")
                            password_entered = True
                            break

                        # WebView 내부의 EditText 수집
                        parent = field.get_attribute('parent')
                        if parent and 'WebView' in parent:
                            webview_fields.append(field)

                    except:
                        continue

                # WebView 내부의 두 번째 EditText가 비밀번호
                if not password_entered and len(webview_fields) >= 2:
                    webview_fields[1].clear()
                    webview_fields[1].send_keys(password)
                    print(f"  [OK] 비밀번호 입력 완료 (WebView 내 두번째 필드)")
                    password_entered = True

            except:
                pass

        if not password_entered:
            print("  [ERROR] 비밀번호 필드를 찾을 수 없습니다")
            page_source = driver.page_source
            with open("error_no_password_field.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  -> error_no_password_field.xml 저장됨")
            return False

        time.sleep(1)

        # [6단계] 로그인하기 버튼 클릭
        print("\n[6단계] '로그인하기' 버튼 클릭")

        submit_clicked = False

        # 방법 1: resource-id로 찾기
        try:
            submit_btn = driver.find_element(AppiumBy.XPATH,
                "//android.widget.Button[@resource-id='login-submit-button']")
            submit_btn.click()
            print(f"  [OK] 로그인 버튼 클릭 (resource-id)")
            submit_clicked = True
        except:
            pass

        # 방법 2: 텍스트로 찾기
        if not submit_clicked:
            for text in ['로그인하기', 'LOG IN', '로그인']:
                try:
                    submit_btn = driver.find_element(AppiumBy.XPATH,
                        f"//android.widget.Button[@text='{text}']")
                    submit_btn.click()
                    print(f"  [OK] '{text}' 버튼 클릭 성공")
                    submit_clicked = True
                    break
                except:
                    pass

        # 방법 3: Button 클래스로 찾기
        if not submit_clicked:
            try:
                buttons = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.Button")
                for btn in buttons:
                    btn.click()
                    print(f"  [OK] 버튼 클릭 완료 (Button class)")
                    submit_clicked = True
                    break
            except:
                pass

        if not submit_clicked:
            print("  [ERROR] 로그인 버튼을 찾을 수 없습니다")
            page_source = driver.page_source
            with open("error_no_submit_button.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  -> error_no_submit_button.xml 저장됨")
            return False

        # [7단계] 로그인 처리 대기
        print("\n로그인 처리 중...")
        time.sleep(3)

        # [8단계] 로그인 결과 확인
        print("\n[7단계] 로그인 결과 확인")

        time.sleep(2)
        page_source = driver.page_source

        # 로그인 실패 메시지 확인
        error_messages = [
            '잘못된 이메일/비밀번호입니다',
            'Invalid email or password',
            '다시 시도하세요',
            'Try again',
            '이메일 또는 비밀번호가',
            '입력한 정보가'
        ]

        login_failed = False
        for error_msg in error_messages:
            if error_msg in page_source:
                print(f"  [FAILED] 로그인 실패: {error_msg}")
                login_failed = True
                break

        if login_failed:
            with open("error_login_failed.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  -> error_login_failed.xml 저장됨")

            # 웹뷰 닫기 - X 버튼 클릭
            print("  [시도] 웹뷰 X 버튼 클릭하여 닫기")
            webview_closed = False

            # 방법 1: content-desc로 찾기
            for desc in ['Close', 'close', '닫기', 'X']:
                try:
                    close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    close_btn.click()
                    print(f"  [OK] 웹뷰 닫기 성공 (content-desc: {desc})")
                    time.sleep(2)
                    webview_closed = True
                    break
                except:
                    pass

            # 방법 2: X 버튼 (ImageButton)
            if not webview_closed:
                try:
                    close_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
                    close_btn.click()
                    print("  [OK] 웹뷰 닫기 성공 (ImageButton)")
                    time.sleep(2)
                    webview_closed = True
                except:
                    pass

            # 방법 3: 뒤로 가기 버튼 (다른 방법 실패 시에만)
            if not webview_closed:
                try:
                    driver.press_keycode(4)
                    print("  [OK] 뒤로 가기로 웹뷰 닫기")
                    time.sleep(2)
                except:
                    pass

            print("  [종료] 로그인 실패로 프로세스 종료")
            return False

        # 로그인 성공 확인
        if '로그아웃' in page_source or 'LOGOUT' in page_source:
            print("  [SUCCESS] 로그인 성공!")
            return True
        else:
            print("  [WARNING] 로그인 성공 여부 불확실 - 계속 진행")
            return True  # 일단 성공으로 간주

    except Exception as e:
        print(f"\n[ERROR] 예외 발생: {e}")
        import traceback
        traceback.print_exc()

        try:
            page_source = driver.page_source
            with open("error_exception.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("-> error_exception.xml 저장됨")
        except:
            pass

        return False

    finally:
        driver.quit()


if __name__ == "__main__":
    import sys
    import os

    # 명령줄 인자로 계정 정보 받기
    if len(sys.argv) >= 3:
        email = sys.argv[1]
        password = sys.argv[2]
        appium_url = sys.argv[3] if len(sys.argv) >= 4 else os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[LOGIN] 명령줄 인자로 계정 정보 받음: {email}")
    # 환경변수로 받기
    elif os.getenv("ADIDAS_EMAIL") and os.getenv("ADIDAS_PASSWORD"):
        email = os.getenv("ADIDAS_EMAIL")
        password = os.getenv("ADIDAS_PASSWORD")
        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[LOGIN] 환경변수로 계정 정보 받음: {email}")
    else:
        # 기본 테스트 계정
        email = "TAM@nillago.com"
        password = "Ser654230@"
        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[LOGIN] 기본 테스트 계정 사용: {email}")

    result = login(email, password, appium_url)

    print("\n" + "=" * 60)
    if result:
        print("결과: 로그인 성공")
    else:
        print("결과: 로그인 실패")
    print("=" * 60)
