"""
Adidas 계정 정보 일괄 추출 (Appium 세션 재사용)
- 단일 드라이버로 여러 계정 처리
- 각 계정: 로그인 → 정보 추출 → 로그아웃 순서로 처리
- 안정화: 오류 발생 시 로그인 화면으로 복귀
"""
import time
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy


def navigate_to_login_screen(driver, max_retries: int = 5) -> bool:
    """
    현재 화면에서 로그인 화면으로 이동 (뒤로가기 반복)

    로그아웃 상태에서 로그인 화면까지 복귀하는 빠른 방법:
    - 뒤로가기 키를 반복 눌러서 로그인 화면까지 이동
    - 앱 재시작보다 훨씬 빠름 (2-3초 vs 15초+)

    Args:
        driver: Appium WebDriver 인스턴스
        max_retries: 최대 뒤로가기 시도 횟수

    Returns:
        bool: 로그인 화면 도달 여부
    """
    print("  [복귀] 로그인 화면으로 이동 중...")

    for i in range(max_retries):
        try:
            page_source = driver.page_source

            # 로그인 화면 확인 (이메일/비밀번호 입력 화면 또는 로그인 버튼 화면)
            if any(text in page_source for text in [
                'login.email.input',  # 이메일 입력 필드
                '가입 또는 로그인하기', 'JOIN OR LOG IN',  # 메인 로그인 버튼
                '로그인하기'  # 광고 화면의 로그인 버튼
            ]):
                print(f"  [복귀] 로그인 화면 도달 (뒤로가기 {i}번)")
                return True

            # 뒤로가기
            driver.press_keycode(4)
            time.sleep(0.5)

        except Exception as e:
            print(f"  [복귀] 오류: {e}")
            time.sleep(0.3)

    print(f"  [복귀] 로그인 화면 도달 실패 ({max_retries}회 시도)")
    return False


def force_return_to_login(driver) -> bool:
    """
    강제로 로그인 화면으로 복귀 (앱 재시작 + 필요시 로그아웃)

    앱 재시작 후에도 이전 계정이 로그인된 상태일 수 있으므로,
    로그인 상태면 먼저 로그아웃 후 로그인 화면으로 이동

    Returns:
        bool: 성공 여부
    """
    from app.services.adidas_automation_extract import logout_with_driver

    print("  [강제 복귀] 앱 재시작...")
    try:
        driver.terminate_app("com.adidas.app")
        time.sleep(1)
        driver.activate_app("com.adidas.app")

        # 앱 로딩 대기 (최대 10초)
        for i in range(10):
            try:
                page_source = driver.page_source

                # 로그인 화면인지 확인 (로그아웃 상태)
                if any(text in page_source for text in [
                    'login.email.input',  # 이메일 입력 필드
                    '가입 또는 로그인하기', 'JOIN OR LOG IN',  # 메인 로그인 버튼
                    '로그인하기'  # 광고 화면의 로그인 버튼
                ]):
                    print(f"  [강제 복귀] 로그인 화면 도달 ({i+1}초)")
                    return True

                # 이미 로그인된 상태인지 확인 (adiclub 툴바, 프로필 버튼 등)
                if any(text in page_source for text in [
                    'adiclub_toolbar', 'profileButton', '로그아웃', 'LOGOUT',
                    'mainTabBarAdiClub', '아디클럽'
                ]):
                    print(f"  [강제 복귀] 이미 로그인된 상태 감지 - 로그아웃 필요")

                    # 로그아웃 시도
                    try:
                        logout_success = logout_with_driver(driver)
                        if logout_success:
                            print(f"  [강제 복귀] 로그아웃 완료, 로그인 화면으로 이동")
                            # 로그아웃 후 로그인 화면으로 이동
                            time.sleep(1)
                            return navigate_to_login_screen(driver, max_retries=5)
                        else:
                            print(f"  [강제 복귀] 로그아웃 실패, 앱 재시작 재시도")
                            # 앱 강제 종료 후 재시작
                            driver.terminate_app("com.adidas.app")
                            time.sleep(2)
                            driver.activate_app("com.adidas.app")
                            time.sleep(3)
                            continue
                    except Exception as logout_error:
                        print(f"  [강제 복귀] 로그아웃 오류: {logout_error}")

            except Exception as e:
                print(f"  [강제 복귀] 페이지 확인 오류: {e}")
            time.sleep(1)

        print("  [강제 복귀] 로그인 화면 도달 실패")
        return False
    except Exception as e:
        print(f"  [강제 복귀] 오류: {e}")
        return False


def close_login_webview(driver) -> bool:
    """
    로그인 실패 후 웹뷰 닫기

    Args:
        driver: Appium WebDriver 인스턴스

    Returns:
        bool: 닫기 성공 여부
    """
    print("  [웹뷰 닫기] 로그인 웹뷰 닫는 중...")
    closed = False

    # 방법 1: X 버튼 또는 닫기 버튼 (content-desc)
    for desc in ['Close', 'close', '닫기', 'X', 'Dismiss', 'dismiss']:
        try:
            close_btn = driver.find_element(AppiumBy.XPATH, f"//*[@content-desc='{desc}']")
            close_btn.click()
            print(f"  [웹뷰 닫기] X 버튼 클릭 (content-desc: {desc})")
            closed = True
            time.sleep(0.5)
            break
        except:
            pass

    # 방법 2: ImageButton 찾기
    if not closed:
        try:
            image_btn = driver.find_element(AppiumBy.XPATH, "//android.widget.ImageButton")
            image_btn.click()
            print("  [웹뷰 닫기] ImageButton 클릭")
            closed = True
            time.sleep(0.5)
        except:
            pass

    # 방법 3: 뒤로가기 키
    if not closed:
        try:
            driver.press_keycode(4)
            print("  [웹뷰 닫기] 뒤로가기 키 사용")
            closed = True
            time.sleep(0.5)
        except:
            pass

    return closed


