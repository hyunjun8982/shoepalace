"""
Adidas 앱 자동화 서비스 (로컬 Appium 서버 사용)
Android 에뮬레이터 + Appium 서버가 로컬에서 실행 중이어야 함
"""
from typing import Optional, Dict, Any
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import logging
import time

logger = logging.getLogger(__name__)


class AdidasAppiumAutomation:
    """Adidas 앱 자동화 클래스 (로컬 Appium 서버)"""

    # Appium 서버 URL
    # Docker 컨테이너에서 호스트 머신의 Appium에 접근
    APPIUM_SERVER = "http://host.docker.internal:4723"

    # 로컬 테스트 시 (컨테이너 외부)
    # APPIUM_SERVER = "http://localhost:4723"

    def __init__(self, device_name: str = "emulator-5554"):
        """
        Args:
            device_name: ADB 디바이스 이름 (adb devices로 확인)
        """
        self.device_name = device_name
        self.driver: Optional[webdriver.Remote] = None

    def __enter__(self):
        """컨텍스트 매니저 진입"""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """컨텍스트 매니저 종료"""
        self.close()

    def start(self, app_package: str = None, app_activity: str = None):
        """
        Appium 세션 시작 및 앱 실행

        Args:
            app_package: 앱 패키지명 (예: com.adidas.app)
            app_activity: 앱 메인 액티비티 (예: .MainActivity)
        """
        try:
            options = UiAutomator2Options()
            options.platform_name = 'Android'
            options.automation_name = 'UiAutomator2'
            options.device_name = self.device_name

            # 앱 패키지/액티비티 설정 (선택사항)
            if app_package:
                options.app_package = app_package
            if app_activity:
                options.app_activity = app_activity

            # 추가 옵션
            options.no_reset = True  # 앱 데이터 유지
            options.new_command_timeout = 300  # 5분 타임아웃

            logger.info(f"Appium 서버 연결 중: {self.APPIUM_SERVER}")
            logger.info(f"디바이스: {self.device_name}")

            self.driver = webdriver.Remote(
                self.APPIUM_SERVER,
                options=options
            )

            logger.info("Appium 세션 시작 완료")
            logger.info(f"Platform: {self.driver.capabilities.get('platformName')}")
            logger.info(f"Version: {self.driver.capabilities.get('platformVersion')}")

        except Exception as e:
            logger.error(f"Appium 세션 시작 실패: {e}")
            raise

    def close(self):
        """세션 종료"""
        try:
            if self.driver:
                self.driver.quit()
                logger.info("Appium 세션 종료 완료")
        except Exception as e:
            logger.error(f"세션 종료 중 오류: {e}")

    def launch_app(self, package_name: str):
        """
        앱 실행

        Args:
            package_name: 실행할 앱 패키지명
        """
        try:
            logger.info(f"앱 실행: {package_name}")
            self.driver.activate_app(package_name)
            time.sleep(3)  # 앱 로딩 대기
        except Exception as e:
            logger.error(f"앱 실행 실패: {e}")
            raise

    def find_element_safe(self, by, value, timeout=10):
        """
        안전하게 요소 찾기 (타임아웃 포함)

        Args:
            by: 검색 방법 (AppiumBy.ID, AppiumBy.XPATH 등)
            value: 검색 값
            timeout: 타임아웃 (초)

        Returns:
            찾은 요소 또는 None
        """
        try:
            wait = WebDriverWait(self.driver, timeout)
            element = wait.until(EC.presence_of_element_located((by, value)))
            return element
        except Exception as e:
            logger.warning(f"요소를 찾을 수 없음: {by}={value}, 오류: {e}")
            return None

    def login(self, email: str, password: str, package_name: str = "com.adidas.app") -> Dict[str, Any]:
        """
        Adidas 앱 로그인

        Args:
            email: 이메일
            password: 비밀번호
            package_name: Adidas 앱 패키지명

        Returns:
            로그인 결과 딕셔너리
        """
        try:
            # 앱 실행
            self.launch_app(package_name)

            # TODO: 실제 Adidas 앱의 UI 요소를 분석하여 수정 필요
            # 아래는 예시 코드

            # 로그인 버튼 찾기 (예시)
            login_button = self.find_element_safe(
                AppiumBy.XPATH,
                "//android.widget.Button[@text='로그인' or @text='Login']",
                timeout=10
            )

            if login_button:
                login_button.click()
                time.sleep(2)

            # 이메일 입력 필드 찾기 (예시 - 실제 리소스 ID 필요)
            email_field = self.find_element_safe(
                AppiumBy.ID,
                f"{package_name}:id/email_input",  # 실제 ID로 변경 필요
                timeout=10
            )

            if email_field:
                email_field.clear()
                email_field.send_keys(email)
                logger.info("이메일 입력 완료")

            # 비밀번호 입력 필드 찾기 (예시)
            password_field = self.find_element_safe(
                AppiumBy.ID,
                f"{package_name}:id/password_input",  # 실제 ID로 변경 필요
                timeout=10
            )

            if password_field:
                password_field.clear()
                password_field.send_keys(password)
                logger.info("비밀번호 입력 완료")

            # 로그인 제출 버튼 클릭 (예시)
            submit_button = self.find_element_safe(
                AppiumBy.XPATH,
                "//android.widget.Button[@text='제출' or @text='Submit']",
                timeout=10
            )

            if submit_button:
                submit_button.click()
                logger.info("로그인 버튼 클릭")
                time.sleep(5)  # 로그인 처리 대기

            # 로그인 성공 확인 (예시 - 실제 확인 로직 필요)
            # 예: 메인 화면의 특정 요소가 보이는지 확인
            success_indicator = self.find_element_safe(
                AppiumBy.ID,
                f"{package_name}:id/main_screen",  # 실제 ID로 변경 필요
                timeout=10
            )

            if success_indicator:
                logger.info("로그인 성공")
                return {
                    "success": True,
                    "message": "로그인 성공"
                }
            else:
                logger.warning("로그인 상태 확인 불가")
                return {
                    "success": False,
                    "error": "로그인 상태를 확인할 수 없습니다"
                }

        except Exception as e:
            logger.error(f"로그인 중 오류: {e}")
            # 스크린샷 저장
            try:
                screenshot_path = f"/tmp/adidas_login_error_{int(time.time())}.png"
                self.driver.save_screenshot(screenshot_path)
                logger.info(f"스크린샷 저장: {screenshot_path}")
            except:
                pass

            return {
                "success": False,
                "error": str(e)
            }

    def get_user_info(self, package_name: str = "com.adidas.app") -> Dict[str, Any]:
        """
        사용자 정보 조회

        Args:
            package_name: Adidas 앱 패키지명

        Returns:
            사용자 정보 딕셔너리
        """
        try:
            # TODO: 마이페이지로 이동 및 정보 추출 로직 구현
            # 실제 앱의 UI 구조에 따라 구현 필요

            user_info = {
                "name": "",
                "email": "",
                "phone": "",
                "birthday": "",
            }

            logger.info(f"사용자 정보 추출 완료: {user_info}")
            return {
                "success": True,
                "data": user_info
            }

        except Exception as e:
            logger.error(f"사용자 정보 조회 중 오류: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_page_source(self) -> str:
        """
        현재 화면의 XML 소스 가져오기 (디버깅용)

        Returns:
            페이지 소스 XML
        """
        if self.driver:
            return self.driver.page_source
        return ""

    def save_screenshot(self, filename: str = None) -> str:
        """
        현재 화면 스크린샷 저장

        Args:
            filename: 저장할 파일명 (없으면 자동 생성)

        Returns:
            저장된 파일 경로
        """
        if not filename:
            filename = f"/tmp/appium_screenshot_{int(time.time())}.png"

        if self.driver:
            self.driver.save_screenshot(filename)
            logger.info(f"스크린샷 저장: {filename}")
            return filename
        return ""


# 사용 예시
def test_local_appium():
    """로컬 Appium 테스트"""
    try:
        with AdidasAppiumAutomation(device_name="emulator-5554") as automation:
            # 세션 시작
            automation.start(
                app_package="com.adidas.app",  # 실제 패키지명으로 변경
                app_activity=".MainActivity"    # 실제 액티비티명으로 변경
            )

            # 스크린샷 저장
            automation.save_screenshot("/tmp/adidas_app_home.png")

            # 페이지 소스 확인
            page_source = automation.get_page_source()
            print(f"페이지 소스 길이: {len(page_source)}")

            # 로그인 테스트
            result = automation.login("test@example.com", "password123")
            print(f"로그인 결과: {result}")

    except Exception as e:
        print(f"테스트 실패: {e}")


if __name__ == "__main__":
    test_local_appium()
