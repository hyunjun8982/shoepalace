"""Adidas 사용자 정보 및 쿠폰 추출 - 최종 버전 V3 (올바른 순서)"""
import time
import re
import json
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy

# 로그인 함수는 별도로 호출되므로 import 불필요
# from app.services.adidas_automation_login import login


def close_ad_popup(driver):
    """광고 팝업이 있으면 닫기 (우측 상단 X 버튼 - resource-id로 찾기)"""
    try:
        page_source = driver.page_source
        if '로그인하기' in page_source or '무료 가입하기' in page_source:
            # X 버튼을 resource-id나 content-desc로 찾기
            closed = False
            for desc in ['Close', 'close', '닫기', 'Dismiss', 'dismiss']:
                try:
                    close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                    close_btn.click()
                    time.sleep(0.5)
                    print(f"  [광고 팝업 닫기] (content-desc: {desc})")
                    closed = True
                    break
                except:
                    continue

            if not closed:
                # ImageButton으로 찾기
                try:
                    close_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
                    close_btn.click()
                    time.sleep(0.5)
                    print("  [광고 팝업 닫기] (ImageButton)")
                    closed = True
                except:
                    pass

            return closed
        return False
    except:
        return False


def extract_user_info_and_vouchers(email: str, password: str, appium_url: str = "http://127.0.0.1:4723", debug: bool = False):
    """Adidas 사용자 정보 및 쿠폰 추출"""

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
        print("Adidas 사용자 정보 및 쿠폰 추출")
        print("=" * 60)
        print(f"계정: {email}\n")

        time.sleep(3)
        close_ad_popup(driver)

        # [1단계] 앱 실행 확인
        print("[1단계] 앱 실행 확인")
        current_pkg = driver.current_package

        if current_pkg != "com.adidas.app":
            print("  앱이 실행되지 않음 - 앱 실행 중...")
            driver.activate_app("com.adidas.app")
            time.sleep(5)
            print("  [OK] 앱 실행 완료")
        else:
            print("  [OK] 앱이 이미 실행 중")

        # [2단계] 로그인 직후 drawer(사용자 관리 페이지)가 열려있음 - 우측 상단 X 버튼으로 닫기
        print("\n[2단계] 로그인 후 drawer 닫기")
        print("  [시도] 우측 상단 X 버튼 찾기 (resource-id/content-desc)")

        # X 버튼을 resource-id나 content-desc로 찾기
        drawer_closed = False

        # 시도 1: content-desc로 찾기
        for desc in ['Close', 'close', '닫기', 'Dismiss', 'dismiss', 'Navigate up']:
            try:
                close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                close_btn.click()
                print(f"  [OK] drawer X 버튼 클릭 완료 (content-desc: {desc})")
                drawer_closed = True
                time.sleep(1.5)
                break
            except Exception as e:
                continue

        # 시도 2: resource-id로 찾기
        if not drawer_closed:
            for res_id in ['close_button', 'closeButton', 'btn_close', 'dismiss_button']:
                try:
                    close_btn = driver.find_element(AppiumBy.ID, res_id)
                    close_btn.click()
                    print(f"  [OK] drawer X 버튼 클릭 완료 (resource-id: {res_id})")
                    drawer_closed = True
                    time.sleep(1.5)
                    break
                except Exception as e:
                    continue

        # 시도 3: ImageButton이나 Button 클래스 찾기
        if not drawer_closed:
            try:
                close_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
                close_btn.click()
                print(f"  [OK] drawer X 버튼 클릭 완료 (ImageButton)")
                drawer_closed = True
                time.sleep(1.5)
            except Exception as e:
                pass

        if not drawer_closed:
            print("  [WARNING] X 버튼을 찾을 수 없어서 뒤로가기 시도")
            driver.press_keycode(4)
            time.sleep(1.5)

        # adiclub 탭으로 이동 - resource-id로 찾기
        print("  [확인] adiclub 탭 클릭")
        adiclub_clicked = False

        for desc in ['adiclub', 'ADICLUB', 'Adiclub', '아디클럽']:
            try:
                adiclub_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                adiclub_btn.click()
                print(f"  [OK] adiclub 탭 클릭 (content-desc: {desc})")
                adiclub_clicked = True
                time.sleep(3)
                break
            except:
                continue

        if not adiclub_clicked:
            print("  [WARNING] adiclub 버튼 못 찾음")
            time.sleep(3)

        close_ad_popup(driver)

        # [3단계] 우측 상단 왼쪽 버튼 → 포인트 추출
        print("\n[3단계] 포인트 추출 (우측 상단 왼쪽 버튼)")

        # adiclub 페이지 로딩 대기 (toolbar가 나타날 때까지 명시적 대기)
        print("  [대기] adiclub 페이지 로딩 중...")
        toolbar_loaded = False
        max_wait = 30  # 최대 30초
        wait_interval = 1  # 1초마다 확인

        for i in range(max_wait):
            try:
                # toolbar 요소 찾기 시도
                driver.find_element(AppiumBy.XPATH, "//*[@resource-id='adiclub_toolbar']")
                print(f"  [OK] adiclub 페이지 로딩 완료 ({i+1}초)")
                toolbar_loaded = True
                break
            except:
                time.sleep(wait_interval)

        if not toolbar_loaded:
            print(f"  [WARNING] {max_wait}초 대기 후에도 toolbar 로딩 안됨, 계속 진행")

        # 현재 화면 저장 (디버깅용) - try 블록 밖에서
        page_source = driver.page_source
        if debug:
            with open("debug_toolbar.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("  [DEBUG] debug_toolbar.xml 저장됨")

        # 아디클럽 화면에서 "쇼핑 포인트" 위의 포인트 값 가져오기
        current_points = None
        try:
            page_source = driver.page_source
            if debug:
                with open("debug_points.xml", "w", encoding="utf-8") as f:
                    f.write(page_source)

            # 방법 1: "쇼핑 포인트" 텍스트를 찾고 그 위의 TextView에서 포인트 추출
            # 페이지 소스에서 "쇼핑 포인트" 위의 숫자 패턴 찾기
            # 예: text="70014" ... text="쇼핑 포인트"
            points_pattern = r'text="([\d,]+)"[^>]*>[^<]*</[^>]+>\s*<[^>]*text="쇼핑 포인트"'
            points_match = re.search(points_pattern, page_source)

            if points_match:
                current_points = int(points_match.group(1).replace(",", ""))
                print(f"  [OK] 포인트: {current_points:,} (아디클럽 화면)")
            else:
                # 방법 2: "쇼핑 포인트" 텍스트 요소를 찾고 형제 또는 부모 요소에서 포인트 찾기
                try:
                    # "쇼핑 포인트" 텍스트 요소 찾기
                    shopping_point_elem = driver.find_element(AppiumBy.XPATH, "//*[@text='쇼핑 포인트']")

                    # 부모 요소에서 모든 TextView 찾기
                    parent = shopping_point_elem.find_element(AppiumBy.XPATH, "..")
                    text_views = parent.find_elements(AppiumBy.CLASS_NAME, "android.widget.TextView")

                    # 숫자만 있는 TextView 찾기 (쇼핑 포인트 제외)
                    for tv in text_views:
                        text = tv.text
                        if text and text != '쇼핑 포인트' and re.match(r'^[\d,]+$', text):
                            current_points = int(text.replace(",", ""))
                            print(f"  [OK] 포인트: {current_points:,} (쇼핑 포인트 형제 요소)")
                            break
                except Exception as e:
                    print(f"  [시도2 실패] 쇼핑 포인트 요소 찾기 실패: {e}")

                # 방법 3: XPath로 "쇼핑 포인트" 바로 위의 TextView 찾기
                if current_points is None:
                    try:
                        points_elem = driver.find_element(AppiumBy.XPATH,
                            "//*[@text='쇼핑 포인트']/preceding-sibling::android.widget.TextView[1]")
                        points_text = points_elem.text
                        if points_text and re.match(r'^[\d,]+$', points_text):
                            current_points = int(points_text.replace(",", ""))
                            print(f"  [OK] 포인트: {current_points:,} (쇼핑 포인트 preceding-sibling)")
                    except Exception as e:
                        print(f"  [시도3 실패] preceding-sibling: {e}")

                # 방법 4: 페이지 소스에서 쇼핑 포인트 근처의 모든 숫자 패턴 찾기
                if current_points is None:
                    # "쇼핑 포인트" 근처 300자 이내의 숫자 찾기
                    shopping_point_pos = page_source.find('쇼핑 포인트')
                    if shopping_point_pos > 0:
                        nearby_text = page_source[max(0, shopping_point_pos-500):shopping_point_pos]
                        # 큰 숫자 찾기 (1000 이상)
                        number_pattern = r'text="([\d,]+)"'
                        numbers = re.findall(number_pattern, nearby_text)
                        for num_str in reversed(numbers):  # 가장 가까운 것부터
                            num = int(num_str.replace(",", ""))
                            if num >= 0:  # 유효한 포인트 범위
                                current_points = num
                                print(f"  [OK] 포인트: {current_points:,} (쇼핑 포인트 근처)")
                                break

            if current_points is None:
                print("  [WARNING] 포인트를 찾을 수 없음")

        except Exception as e:
            print(f"  [ERROR] 포인트 추출 실패: {e}")

        # [4단계] 우측 상단 중간 버튼 → ADIKR 바코드 추출
        print("\n[4단계] ADIKR 바코드 추출 (우측 상단 중간 버튼)")
        time.sleep(1)

        # QR 버튼 클릭 (중간 버튼) - 여러 방법 시도
        adikr_barcode = None
        qr_clicked = False

        # 방법 1: toolbar에서 두 번째 clickable 버튼 찾기
        try:
            toolbar = driver.find_element(AppiumBy.XPATH, "//*[@resource-id='adiclub_toolbar']")
            buttons = toolbar.find_elements(AppiumBy.XPATH, ".//*[@clickable='true']")

            # profileButton이 아닌 버튼들 중 두 번째 (중간 버튼)
            non_profile_buttons = []
            for btn in buttons:
                res_id = btn.get_attribute('resource-id')
                if res_id and 'profileButton' not in res_id:
                    non_profile_buttons.append(btn)

            if len(non_profile_buttons) >= 2:
                qr_btn = non_profile_buttons[1]  # 두 번째 버튼
                qr_btn.click()
                print("  [OK] QR 버튼 클릭 (toolbar 두 번째 버튼)")
                qr_clicked = True
                time.sleep(2)
        except Exception as e:
            print(f"  [시도1 실패] toolbar 버튼: {e}")

        # 방법 2: resource-id로 직접 찾기
        if not qr_clicked:
            try:
                for res_id in ['qr_icon', 'qrIcon', 'btn_qr', 'qr_button', 'barcode_button']:
                    try:
                        qr_btn = driver.find_element(AppiumBy.ID, res_id)
                        qr_btn.click()
                        print(f"  [OK] QR 버튼 클릭 (resource-id: {res_id})")
                        qr_clicked = True
                        time.sleep(2)
                        break
                    except:
                        continue
            except Exception as e:
                print(f"  [시도2 실패] resource-id: {e}")

        # QR 페이지가 열렸으면 바코드 추출
        if qr_clicked:
            try:
                # 바코드 추출
                page_source = driver.page_source
                barcode_pattern = r'(ADIKR\d+|ADIUS\d+|ADI[A-Z]{2}\d+)'
                barcode_matches = re.findall(barcode_pattern, page_source)
                adikr_barcode = barcode_matches[0] if barcode_matches else None

                if adikr_barcode:
                    print(f"  [OK] ADIKR 바코드: {adikr_barcode}")
                else:
                    print("  [WARNING] 바코드를 찾을 수 없음")

                # X 버튼으로 닫기
                for desc in ['Close', 'close', '닫기']:
                    try:
                        close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        close_btn.click()
                        break
                    except:
                        pass
                time.sleep(1)
            except Exception as e:
                print(f"  [WARNING] 바코드 추출 실패: {e}")
        else:
            print("  [WARNING] QR 버튼을 찾을 수 없음")

        # [5단계] 우측 상단 오른쪽 버튼 (프로필) → 쿠폰 + 프로필 정보
        print("\n[5단계] 프로필 메뉴 (우측 상단 오른쪽 버튼)")
        time.sleep(1)

        # 프로필 버튼 클릭
        vouchers = []
        user_name = None
        birthday = None
        phone = None

        try:
            profile_btn = driver.find_element(AppiumBy.XPATH, "//android.view.View[@resource-id='profileButton']")
            profile_btn.click()
            print("  [OK] 프로필 메뉴 열림")
            time.sleep(2)

            # 6.1. 쿠폰 & 기프트 카드 클릭
            print("\n  [6.1] 쿠폰 & 기프트 카드")
            try:
                for text in ['쿠폰 & 기프트 카드', 'Coupons & Gift Cards']:
                    try:
                        coupon_cell = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        coupon_cell.click()
                        print(f"  [OK] '{text}' 클릭")
                        time.sleep(2)
                        break
                    except:
                        continue

                # 쿠폰 정보 추출
                page_source = driver.page_source

                # 디버그용 저장
                if debug:
                    with open("debug_coupons.xml", "w", encoding="utf-8") as f:
                        f.write(page_source)
                    print("  [DEBUG] debug_coupons.xml 저장됨")

                if '쿠폰을 보유하고 있지 않습니다' in page_source or '보유한 쿠폰이 없습니다' in page_source:
                    print("  [INFO] 보유 쿠폰 없음")
                else:
                    # 쿠폰 정보 파싱 (content-desc에서 추출)
                    # 패턴: content-desc="\d+ adidas 할인: ₩100000" 또는 "1 adidas 할인: 15%"
                    voucher_pattern = r'content-desc="(\d+)\s+adidas\s+할인:\s+([^"]+)"'
                    matches = re.findall(voucher_pattern, page_source)

                    for serial, discount in matches:
                        # ₩100000 형태 또는 15% 형태
                        if '₩' in discount:
                            # 금액 쿠폰: ₩100000 -> 100,000원 할인
                            amount = discount.replace('₩', '').strip()
                            amount_int = int(amount)
                            desc = f"{amount_int:,}원 할인"
                        elif '%' in discount:
                            # 퍼센트 쿠폰: 15% -> 15% 할인
                            desc = f"{discount.strip()} 할인"
                        else:
                            desc = f"{discount.strip()} 할인"

                        vouchers.append({
                            "description": desc,
                            "valid_until": "N/A"
                        })
                        print(f"  [OK] 쿠폰: {desc}")

                    if len(vouchers) == 0:
                        print("  [WARNING] 쿠폰 정보를 추출하지 못했습니다")
                    else:
                        print(f"  [INFO] 총 {len(vouchers)}개 쿠폰 추출")

                # 뒤로가기
                driver.press_keycode(4)
                time.sleep(1)
            except Exception as e:
                print(f"  [WARNING] 쿠폰 추출 실패: {e}")

            # 6.2. 나의 프로필 클릭
            print("\n  [6.2] 나의 프로필")
            try:
                for text in ['나의 프로필', 'My Profile', 'MY PROFILE']:
                    try:
                        profile_cell = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                        profile_cell.click()
                        print(f"  [OK] '{text}' 클릭")
                        time.sleep(2)
                        break
                    except:
                        continue

                # 프로필 정보 추출 - 상단 2개 EditText 항목 (이름, 생년월일)
                page_source = driver.page_source

                # EditText 필드들을 순서대로 찾기
                try:
                    edit_fields = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")

                    # 디버그: 모든 EditText 필드 출력
                    print(f"  [DEBUG] 총 {len(edit_fields)}개 EditText 필드 발견")
                    for i, field in enumerate(edit_fields):
                        field_text = field.text
                        print(f"  [DEBUG] EditText[{i}]: '{field_text}'")

                    # 첫 번째 EditText = 이름
                    if len(edit_fields) >= 1:
                        user_name = edit_fields[0].text
                        if user_name:
                            print(f"  [OK] 이름: {user_name}")

                    # 생년월일: 2번째(년), 3번째(월), 4번째(일) EditText를 조합
                    if len(edit_fields) >= 4:
                        year = edit_fields[1].text
                        month = edit_fields[2].text
                        day = edit_fields[3].text
                        if year and month and day:
                            # YYYY-MM-DD 형식으로 조합
                            birthday = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                            print(f"  [OK] 생년월일: {birthday}")
                    # 혹시 하나의 필드에 있을 경우
                    elif len(edit_fields) >= 2:
                        birthday = edit_fields[1].text
                        if birthday:
                            print(f"  [OK] 생년월일: {birthday}")

                except Exception as e:
                    print(f"  [WARNING] EditText 필드 추출 실패, 패턴 매칭 시도: {e}")

                    # 대체 방법: 패턴 매칭
                    name_pattern = r'이름["\s:]*([가-힣A-Z\s]+)'
                    name_match = re.search(name_pattern, page_source)
                    if name_match:
                        user_name = name_match.group(1).strip()
                        print(f"  [OK] 이름: {user_name}")

                    birthday_pattern = r'생년월일["\s:]*(\d{4}-\d{2}-\d{2})'
                    birthday_match = re.search(birthday_pattern, page_source)
                    if birthday_match:
                        birthday = birthday_match.group(1)
                        print(f"  [OK] 생년월일: {birthday}")

                # 전화번호 (기존 패턴 유지)
                phone_pattern = r'(\+82\s*\d{1,2}[- ]?\d{4}[- ]?\d{4})'
                phone_match = re.search(phone_pattern, page_source)
                if phone_match:
                    phone = phone_match.group(1)
                    print(f"  [OK] 전화번호: {phone}")

                # 뒤로가기
                driver.press_keycode(4)
                time.sleep(1)
            except Exception as e:
                print(f"  [WARNING] 프로필 추출 실패: {e}")

            # 프로필 메뉴 닫기 (뒤로가기)
            driver.press_keycode(4)
            time.sleep(1)

        except Exception as e:
            print(f"  [ERROR] 프로필 메뉴 열기 실패: {e}")

        # [6단계] 로그아웃
        print("\n[6단계] 로그아웃")
        logout_success = False
        try:
            # 프로필 버튼 다시 클릭
            try:
                profile_btn = driver.find_element(AppiumBy.XPATH, "//android.view.View[@resource-id='profileButton']")
                profile_btn.click()
                print("  [OK] 프로필 메뉴 재진입")
                time.sleep(2)
            except:
                # 이미 프로필 메뉴가 열려 있을 수 있음
                print("  [INFO] 프로필 메뉴가 이미 열려있거나 버튼을 찾을 수 없음")
                pass

            # 화면 크기 가져오기
            window_size = driver.get_window_size()
            width = window_size['width']
            height = window_size['height']

            # 하단으로 스크롤 (화면 크기 기반)
            print("  [시도] 하단으로 스크롤")
            for i in range(5):
                driver.swipe(
                    width // 2,           # 중앙 x
                    height * 0.8,         # 하단에서 시작
                    width // 2,           # 중앙 x
                    height * 0.2,         # 상단으로
                    400
                )
                time.sleep(0.5)

                # 로그아웃 버튼 찾기 시도
                page_source = driver.page_source
                if '로그아웃' in page_source or 'LOGOUT' in page_source or 'Log out' in page_source:
                    print(f"  [OK] 로그아웃 버튼 발견 (스크롤 {i+1}번째)")
                    break

            # 로그아웃 버튼 클릭
            logout_clicked = False
            for text in ['로그아웃', 'LOGOUT', 'Log out', 'LOG OUT']:
                try:
                    logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@text='{text}']")
                    logout_btn.click()
                    print(f"  [OK] '{text}' 버튼 클릭")
                    time.sleep(2)
                    logout_clicked = True
                    logout_success = True
                    break
                except:
                    continue

            # content-desc로도 시도
            if not logout_clicked:
                for desc in ['로그아웃', 'logout', 'LOGOUT', 'Log out']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
                        logout_btn.click()
                        print(f"  [OK] content-desc '{desc}' 버튼 클릭")
                        time.sleep(2)
                        logout_clicked = True
                        logout_success = True
                        break
                    except:
                        continue

            if not logout_clicked:
                print("  [WARNING] 로그아웃 버튼을 찾을 수 없습니다")
                # 디버깅용 페이지 저장
                if debug:
                    with open("error_logout.xml", "w", encoding="utf-8") as f:
                        f.write(driver.page_source)
                    print("  -> error_logout.xml 저장됨")

        except Exception as e:
            print(f"  [WARNING] 로그아웃 실패: {e}")

        # 로그아웃 실패 시 앱 강제 종료
        if not logout_success:
            try:
                print("  [시도] 앱 강제 종료로 로그아웃 처리")
                driver.terminate_app("com.adidas.app")
                time.sleep(1)
            except:
                pass

        # 결과 정리
        result = {
            "email": email,
            "name": user_name,
            "birthday": birthday,
            "phone": phone,
            "points": current_points,
            "adikr_barcode": adikr_barcode,
            "owned_vouchers": json.dumps(vouchers, ensure_ascii=False)
        }

        end_time = time.time()
        elapsed_time = end_time - start_time

        print("\n" + "=" * 60)
        print("추출 완료")
        print("=" * 60)
        print(f"이메일: {email}")
        print(f"이름: {user_name or 'None'}")
        print(f"생년월일: {birthday or 'None'}")
        print(f"전화번호: {phone or 'None'}")
        print(f"포인트: {current_points:,}" if current_points else "포인트: None")
        print(f"ADIKR 바코드: {adikr_barcode or 'None'}")
        print(f"보유 쿠폰: {len(vouchers)}개")
        print(f"실행 시간: {elapsed_time:.1f}초")
        print("=" * 60)

        return result

    except Exception as e:
        print(f"\n[ERROR] 예외 발생: {e}")
        import traceback
        traceback.print_exc()
        
        if debug:
            page_source = driver.page_source
            with open("error_extract_final.xml", "w", encoding="utf-8") as f:
                f.write(page_source)
            print("-> error_extract_final.xml 저장됨")

        print("\n" + "=" * 60)
        print("결과: 추출 실패")
        print("=" * 60)
        return None

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
        appium_url = sys.argv[3] if len(sys.argv) >= 4 else os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[EXTRACT] 명령줄 인자로 계정 정보 받음: {email}")
    # 환경변수로 받기
    elif os.getenv("ADIDAS_EMAIL"):
        email = os.getenv("ADIDAS_EMAIL")
        password = os.getenv("ADIDAS_PASSWORD", "")
        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[EXTRACT] 환경변수로 계정 정보 받음: {email}")
    else:
        # 기본 테스트 계정
        email = "TAM@nillago.com"
        password = "Ser654230@"
        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        print(f"[EXTRACT] 기본 테스트 계정 사용: {email}")

    debug_mode = "--debug" in sys.argv

    result = extract_user_info_and_vouchers(email, password, appium_url, debug=debug_mode)

    if result:
        print("\n최종 결과:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
