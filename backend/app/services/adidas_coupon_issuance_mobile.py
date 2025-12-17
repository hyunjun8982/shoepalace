"""
Adidas 앱 쿠폰 발급 (모바일 자동화)
"""
import time
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


def wait_for_element(driver, by, value, timeout=10, condition='presence'):
    """
    요소가 나타날 때까지 동적으로 대기

    Args:
        driver: Appium driver
        by: AppiumBy 타입 (예: AppiumBy.XPATH)
        value: 요소 식별자
        timeout: 최대 대기 시간 (초)
        condition: 대기 조건 ('presence', 'clickable', 'visible')

    Returns:
        찾은 요소 또는 None
    """
    try:
        wait = WebDriverWait(driver, timeout)
        if condition == 'clickable':
            element = wait.until(EC.element_to_be_clickable((by, value)))
        elif condition == 'visible':
            element = wait.until(EC.visibility_of_element_located((by, value)))
        else:  # presence
            element = wait.until(EC.presence_of_element_located((by, value)))
        return element
    except TimeoutException:
        return None


def wait_for_page_source_contains(driver, text, timeout=10):
    """
    페이지에 특정 텍스트가 나타날 때까지 동적으로 대기

    Args:
        driver: Appium driver
        text: 찾을 텍스트
        timeout: 최대 대기 시간 (초)

    Returns:
        True if found, False otherwise
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        if text in driver.page_source:
            return True
        time.sleep(0.3)
    return False


def _issue_coupon_core(driver, email: str, password: str, coupon_amount: str = "100000") -> dict:
    """
    Adidas 앱에서 쿠폰 발급 (코어 로직, driver는 외부에서 전달)

    Args:
        driver: Appium WebDriver 인스턴스
        email: 이메일 주소
        password: 비밀번호
        coupon_amount: 쿠폰 금액 (기본값: 100000)

    Returns:
        dict: {"success": bool, "message": str}
    """
    try:
        print("=" * 60)
        print("Adidas 쿠폰 발급")
        print("=" * 60)
        print(f"계정: {email}")
        print(f"쿠폰 금액: {coupon_amount}원\n")

        # [1단계] 앱 실행 확인
        print("[1단계] 앱 실행 확인")
        current_pkg = driver.current_package
        print(f"  현재 패키지: {current_pkg}")

        if current_pkg != "com.adidas.app":
            print("  [ERROR] 앱이 실행되지 않음")
            raise Exception("Adidas 앱이 실행되지 않았습니다. 앱을 먼저 실행해주세요.")

        print("  [OK] 앱이 실행 중")

        # [2단계] 로그인
        print("\n[2단계] 로그인 시작")

        # 로그인 화면이 나타날 때까지 대기 (최대 5초)
        if not wait_for_page_source_contains(driver, '로그인', timeout=5):
            print("  [ERROR] 로그인 화면을 찾을 수 없음")
            raise Exception("로그인 화면을 찾을 수 없습니다.")

        page_source = driver.page_source

        # 로그인 버튼 찾기
        login_button_found = False
        if '로그인하기' in page_source:
            print("  [광고 화면] 하단 '로그인하기' 버튼으로 시작")
            try:
                login_btn = driver.find_element(AppiumBy.XPATH, "//*[@text='로그인하기']")
                login_btn.click()
                print("  [OK] 광고 화면에서 로그인 시작")
                time.sleep(2)
                login_button_found = True
            except:
                pass

        # 가입 또는 로그인하기 버튼
        if not login_button_found:
            print("  [시도] '가입 또는 로그인하기' 버튼 찾기")
            for desc in ['지금 로그인하기', '가입 또는 로그인하기', 'JOIN OR LOG IN']:
                try:
                    login_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    login_btn.click()
                    print(f"  [OK] '{desc}' 버튼 클릭")
                    login_button_found = True
                    time.sleep(3)
                    break
                except:
                    pass

            if not login_button_found:
                for text in ['가입 또는 로그인하기', 'JOIN OR LOG IN', '로그인', 'LOG IN']:
                    try:
                        login_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        login_btn.click()
                        print(f"  [OK] '{text}' 버튼 클릭")
                        login_button_found = True
                        time.sleep(2)
                        break
                    except:
                        pass

        if not login_button_found:
            return {"success": False, "message": "로그인 버튼을 찾을 수 없습니다"}

        # [3단계] 이메일 입력
        print("\n[3단계] 이메일 입력")

        # 동적 대기: 이메일 입력란이 나타날 때까지 최대 10초 대기
        email_field = wait_for_element(driver, AppiumBy.XPATH,
            "//android.widget.EditText[@resource-id='login.email.input']",
            timeout=10, condition='clickable')

        # WebView 내 EditText로 찾기 (fallback)
        if not email_field:
            email_field = wait_for_element(driver, AppiumBy.XPATH,
                "(//android.webkit.WebView//android.widget.EditText)[1]",
                timeout=5, condition='clickable')

        if not email_field:
            print("  [ERROR] 이메일 입력란을 찾을 수 없음")
            raise Exception("이메일 입력란을 찾을 수 없습니다.")

        email_field.clear()
        email_field.send_keys(email)
        print(f"  [OK] 이메일 입력 완료")

        time.sleep(1)

        # [4단계] 비밀번호 입력
        print("\n[4단계] 비밀번호 입력")

        password_entered = False

        try:
            pwd_field = driver.find_element(AppiumBy.XPATH,
                "//android.widget.EditText[@resource-id='login.password.input']")
            pwd_field.clear()
            pwd_field.send_keys(password)
            print(f"  [OK] 비밀번호 입력 완료")
            password_entered = True
        except:
            pass

        if not password_entered:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH,
                    "(//android.webkit.WebView//android.widget.EditText)[2]")
                pwd_field.clear()
                pwd_field.send_keys(password)
                print(f"  [OK] 비밀번호 입력 완료 (WebView)")
                password_entered = True
            except:
                pass

        if not password_entered:
            return {"success": False, "message": "비밀번호 입력란을 찾을 수 없습니다"}

        time.sleep(1)

        # [5단계] 로그인하기 버튼 클릭
        print("\n[5단계] '로그인하기' 버튼 클릭")

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
                    print(f"  [OK] '{text}' 버튼 클릭")
                    submit_clicked = True
                    break
                except:
                    pass

        # 방법 3: Button 클래스로 찾기
        if not submit_clicked:
            try:
                buttons = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.Button")
                if len(buttons) > 0:
                    buttons[0].click()
                    print(f"  [OK] 버튼 클릭 완료 (Button class)")
                    submit_clicked = True
            except:
                pass

        if not submit_clicked:
            return {"success": False, "message": "로그인 버튼을 찾을 수 없습니다"}

        print("\n  로그인 처리 중...")
        time.sleep(5)

        # 로그인 실패 확인
        page_source = driver.page_source
        error_messages = ['잘못된 이메일/비밀번호입니다', 'Invalid email or password', '다시 시도하세요', 'Try again', '이메일 또는 비밀번호가', '입력한 정보가']

        login_failed = False
        failed_reason = ""
        for error_msg in error_messages:
            if error_msg in page_source:
                print(f"  [FAILED] 로그인 실패: {error_msg}")
                login_failed = True
                failed_reason = error_msg
                break

        if login_failed:
            # 웹뷰 닫기
            print("  웹뷰 닫기 시작...")
            try:
                # 방법 1: X 버튼 또는 닫기 버튼
                closed = False
                for desc in ['Close', 'close', '닫기', 'X']:
                    try:
                        close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        close_btn.click()
                        print(f"  [OK] 로그인 실패 후 웹뷰 닫기 (content-desc: {desc})")
                        time.sleep(2)
                        closed = True
                        break
                    except:
                        pass

                # 방법 2: ImageButton 찾기
                if not closed:
                    try:
                        image_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
                        image_btn.click()
                        print(f"  [OK] 로그인 실패 후 웹뷰 닫기 (ImageButton)")
                        time.sleep(2)
                        closed = True
                    except:
                        pass

                # 방법 3: 뒤로가기 키
                if not closed:
                    driver.press_keycode(4)
                    print(f"  [OK] 로그인 실패 후 뒤로가기")
                    time.sleep(2)

            except Exception as e:
                print(f"  [경고] 웹뷰 닫기 실패: {e}")

            print("  [종료] 로그인 실패로 프로세스 종료")
            return {"success": False, "message": f"로그인 실패: {failed_reason}"}

        print("  [OK] 로그인 성공")

        # [6단계] 사용자 관리 창 X 버튼 클릭
        print("\n[6단계] 사용자 관리 창 닫기")

        # 동적 대기: X 버튼이 나타날 때까지 대기
        x_button_clicked = False

        # 방법 1: X 버튼 찾기 (content-desc)
        for desc in ['Close', 'close', '닫기', 'X']:
            x_btn = wait_for_element(driver, AppiumBy.XPATH, f"//*[@content-desc='{desc}']",
                timeout=5, condition='clickable')
            if x_btn:
                x_btn.click()
                print(f"  [OK] X 버튼 클릭 (content-desc: {desc})")
                x_button_clicked = True
                time.sleep(1)
                break

        # 방법 2: X 버튼 찾기 (text)
        if not x_button_clicked:
            for text in ['X', '×', '✕']:
                x_btn = wait_for_element(driver, AppiumBy.XPATH, f"//*[@text='{text}']",
                    timeout=3, condition='clickable')
                if x_btn:
                    x_btn.click()
                    print(f"  [OK] X 버튼 클릭 (text: {text})")
                    x_button_clicked = True
                    time.sleep(1)
                    break

        # 방법 3: 뒤로가기 키
        if not x_button_clicked:
            try:
                driver.press_keycode(4)  # 뒤로가기
                print("  [OK] 뒤로가기 버튼으로 닫기")
                x_button_clicked = True
                time.sleep(1)
            except:
                pass

        # [7단계] 하단 메뉴에서 아디클럽 버튼 클릭
        print("\n[7단계] 하단 메뉴에서 아디클럽 클릭")
        time.sleep(3)

        adiclub_clicked = False

        # 방법 1: resource-id로 찾기
        try:
            adiclub_btn = driver.find_element(AppiumBy.XPATH,
                "//*[@resource-id='com.adidas.app:id/mainTabBarAdiClub']")
            adiclub_btn.click()
            print("  [OK] 아디클럽 버튼 클릭 (resource-id)")
            adiclub_clicked = True
            time.sleep(3)
        except:
            pass

        # 방법 2: content-desc로 찾기
        if not adiclub_clicked:
            for desc in ['아디클럽', 'adiCLUB', 'ADICLUB']:
                try:
                    adiclub_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    adiclub_btn.click()
                    print(f"  [OK] 아디클럽 버튼 클릭 (content-desc: {desc})")
                    adiclub_clicked = True
                    time.sleep(3)
                    break
                except:
                    pass

        if not adiclub_clicked:
            return {"success": False, "message": "아디클럽 버튼을 찾을 수 없습니다"}

        # adiclub 페이지 완전 로딩 확인 (툴바 + 상품권 쿠폰 받기)
        page_fully_loaded = False
        max_wait = 30
        wait_interval = 0.5

        print("  [INFO] 아디클럽 페이지 로딩 대기 중...")

        for i in range(max_wait):
            try:
                page_source = driver.page_source

                # 툴바와 "상품권 쿠폰 받기" 둘 다 있어야 완전 로딩
                has_toolbar = 'adiclub_toolbar' in page_source
                has_coupon_section = '상품권 쿠폰 받기' in page_source or '포인트 사용하기' in page_source

                if has_toolbar and has_coupon_section:
                    print(f"  [OK] 아디클럽 페이지 완전 로딩 완료 ({(i+1)*wait_interval:.1f}초)")
                    page_fully_loaded = True
                    break
                elif has_toolbar:
                    print(f"  [대기] 툴바는 보임, 쿠폰 섹션 로딩 중... ({(i+1)*wait_interval:.1f}초)")

                time.sleep(wait_interval)
            except:
                time.sleep(wait_interval)

        if not page_fully_loaded:
            return {"success": False, "message": "아디클럽 페이지 로딩 실패 (타임아웃)"}

        # 로딩 완료 후 약간의 안정화 시간
        time.sleep(1)

        # DEBUG: 초기 페이지 소스 저장
        try:
            initial_page = driver.page_source
            with open("debug_adiclub_initial.xml", "w", encoding="utf-8") as f:
                f.write(initial_page)
            print("  [DEBUG] debug_adiclub_initial.xml 저장됨")
        except Exception as e:
            print(f"  [DEBUG] 페이지 소스 저장 실패: {e}")

        # [9단계] "상품권 쿠폰 받기" 확인
        print("\n[9단계] '상품권 쿠폰 받기' 섹션 확인")
        time.sleep(2)

        # 화면 크기 가져오기
        window_size = driver.get_window_size()
        width = window_size['width']
        height = window_size['height']

        # 초기 화면에서 "상품권 쿠폰 받기" 확인
        page_source = driver.page_source

        if '상품권 쿠폰 받기' not in page_source:
            print("  [INFO] '상품권 쿠폰 받기' 텍스트가 보이지 않음, 약간 스크롤 시도")
            # 최대 3번만 세로 스크롤
            for i in range(3):
                driver.swipe(width // 2, height * 0.8, width // 2, height * 0.2, 400)
                time.sleep(0.5)
                page_source = driver.page_source
                if '상품권 쿠폰 받기' in page_source:
                    print(f"  [OK] '상품권 쿠폰 받기' 섹션 발견 (스크롤 {i+1}번)")
                    break
        else:
            print("  [OK] '상품권 쿠폰 받기' 섹션이 초기 화면에 보임")

        # DEBUG: 현재 페이지 소스 저장
        try:
            coupon_page = driver.page_source
            with open("debug_coupon_section.xml", "w", encoding="utf-8") as f:
                f.write(coupon_page)
            print("  [DEBUG] debug_coupon_section.xml 저장됨")
        except Exception as e:
            print(f"  [DEBUG] 페이지 소스 저장 실패: {e}")

        if '상품권 쿠폰 받기' not in page_source:
            return {"success": False, "message": "상품권 쿠폰 섹션을 찾을 수 없습니다"}

        # [10단계] 100,000원 쿠폰 찾기 (스크롤 없이 먼저 시도)
        print(f"\n[10단계] 100,000원 쿠폰 찾기")
        time.sleep(1)

        # 스크롤 없이 먼저 숨어있는 버튼 찾기 시도
        print("  [시도] 스크롤 없이 쿠폰 버튼 찾기")
        found_without_scroll = False

        # 방법 1: 텍스트로 찾기 (화면에 안 보여도 DOM에 있으면 찾을 수 있음)
        try:
            coupon_elem = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '100000') and contains(@text, '할인')]")
            print(f"  [OK] 스크롤 없이 10만원 쿠폰 발견 (텍스트)")
            found_without_scroll = True
        except:
            pass

        # 방법 2: resource-id로 찾기
        if not found_without_scroll:
            try:
                coupon_elem = driver.find_element(AppiumBy.XPATH, "//*[contains(@resource-id, '50219')]")
                print(f"  [OK] 스크롤 없이 10만원 쿠폰 발견 (resource-id)")
                found_without_scroll = True
            except:
                pass

        if not found_without_scroll:
            print("  [정보] 스크롤 없이 찾기 실패, 가로 스크롤 시작")
            # [10-1단계] 가로 스크롤로 100,000원 쿠폰 찾기
            print(f"\n[10-1단계] 가로 스크롤로 100,000원 쿠폰 찾기")
            time.sleep(1)

        # 쿠폰 목록의 scrollable 영역 찾기
        coupon_y = int(height * 0.85)  # 기본값: 화면 하단쪽
        try:
            # "상품권 쿠폰 받기" 텍스트 찾기
            coupon_title = driver.find_element(AppiumBy.XPATH, "//*[@text='상품권 쿠폰 받기']")
            title_y = coupon_title.location['y']
            title_height = coupon_title.size['height']
            print(f"  [발견] '상품권 쿠폰 받기' 위치: Y={title_y}, Height={title_height}")

            # 쿠폰 카드 요소(10000 또는 30000 쿠폰)를 찾아서 Y 위치 얻기
            # XML에서 보면 "₩10000 할인" 또는 "₩30000 할인" 텍스트가 쿠폰 영역 안에 있음
            try:
                first_coupon = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '₩') and contains(@text, '할인')]")
                coupon_location = first_coupon.location
                coupon_size = first_coupon.size
                coupon_y = coupon_location['y'] + coupon_size['height'] // 2
                print(f"  [OK] 첫번째 쿠폰 카드 발견 (Y: {coupon_location['y']}~{coupon_location['y']+coupon_size['height']}, 중간: {coupon_y})")
            except:
                # 쿠폰 카드를 찾지 못했으면 타이틀 아래 300px 정도로 추정
                coupon_y = title_y + title_height + 200
                print(f"  [INFO] 쿠폰 카드 위치 추정값 사용: {coupon_y}")

        except Exception as e:
            print(f"  [INFO] 상품권 쿠폰 영역 자동 감지 실패, 기본값 사용: {e}")

        # 우측으로 가로 스크롤 (최대 7번) - 스크롤 없이 찾았으면 건너뜀
        found_100k = found_without_scroll

        if not found_without_scroll:
            for swipe_count in range(7):
                try:
                    # 스크롤 전에 현재 화면 확인
                    page_source = driver.page_source

                    # ₩100000 할인 텍스트 확인 (정확한 텍스트 매칭)
                    if '₩100000' in page_source or '100000 할인' in page_source:
                        print(f"  [OK] ₩100000 할인 쿠폰 발견 (가로 스크롤 {swipe_count}번)")
                        found_100k = True
                        break

                    # 우측으로 가로 스크롤 (쿠폰 리스트 영역에서)
                    driver.swipe(
                        int(width * 0.9),      # 오른쪽 끝에서 시작
                        coupon_y,              # 쿠폰 영역 Y 좌표
                        int(width * 0.1),      # 왼쪽 끝으로 이동 (우측 스크롤)
                        coupon_y,              # 같은 Y 좌표 유지
                        500                    # 스크롤 시간
                    )
                    print(f"  [INFO] 우측으로 가로 스크롤 {swipe_count + 1}번 (Y={coupon_y})")
                    time.sleep(2)  # 스크롤 후 UI 안정화 대기 시간 증가 (1.5초 → 2초)
                except Exception as e:
                    print(f"  [오류] 가로 스크롤 {swipe_count + 1}번 중 예외: {e}")
                    break

        if not found_100k:
            print("  [WARNING] ₩100000 할인 쿠폰을 찾지 못함, 그래도 진행")
        else:
            print("  [확인] ₩100000 할인 쿠폰 찾기 완료")

        # DEBUG: 가로 스크롤 후 페이지 소스 저장
        try:
            after_swipe = driver.page_source
            with open("debug_after_horizontal_swipe.xml", "w", encoding="utf-8") as f:
                f.write(after_swipe)
            print("  [DEBUG] debug_after_horizontal_swipe.xml 저장됨")
        except:
            pass

        # [11단계] ₩100000 할인 쿠폰 버튼 클릭
        print(f"\n[11단계] ₩100000 할인 쿠폰 버튼 클릭")
        time.sleep(0.5)  # 딜레이 감소

        offer_clicked = False

        # 방법 1: "₩100000 할인" 텍스트의 부모 View 찾아서 클릭
        try:
            # ₩100000 할인 텍스트 찾기
            coupon_text = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '100000') and contains(@text, '할인')]")
            print(f"  [발견] ₩100000 할인 텍스트 발견")

            # 부모 요소 찾기 (clickable="true"인 View)
            parent_view = coupon_text.find_element(AppiumBy.XPATH, "..")

            if parent_view.get_attribute("clickable") == "true":
                parent_view.click()
                print(f"  [OK] ₩100000 할인 쿠폰 클릭 (부모 View)")
                offer_clicked = True
            else:
                # 부모의 부모 시도
                grandparent = parent_view.find_element(AppiumBy.XPATH, "..")
                if grandparent.get_attribute("clickable") == "true":
                    grandparent.click()
                    print(f"  [OK] ₩100000 할인 쿠폰 클릭 (조부모 View)")
                    offer_clicked = True

            time.sleep(2)  # 페이지 로딩 대기
        except Exception as e:
            print(f"  [시도 실패] ₩100000 할인 텍스트 방식: {e}")

        # 방법 2: resource-id 패턴으로 찾기
        if not offer_clicked:
            try:
                coupon_view = driver.find_element(AppiumBy.XPATH, "//*[contains(@resource-id, '50219')][@clickable='true']")
                coupon_view.click()
                print(f"  [OK] ₩100000 할인 쿠폰 클릭 (resource-id)")
                offer_clicked = True
                time.sleep(2)
            except Exception as e:
                print(f"  [시도 실패] resource-id 방식: {e}")

        if not offer_clicked:
            return {"success": False, "message": "₩100000 할인 쿠폰 버튼을 찾을 수 없습니다"}

        # [12단계] 쿠폰 상세 페이지 로딩 대기
        print(f"\n[12단계] 쿠폰 상세 페이지 로딩 대기")
        time.sleep(2)

        # DEBUG: 쿠폰 상세 페이지 소스 저장
        try:
            coupon_detail_page = driver.page_source
            with open("debug_coupon_detail.xml", "w", encoding="utf-8") as f:
                f.write(coupon_detail_page)
            print("  [DEBUG] debug_coupon_detail.xml 저장됨")
        except:
            pass

        print(f"  [OK] 쿠폰 상세 페이지 진입")

        # [13단계] 하단 스크롤하여 "6000 포인트로 상품권 변환하기" 버튼 찾기
        print("\n[13단계] 하단으로 스크롤하여 '상품권 변환하기' 버튼 찾기")

        # 하단으로 스크롤 (버튼이 화면 하단에 있음) - 2번으로 축소
        for i in range(2):
            driver.swipe(width // 2, height * 0.8, width // 2, height * 0.2, 400)
            time.sleep(0.3)

        print("  [OK] 하단으로 스크롤 완료")
        time.sleep(0.5)

        # DEBUG: 스크롤 후 페이지 소스 저장
        after_scroll_page = ""
        try:
            after_scroll_page = driver.page_source
            with open("debug_after_scroll.xml", "w", encoding="utf-8") as f:
                f.write(after_scroll_page)
            print("  [DEBUG] debug_after_scroll.xml 저장됨")
        except:
            pass

        # [13-1단계] 에러 케이스 확인 (스크롤 후 페이지에서)
        print("\n[13-1단계] 에러 케이스 확인 (포인트 부족, 이미 발급됨)")

        # 케이스 1: 포인트 부족
        if '포인트가 부족합니다' in after_scroll_page or '죄송합니다' in after_scroll_page:
            print("  [에러] 포인트가 부족합니다")

            # 뒤로가기
            try:
                driver.tap([(int(width * 0.07), int(height * 0.08))])
                print("  [OK] 좌측 상단 뒤로가기")
                time.sleep(2)
            except:
                driver.press_keycode(4)
                time.sleep(2)

            # 로그아웃 처리
            try:
                print("  [시도] 우측 상단 사용자 관리 버튼 클릭")
                user_clicked = False

                # 방법 1: resource-id로 찾기
                for resource_id in ['user_management', 'profile', 'account', 'profileButton']:
                    try:
                        user_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@resource-id, '{resource_id}')]")
                        user_btn.click()
                        print(f"  [OK] 사용자 관리 버튼 클릭 ({resource_id})")
                        user_clicked = True
                        time.sleep(2)
                        break
                    except:
                        pass

                # 방법 2: 우측 상단 좌표 클릭
                if not user_clicked:
                    driver.tap([(int(width * 0.9), int(height * 0.1))])
                    print("  [OK] 우측 상단 영역 클릭")
                    time.sleep(2)

                # 하단으로 스크롤하여 로그아웃 버튼 찾기
                print("  [시도] 하단으로 스크롤")
                for i in range(5):
                    driver.swipe(width // 2, int(height * 0.8), width // 2, int(height * 0.2), 400)
                    time.sleep(0.5)

                    page_source = driver.page_source
                    if '로그아웃' in page_source or 'LOGOUT' in page_source:
                        print(f"  [OK] 로그아웃 버튼 발견 (스크롤 {i+1}번)")
                        break

                # 로그아웃 버튼 클릭
                logout_success = False
                for text in ['로그아웃', 'LOGOUT', 'Log out']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        logout_btn.click()
                        print(f"  [OK] 로그아웃 완료 ({text})")
                        logout_success = True
                        time.sleep(2)
                        break
                    except:
                        pass

                # content-desc로 시도
                if not logout_success:
                    for desc in ['로그아웃', 'logout', 'LOGOUT']:
                        try:
                            logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                            logout_btn.click()
                            print(f"  [OK] 로그아웃 완료 (content-desc: {desc})")
                            logout_success = True
                            time.sleep(2)
                            break
                        except:
                            pass

                if not logout_success:
                    print("  [경고] 로그아웃 버튼을 찾지 못했지만 계속 진행")

            except Exception as e:
                print(f"  [경고] 로그아웃 처리 중 오류: {e}")

            return {
                "success": False,
                "message": f"{email} 계정 포인트 부족으로 쿠폰 발급 실패",
                "error_type": "insufficient_points"
            }

        # 케이스 2: 이미 발급됨 (교환 완료)
        if '교환 완료' in after_scroll_page:
            print("  [정보] 이미 쿠폰이 발급되었습니다")

            # 다음 발급 가능 날짜 추출 ("12월 17일" 또는 "2026년 1월 4일" 형식)
            next_available_date = None
            try:
                import re
                from datetime import datetime

                # 패턴 1: "12월 17일 (수)" 형식 (년도 없음)
                date_pattern1 = r'(\d{1,2})월\s*(\d{1,2})일'
                match = re.search(date_pattern1, after_scroll_page)
                if match:
                    month, day = match.groups()
                    # 현재 년도 사용
                    current_year = datetime.now().year
                    # 만약 현재 월보다 작으면 다음 해
                    current_month = datetime.now().month
                    if int(month) < current_month:
                        current_year += 1
                    next_available_date = f"{current_year}-{month.zfill(2)}-{day.zfill(2)}"
                    print(f"  [정보] 다음 발급 가능일: {next_available_date}")
                else:
                    # 패턴 2: "2026년 1월 4일" 형식 (년도 있음)
                    date_pattern2 = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
                    match = re.search(date_pattern2, after_scroll_page)
                    if match:
                        year, month, day = match.groups()
                        next_available_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                        print(f"  [정보] 다음 발급 가능일: {next_available_date}")
            except Exception as e:
                print(f"  [경고] 다음 발급 가능일 추출 실패: {e}")

            # 뒤로가기
            try:
                driver.tap([(int(width * 0.07), int(height * 0.08))])
                print("  [OK] 좌측 상단 뒤로가기")
                time.sleep(2)
            except:
                driver.press_keycode(4)
                time.sleep(2)

            # 로그아웃 처리 (포인트 부족과 동일한 로직)
            try:
                print("  [시도] 우측 상단 사용자 관리 버튼 클릭")
                user_clicked = False

                # 방법 1: resource-id로 찾기
                for resource_id in ['user_management', 'profile', 'account', 'profileButton']:
                    try:
                        user_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@resource-id, '{resource_id}')]")
                        user_btn.click()
                        print(f"  [OK] 사용자 관리 버튼 클릭 ({resource_id})")
                        user_clicked = True
                        time.sleep(2)
                        break
                    except:
                        pass

                # 방법 2: 우측 상단 좌표 클릭
                if not user_clicked:
                    driver.tap([(int(width * 0.9), int(height * 0.1))])
                    print("  [OK] 우측 상단 영역 클릭")
                    time.sleep(2)

                # 하단으로 스크롤하여 로그아웃 버튼 찾기
                print("  [시도] 하단으로 스크롤")
                for i in range(5):
                    driver.swipe(width // 2, int(height * 0.8), width // 2, int(height * 0.2), 400)
                    time.sleep(0.5)

                    page_source = driver.page_source
                    if '로그아웃' in page_source or 'LOGOUT' in page_source:
                        print(f"  [OK] 로그아웃 버튼 발견 (스크롤 {i+1}번)")
                        break

                # 로그아웃 버튼 클릭
                logout_success = False
                for text in ['로그아웃', 'LOGOUT', 'Log out']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        logout_btn.click()
                        print(f"  [OK] 로그아웃 완료 ({text})")
                        logout_success = True
                        time.sleep(2)
                        break
                    except:
                        pass

                # content-desc로 시도
                if not logout_success:
                    for desc in ['로그아웃', 'logout', 'LOGOUT']:
                        try:
                            logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                            logout_btn.click()
                            print(f"  [OK] 로그아웃 완료 (content-desc: {desc})")
                            logout_success = True
                            time.sleep(2)
                            break
                        except:
                            pass

                if not logout_success:
                    print("  [경고] 로그아웃 버튼을 찾지 못했지만 계속 진행")

            except Exception as e:
                print(f"  [경고] 로그아웃 처리 중 오류: {e}")

            return {
                "success": False,
                "message": f"{email} 계정 이미 쿠폰 발급됨",
                "error_type": "already_issued",
                "next_available_date": next_available_date
            }

        # [14단계] "6000 포인트로 상품권 변환하기" 버튼 클릭
        print("\n[14단계] '6000 포인트로 상품권 변환하기' 버튼 클릭")

        exchange_clicked = False

        # 방법 1: resource-id로 직접 찾기
        try:
            exchange_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='voucher_offer_buy_button']")
            exchange_btn.click()
            print(f"  [OK] '상품권 변환하기' 버튼 클릭 (voucher_offer_buy_button)")
            exchange_clicked = True
            time.sleep(2)
        except Exception as e:
            print(f"  [시도 실패] voucher_offer_buy_button: {e}")

        # 방법 2: 6000 포함된 텍스트로 찾기
        if not exchange_clicked:
            try:
                exchange_btn = driver.find_element(AppiumBy.XPATH, "//*[contains(@text, '6000') and contains(@text, '변환')]")
                exchange_btn.click()
                print(f"  [OK] '6000 포인트로 상품권 변환하기' 버튼 클릭")
                exchange_clicked = True
                time.sleep(2)
            except Exception as e:
                print(f"  [시도 실패] 6000 포함 텍스트: {e}")

        # 방법 3: 일반 "상품권 변환하기" 텍스트
        if not exchange_clicked:
            for text in ['상품권 변환하기', '변환하기', '교환하기', '상품권으로 변환하기']:
                try:
                    exchange_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{text}')]")
                    exchange_btn.click()
                    print(f"  [OK] '{text}' 버튼 클릭")
                    exchange_clicked = True
                    time.sleep(2)
                    break
                except:
                    pass

        # 방법 4: clickable Button 전체 탐색
        if not exchange_clicked:
            try:
                buttons = driver.find_elements(AppiumBy.XPATH, "//android.widget.Button[@clickable='true'] | //android.view.View[@clickable='true']")
                print(f"  [발견] {len(buttons)}개의 클릭 가능한 버튼")
                # 화면 하단에 있는 버튼 찾기
                for btn in buttons:
                    btn_y = btn.location['y']
                    if btn_y > height * 0.7:  # 화면 하단 30%
                        btn.click()
                        print(f"  [OK] 하단 버튼 클릭 (Y={btn_y})")
                        exchange_clicked = True
                        time.sleep(2)
                        break
            except Exception as e:
                print(f"  [시도 실패] 하단 버튼 탐색: {e}")

        if not exchange_clicked:
            return {"success": False, "message": "상품권 변환하기 버튼을 찾을 수 없습니다"}

        # [15단계] "상품권 변환 확정하기" 버튼 클릭
        print("\n[15단계] '상품권 변환 확정하기' 버튼 클릭")
        time.sleep(2)

        # DEBUG: 확정 페이지 소스 저장
        try:
            confirm_page = driver.page_source
            with open("debug_confirm_page.xml", "w", encoding="utf-8") as f:
                f.write(confirm_page)
            print("  [DEBUG] debug_confirm_page.xml 저장됨")
        except:
            pass

        confirm_clicked = False

        # 방법 1: resource-id로 직접 찾기
        try:
            confirm_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='redemption_points_confirmation_confirm_button']")
            confirm_btn.click()
            print(f"  [OK] '상품권 변환 확정하기' 버튼 클릭 (redemption_points_confirmation_confirm_button)")
            confirm_clicked = True
            time.sleep(3)  # 쿠폰 페이지 로딩 대기
        except Exception as e:
            print(f"  [시도 실패] redemption_points_confirmation_confirm_button: {e}")

        # 방법 2: 텍스트로 찾기
        if not confirm_clicked:
            for text in ['상품권 변환 확정하기', '상품권 교환 확정하기', '변환 확정하기', '교환 확정하기', '확정하기', '확인']:
                try:
                    confirm_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{text}')]")
                    confirm_btn.click()
                    print(f"  [OK] '{text}' 버튼 클릭")
                    confirm_clicked = True
                    time.sleep(2)
                    break
                except:
                    pass

        # 방법 3: 화면 하단의 clickable 버튼 찾기
        if not confirm_clicked:
            try:
                buttons = driver.find_elements(AppiumBy.XPATH, "//android.widget.Button[@clickable='true'] | //android.view.View[@clickable='true']")
                print(f"  [발견] {len(buttons)}개의 클릭 가능한 버튼")
                for btn in buttons:
                    btn_y = btn.location['y']
                    if btn_y > height * 0.7:
                        btn.click()
                        print(f"  [OK] 하단 버튼 클릭 (Y={btn_y})")
                        confirm_clicked = True
                        time.sleep(2)
                        break
            except Exception as e:
                print(f"  [시도 실패] 하단 버튼 탐색: {e}")

        if not confirm_clicked:
            return {"success": False, "message": "상품권 변환 확정하기 버튼을 찾을 수 없습니다"}

        print("  [OK] 쿠폰 발급 완료")

        # DEBUG: 쿠폰 페이지 소스 저장
        complete_page = ""
        try:
            complete_page = driver.page_source
            with open("debug_complete_page.xml", "w", encoding="utf-8") as f:
                f.write(complete_page)
            print("  [DEBUG] debug_complete_page.xml 저장됨")
        except Exception as e:
            print(f"  [DEBUG] 페이지 소스 저장 실패: {e}")

        # [15-1단계] 에러 케이스 확인
        print("\n[15-1단계] 쿠폰 발급 결과 확인")

        is_error = False
        error_result = None

        # 케이스 1: 포인트 부족
        if '포인트가 부족합니다' in complete_page or '죄송합니다' in complete_page:
            print("  [에러] 포인트가 부족합니다")
            is_error = True
            error_result = {
                "success": False,
                "message": f"{email} 계정 포인트 부족으로 쿠폰 발급 실패",
                "error_type": "insufficient_points"
            }

        # 케이스 2: 이미 발급됨 (교환 완료)
        elif '교환 완료' in complete_page:
            print("  [정보] 이미 쿠폰이 발급되었습니다")

            # 다음 발급 가능 날짜 추출 ("12월 17일" 또는 "2026년 1월 4일" 형식)
            next_available_date = None
            try:
                import re
                from datetime import datetime

                # 패턴 1: "12월 17일 (수)" 형식 (년도 없음)
                date_pattern1 = r'(\d{1,2})월\s*(\d{1,2})일'
                match = re.search(date_pattern1, complete_page)
                if match:
                    month, day = match.groups()
                    # 현재 년도 사용
                    current_year = datetime.now().year
                    # 만약 현재 월보다 작으면 다음 해
                    current_month = datetime.now().month
                    if int(month) < current_month:
                        current_year += 1
                    next_available_date = f"{current_year}-{month.zfill(2)}-{day.zfill(2)}"
                    print(f"  [정보] 다음 발급 가능일: {next_available_date}")
                else:
                    # 패턴 2: "2026년 1월 4일" 형식 (년도 있음)
                    date_pattern2 = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
                    match = re.search(date_pattern2, complete_page)
                    if match:
                        year, month, day = match.groups()
                        next_available_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                        print(f"  [정보] 다음 발급 가능일: {next_available_date}")
            except Exception as e:
                print(f"  [경고] 다음 발급 가능일 추출 실패: {e}")

            is_error = True
            error_result = {
                "success": False,
                "message": f"{email} 계정 이미 쿠폰 발급됨",
                "error_type": "already_issued",
                "next_available_date": next_available_date
            }

        # 에러 케이스인 경우 로그아웃 후 반환
        if is_error:
            print("\n[에러 케이스] 뒤로가기 후 로그아웃 처리")

            # 좌측 상단 뒤로가기 (앱 바의 백 버튼 - 화면 좌측 상단)
            back_clicked = False

            # 방법 1: 좌측 상단 영역 직접 클릭 (가장 확실한 방법)
            try:
                # 화면 좌측 상단 (x: 7%, y: 8%) - 뒤로가기 버튼 위치
                driver.tap([(int(width * 0.07), int(height * 0.08))])
                print("  [OK] 좌측 상단 뒤로가기 영역 클릭")
                back_clicked = True
                time.sleep(2)
            except Exception as e:
                print(f"  [시도 실패] 좌측 상단 클릭: {e}")

            # 방법 2: app_bar_back_button resource-id
            if not back_clicked:
                try:
                    back_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='app_bar_back_button']")
                    back_btn.click()
                    print("  [OK] 뒤로가기 버튼 클릭 (app_bar_back_button)")
                    back_clicked = True
                    time.sleep(2)
                except Exception as e:
                    print(f"  [시도 실패] app_bar_back_button: {e}")

            # 방법 3: content-desc로 찾기
            if not back_clicked:
                try:
                    back_btn = driver.find_element(AppiumBy.XPATH, "//*[@content-desc='Back.' or @content-desc='뒤로']")
                    back_btn.click()
                    print("  [OK] 뒤로가기 버튼 클릭 (content-desc)")
                    back_clicked = True
                    time.sleep(2)
                except Exception as e:
                    print(f"  [시도 실패] content-desc: {e}")

            # 방법 4: 뒤로가기 키 (마지막 수단)
            if not back_clicked:
                driver.press_keycode(4)
                print("  [OK] 뒤로가기 키 사용")
                time.sleep(2)

            # 로그아웃 처리
            try:
                # 우측 상단 사용자 관리 버튼 클릭
                user_management_clicked = False
                for resource_id in ['user_management', 'profile', 'account', 'profileButton']:
                    try:
                        user_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@resource-id, '{resource_id}')]")
                        user_btn.click()
                        print(f"  [OK] 사용자 관리 버튼 클릭")
                        user_management_clicked = True
                        time.sleep(2)
                        break
                    except:
                        pass

                if not user_management_clicked:
                    # 화면 우측 상단 클릭
                    driver.tap([(int(width * 0.9), int(height * 0.1))])
                    time.sleep(2)

                # 로그아웃 버튼 찾기 및 클릭
                for text in ['로그아웃', 'LOGOUT', 'Log out']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        logout_btn.click()
                        print(f"  [OK] 로그아웃 완료")
                        time.sleep(2)
                        break
                    except:
                        pass
            except Exception as e:
                print(f"  [경고] 로그아웃 실패: {e}")

            return error_result

        # 정상 발급 완료
        print("  [성공] 쿠폰 발급 성공!")

        # [16단계] 좌측 상단 뒤로가기 버튼 클릭
        print("\n[16단계] 좌측 상단 뒤로가기 버튼 클릭")
        try:
            back_btn = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='app_bar_back_button']")
            back_btn.click()
            print("  [OK] 뒤로가기 버튼 클릭 (app_bar_back_button)")
            time.sleep(2)
        except Exception as e:
            print(f"  [시도 실패] app_bar_back_button: {e}")
            # 뒤로가기 키 사용
            try:
                driver.press_keycode(4)
                print("  [OK] 뒤로가기 키 사용")
                time.sleep(2)
            except:
                pass


        # [17단계] 우측 상단 사용자 관리 버튼 클릭 후 로그아웃
        print("\n[17단계] 우측 상단 사용자 관리 버튼 클릭 후 로그아웃")
        logout_success = False

        # 최대 3번 재시도
        for retry in range(3):
            if logout_success:
                break

            print(f"\n  [시도 {retry + 1}/3] 로그아웃 프로세스 시작")

            try:
                # 현재 화면 상태 확인
                page_source = driver.page_source

                # 만약 로그아웃 버튼이 이미 보이면 바로 클릭
                if '로그아웃' in page_source or 'LOGOUT' in page_source:
                    print("  [INFO] 로그아웃 버튼이 이미 화면에 있음")
                else:
                    # 사용자 관리 버튼 찾기
                    user_management_clicked = False

                    # 방법 1: resource-id로 찾기
                    for resource_id in ['user_management', 'profile', 'account', 'profileButton', 'user', 'my_profile']:
                        try:
                            user_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@resource-id, '{resource_id}')]")
                            user_btn.click()
                            print(f"  [OK] 사용자 관리 버튼 클릭 (resource-id: {resource_id})")
                            user_management_clicked = True
                            time.sleep(2)
                            break
                        except:
                            pass

                    # 방법 2: text로 찾기
                    if not user_management_clicked:
                        for text in ['프로필', 'Profile', '내 정보', 'My Profile']:
                            try:
                                user_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                                user_btn.click()
                                print(f"  [OK] 사용자 관리 버튼 클릭 (text: {text})")
                                user_management_clicked = True
                                time.sleep(2)
                                break
                            except:
                                pass

                    # 방법 3: 우측 상단 여러 좌표 시도
                    if not user_management_clicked:
                        print("  [시도] 우측 상단 여러 좌표 클릭")
                        for x_ratio in [0.95, 0.9, 0.85]:
                            for y_ratio in [0.08, 0.1, 0.12]:
                                try:
                                    driver.tap([(int(width * x_ratio), int(height * y_ratio))])
                                    print(f"  [시도] 좌표 클릭: ({x_ratio}, {y_ratio})")
                                    time.sleep(2)

                                    # 클릭 후 페이지 확인
                                    page_source = driver.page_source
                                    if '로그아웃' in page_source or 'LOGOUT' in page_source or '프로필' in page_source:
                                        print(f"  [OK] 좌표 클릭 성공: ({x_ratio}, {y_ratio})")
                                        user_management_clicked = True
                                        break
                                except:
                                    pass
                            if user_management_clicked:
                                break

                    if not user_management_clicked:
                        print("  [경고] 사용자 관리 버튼을 찾을 수 없음, 재시도")
                        # 뒤로가기 후 재시도
                        driver.press_keycode(4)
                        time.sleep(2)
                        continue

                # 하단으로 스크롤하여 로그아웃 버튼 찾기
                print("  [시도] 하단으로 스크롤")
                for i in range(7):
                    driver.swipe(
                        width // 2,
                        int(height * 0.8),
                        width // 2,
                        int(height * 0.2),
                        400
                    )
                    time.sleep(0.5)

                    page_source = driver.page_source
                    if '로그아웃' in page_source or 'LOGOUT' in page_source:
                        print(f"  [OK] 로그아웃 버튼 발견 (스크롤 {i+1}번)")
                        break

                # 로그아웃 버튼 클릭 시도
                for text in ['로그아웃', 'LOGOUT', 'Log out', 'Logout']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        logout_btn.click()
                        print(f"  [OK] 로그아웃 버튼 클릭 (text: '{text}')")
                        logout_success = True
                        time.sleep(2)
                        break
                    except:
                        pass

                if not logout_success:
                    for desc in ['로그아웃', 'logout', 'LOGOUT', 'Logout']:
                        try:
                            logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                            logout_btn.click()
                            print(f"  [OK] 로그아웃 버튼 클릭 (content-desc: '{desc}')")
                            logout_success = True
                            time.sleep(2)
                            break
                        except:
                            pass

            except Exception as e:
                print(f"  [경고] 시도 {retry + 1} 실패: {e}")
                if retry < 2:  # 마지막 시도가 아니면
                    # 뒤로가기로 초기 화면으로 돌아가기
                    try:
                        driver.press_keycode(4)
                        time.sleep(2)
                    except:
                        pass

        # 로그아웃 실패 시 에러
        if not logout_success:
            raise Exception("로그아웃 버튼을 찾을 수 없습니다. 3번 재시도했지만 실패했습니다.")

        print("\n" + "=" * 60)
        print(f"결과: {coupon_amount}원 쿠폰 발급 성공")
        print("=" * 60)

        return {"success": True, "message": f"{coupon_amount}원 쿠폰이 발급되었습니다", "deduct_points": True}

    except Exception as e:
        print(f"\n[ERROR] 예외 발생: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"쿠폰 발급 실패: {str(e)}"}


def issue_coupon_mobile(email: str, password: str, coupon_amount: str = "100000", appium_url: str = "http://127.0.0.1:4723") -> dict:
    """
    Adidas 앱에서 쿠폰 발급 (단일 계정용 - driver 생성/종료 포함)

    Args:
        email: 이메일 주소
        password: 비밀번호
        coupon_amount: 쿠폰 금액 (기본값: 100000)
        appium_url: Appium 서버 URL

    Returns:
        dict: {"success": bool, "message": str}

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
    options.set_capability('chromedriverExecutable', '')
    options.set_capability('recreateChromeDriverSessions', True)
    options.set_capability('nativeWebScreenshot', True)
    options.set_capability('autoWebview', False)

    try:
        driver = webdriver.Remote(appium_url, options=options)
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise ConnectionError("모바일 기기 연결이 되지 않았습니다")
        else:
            raise

    try:
        return _issue_coupon_core(driver, email, password, coupon_amount)
    finally:
        try:
            driver.quit()
        except:
            pass


