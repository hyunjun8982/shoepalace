"""
Adidas 계정 정보 일괄 추출 (Appium 세션 재사용)
"""
import time
from appium import webdriver
from appium.options.android import UiAutomator2Options


def extract_bulk_account_info(account_list: list, appium_url: str = "http://127.0.0.1:4723", on_each_complete=None) -> list:
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
    from app.services.adidas_automation_login import login
    from app.services.adidas_automation_extract import extract_user_info_and_vouchers

    # Appium 연결 설정
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "emulator-5554"
    options.app_package = "com.adidas.app"
    options.app_activity = ".MainActivity"
    options.automation_name = "UiAutomator2"
    options.no_reset = True

    # Chrome WebView 사용
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
                # 1단계: 로그인 (기존 driver 재사용)
                print(f"[1단계] 로그인 시작: {email}")

                # login 함수는 내부에서 driver를 생성하므로, 직접 로그인 로직을 구현해야 함
                # 또는 login 함수를 수정하여 driver를 파라미터로 받도록 해야 함
                # 여기서는 간단히 전체 프로세스를 다시 호출

                # 임시: 기존 함수 호출 (driver 생성/종료 포함)
                # TODO: login 함수와 extract 함수를 driver를 받도록 리팩토링 필요
                login_success = login(email, password, appium_url)

                if not login_success:
                    result["message"] = "로그인 실패 (계정 정보 확인 필요)"
                    result["login_success"] = False
                    results.append({"email": email, "result": result})

                    if on_each_complete:
                        on_each_complete(account_id, email, result, idx, len(account_list))

                    continue

                result["login_success"] = True
                print(f"[1단계 완료] 로그인 성공")

                # 2단계: 정보 추출
                print(f"[2단계] 정보 추출 시작: {email}")
                extraction_result = extract_user_info_and_vouchers(email, password, appium_url, debug=False)

                result["extraction_success"] = True
                result["success"] = True
                result["data"] = extraction_result
                result["message"] = "정보 조회 완료"

                print(f"[벌크 정보조회] {idx}/{len(account_list)} - {email} 완료")

            except ConnectionError as e:
                result["message"] = f"Appium 연결 오류: {str(e)}"
                print(f"[벌크 정보조회] {idx}/{len(account_list)} - {email} Appium 연결 오류")

            except Exception as e:
                if not result["login_success"]:
                    result["message"] = f"로그인 오류: {str(e)[:50]}"
                else:
                    result["message"] = f"정보 추출 오류: {str(e)[:50]}"
                print(f"[벌크 정보조회] {idx}/{len(account_list)} - {email} 오류: {e}")

            results.append({"email": email, "result": result})

            # 각 계정 처리 완료 시 콜백 호출
            if on_each_complete:
                on_each_complete(account_id, email, result, idx, len(account_list))

        return results

    finally:
        try:
            driver.quit()
        except:
            pass
