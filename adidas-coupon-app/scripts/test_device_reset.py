"""디바이스 리셋 기능 단독 테스트"""
import sys
import time
sys.path.insert(0, '.')

from appium import webdriver
from appium.options.android import UiAutomator2Options
from adidas_login import reset_device_identity

UDID = '127.0.0.1:16416'

print("=" * 60)
print("디바이스 리셋 테스트")
print("=" * 60)

# 1. Appium 연결
print("\n[1] Appium 연결 중...")
options = UiAutomator2Options()
options.platform_name = 'Android'
options.automation_name = 'UiAutomator2'
options.app_package = 'com.adidas.app'
options.no_reset = True
options.new_command_timeout = 300
options.set_capability('appium:androidSdkRoot', 'C:\\platform-tools')
options.set_capability('appium:adbExecTimeout', 60000)
options.set_capability('appium:chromedriverAutodownload', True)
options.set_capability('appium:skipServerInstallation', True)
options.set_capability('appium:udid', UDID)

driver = webdriver.Remote('http://localhost:4723', options=options)
print("[1] Appium 연결 성공")

# 2. 앱 활성화
driver.activate_app('com.adidas.app')
time.sleep(2)
print("[2] 앱 활성화 완료")

# 3. 디바이스 리셋 실행
print("\n[3] reset_device_identity() 호출...")
success = reset_device_identity(driver, UDID)
print(f"\n[3] 리셋 결과: {'성공' if success else '실패'}")

# 4. 리셋 후 딥링크 로그인 화면 접근 테스트
print("\n[4] 딥링크 로그인 화면 테스트...")
try:
    driver.execute_script("mobile: deepLink", {
        "url": "adidas://login",
        "package": "com.adidas.app"
    })
    time.sleep(3)

    contexts = driver.contexts
    webview_found = any('WEBVIEW' in ctx and 'Terrace' not in ctx for ctx in contexts)
    print(f"[4] 컨텍스트: {contexts}")
    print(f"[4] 로그인 웹뷰 {'발견' if webview_found else '미발견'}")

    if webview_found:
        print("\n테스트 성공! 리셋 후 로그인 화면 정상 접근 가능")
    else:
        print("\n테스트 주의: 웹뷰 미발견 - 앱 상태 확인 필요")
except Exception as e:
    print(f"[4] 딥링크 오류: {e}")

# 5. 정리
driver.quit()
print("\n[5] Appium 세션 종료")
print("=" * 60)
print("테스트 완료")
