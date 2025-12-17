"""Adidas 로그인 + 정보 추출 통합 스크립트"""
import time
import re
import json
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy


def login_and_extract(email: str, password: str, appium_url: str = "http://127.0.0.1:4723", debug: bool = False):
    """
    Adidas 로그인 + 사용자 정보 및 쿠폰 추출 통합

    Returns:
        dict: {
            "name": str,
            "birthday": str,
            "phone": str,
            "adikr_barcode": str,
            "points": int,
            "owned_vouchers": str (JSON)
        }
    """

    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "emulator-5554"
    options.app_package = "com.adidas.app"
    options.app_activity = ".MainActivity"
    options.automation_name = "UiAutomator2"
    options.no_reset = True

    driver = webdriver.Remote(appium_url, options=options)

    try:
        start_time = time.time()
        print("=" * 60)
        print("Adidas 로그인 + 정보 추출")
        print("=" * 60)
        print(f"계정: {email}\n")

        # ==================== 로그인 시작 ====================
        print("[1단계] 앱 실행 확인")
        current_pkg = driver.current_package

        if current_pkg != "com.adidas.app":
            print("  앱 실행 중...")
            driver.activate_app("com.adidas.app")
            time.sleep(5)  # 앱 시작 후 로딩 대기
            print("  [OK] 앱 실행 완료")
        else:
            print("  [OK] 앱 이미 실행 중")

        # 로그인 화면 확인
        print("\n[2단계] 로그인 화면 확인")
        page_source = driver.page_source

        # 이미 로그인 화면 (이메일 주소 필드가 있음)
        if '이메일 주소' in page_source or 'login.email.input' in page_source:
            print("  [OK] 이미 로그인 화면입니다")
        else:
            # 광고 화면 처리 필요
            print("  [시도] 광고 화면 처리")
            login_started = False

            # 방법 1: 광고 화면에서 바로 로그인
            if '로그인하기' in page_source:
                try:
                    login_btn = driver.find_element(AppiumBy.XPATH, "//*[@text='로그인하기']")
                    login_btn.click()
                    print("  [OK] 광고에서 로그인 시작")
                    time.sleep(3)
                    login_started = True
                except:
                    pass

            # 방법 2: 광고 닫고 로그인 버튼 찾기
            if not login_started:
                for desc in ['Close', 'close', '닫기', 'Dismiss']:
                    try:
                        close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        close_btn.click()
                        time.sleep(2)
                        print(f"  [OK] 광고 닫기 (content-desc: {desc})")
                        break
                    except:
                        continue

                time.sleep(3)
                for desc in ['지금 로그인하기', '가입 또는 로그인하기']:
                    try:
                        login_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        login_btn.click()
                        print(f"  [OK] '{desc}' 클릭")
                        time.sleep(3)
                        login_started = True
                        break
                    except:
                        continue

            if not login_started and '이메일 주소' not in page_source:
                print("  [ERROR] 로그인 화면 진입 실패")
                if debug:
                    with open("debug_login_screen.xml", "w", encoding="utf-8") as f:
                        f.write(page_source)
                print("  [DEBUG] debug_login_screen.xml 저장됨")
                return None

        # 이메일 입력 (웹뷰 로딩 대기)
        print("\n[3단계] 이메일 입력")
        time.sleep(2)  # 웹뷰 로딩 대기

        email_entered = False

        # 방법 1: resource-id로 찾기
        try:
            email_field = driver.find_element(AppiumBy.XPATH, "//android.widget.EditText[@resource-id='login.email.input']")
            email_field.clear()
            email_field.send_keys(email)
            print("  [OK] 이메일 입력 완료 (resource-id)")
            email_entered = True
        except:
            pass

        # 방법 2: 첫 번째 EditText
        if not email_entered:
            try:
                email_field = driver.find_element(AppiumBy.XPATH, "(//android.widget.EditText)[1]")
                email_field.clear()
                email_field.send_keys(email)
                print("  [OK] 이메일 입력 완료 (첫번째 EditText)")
                email_entered = True
            except:
                pass

        # 방법 3: class name으로 찾기
        if not email_entered:
            try:
                edit_fields = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
                if len(edit_fields) > 0:
                    edit_fields[0].clear()
                    edit_fields[0].send_keys(email)
                    print("  [OK] 이메일 입력 완료 (class name)")
                    email_entered = True
            except:
                pass

        if not email_entered:
            print("  [ERROR] 이메일 필드를 찾을 수 없습니다")
            return None

        time.sleep(1)

        # 비밀번호 입력
        print("\n[4단계] 비밀번호 입력")

        try:
            pwd_field = driver.find_element(AppiumBy.XPATH, "//android.widget.EditText[@resource-id='login.password.input']")
            pwd_field.clear()
            pwd_field.send_keys(password)
            print("  [OK] 비밀번호 입력 완료")
        except:
            try:
                pwd_field = driver.find_element(AppiumBy.XPATH, "(//android.widget.EditText)[2]")
                pwd_field.clear()
                pwd_field.send_keys(password)
                print("  [OK] 비밀번호 입력 완료 (두번째 EditText)")
            except Exception as e:
                print(f"  [ERROR] 비밀번호 입력 실패: {e}")
                return None

        time.sleep(1)

        # 로그인 버튼 클릭
        print("\n[5단계] 로그인 버튼 클릭")

        try:
            submit_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.Button[@resource-id='login-submit-button']")
            submit_btn.click()
            print("  [OK] 로그인 버튼 클릭")
        except:
            try:
                submit_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.Button[@text='로그인하기']")
                submit_btn.click()
                print("  [OK] 로그인 버튼 클릭 (텍스트)")
            except Exception as e:
                print(f"  [ERROR] 로그인 버튼 클릭 실패: {e}")
                return None

        # 로그인 처리 대기
        print("\n로그인 처리 중...")
        time.sleep(5)

        # 로그인 실패 확인
        time.sleep(3)
        page_source = driver.page_source

        # 디버그: 로그인 후 페이지 저장
        if debug:
            with open("debug_login_result.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  [DEBUG] debug_login_result.xml 저장됨")

        error_messages = ['잘못된 이메일/비밀번호입니다', 'Invalid email or password', '다시 시도하세요', 'Try again', '이메일 또는 비밀번호가', '입력한 정보가']
        login_failed = False
        for error_msg in error_messages:
            if error_msg in page_source:
                print(f"  [FAILED] 로그인 실패: {error_msg}")
                login_failed = True
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
            return None

        print("  [OK] 로그인 성공!\n")

        # ==================== 정보 추출 시작 ====================
        print("[6단계] 로그인 후 drawer 닫기")
        time.sleep(2)

        # drawer 닫기 (X 버튼 또는 뒤로가기)
        drawer_closed = False
        for desc in ['Close', 'close', '닫기', 'Navigate up']:
            try:
                close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                close_btn.click()
                print(f"  [OK] drawer 닫기 (content-desc: {desc})")
                drawer_closed = True
                time.sleep(1.5)
                break
            except:
                continue

        if not drawer_closed:
            try:
                driver.back()
                print("  [OK] drawer 닫기 (뒤로가기)")
                time.sleep(1.5)
            except:
                print("  [WARNING] drawer 닫기 실패")

        # 하단 adiclub 버튼 클릭
        print("\n[7단계] adiclub 메뉴 클릭")
        time.sleep(2)

        adiclub_clicked = False
        for desc in ['아디클럽', 'adiclub', 'Adiclub']:
            try:
                adiclub_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                adiclub_btn.click()
                print(f"  [OK] adiclub 클릭 (content-desc: {desc})")
                adiclub_clicked = True
                time.sleep(3)
                break
            except:
                continue

        if not adiclub_clicked:
            print("  [WARNING] adiclub 버튼 찾기 실패")

        # ==================== 사용자 정보 추출 ====================
        result = {
            "name": None,
            "birthday": None,
            "phone": None,
            "adikr_barcode": None,
            "points": None,
            "owned_vouchers": None
        }

        print("\n[8단계] 사용자 정보 추출")
        time.sleep(2)

        page_source = driver.page_source

        # 포인트 추출
        points_match = re.search(r'content-desc="(\d+) 포인트"', page_source) or \
                      re.search(r'content-desc="(\d{1,3}(?:,\d{3})*) 포인트"', page_source)

        if points_match:
            points_str = points_match.group(1).replace(',', '')
            result['points'] = int(points_str)
            print(f"  [OK] 포인트: {result['points']}")

        # ADIKR 바코드 추출
        barcode_match = re.search(r'content-desc="바코드 번호: ([A-Z0-9]+)"', page_source) or \
                       re.search(r'barcode_number[^>]*>([A-Z0-9]{10,})<', page_source)

        if barcode_match:
            result['adikr_barcode'] = barcode_match.group(1)
            print(f"  [OK] ADIKR 바코드: {result['adikr_barcode']}")

        # 프로필 설정 버튼 클릭 (이름, 생일, 전화번호 추출용)
        print("\n[9단계] 프로필 설정 진입")

        try:
            # 설정 또는 프로필 버튼 찾기
            for text in ['설정', '프로필 설정', 'Profile']:
                try:
                    settings_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                    settings_btn.click()
                    print(f"  [OK] '{text}' 클릭")
                    time.sleep(3)
                    break
                except:
                    continue

            page_source = driver.page_source

            # 이름 추출
            name_match = re.search(r'이름["\s]+.*?value="([^"]+)"', page_source) or \
                        re.search(r'성명["\s]+.*?text="([^"]+)"', page_source)

            if name_match:
                result['name'] = name_match.group(1)
                print(f"  [OK] 이름: {result['name']}")

            # 생일 추출
            birthday_match = re.search(r'생년월일["\s]+.*?(\d{4}-\d{2}-\d{2})', page_source) or \
                            re.search(r'(\d{4}\.\d{2}\.\d{2})', page_source)

            if birthday_match:
                birthday = birthday_match.group(1).replace('.', '-')
                result['birthday'] = birthday
                print(f"  [OK] 생일: {result['birthday']}")

            # 전화번호 추출
            phone_match = re.search(r'전화["\s]+.*?(\d{3}-\d{3,4}-\d{4})', page_source) or \
                         re.search(r'(\d{3}-\d{3,4}-\d{4})', page_source)

            if phone_match:
                result['phone'] = phone_match.group(1)
                print(f"  [OK] 전화번호: {result['phone']}")

            # 뒤로가기
            driver.back()
            time.sleep(2)

        except Exception as e:
            print(f"  [WARNING] 프로필 정보 추출 실패: {e}")

        # ==================== 쿠폰 추출 ====================
        print("\n[10단계] 쿠폰 정보 추출")

        try:
            # 쿠폰/혜택 메뉴 찾기
            for text in ['쿠폰', '포인트 & 리워드', 'Rewards']:
                try:
                    coupon_btn = driver.find_element(AppiumBy.XPATH, f"//*[contains(@text, '{text}') or contains(@content-desc, '{text}')]")
                    coupon_btn.click()
                    print(f"  [OK] '{text}' 메뉴 클릭")
                    time.sleep(3)
                    break
                except:
                    continue

            page_source = driver.page_source

            if debug:
                with open("debug_coupons.xml", "w", encoding="utf-8") as f:
                    f.write(page_source)
                print("  [DEBUG] debug_coupons.xml 저장됨")

            # 쿠폰 정보 파싱 (content-desc에서 추출)
            vouchers = []

            # 패턴: content-desc="\d+ adidas 할인: ₩100000" 또는 "1 adidas 할인: 15%"
            # 예: "0 adidas 할인: ₩100000", "1 adidas 할인: 15%"
            voucher_pattern = r'content-desc="(\d+)\s+adidas\s+할인:\s+([^"]+)"'
            matches = re.findall(voucher_pattern, page_source)

            for serial, discount in matches:
                # ₩100000 형태 또는 15% 형태
                if '₩' in discount:
                    # 금액 쿠폰: ₩100000 -> 100,000원 할인
                    amount = discount.replace('₩', '').strip()
                    # 3자리마다 콤마 추가
                    amount_int = int(amount)
                    desc = f"{amount_int:,}원 할인"
                elif '%' in discount:
                    # 퍼센트 쿠폰: 15% -> 15% 할인
                    desc = f"{discount.strip()} 할인"
                else:
                    desc = f"{discount.strip()} 할인"

                vouchers.append({
                    "description": desc,
                    "valid_until": "N/A"  # 유효기간 정보가 content-desc에 없음
                })

            if vouchers:
                result['owned_vouchers'] = json.dumps(vouchers, ensure_ascii=False)
                print(f"  [OK] 쿠폰 {len(vouchers)}개 발견")
                for i, v in enumerate(vouchers, 1):
                    print(f"    {i}. {v['description']}")
            else:
                result['owned_vouchers'] = json.dumps([], ensure_ascii=False)
                print("  [INFO] 보유 쿠폰 없음")

        except Exception as e:
            print(f"  [WARNING] 쿠폰 추출 실패: {e}")
            result['owned_vouchers'] = json.dumps([], ensure_ascii=False)

        # ==================== 완료 ====================
        elapsed_time = time.time() - start_time

        print("\n" + "=" * 60)
        print("작업 완료")
        print("=" * 60)
        print(f"이메일: {email}")
        print(f"이름: {result['name']}")
        print(f"생년월일: {result['birthday']}")
        print(f"전화번호: {result['phone']}")
        print(f"포인트: {result['points']}")
        print(f"ADIKR 바코드: {result['adikr_barcode']}")

        if result['owned_vouchers']:
            vouchers = json.loads(result['owned_vouchers'])
            print(f"보유 쿠폰: {len(vouchers)}개")
        else:
            print("보유 쿠폰: 0개")

        print(f"소요 시간: {elapsed_time:.1f}초")
        print("=" * 60)

        return result

    except Exception as e:
        print(f"\n[ERROR] 예외 발생: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        driver.quit()


if __name__ == "__main__":
    import sys
    import os

    if len(sys.argv) >= 3:
        email = sys.argv[1]
        password = sys.argv[2]
        appium_url = sys.argv[3] if len(sys.argv) >= 4 else "http://127.0.0.1:4723"
    else:
        email = "zkxf539c4@nillago.com"
        password = "Dlffo12!@"
        appium_url = "http://127.0.0.1:4723"

    result = login_and_extract(email, password, appium_url, debug=True)

    if result:
        print("\n[SUCCESS]")
    else:
        print("\n[FAILED]")
