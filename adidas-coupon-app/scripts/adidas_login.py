"""
아디다스 모바일 로그인 공통 모듈
- extract_account.py와 issue_coupon_mobile.py에서 공통으로 사용
- 웹뷰 방식 로그인 및 토큰 추출
- 멀티 인스턴스 관리 (BOT_BLOCKED 시 인스턴스 전환)
"""
import sys
import os
import json
import time
import uuid
import random
import subprocess
import threading
import functools
from typing import Optional, Tuple
from selenium.webdriver.common.by import By

# stdout 버퍼링 비활성화 (실시간 로그 출력)
print = functools.partial(print, flush=True)

ADB_PATH = 'C:\\platform-tools\\adb.exe'
ADIDAS_PACKAGE = 'com.adidas.app'

# BOT_BLOCKED 발생 시 즉시 인스턴스 전환
DEVICE_RESET_THRESHOLD = 1

# MuMu Player 경로
MUMU_MANAGER = r'C:\Program Files\Netease\MuMuPlayer\nx_main\MuMuManager.exe'
MUMU_CONFIG_BASE = r'C:\Program Files\Netease\MuMuPlayer\vms'

# 디바이스 프로필 풀 (MuMu 설정 파일 변경용)
DEVICE_PROFILES = [
    {'brand': 'Samsung', 'code': 'dm3q', 'miit': 'SM-S911N', 'model': 'Galaxy S23'},
    {'brand': 'Samsung', 'code': 'e3q', 'miit': 'SM-S928N', 'model': 'Galaxy S24 Ultra'},
    {'brand': 'Samsung', 'code': 'b4q', 'miit': 'SM-S926N', 'model': 'Galaxy S24+'},
    {'brand': 'Samsung', 'code': 'dm1q', 'miit': 'SM-S911B', 'model': 'Galaxy S23'},
    {'brand': 'Samsung', 'code': 'q5q', 'miit': 'SM-F946B', 'model': 'Galaxy Z Fold5'},
    {'brand': 'Samsung', 'code': 'r0q', 'miit': 'SM-S908B', 'model': 'Galaxy S22 Ultra'},
    {'brand': 'Samsung', 'code': 'pa3q', 'miit': 'SM-S938U', 'model': 'Galaxy S25 Ultra'},
]

# 기본 MuMu 인스턴스 설정 (인스턴스 0은 사용 안 함)
DEFAULT_INSTANCES = [
    {
        'mumu_index': 1,
        'name': 'MuMu-01',
        'config_dir': 'MuMuPlayerGlobal-12.0-1',
    },
]