def extract_bulk_account_info(account_list: list, appium_url: str = "http://127.0.0.1:4723/wd/hub", on_each_complete=None) -> list:
    """
    여러 계정의 정보를 일괄 추출 (단일 Appium 세션 재사용)

    Args:
        account_list: 계정 정보 리스트 [{"id": str, "email": str, "password": str}, ...]
        appium_url: Appium 서버 URL
        on_each_complete: 각 계정 처리 완료 시 호출될 콜백 함수 (account_id, email, result, idx, total)

    Returns:
        list: 각 계정별 결과 [{"email": str, "result": dict}, ...]

    Raises:
        ConnectionError: Appium 서버 연결 실패 시
    """
    from app.services.adidas_automation_login import login_with_driver
    from app.services.adidas_automation_extract import extract_info_with_driver, logout_with_driver
    from app.services.appium_utils import get_appium_options

    # Appium 연결 설정 (자동 디바이스 감지)
    options = get_appium_options()

    try:
        driver = webdriver.Remote(appium_url, options=options)
        print(f"[벌크 처리] Appium 드라이버 연결 성공")
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

            print(f"\n{'=' * 60}")
            print(f"[벌크 정보조회] {idx}/{len(account_list)} 처리 중")
            print(f"{'=' * 60}")
            print(f"계정: {email}")

            result = {
                "success": False,
                "message": "",
                "login_success": False,
                "extraction_success": False,
                "data": None
            }

            try:
                # 첫 번째 계정이 아니면 로그인 화면 복귀 확인
                # (첫 번째 계정은 사용자가 로그인 화면을 켜둔 상태로 시작)
                if idx > 1:
                    print(f"\n[사전 단계] 로그인 화면 확인")
                    # 로그인 화면인지 빠르게 확인
                    page_source = driver.page_source
                    if not any(text in page_source for text in [
                        'login.email.input', '가입 또는 로그인하기', 'JOIN OR LOG IN', '로그인하기'
                    ]):
                        # 로그인 화면이 아니면 뒤로가기로 복귀 시도
                        if not navigate_to_login_screen(driver):
                            # 실패하면 앱 재시작 (최후의 수단)
                            force_return_to_login(driver)

                # 1단계: 로그인 (드라이버 재사용)
                print(f"\n[1단계] 로그인 시작: {email}")
                login_success = login_with_driver(driver, email, password)

                if not login_success:
                    result["message"] = "로그인 실패 (계정 정보 확인 필요)"
                    result["login_success"] = False
                    results.append({"email": email, "result": result})

                    if on_each_complete:
                        on_each_complete(account_id, email, result, idx, len(account_list))

                    # 로그인 실패 시 웹뷰 닫고 로그인 화면으로 복귀
                    print("  [로그인 실패] 웹뷰 닫기")
                    close_login_webview(driver)
                    print("  [로그인 실패] 로그인 화면 복귀")
                    navigate_to_login_screen(driver)
                    continue

                result["login_success"] = True
                print(f"[1단계 완료] 로그인 성공")

                # 2단계: 정보 추출 (드라이버 재사용)
                print(f"\n[2단계] 정보 추출 시작: {email}")
                try:
                    extraction_result = extract_info_with_driver(driver, email, debug=False)

                    if extraction_result:
                        result["extraction_success"] = True
                        result["success"] = True
                        result["data"] = extraction_result
                        result["message"] = "정보 조회 완료"
                    else:
                        result["message"] = "정보 추출 실패"
                except Exception as extract_error:
                    result["message"] = f"정보 추출 오류: {str(extract_error)[:50]}"
                    print(f"  [2단계 오류] {extract_error}")

                print(f"[2단계 완료] 정보 추출 {'성공' if result['extraction_success'] else '실패'}")

                # 3단계: 로그아웃 (드라이버 재사용)
                print(f"\n[3단계] 로그아웃: {email}")
                try:
                    logout_success = logout_with_driver(driver)
                    print(f"[3단계 완료] 로그아웃 {'성공' if logout_success else '실패'}")

                    # 로그아웃 후 로그인 화면으로 복귀
                    if logout_success:
                        navigate_to_login_screen(driver)
                except Exception as logout_error:
                    print(f"[3단계 오류] 로그아웃 실패: {logout_error}")
                    # 로그아웃 실패 시 강제 복귀
                    navigate_to_login_screen(driver)

                print(f"\n[벌크 정보조회] {idx}/{len(account_list)} - {email} 완료")

            except ConnectionError as e:
                result["message"] = f"Appium 연결 오류: {str(e)}"
                print(f"[벌크 정보조회] {idx}/{len(account_list)} - {email} Appium 연결 오류")
                # 연결 오류 시 강제 복귀 시도
                force_return_to_login(driver)

            except Exception as e:
                if not result["login_success"]:
                    result["message"] = f"로그인 오류: {str(e)[:50]}"
                else:
                    result["message"] = f"처리 오류: {str(e)[:50]}"
                print(f"[벌크 정보조회] {idx}/{len(account_list)} - {email} 오류: {e}")

                # 오류 발생 시 로그인 화면으로 복귀 (다음 계정을 위해)
                print("  [오류 복구] 로그인 화면 복귀 시도")
                if not navigate_to_login_screen(driver):
                    force_return_to_login(driver)

            results.append({"email": email, "result": result})

            # 각 계정 처리 완료 시 콜백 호출
            if on_each_complete:
                on_each_complete(account_id, email, result, idx, len(account_list))

        return results

    finally:
        try:
            driver.quit()
            print(f"\n[벌크 처리] Appium 드라이버 종료")
        except:
            pass
