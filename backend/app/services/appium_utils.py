"""
Appium 유틸리티 함수
- 자동 디바이스 감지
- 공통 Appium 옵션 설정
"""
import os
import subprocess


def get_connected_device_udid() -> str:
    """
    ADB를 통해 연결된 Android 디바이스 UDID를 자동으로 가져옴

    Returns:
        str: 연결된 디바이스 UDID

    Raises:
        RuntimeError: 연결된 디바이스가 없을 경우
    """
    # 1순위: 환경변수에서 UDID 가져오기 (수동 지정 시)
    env_udid = os.getenv("DEVICE_UDID")
    if env_udid and env_udid.strip():
        print(f"[Appium] 환경변수에서 DEVICE_UDID 사용: {env_udid}")
        return env_udid.strip()

    # 2순위: adb devices로 자동 감지
    try:
        # ADB 경로 설정
        adb_path = os.getenv("ADB_PATH", "adb")

        # Windows에서 Docker 컨테이너 내부인 경우 호스트의 adb 사용 불가
        # 따라서 Appium 서버가 자동으로 디바이스를 찾도록 빈 값 반환
        result = subprocess.run(
            [adb_path, "devices"],
            capture_output=True,
            text=True,
            timeout=10
        )

        lines = result.stdout.strip().split('\n')
        devices = []

        for line in lines[1:]:  # 첫 줄은 "List of devices attached"
            if line.strip() and '\tdevice' in line:
                udid = line.split('\t')[0].strip()
                if udid:
                    devices.append(udid)

        if devices:
            selected_udid = devices[0]  # 첫 번째 연결된 디바이스 사용
            print(f"[Appium] ADB에서 감지된 디바이스: {selected_udid}")
            if len(devices) > 1:
                print(f"[Appium] 주의: {len(devices)}개 디바이스 연결됨. 첫 번째 사용: {devices}")
            return selected_udid
        else:
            print("[Appium] 연결된 디바이스 없음 - Appium이 자동 감지하도록 함")
            return ""  # 빈 값 반환 - Appium이 자동 감지

    except subprocess.TimeoutExpired:
        print("[Appium] ADB 명령 타임아웃 - Appium이 자동 감지하도록 함")
        return ""
    except FileNotFoundError:
        print("[Appium] ADB를 찾을 수 없음 - Appium이 자동 감지하도록 함")
        return ""
    except Exception as e:
        print(f"[Appium] ADB 실행 오류: {e} - Appium이 자동 감지하도록 함")
        return ""


def get_appium_options(app_package: str = "com.adidas.app", app_activity: str = ".MainActivity"):
    """
    공통 Appium 옵션 생성

    Args:
        app_package: 앱 패키지명
        app_activity: 앱 액티비티명

    Returns:
        UiAutomator2Options: 설정된 옵션 객체
    """
    from appium.options.android import UiAutomator2Options

    options = UiAutomator2Options()
    options.platform_name = "Android"

    # 디바이스 UDID 자동 감지
    device_udid = get_connected_device_udid()
    if device_udid:
        options.udid = device_udid
        options.device_name = device_udid
    # UDID가 없으면 Appium이 자동으로 첫 번째 연결된 디바이스 사용

    options.app_package = app_package
    options.app_activity = app_activity
    options.automation_name = "UiAutomator2"
    options.no_reset = True

    # 연결 속도 최적화
    # 주의: 새 기기 연결 시 UIAutomator2 서버 설치가 필요하므로 skipServerInstallation은 False로 설정
    # 설치 후에는 True로 변경하면 연결 속도가 빨라짐
    options.set_capability('skipServerInstallation', False)  # 새 기기용
    options.set_capability('skipDeviceInitialization', False)  # 새 기기용
    options.set_capability('adbExecTimeout', 60000)  # 설치 시간 고려하여 60초

    # Chrome WebView 사용
    options.set_capability('chromedriverExecutable', '')
    options.set_capability('recreateChromeDriverSessions', True)
    options.set_capability('nativeWebScreenshot', True)
    options.set_capability('autoWebview', False)

    return options


def create_appium_driver(appium_url: str = None):
    """
    Appium WebDriver 생성

    Args:
        appium_url: Appium 서버 URL (없으면 환경변수 사용)

    Returns:
        WebDriver: Appium WebDriver 인스턴스

    Raises:
        ConnectionError: Appium 서버 연결 실패 시
    """
    from appium import webdriver

    if appium_url is None:
        appium_url = os.getenv("APPIUM_URL", "http://host.docker.internal:4723/wd/hub")

    options = get_appium_options()

    try:
        driver = webdriver.Remote(appium_url, options=options)
        print(f"[Appium] 연결 성공: {appium_url}")
        return driver
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise ConnectionError("모바일 기기 연결이 되지 않았습니다")
        else:
            raise