class InstanceManager:
    """
    MuMu 멀티 인스턴스 관리자
    - BOT_BLOCKED 발생 시 다른 인스턴스로 전환
    - 차단된 인스턴스는 백그라운드에서 새 디바이스로 리부팅
    - Appium 서버는 유지, 드라이버 세션만 교체
    """

    def __init__(self, instances=None):
        self.instances = instances or DEFAULT_INSTANCES
        self.current_idx = 0
        self.driver = None
        self._reboot_ready = {inst['mumu_index']: True for inst in self.instances}
        self._needs_onboarding = {}
        self._used_profiles = []
        self._lock = threading.Lock()

    def get_current_instance(self):
        return self.instances[self.current_idx]

    def read_adb_udid(self, config_dir=None):
        """vm_config.json에서 ADB 포트를 읽어 UDID 반환"""
        if config_dir is None:
            config_dir = self.get_current_instance()['config_dir']
        vm_path = os.path.join(MUMU_CONFIG_BASE, config_dir, 'configs', 'vm_config.json')
        try:
            with open(vm_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            port = config['vm']['nat']['port_forward']['adb']['host_port']
            return f'127.0.0.1:{port}'
        except Exception as e:
            print(f"  [경고] ADB 포트 읽기 실패 ({config_dir}): {e}")
            return None

    def create_driver(self, handle_onboarding=False):
        """현재 인스턴스에 Appium 드라이버 생성"""
        from appium import webdriver as appium_webdriver
        from appium.options.android import UiAutomator2Options

        inst = self.get_current_instance()

        # 실제 폰(udid 직접 지정) vs MuMu 에뮬레이터
        if inst.get('udid'):
            udid = inst['udid']
            print(f"[실제 폰] ADB 연결 확인 중: {udid}...")
            # 실제 폰은 adb connect 불필요, 연결 확인만
            for _ in range(5):
                result = subprocess.run(
                    [ADB_PATH, '-s', udid, 'shell', 'echo', 'ok'],
                    capture_output=True, text=True, timeout=5
                )
                if result.stdout.strip() == 'ok':
                    break
                time.sleep(2)
            else:
                print(f"  [경고] ADB 연결 확인 실패: {udid}")
        else:
            udid = self.read_adb_udid()
            # MuMu 인스턴스는 명시적 connect 필요
            print(f"[인스턴스] ADB 연결 중: {udid}...")
            subprocess.run(
                [ADB_PATH, 'connect', udid],
                capture_output=True, text=True, timeout=10
            )
            for _ in range(5):
                result = subprocess.run(
                    [ADB_PATH, '-s', udid, 'shell', 'echo', 'ok'],
                    capture_output=True, text=True, timeout=5
                )
                if result.stdout.strip() == 'ok':
                    break
                time.sleep(2)
            else:
                print(f"  [경고] ADB 연결 확인 실패: {udid}")

        options = UiAutomator2Options()
        options.platform_name = 'Android'
        options.automation_name = 'UiAutomator2'
        options.app_package = ADIDAS_PACKAGE
        options.no_reset = True
        options.new_command_timeout = 600

        android_home = 'C:\\platform-tools'
        options.set_capability('appium:androidSdkRoot', android_home)
        options.set_capability('appium:adbExecTimeout', 60000)
        options.set_capability('appium:chromedriverAutodownload', True)
        # 실제 폰은 UiAutomator2 서버 설치 필요, 에뮬레이터는 스킵
        if not inst.get('udid'):
            options.set_capability('appium:skipServerInstallation', True)
        options.set_capability('appium:udid', udid)

        self.driver = appium_webdriver.Remote('http://localhost:4723', options=options)
        device_label = f"{inst['name']}" if inst.get('udid') else f"{inst['name']}, MuMu #{inst['mumu_index']}"
        print(f"[Appium] 연결 완료: {udid} ({device_label})")

        # 앱 활성화
        self.driver.activate_app(ADIDAS_PACKAGE)
        if handle_onboarding:
            time.sleep(5)
            dismiss_onboarding_popup(self.driver, timeout=10)
        else:
            time.sleep(2)

        return self.driver, udid

    def switch_instance(self):
        """
        BOT_BLOCKED 시 다른 인스턴스로 전환.
        차단된 인스턴스는 백그라운드에서 새 디바이스로 리부팅.
        Returns: (new_driver, new_udid)
        """
        blocked_inst = self.get_current_instance()

        print(f"\n{'='*60}")
        print(f"[인스턴스 전환] {blocked_inst['name']} 차단됨 → 다른 인스턴스로 전환")
        print(f"{'='*60}")

        # 1. 현재 드라이버 종료
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None

        # 2. 차단된 인스턴스 백그라운드 리부팅
        self._reboot_in_background(blocked_inst)

        # 3. 다음 인스턴스로 전환
        self.current_idx = (self.current_idx + 1) % len(self.instances)
        next_inst = self.get_current_instance()

        # 4. 다음 인스턴스가 리부팅 중이면 대기
        mumu_idx = next_inst['mumu_index']
        if not self._reboot_ready.get(mumu_idx, True):
            print(f"[인스턴스 전환] {next_inst['name']} 부팅 대기 중...")
            self._wait_for_reboot(mumu_idx, timeout=120)

        # 5. 새 드라이버 생성 (전환 시 항상 온보딩 팝업 체크)
        self._needs_onboarding.pop(mumu_idx, None)
        driver, udid = self.create_driver(handle_onboarding=True)

        print(f"[인스턴스 전환] 완료: {next_inst['name']} ({udid})\n")
        return driver, udid

    def _reboot_in_background(self, instance):
        """백그라운드 스레드에서 인스턴스 재부팅 (새 디바이스 프로필)"""
        mumu_idx = instance['mumu_index']
        config_dir = instance['config_dir']
        self._reboot_ready[mumu_idx] = False

        def _do_reboot():
            try:
                # 1. 종료
                print(f"  [백그라운드] #{mumu_idx} ({instance['name']}) 종료 중...")
                self._mumu_command(mumu_idx, 'shutdown_player')
                time.sleep(5)

                # 2. 디바이스 설정 변경
                profile = self._get_next_profile()
                self._update_config_files(config_dir, profile)
                print(f"  [백그라운드] #{mumu_idx} 디바이스 변경: {profile['model']} ({profile['miit']})")

                # 3. 재기동
                print(f"  [백그라운드] #{mumu_idx} 기동 중...")
                self._mumu_command(mumu_idx, 'launch_player')
                time.sleep(10)  # 포트 할당 대기

                # 4. ADB 준비 대기
                udid = self.read_adb_udid(config_dir)
                if udid:
                    # ADB 연결
                    subprocess.run(
                        [ADB_PATH, 'connect', udid],
                        capture_output=True, text=True, timeout=10
                    )
                    self._wait_for_adb_ready(udid, timeout=60)

                    # 앱 데이터 클리어
                    _adb(udid, 'pm', 'clear', ADIDAS_PACKAGE)
                    print(f"  [백그라운드] #{mumu_idx} 앱 클리어 완료")

                self._needs_onboarding[mumu_idx] = True
                self._reboot_ready[mumu_idx] = True
                print(f"  [백그라운드] #{mumu_idx} 준비 완료!")

            except Exception as e:
                print(f"  [백그라운드] #{mumu_idx} 리부팅 오류: {e}")
                self._reboot_ready[mumu_idx] = True  # 데드락 방지

        thread = threading.Thread(target=_do_reboot, daemon=True)
        thread.start()

    def _mumu_command(self, mumu_index, command):
        """MuMuManager 명령 실행"""
        result = subprocess.run(
            [MUMU_MANAGER, 'api', '-v', str(mumu_index), command],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout.strip()

    def _get_next_profile(self):
        """미사용 디바이스 프로필 선택 + 랜덤 IMEI/VDID 생성"""
        with self._lock:
            available = [p for p in DEVICE_PROFILES if p['miit'] not in self._used_profiles]
            if not available:
                self._used_profiles.clear()
                available = DEVICE_PROFILES
            profile = random.choice(available)
            self._used_profiles.append(profile['miit'])

        profile = profile.copy()
        profile['imei'] = self._generate_random_imei()
        profile['vdid'] = str(uuid.uuid4())
        return profile

    @staticmethod
    def _generate_random_imei():
        """유효한 15자리 IMEI 생성 (Luhn 체크 디짓)"""
        digits = [random.randint(0, 9) for _ in range(14)]
        total = 0
        for i, d in enumerate(digits):
            if i % 2 == 1:
                d *= 2
                if d > 9:
                    d -= 9
            total += d
        check = (10 - (total % 10)) % 10
        digits.append(check)
        return ''.join(map(str, digits))

    def _update_config_files(self, config_dir, profile):
        """vm_config.json과 customer_config.json의 디바이스 정보 업데이트"""
        config_base = os.path.join(MUMU_CONFIG_BASE, config_dir, 'configs')

        # vm_config.json
        vm_path = os.path.join(config_base, 'vm_config.json')
        with open(vm_path, 'r', encoding='utf-8') as f:
            vm = json.load(f)
        phone = vm['vm']['phone']
        phone['brand'] = profile['brand']
        phone['code'] = profile['code']
        phone['imei'] = profile['imei']
        phone['manufacturer'] = profile['brand']
        phone['miit'] = profile['miit']
        phone['model'] = profile['model']
        phone['vdid'] = profile['vdid']
        with open(vm_path, 'w', encoding='utf-8') as f:
            json.dump(vm, f, indent=2, ensure_ascii=False)

        # customer_config.json
        cust_path = os.path.join(config_base, 'customer_config.json')
        with open(cust_path, 'r', encoding='utf-8') as f:
            cust = json.load(f)
        if 'phone' in cust.get('setting', {}):
            cp = cust['setting']['phone']
            cp['brand'] = profile['brand']
            cp['code'] = profile['code']
            cp['imei'] = profile['imei']
            cp['manufacturer'] = profile['brand']
            cp['miit'] = profile['miit']
            cp['model'] = profile['model']
            cp['vdid'] = profile['vdid']
            with open(cust_path, 'w', encoding='utf-8') as f:
                json.dump(cust, f, indent=2, ensure_ascii=False)

    @staticmethod
    def _wait_for_adb_ready(udid, timeout=60):
        """ADB 연결 및 부팅 완료 대기"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                result = subprocess.run(
                    [ADB_PATH, '-s', udid, 'shell', 'getprop', 'sys.boot_completed'],
                    capture_output=True, text=True, timeout=5
                )
                if result.stdout.strip() == '1':
                    time.sleep(3)
                    return True
            except:
                pass
            time.sleep(3)
        return False

    def _wait_for_reboot(self, mumu_index, timeout=120):
        """인스턴스 리부팅 완료 대기"""
        start = time.time()
        while time.time() - start < timeout:
            if self._reboot_ready.get(mumu_index, True):
                return True
            time.sleep(2)
        print(f"  [경고] 인스턴스 #{mumu_index} 대기 타임아웃 ({timeout}초)")
        return False

    def cleanup(self):
        """드라이버 정리"""
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None


def _adb(udid: str, *args) -> str:
    """ADB 명령 실행 헬퍼"""
    cmd = [ADB_PATH, '-s', udid, 'shell'] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    return result.stdout.strip()


def reset_device_identity(driver, udid: str) -> bool:
    """
    디바이스 식별자 전체 리셋:
    - Android ID 변경
    - Google Advertising ID 리셋
    - Google Services Framework ID 리셋
    - 디바이스 모델/빌드 정보 변경
    - 앱 데이터 클리어
    - 온보딩 팝업 처리
    """
    import random

    print("\n" + "=" * 60)
    print("[디바이스 리셋] BOT_BLOCKED 감지 - 디바이스 식별자 전체 변경")
    print("=" * 60)

    # 랜덤 디바이스 모델 풀 (삼성 한국 모델)
    device_models = [
        ('SM-S926N', 'samsung', 'Samsung'),   # Galaxy S24+
        ('SM-S928N', 'samsung', 'Samsung'),   # Galaxy S24 Ultra
        ('SM-G998N', 'samsung', 'Samsung'),   # Galaxy S21 Ultra
        ('SM-G996N', 'samsung', 'Samsung'),   # Galaxy S21+
        ('SM-S916N', 'samsung', 'Samsung'),   # Galaxy S23+
        ('SM-A546N', 'samsung', 'Samsung'),   # Galaxy A54
        ('SM-S711N', 'samsung', 'Samsung'),   # Galaxy S23 FE
    ]

    try:
        # 1. 앱 종료
        try:
            driver.terminate_app(ADIDAS_PACKAGE)
            print("  [1/7] 앱 종료")
        except:
            pass
        time.sleep(1)

        # 2. Android ID 변경
        new_android_id = uuid.uuid4().hex[:16]
        _adb(udid, 'settings', 'put', 'secure', 'android_id', new_android_id)
        print(f"  [2/7] Android ID 변경: {new_android_id}")

        # 3. Google Advertising ID 리셋
        _adb(udid, 'pm', 'clear', 'com.google.android.gms')
        print("  [3/7] Google Play Services 클리어 (GAID 리셋)")

        # 4. Google Services Framework ID 리셋
        _adb(udid, 'pm', 'clear', 'com.google.android.gsf')
        print("  [4/7] Google Services Framework 클리어 (GSF ID 리셋)")
        time.sleep(1)

        # 5. 디바이스 모델 변경
        model, brand, manufacturer = random.choice(device_models)
        _adb(udid, 'setprop', 'ro.product.model', model)
        _adb(udid, 'setprop', 'ro.product.brand', brand)
        _adb(udid, 'setprop', 'ro.product.manufacturer', manufacturer)
        print(f"  [5/7] 디바이스 모델 변경: {manufacturer} {model}")

        # 6. 아디다스 앱 데이터 클리어
        result = _adb(udid, 'pm', 'clear', ADIDAS_PACKAGE)
        print(f"  [6/7] 앱 데이터 클리어: {result}")
        time.sleep(2)

        # 7. 앱 재시작 + 온보딩 팝업 처리
        driver.activate_app(ADIDAS_PACKAGE)
        print("  [7/7] 앱 재시작")
        time.sleep(5)
        dismiss_onboarding_popup(driver)

        print("[디바이스 리셋] 완료\n")
        return True

    except Exception as e:
        print(f"[디바이스 리셋] 오류: {e}")
        return False


def dismiss_onboarding_popup(driver, timeout: int = 10) -> bool:
    """
    pm clear 후 앱 첫 실행 시 쇼핑 선호사항 팝업 처리
    '마지막 기회입니다! 쇼핑 선호사항을 설정하세요.' 화면에서 Menswear 클릭
    """
    from appium.webdriver.common.appiumby import AppiumBy

    try:
        driver.switch_to.context('NATIVE_APP')
    except:
        pass

    print("  [5/5] 온보딩 팝업 처리 중...")

    start = time.time()
    while time.time() - start < timeout:
        try:
            btn = driver.find_element(AppiumBy.XPATH, "//*[@text='Menswear']")
            if btn.is_displayed():
                btn.click()
                print("  [5/5] 온보딩 팝업: Menswear 선택 완료")
                time.sleep(2)
                return True
        except:
            pass
        time.sleep(0.5)

    print("  [5/5] 온보딩 팝업 미발견 (이미 처리됨 또는 타임아웃)")
    return False


def clear_webview_cookies(driver) -> bool:
    """웹뷰 쿠키 삭제 (토큰 포함)"""
    try:
        contexts = driver.contexts
        for ctx in contexts:
            if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                try:
                    driver.switch_to.context(ctx)
                    driver.delete_all_cookies()
                except:
                    pass
        driver.switch_to.context('NATIVE_APP')
        return True
    except:
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return False


def _check_native_error_popup(driver, webview_context: str) -> bool:
    """Native 팝업에서 '오류가 발생했습니다' 메시지 체크"""
    from appium.webdriver.common.appiumby import AppiumBy

    try:
        # Native 컨텍스트로 전환
        driver.switch_to.context('NATIVE_APP')
        time.sleep(0.3)

        # "오류가 발생했습니다" 메시지 찾기
        elements = driver.find_elements(AppiumBy.XPATH, "//*[contains(@text, '오류가 발생했습니다')]")
        for elem in elements:
            if elem.is_displayed():
                error_text = elem.text
                print(f"  [Native] 에러 팝업 발견: {error_text}")

                # 확인/닫기 버튼 찾아서 클릭
                try:
                    ok_buttons = driver.find_elements(AppiumBy.XPATH,
                        "//*[contains(@text, '확인') or contains(@text, '닫기') or contains(@text, 'OK')]")
                    for btn in ok_buttons:
                        if btn.is_displayed():
                            btn.click()
                            print(f"  [Native] 팝업 닫기 버튼 클릭")
                            time.sleep(0.5)
                            break
                except:
                    pass

                print("[ERROR] BOT_BLOCKED")
                _close_webview_on_error(driver)
                return True

        # 에러 없으면 WebView로 복귀
        driver.switch_to.context(webview_context)
        return False

    except Exception as e:
        # 복구 시도
        try:
            driver.switch_to.context(webview_context)
        except:
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
        return False


def _close_webview_on_error(driver) -> None:
    """웹뷰 로그인 에러 발생 시 웹뷰 닫고 앱 재시작"""
    print("  [정리] 에러 발생으로 웹뷰 닫는 중...")
    try:
        # 1. Native로 전환
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass

        # 2. 뒤로가기로 웹뷰 닫기 시도
        try:
            driver.back()
            time.sleep(0.5)
        except:
            pass

        # 3. 앱 종료 후 재시작
        try:
            driver.terminate_app('com.adidas.app')
            print("  [정리] 앱 종료")
            time.sleep(1.5)
            driver.activate_app('com.adidas.app')
            print("  [정리] 앱 재시작")
            time.sleep(2)
        except Exception as e:
            print(f"  [정리] 앱 재시작 실패: {e}")

        # 4. Native 컨텍스트 확인
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass

        print("  [정리] 완료")
    except Exception as e:
        print(f"  [정리] 오류: {e}")


def wait_for_element(driver, by, value, timeout=10, condition='presence'):
    """요소 대기 (presence 또는 clickable)"""
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        if condition == 'clickable':
            element = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
        else:
            element = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
        return element
    except:
        return None


def login_with_driver(driver, email: str, password: str, is_batch_continuation: bool = False) -> Tuple[bool, Optional[str]]:
    """
    웹뷰 컨텍스트에서 로그인하여 토큰 추출 (공통 함수)

    Args:
        driver: Appium 드라이버
        email: 이메일
        password: 비밀번호
        is_batch_continuation: 배치 모드에서 첫 번째 계정 이후인지 여부

    Returns:
        (success: bool, token_or_error: Optional[str])
        - 성공 시: (True, access_token) 또는 (True, None) - 토큰 없이 로그인만 성공
        - 실패 시: (False, "PASSWORD_WRONG") 또는 (False, "BOT_BLOCKED") 또는 (False, None)
    """
    try:
        print("=" * 60)
        print("Adidas 로그인 (웹뷰 방식)")
        print("=" * 60)
        print(f"계정: {email}")
        if is_batch_continuation:
            print("  [배치 모드] 빠른 처리 활성화\n")
        else:
            print()

        # [0단계] 배치 모드에서 이전 계정 로그아웃 및 앱 재시작 (중요!)
        if is_batch_continuation:
            print("[0단계] 이전 계정 정리 및 앱 완전 초기화")

            # 1. Native 컨텍스트로 먼저 전환
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass

            # 2. 앱 완전 종료 (force stop) — 웹뷰 쿠키 삭제보다 먼저 실행
            try:
                driver.terminate_app('com.adidas.app')
                print("  앱 종료 (terminate)")
                time.sleep(1.5)
            except Exception as e:
                print(f"  앱 종료 실패: {e}")

            # 3. 앱 재시작
            try:
                driver.activate_app('com.adidas.app')
                print("  앱 재시작 (activate)")
                time.sleep(3)
            except Exception as e:
                print(f"  앱 재시작 실패: {e}")

            # 4. Native 컨텍스트 확인
            try:
                driver.switch_to.context('NATIVE_APP')
                print("  Native 컨텍스트 전환 완료")
            except Exception as e:
                print(f"  Native 전환 실패: {e}")

        # [1단계] 딥링크로 로그인 화면 직접 이동 (재시도 포함)
        print("[1단계] 로그인 화면 이동 (딥링크)")

        adidas_webview = None
        max_deeplink_retry = 3

        for deeplink_attempt in range(max_deeplink_retry):
            if deeplink_attempt > 0:
                print(f"\n  딥링크 재시도 ({deeplink_attempt + 1}/{max_deeplink_retry})...")
                time.sleep(1)

            driver.execute_script("mobile: deepLink", {
                "url": "adidas://login",
                "package": "com.adidas.app"
            })
            print("  adidas://login 딥링크 실행")
            time.sleep(2 if deeplink_attempt > 0 else 1.5)

            # [2단계] 웹뷰 컨텍스트로 전환
            if deeplink_attempt == 0:
                print("\n[2단계] 웹뷰 컨텍스트 전환")
            time.sleep(1)

            start_wait = time.time()
            max_wait = 8

            while time.time() - start_wait < max_wait:
                try:
                    contexts = driver.contexts
                except Exception as e:
                    print(f"  컨텍스트 목록 조회 실패: {e}")
                    time.sleep(0.5)
                    continue

                webview_contexts = [ctx for ctx in contexts if 'WEBVIEW' in ctx and 'Terrace' not in ctx]

                for ctx in webview_contexts:
                    try:
                        driver.switch_to.context(ctx)
                        url = driver.current_url
                        print(f"  {ctx} URL: {url}")

                        if 'adidas' in url.lower():
                            adidas_webview = ctx
                            print(f"  아디다스 웹뷰 발견: {ctx}")
                            break
                        else:
                            driver.switch_to.context('NATIVE_APP')
                    except Exception as e:
                        try:
                            driver.switch_to.context('NATIVE_APP')
                        except:
                            pass

                if adidas_webview:
                    elapsed = time.time() - start_wait
                    print(f"  아디다스 웹뷰 확정: {adidas_webview} ({elapsed:.1f}초)")
                    break

                time.sleep(0.3)

            if adidas_webview:
                break

            # 웹뷰 못 찾으면 Native로 돌아가서 다시 시도
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass

        if not adidas_webview:
            print("  아디다스 웹뷰를 찾을 수 없습니다 (모든 재시도 실패)")
            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # [3단계] 웹뷰에서 로그인
        print("\n[3단계] 웹뷰에서 로그인")
        current_url = driver.current_url
        print(f"  현재 URL: {current_url}")

        # 로그인 전 기존 토큰 쿠키 삭제
        try:
            old_cookies = driver.get_cookies()
            token_cookies_to_delete = ['account.grant.accessToken', 'account.grant.refreshToken']
            for cookie in old_cookies:
                if cookie.get('name') in token_cookies_to_delete:
                    driver.delete_cookie(cookie.get('name'))
                    print(f"  기존 토큰 쿠키 삭제: {cookie.get('name')}")
        except Exception as e:
            pass

        # 이메일 입력
        email_input = None
        email_selectors = [
            'input[name="email"]',
            'input[type="email"]',
            '#login\\.email\\.input',
            'input[id*="email"]',
        ]

        start_find = time.time()
        max_find_wait = 5

        while time.time() - start_find < max_find_wait:
            for selector in email_selectors:
                try:
                    email_input = driver.find_element(By.CSS_SELECTOR, selector)
                    if email_input and email_input.is_displayed():
                        elapsed = time.time() - start_find
                        print(f"  이메일 필드 발견: {selector} ({elapsed:.1f}초)")
                        break
                except:
                    continue

            if email_input:
                break
            time.sleep(0.2)

        if email_input:
            try:
                # WebView 컨텍스트 유효성 재확인
                current_ctx = driver.current_context
                if 'WEBVIEW' not in current_ctx:
                    print(f"  [경고] WebView 컨텍스트 이탈 ({current_ctx}), 재연결...")
                    driver.switch_to.context(adidas_webview)
                    time.sleep(0.3)
                    # 이메일 필드 다시 찾기
                    email_input = driver.find_element(By.CSS_SELECTOR, 'input[name="email"]')

                # 먼저 JavaScript로 직접 입력 시도 (send_keys가 안먹히는 문제 해결)
                print(f"  이메일 JavaScript로 직접 입력...")
                driver.execute_script("""
                    var input = arguments[0];
                    var value = arguments[1];
                    input.focus();
                    input.value = '';
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                """, email_input, email)
                time.sleep(0.3)

                # 입력 확인
                entered_value = email_input.get_attribute('value') or ''
                if email.lower() not in entered_value.lower():
                    print(f"  [경고] JavaScript 입력 실패 ({entered_value}), send_keys로 재시도...")
                    email_input.click()
                    time.sleep(0.1)
                    email_input.clear()
                    time.sleep(0.1)
                    email_input.send_keys(email)
                    time.sleep(0.2)
                    entered_value = email_input.get_attribute('value') or ''

                if email.lower() in entered_value.lower():
                    print(f"  이메일 입력 완료: {entered_value}")
                else:
                    print(f"  [오류] 이메일 입력 실패: 입력={entered_value}, 예상={email}")
                    driver.switch_to.context('NATIVE_APP')
                    return (False, None)
            except Exception as e:
                print(f"  이메일 입력 실패: {e}")
                driver.switch_to.context('NATIVE_APP')
                return (False, None)
        else:
            print(f"  이메일 필드 찾기 실패 - 이미 로그인된 상태일 수 있음")
            # URL 확인하여 이미 로그인된 상태인지 체크
            try:
                current_url = driver.current_url
                if 'login' not in current_url.lower() and 'account-portal' not in current_url.lower():
                    print(f"  현재 URL: {current_url} - 로그인 화면 아님")
            except:
                pass
            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # 비밀번호 입력
        password_input = None
        password_selectors = [
            'input[type="password"]',
            'input[name="password"]',
            '#login\\.password\\.input',
            'input[id*="password"]',
        ]

        for selector in password_selectors:
            try:
                password_input = driver.find_element(By.CSS_SELECTOR, selector)
                if password_input and password_input.is_displayed():
                    print(f"  비밀번호 필드 발견: {selector}")
                    break
                password_input = None
            except:
                continue

        if password_input:
            try:
                # WebView 컨텍스트 유효성 재확인
                current_ctx = driver.current_context
                if 'WEBVIEW' not in current_ctx:
                    print(f"  [경고] WebView 컨텍스트 이탈 ({current_ctx}), 재연결...")
                    driver.switch_to.context(adidas_webview)
                    time.sleep(0.3)
                    # 비밀번호 필드 다시 찾기
                    password_input = driver.find_element(By.CSS_SELECTOR, 'input[type="password"]')

                # 먼저 JavaScript로 직접 입력 시도 (send_keys가 안먹히는 문제 해결)
                print(f"  비밀번호 JavaScript로 직접 입력...")
                driver.execute_script("""
                    var input = arguments[0];
                    var value = arguments[1];
                    input.focus();
                    input.value = '';
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                """, password_input, password)
                time.sleep(0.3)

                # 입력 확인
                entered_len = len(password_input.get_attribute('value') or '')
                if entered_len >= len(password):
                    print(f"  비밀번호 입력 완료 ({entered_len}자)")
                else:
                    print(f"  [경고] JavaScript 입력 부족 ({entered_len}자), send_keys로 재시도")
                    password_input.clear()
                    time.sleep(0.1)
                    password_input.send_keys(password)
                    time.sleep(0.2)
                    entered_len = len(password_input.get_attribute('value') or '')
                    print(f"  send_keys 후 비밀번호 길이: {entered_len}자")
            except Exception as e:
                print(f"  비밀번호 입력 실패: {e}")
                driver.switch_to.context('NATIVE_APP')
                return (False, None)
        else:
            print(f"  비밀번호 필드 찾기 실패")
            driver.switch_to.context('NATIVE_APP')
            return (False, None)

        # 로그인 버튼 클릭 (웹뷰 컨텍스트에서 직접 JavaScript로 클릭)
        # 주의: hide_keyboard()는 Enter 키를 전송하여 폼이 자동 제출되므로 사용하지 않음
        try:
            driver.execute_script("""
                // 키보드 포커스 해제 (Enter 전송 없이)
                document.activeElement.blur();
                // submit 버튼 클릭
                var btn = document.querySelector('button[type="submit"]')
                    || document.querySelector('#login-submit-button')
                    || document.querySelector('input[type="submit"]');
                if (btn) {
                    btn.scrollIntoView({block: 'center'});
                    btn.click();
                } else {
                    // 버튼 못 찾으면 form submit
                    var form = document.querySelector('form');
                    if (form) form.submit();
                }
            """)
            print(f"  로그인 버튼 클릭 (JavaScript)")
        except Exception as e:
            err_msg = str(e)
            if 'window already closed' in err_msg or 'web view not found' in err_msg:
                # 웹뷰 닫힘 = 이미 로그인 완료 (send_keys가 자동 submit 트리거)
                print(f"  웹뷰 닫힘 - 로그인 자동 완료")
            else:
                print(f"  로그인 버튼 클릭 실패: {e}")
                try:
                    driver.switch_to.context('NATIVE_APP')
                except:
                    pass
                return (False, None)

        # [4단계] 토큰 추출
        print("\n[4단계] 토큰 추출 시작")
        access_token = None
        start_time = time.time()
        max_wait = 15  # 대기 시간 증가
        last_log_time = -1
        last_error_check = -10  # 첫 체크가 바로 실행되도록
        webview_closed = False
        password_checked = False

        # 로그인 버튼 클릭 직후 잠시 대기 (토큰 쿠키 생성 대기)
        time.sleep(0.5)

        while time.time() - start_time < max_wait:
            try:
                elapsed = int(time.time() - start_time)

                current_context = driver.current_context

                if 'WEBVIEW' not in current_context:
                    contexts = driver.contexts
                    webview_ctx = None
                    for ctx in contexts:
                        if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                            webview_ctx = ctx
                            break

                    if webview_ctx:
                        driver.switch_to.context(webview_ctx)
                        print(f"  [{elapsed}초] 웹뷰 전환: {webview_ctx}")
                    else:
                        if elapsed > 1:
                            print(f"  [{elapsed}초] 웹뷰 닫힘 - 로그인 성공 추정")
                            webview_closed = True
                            break
                        time.sleep(0.2)
                        continue

                # 웹뷰에서 쿠키 조회
                try:
                    cookies = driver.get_cookies()
                    if cookies:
                        # 토큰 관련 쿠키 찾기 (여러 가능한 이름)
                        token_cookie_names = [
                            'account.grant.accessToken',
                            'accessToken',
                            'access_token',
                            'token',
                            'auth_token'
                        ]
                        for cookie in cookies:
                            cookie_name = cookie.get('name', '')
                            if cookie_name in token_cookie_names or 'accesstoken' in cookie_name.lower():
                                access_token = cookie.get('value')
                                print(f"  [{elapsed}초] 토큰 획득 성공! (쿠키: {cookie_name})")
                                try:
                                    driver.delete_cookie(cookie_name)
                                    driver.delete_cookie('account.grant.refreshToken')
                                except:
                                    pass
                                break

                        if access_token:
                            break

                        # 쿠키에서 못 찾으면 localStorage 시도
                        if not access_token and elapsed >= 2:
                            try:
                                ls_token = driver.execute_script(
                                    "return localStorage.getItem('account.grant.accessToken') || "
                                    "localStorage.getItem('accessToken') || "
                                    "localStorage.getItem('token');"
                                )
                                if ls_token:
                                    access_token = ls_token
                                    print(f"  [{elapsed}초] 토큰 획득 성공! (localStorage)")
                                    break
                            except:
                                pass

                        if elapsed - last_log_time >= 1:
                            cookie_names = [c.get('name', '') for c in cookies]
                            token_related = [n for n in cookie_names if 'token' in n.lower() or 'grant' in n.lower() or 'auth' in n.lower()]
                            print(f"  [{elapsed}초] 쿠키 {len(cookies)}개, 토큰관련: {token_related}")
                            # 첫 3초 동안 모든 쿠키 이름 출력 (디버깅용)
                            if elapsed <= 3:
                                print(f"    모든 쿠키: {cookie_names[:10]}...")
                            last_log_time = elapsed

                    # 2초 이후부터 3초 간격으로 에러 반복 체크
                    if elapsed >= 2 and (not password_checked or elapsed - last_error_check >= 3):
                        password_checked = True
                        last_error_check = elapsed
                        print(f"  [{elapsed}초] 오류 체크")

                        # Native 팝업(다이얼로그) 먼저 체크
                        native_error_found = _check_native_error_popup(driver, adidas_webview)
                        if native_error_found:
                            return (False, "BOT_BLOCKED")

                        # WebView 에러 셀렉터 체크
                        error_selectors = [
                            '#password--error',
                            '.gl-form-notice__error',
                            '.gl-form-hint--error',
                            '[data-auto-id="login-error"]',
                            'p[class*="_error_"]',
                            '.error-message',
                            '[class*="error"]',
                        ]

                        for selector in error_selectors:
                            try:
                                error_elements = driver.find_elements(By.CSS_SELECTOR, selector)
                                for elem in error_elements:
                                    if elem.is_displayed():
                                        error_text = elem.text.strip()
                                        if error_text:
                                            print(f"  에러 발견 ({selector}): {error_text}")
                                            error_lower = error_text.lower()

                                            # 봇 차단/일반 오류 패턴 (우선 체크)
                                            bot_error_patterns = [
                                                '오류가 발생했습니다', '다시 시도하세요', 'error occurred', 'try again',
                                                '웹뷰 로그인', '로그인 시 오류', '문제가 발생'
                                            ]
                                            if any(err.lower() in error_lower for err in bot_error_patterns):
                                                print(f"  봇 차단 또는 일반 오류 감지: {error_text}")
                                                print("[ERROR] BOT_BLOCKED")
                                                _close_webview_on_error(driver)
                                                return (False, "BOT_BLOCKED")

                                            # 비밀번호 오류 패턴
                                            password_error_patterns = [
                                                '이메일 또는 비밀번호가 잘못', '비밀번호가 올바르지',
                                                'invalid email or password', 'incorrect password',
                                                'wrong password', 'invalid credentials'
                                            ]
                                            if any(err.lower() in error_lower for err in password_error_patterns):
                                                print(f"  비밀번호 오류 감지: {error_text}")
                                                print("[ERROR] PASSWORD_WRONG")
                                                _close_webview_on_error(driver)
                                                return (False, "PASSWORD_WRONG")
                            except:
                                pass

                except Exception as cookie_err:
                    if 'no such window' in str(cookie_err) or 'web view not found' in str(cookie_err):
                        print(f"  [{elapsed}초] 웹뷰 닫힘 감지")
                        webview_closed = True
                        break

                time.sleep(0.2)

            except Exception as e:
                err_str = str(e)
                if 'no such window' in err_str or 'web view not found' in err_str:
                    print(f"  웹뷰 닫힘 - 루프 종료")
                    webview_closed = True
                    break
                print(f"  오류: {err_str[:50]}")
                time.sleep(0.2)
                continue

        # 네이티브로 복귀
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass

        if access_token:
            print("  로그인 성공!")
            return (True, access_token)

        # 웹뷰가 닫혔으면 (로그인 성공) 다시 로그인 딥링크로 이동해서 토큰 가져오기
        if webview_closed:
            print("\n[4-1단계] 로그인 웹뷰 재진입하여 토큰 추출")
            try:
                driver.execute_script("mobile: deepLink", {
                    "url": "adidas://login",
                    "package": "com.adidas.app"
                })
                time.sleep(1.5)

                # 웹뷰 컨텍스트 찾기 (최대 3초)
                for attempt in range(6):
                    contexts = driver.contexts
                    for ctx in contexts:
                        if 'WEBVIEW' in ctx and 'Terrace' not in ctx:
                            try:
                                driver.switch_to.context(ctx)
                                cookies = driver.get_cookies()

                                # 토큰 쿠키 찾기
                                for cookie in cookies:
                                    cookie_name = cookie.get('name', '')
                                    if cookie_name == 'account.grant.accessToken' or 'accesstoken' in cookie_name.lower():
                                        access_token = cookie.get('value')
                                        print(f"  토큰 발견! (쿠키: {cookie_name})")
                                        driver.switch_to.context('NATIVE_APP')
                                        return (True, access_token)

                                driver.switch_to.context('NATIVE_APP')
                            except:
                                pass
                    time.sleep(0.5)
                print("  웹뷰 재진입 실패 - 토큰 없음")
            except Exception as e:
                print(f"  웹뷰 재진입 오류: {e}")

            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass

        print("  토큰 미발견 (추가 시도 필요)")
        return (True, None)

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()

        # 예외 메시지에서 비밀번호 오류 패턴 검사
        error_str = str(e).lower()
        password_patterns = ['password', '비밀번호', 'invalid', 'incorrect', 'wrong']
        if any(p in error_str for p in password_patterns):
            print("  [예외 분석] 비밀번호 오류로 추정")
            try:
                driver.switch_to.context('NATIVE_APP')
            except:
                pass
            return (False, "PASSWORD_WRONG")

        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return (False, None)


def logout_with_driver(driver) -> bool:
    """로그아웃 수행"""
    from appium.webdriver.common.appiumby import AppiumBy

    try:
        print("\n[로그아웃] 시작")

        # 딥링크로 프로필 화면 이동
        driver.execute_script("mobile: deepLink", {
            "url": "adidas://profile",
            "package": "com.adidas.app"
        })
        time.sleep(2)

        # 로그아웃 버튼 찾기 (스크롤 최대 2회)
        max_scroll = 2
        for scroll_count in range(max_scroll):
            try:
                # 로그아웃 버튼 찾기
                logout_btn = None
                for text in ['로그아웃', 'LOG OUT', 'Logout', 'Sign out']:
                    try:
                        logout_btn = driver.find_element(AppiumBy.XPATH,
                            f"//*[contains(@text, '{text}') or contains(@content-desc, '{text}')]")
                        if logout_btn:
                            break
                    except:
                        continue

                if logout_btn:
                    logout_btn.click()
                    print("  로그아웃 버튼 클릭")
                    time.sleep(1)

                    # 확인 버튼 클릭 (팝업이 있는 경우)
                    for confirm_text in ['확인', '예', 'Yes', 'OK', 'Confirm']:
                        try:
                            confirm_btn = driver.find_element(AppiumBy.XPATH,
                                f"//*[contains(@text, '{confirm_text}')]")
                            confirm_btn.click()
                            print("  로그아웃 확인")
                            break
                        except:
                            continue

                    time.sleep(1)
                    print("  로그아웃 완료")
                    return True

                # 스크롤 다운
                window_size = driver.get_window_size()
                driver.swipe(
                    window_size['width'] // 2,
                    int(window_size['height'] * 0.7),
                    window_size['width'] // 2,
                    int(window_size['height'] * 0.3),
                    500
                )
                time.sleep(0.5)

            except Exception as e:
                pass

        print("  로그아웃 버튼 찾기 실패")
        return False

    except Exception as e:
        print(f"  로그아웃 오류: {e}")
        return False


def get_token_from_webview(driver, max_wait: int = 8) -> Optional[str]:
    """
    웹뷰에서 토큰 쿠키 추출 (로그인 딥링크로 바로 접근)
    """
    print("\n[추가 토큰 추출] 로그인 웹뷰에서 토큰 확인...")

    try:
        # 로그인 딥링크로 바로 이동 (토큰 쿠키가 여기에 있음)
        driver.execute_script("mobile: deepLink", {
            "url": "adidas://login",
            "package": "com.adidas.app"
        })
        time.sleep(1.5)

        start_time = time.time()
        while time.time() - start_time < max_wait:
            elapsed = int(time.time() - start_time)
            contexts = driver.contexts
            webview_contexts = [ctx for ctx in contexts if 'WEBVIEW' in ctx and 'Terrace' not in ctx]

            if elapsed % 2 == 0:
                print(f"  [{elapsed}초] 웹뷰 컨텍스트: {webview_contexts}")

            for ctx in webview_contexts:
                try:
                    driver.switch_to.context(ctx)
                    cookies = driver.get_cookies()

                    # 토큰 쿠키 찾기
                    for cookie in cookies:
                        cookie_name = cookie.get('name', '')
                        if cookie_name == 'account.grant.accessToken' or 'accesstoken' in cookie_name.lower():
                            print(f"  토큰 발견! (쿠키: {cookie_name})")
                            driver.switch_to.context('NATIVE_APP')
                            return cookie.get('value')

                    driver.switch_to.context('NATIVE_APP')
                except:
                    try:
                        driver.switch_to.context('NATIVE_APP')
                    except:
                        pass

            time.sleep(0.5)

        print("  토큰 찾기 실패")
        return None

    except Exception as e:
        print(f"  토큰 추출 오류: {e}")
        try:
            driver.switch_to.context('NATIVE_APP')
        except:
            pass
        return None