def issue_coupon_mobile_bulk(account_list: list, appium_url: str = "http://127.0.0.1:4723", on_each_complete=None) -> list:
    """
    Adidas 앱에서 여러 계정 쿠폰 발급 (단일 driver 세션 재사용)

    Args:
        account_list: 계정 정보 리스트 [{"id": int, "email": str, "password": str, "coupon_amount": str}, ...]
        appium_url: Appium 서버 URL
        on_each_complete: 각 계정 처리 완료 시 호출될 콜백 함수 (account_id, email, result)

    Returns:
        list: 각 계정별 결과 [{"email": str, "result": dict}, ...]

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
    options.set_capability('chromedriverExecutable', '')
    options.set_capability('recreateChromeDriverSessions', True)
    options.set_capability('nativeWebScreenshot', True)
    options.set_capability('autoWebview', False)

    try:
        driver = webdriver.Remote(appium_url, options=options)
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise ConnectionError("모바일 기기 연결이 되지 않았습니다")
        else:
            raise

    results = []
    try:
        for idx, account_data in enumerate(account_list, 1):
            account_id = account_data.get("id")
            email = account_data.get("email")
            password = account_data.get("password")
            coupon_amount = account_data.get("coupon_amount", "100000")

            print(f"\n{'=' * 60}")
            print(f"[벌크 쿠폰발급] {idx}/{len(account_list)} 처리 중")
            print(f"{'=' * 60}")

            try:
                result = _issue_coupon_core(driver, email, password, coupon_amount)
                results.append({"email": email, "result": result})

                # 각 계정 처리 완료 시 콜백 호출 (DB 즉시 업데이트용)
                if on_each_complete:
                    on_each_complete(account_id, email, result, idx, len(account_list))

            except Exception as e:
                print(f"[벌크 쿠폰발급] {email} 처리 실패: {e}")
                error_result = {"success": False, "message": f"처리 실패: {str(e)}"}
                results.append({"email": email, "result": error_result})

                # 실패 시에도 콜백 호출
                if on_each_complete:
                    on_each_complete(account_id, email, error_result, idx, len(account_list))

        return results

    finally:
        try:
            driver.quit()
        except:
            pass


if __name__ == "__main__":
    import sys
    import os

    # 명령줄 인자로 계정 정보 받기
    if len(sys.argv) >= 3:
        email = sys.argv[1]
        password = sys.argv[2]
        amount = sys.argv[3] if len(sys.argv) >= 4 else "100000"
        appium_url = sys.argv[4] if len(sys.argv) >= 5 else os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
    else:
        email = "test@example.com"
        password = "password"
        amount = "100000"
        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")

    result = issue_coupon_mobile(email, password, amount, appium_url)
    print(f"\n최종 결과: {result}")
