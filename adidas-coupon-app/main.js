const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

let mainWindow = null;
let tray = null;
let appiumProcess = null;
let server = null;

// 개발 모드 플래그 (true: 터미널 창으로 Appium 실행)
const DEV_MODE = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'adidas.png'),
        show: false,
    });

    // 메인 HTML 로드
    mainWindow.loadFile('index.html');

    // 준비되면 표시
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 닫기 버튼 클릭 시 트레이로 최소화
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    // adidas.png 아이콘 사용
    let icon;

    try {
        icon = nativeImage.createFromPath(path.join(__dirname, 'adidas.png'));
        // 트레이 아이콘은 작게 리사이즈 (16x16 또는 32x32)
        if (!icon.isEmpty()) {
            icon = icon.resize({ width: 16, height: 16 });
        } else {
            icon = nativeImage.createEmpty();
        }
    } catch (e) {
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('아디다스 쿠폰 관리자');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '열기',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '종료',
            click: () => {
                app.isQuitting = true;
                stopAppium();
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function startAppium() {
    stopAppium(false);

    try {
        const env = {
            ...process.env,
            ANDROID_HOME: 'C:\\platform-tools',
            ANDROID_SDK_ROOT: 'C:\\platform-tools',
            PATH: `C:\\platform-tools;${process.env.PATH}`
        };

        if (DEV_MODE) {
            // 개발 모드: 터미널 창 표시
            const cmd = 'cmd.exe';
            const args = [
                '/c', 'start', 'Appium Server', 'cmd', '/k',
                'set ANDROID_HOME=C:\\platform-tools&& set ANDROID_SDK_ROOT=C:\\platform-tools&& set PATH=%ANDROID_HOME%;%PATH%&& appium --allow-insecure=uiautomator2:chromedriver_autodownload --relaxed-security'
            ];

            appiumProcess = spawn(cmd, args, { shell: false, detached: true });
            appiumProcess.unref();

            setTimeout(() => {
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('appium-status', {
                        running: true,
                        message: 'Appium 서버가 시작되었습니다. (개발 모드)'
                    });
                }
            }, 2000);
        } else {
            // 운영 모드: 백그라운드로 실행 (터미널 창 없이)
            // Appium JS 파일을 node로 직접 실행 (콘솔 창 없음)
            const path = require('path');
            const appiumPath = path.join(process.env.APPDATA, 'npm', 'node_modules', 'appium', 'build', 'lib', 'main.js');

            appiumProcess = spawn('node', [
                appiumPath,
                '--allow-insecure=uiautomator2:chromedriver_autodownload',
                '--relaxed-security'
            ], {
                detached: true,
                stdio: 'ignore',
                env: env,
                windowsHide: true
            });

            appiumProcess.unref();

            setTimeout(() => {
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('appium-status', {
                        running: true,
                        message: 'Appium 서버가 백그라운드로 동작 중입니다.'
                    });
                }
            }, 2000);
        }
    } catch (error) {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('appium-status', {
                running: false,
                error: true,
                message: `Appium 시작 실패: ${error.message}`
            });
        }
    }
}

function stopAppium(sendNotification = true) {
    // 기존 프로세스 참조 정리
    if (appiumProcess) {
        try {
            process.kill(appiumProcess.pid);
        } catch (e) {}
        appiumProcess = null;
    }

    // 포트 4723을 사용하는 모든 프로세스 강제 종료
    try {
        // netstat으로 4723 포트 사용 프로세스 찾아서 종료
        try {
            spawnSync('cmd.exe', ['/c', 'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :4723 ^| findstr LISTENING\') do taskkill /F /PID %a'], {
                stdio: 'ignore',
                windowsHide: true
            });
        } catch (e) {
            // 프로세스가 없으면 에러 무시
        }

        // node.exe 중 appium 관련 프로세스 종료
        try {
            spawnSync('taskkill', ['/F', '/IM', 'node.exe', '/FI', 'WINDOWTITLE eq Appium*'], {
                stdio: 'ignore',
                windowsHide: true
            });
        } catch (e) {}

        console.log('[Appium] 서버 중지 완료');

        // 커스텀 알림 전송 (앱 내 알림창 사용)
        if (sendNotification && mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('appium-status', {
                running: false,
                message: 'Appium 서버가 종료되었습니다.'
            });
        }
    } catch (error) {
        console.error('[Appium] 중지 오류:', error.message);
    }
}

// 단일 인스턴스 강제
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    // 앱 준비
    app.whenReady().then(async () => {
        // 서버 모듈 로드 및 시작 (포트 8003)
        server = require('./server');
        await server.start(8003);

        createWindow();
        createTray();
    });
}

// 모든 창이 닫혀도 앱 유지 (트레이)
app.on('window-all-closed', () => {
    // macOS 제외하고는 트레이에서 실행 유지
});

// 두 번째 인스턴스 실행 시 기존 창 활성화
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// 앱 종료 시 정리
app.on('before-quit', () => {
    app.isQuitting = true;
    stopAppium(false); // 앱 종료 시에는 알림 없이 중지
});

// IPC 핸들러
ipcMain.handle('start-appium', () => {
    startAppium();
    return { success: true };
});

ipcMain.handle('stop-appium', () => {
    stopAppium();
    return { success: true };
});

ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
});

// Appium 실행 상태 확인 (외부에서 실행된 경우도 감지)
ipcMain.handle('check-appium-status', async () => {
    const http = require('http');

    return new Promise((resolve) => {
        const req = http.get('http://localhost:4723/status', { timeout: 2000 }, (res) => {
            if (res.statusCode === 200) {
                resolve({ running: true });
            } else {
                resolve({ running: false });
            }
        });

        req.on('error', () => {
            resolve({ running: false });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ running: false });
        });
    });
});

// 설치 스크립트 실행
ipcMain.handle('run-installer', (event, type) => {
    const { spawn } = require('child_process');
    const fs = require('fs');

    let batPath;

    if (type === 'web') {
        // 개발 모드와 빌드 모드에서 경로가 다름
        if (app.isPackaged) {
            batPath = path.join(process.resourcesPath, 'install_web_crawler.bat');
        } else {
            batPath = path.join(__dirname, 'install_web_crawler.bat');
        }

        if (!fs.existsSync(batPath)) {
            return { success: false, error: '설치 파일을 찾을 수 없습니다: ' + batPath };
        }

        // cmd 창에서 bat 파일 실행
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', batPath], {
            detached: true,
            shell: false
        });
        child.unref();

        return { success: true, message: '웹 크롤러 설치를 시작했습니다.' };
    } else if (type === 'mobile') {
        // 모바일 크롤러 설치 (full_install.bat)
        if (app.isPackaged) {
            batPath = path.join(process.resourcesPath, 'install_files', 'full_install.bat');
        } else {
            batPath = path.join(__dirname, 'install_files', 'full_install.bat');
        }

        if (!fs.existsSync(batPath)) {
            return { success: false, error: '설치 파일을 찾을 수 없습니다: ' + batPath };
        }

        // cmd 창에서 bat 파일 실행
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', batPath], {
            detached: true,
            shell: false
        });
        child.unref();

        return { success: true, message: '모바일 환경 설치를 시작했습니다. (MuMu Player, ADB, Appium)' };
    }

    return { success: false, error: '알 수 없는 설치 유형입니다.' };
});

// 설치 상태 확인 (Python, Chrome, pip 패키지 등)
ipcMain.handle('check-install-status', async () => {
    const fs = require('fs');

    // spawnSync 래퍼 (windowsHide 적용)
    function runCommand(cmd, args) {
        const result = spawnSync(cmd, args, {
            encoding: 'utf-8',
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return result.stdout || '';
    }

    const result = {
        web: {
            python: false,
            pythonPath: null,
            chrome: false,
            selenium: false,
            undetectedChromedriver: false,
            requests: false,
            allInstalled: false
        },
        mobile: {
            mumuPlayer: false,
            adb: false,
            appium: false,
            uiautomator2: false,
            appiumPython: false,
            allInstalled: false
        }
    };

    // 1. Python 확인 - 여러 방법으로 시도
    let pythonPath = null;

    // 방법 1: 저장된 설정에서 Python 경로 확인
    const settingsPath = path.join(app.getPath('userData'), 'python_settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.pythonPath && fs.existsSync(settings.pythonPath)) {
                pythonPath = settings.pythonPath;
            }
        } catch (e) {
            // Settings read error
        }
    }

    // 방법 2: where python 명령 (WindowsApps 경로 제외)
    if (!pythonPath) {
        try {
            const whereResult = runCommand('where', ['python']);
            // Windows 줄바꿈(\r\n)과 Unix 줄바꿈(\n) 모두 처리
            const paths = whereResult.trim().split(/\r?\n/);
            // WindowsApps 경로는 Windows Store alias로 pip가 없으므로 제외
            for (const p of paths) {
                const trimmedPath = p.trim().replace(/\r/g, '');
                if (trimmedPath &&
                    !trimmedPath.includes('WindowsApps') &&
                    fs.existsSync(trimmedPath)) {
                    pythonPath = trimmedPath;
                    break;
                }
            }
        } catch (e) {
            // where python failed
        }
    }

    // 방법 3: 일반적인 경로 확인
    if (!pythonPath) {
        const commonPaths = [
            process.env['LOCALAPPDATA'] + '\\Python\\bin\\python.exe',
            process.env['LOCALAPPDATA'] + '\\Programs\\Python\\Python311\\python.exe',
            process.env['LOCALAPPDATA'] + '\\Programs\\Python\\Python310\\python.exe',
            process.env['LOCALAPPDATA'] + '\\Programs\\Python\\Python39\\python.exe',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe',
            'C:\\Python39\\python.exe'
        ];

        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                pythonPath = p;
                console.log('[Install Check] Python found at common path:', pythonPath);
                break;
            }
        }
    }

    if (pythonPath) {
        result.web.python = true;
        result.web.pythonPath = pythonPath;
    }

    // 2. Chrome 확인
    const chromePaths = [
        process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe'
    ];

    result.web.chrome = chromePaths.some(p => {
        try {
            return fs.existsSync(p);
        } catch (e) {
            return false;
        }
    });

    // 3. Python이 설치된 경우에만 pip 패키지 확인
    if (result.web.python && pythonPath) {
        try {
            // 찾은 Python 경로를 직접 사용
            const pipList = runCommand(pythonPath, ['-m', 'pip', 'list']);
            result.web.selenium = pipList.toLowerCase().includes('selenium');
            result.web.undetectedChromedriver = pipList.toLowerCase().includes('undetected-chromedriver');
            result.web.requests = pipList.toLowerCase().includes('requests');
            console.log('[Install Check] Packages - selenium:', result.web.selenium,
                        'undetected-chromedriver:', result.web.undetectedChromedriver,
                        'requests:', result.web.requests);
        } catch (e) {
            console.log('[Install Check] pip list failed:', e.message);
            // pip 실패 시 모두 false 유지
        }
    }

    // 웹 크롤러 전체 설치 여부
    result.web.allInstalled = result.web.python &&
                              result.web.chrome &&
                              result.web.selenium &&
                              result.web.undetectedChromedriver &&
                              result.web.requests;

    // ========== 모바일 크롤러 설치 상태 확인 ==========

    // 1. MuMu Player 확인 (여러 경로 지원)
    const mumuPaths = [
        'C:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\MuMuManager.exe',
        'C:\\Program Files\\Netease\\MuMuPlayerGlobal-12.0\\shell\\MuMuManager.exe'
    ];
    result.mobile.mumuPlayer = mumuPaths.some(p => fs.existsSync(p));

    // 2. ADB (platform-tools) 확인
    const adbPath = 'C:\\platform-tools\\adb.exe';
    result.mobile.adb = fs.existsSync(adbPath);

    // 3. Appium 확인
    try {
        const appiumWhere = runCommand('where', ['appium']);
        result.mobile.appium = appiumWhere.trim().length > 0;
    } catch (e) {
        result.mobile.appium = false;
    }

    // 4. uiautomator2 드라이버 확인
    if (result.mobile.appium) {
        try {
            // Windows에서는 .cmd 확장자를 명시하거나 shell: true 사용 필요
            const driverResult = spawnSync('appium', ['driver', 'list', '--installed', '--json'], {
                encoding: 'utf-8',
                windowsHide: true,
                shell: true,  // Windows에서 .cmd 파일 실행을 위해 필요
                stdio: ['pipe', 'pipe', 'pipe']
            });
            const driverList = driverResult.stdout || '';
            result.mobile.uiautomator2 = driverList.includes('uiautomator2');
            console.log('[Install Check] uiautomator2 check:', result.mobile.uiautomator2, 'raw output length:', driverList.length);
        } catch (e) {
            console.log('[Install Check] uiautomator2 check failed:', e.message);
            result.mobile.uiautomator2 = false;
        }
    }

    // 5. Appium-Python-Client 확인
    if (result.web.python && pythonPath) {
        try {
            const pipList = runCommand(pythonPath, ['-m', 'pip', 'list']);
            result.mobile.appiumPython = pipList.toLowerCase().includes('appium-python-client');
        } catch (e) {
            result.mobile.appiumPython = false;
        }
    }

    // 모바일 크롤러 전체 설치 여부
    result.mobile.allInstalled = result.mobile.mumuPlayer &&
                                  result.mobile.adb &&
                                  result.mobile.appium &&
                                  result.mobile.uiautomator2 &&
                                  result.mobile.appiumPython;

    console.log('[Install Check] Web result:', JSON.stringify(result.web));
    console.log('[Install Check] Mobile - mumuPlayer:', result.mobile.mumuPlayer);
    console.log('[Install Check] Mobile - adb:', result.mobile.adb);
    console.log('[Install Check] Mobile - appium:', result.mobile.appium);
    console.log('[Install Check] Mobile - uiautomator2:', result.mobile.uiautomator2);
    console.log('[Install Check] Mobile - appiumPython:', result.mobile.appiumPython);
    console.log('[Install Check] Mobile - allInstalled:', result.mobile.allInstalled);
    return result;
});

// 모바일 연결 (에뮬레이터 + ADB + Appium 통합)
ipcMain.handle('connect-mobile', async (event) => {
    const { spawnSync, spawn } = require('child_process');
    const fs = require('fs');
    const http = require('http');

    const MUMU_MANAGER = 'C:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\MuMuManager.exe';
    const ADB_PATH = 'C:\\platform-tools\\adb.exe';
    const TARGET_DEVICE = 'android_20251228_01';

    // spawnSync 래퍼 (windowsHide 적용)
    function runCommand(cmd, args) {
        const result = spawnSync(cmd, args, {
            encoding: 'utf-8',
            windowsHide: true
        });
        return result.stdout || '';
    }

    // 진행 상태 전송 함수
    function sendProgress(step, message) {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('mobile-connect-progress', { step, message });
        }
    }

    try {
        // ===== Step 1: 에뮬레이터 확인 및 시작 =====
        sendProgress(1, '에뮬레이터 확인 중...');

        if (!fs.existsSync(MUMU_MANAGER)) {
            return { success: false, error: '모바일 연결 필요 (MuMu Player 미설치)' };
        }

        // 디바이스 인덱스 찾기 (이름으로 검색)
        let deviceIndex = null;
        let isRunning = false;

        // 실행 상태 확인 함수 (정확한 패턴 매칭)
        function checkAndroidStarted(info) {
            // "is_android_started":true 또는 "is_android_started": true 패턴 체크
            return /"is_android_started"\s*:\s*true/.test(info);
        }

        for (let i = 0; i <= 5; i++) {
            try {
                const info = runCommand(MUMU_MANAGER, ['info', '-v', String(i)]);
                if (info.includes(TARGET_DEVICE)) {
                    deviceIndex = i;
                    // 실행 상태 확인 (정확한 패턴 매칭)
                    isRunning = checkAndroidStarted(info);
                    console.log(`[Mobile Connect] Found device at index ${i}, running: ${isRunning}`);
                    break;
                }
            } catch (e) {
                // 해당 인덱스 없음
            }
        }

        // 디바이스를 찾지 못한 경우 인덱스 1 사용 (백업 복원 기본 위치)
        if (deviceIndex === null) {
            deviceIndex = 1;
            try {
                const info = runCommand(MUMU_MANAGER, ['info', '-v', '1']);
                isRunning = checkAndroidStarted(info);
                console.log(`[Mobile Connect] Using fallback index 1, running: ${isRunning}`);
            } catch (e) {}
        }

        // 에뮬레이터 미실행 시 시작
        if (!isRunning) {
            sendProgress(1, '에뮬레이터 시작 중...');
            try {
                runCommand(MUMU_MANAGER, ['control', '-v', String(deviceIndex), 'launch']);
            } catch (e) {
                return { success: false, error: '모바일 연결 필요 (에뮬레이터 시작 실패)' };
            }

            // 에뮬레이터 부팅 대기 (최대 60초)
            sendProgress(1, '에뮬레이터 부팅 대기 중...');
            let bootSuccess = false;
            for (let t = 0; t < 12; t++) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
                try {
                    const info = runCommand(MUMU_MANAGER, ['info', '-v', String(deviceIndex)]);
                    if (checkAndroidStarted(info)) {
                        bootSuccess = true;
                        console.log(`[Mobile Connect] Boot success at attempt ${t + 1}`);
                        break;
                    }
                } catch (e) {}
                sendProgress(1, `에뮬레이터 부팅 대기 중... (${t + 1}/12)`);
            }

            if (!bootSuccess) {
                return { success: false, error: '모바일 연결 필요 (에뮬레이터 부팅 타임아웃)' };
            }

            // 부팅 후 세로 모드로 전환 (rotate 명령 사용)
            await new Promise(resolve => setTimeout(resolve, 2000)); // 안정화 대기
            try {
                // MuMu rotate 명령: 현재 방향에서 회전
                // 가로 모드(1)에서 세로 모드(0)로 전환 시도
                runCommand(MUMU_MANAGER, ['control', '-v', String(deviceIndex), 'rotate']);
                console.log('[Mobile Connect] Rotated to portrait mode');
            } catch (e) {
                console.log('[Mobile Connect] Rotate command failed:', e.message);
            }
        }

        sendProgress(1, '에뮬레이터 실행 완료');

        // ===== Step 2: ADB 연결 =====
        sendProgress(2, 'ADB 연결 중...');

        if (!fs.existsSync(ADB_PATH)) {
            return { success: false, error: '모바일 연결 필요 (ADB 미설치)' };
        }

        // ADB 포트 가져오기
        let adbPort = null;
        try {
            const info = runCommand(MUMU_MANAGER, ['info', '-v', String(deviceIndex)]);
            const match = info.match(/"adb_port"\s*:\s*(\d+)/);
            if (match) {
                adbPort = match[1];
            }
        } catch (e) {}

        if (!adbPort) {
            // 기본 포트 시도
            adbPort = deviceIndex === 0 ? '16384' : '16416';
        }

        // ADB 연결
        try {
            // 기존 연결 상태 확인
            const devices = runCommand(ADB_PATH, ['devices']);
            if (!devices.includes(`127.0.0.1:${adbPort}`)) {
                runCommand(ADB_PATH, ['connect', `127.0.0.1:${adbPort}`]);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 연결 대기
            }

            // 연결 확인
            const devicesAfter = runCommand(ADB_PATH, ['devices']);
            if (!devicesAfter.includes('127.0.0.1:') || devicesAfter.includes('offline')) {
                return { success: false, error: '모바일 연결 필요 (ADB 연결 실패)' };
            }

            // 세로 모드로 설정 (user_rotation=0: 세로, 1: 가로)
            try {
                runCommand(ADB_PATH, ['-s', `127.0.0.1:${adbPort}`, 'shell', 'settings', 'put', 'system', 'user_rotation', '0']);
                runCommand(ADB_PATH, ['-s', `127.0.0.1:${adbPort}`, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
                console.log('[Mobile Connect] Set portrait mode');
            } catch (e) {
                console.log('[Mobile Connect] Failed to set portrait mode:', e.message);
            }
        } catch (e) {
            return { success: false, error: '모바일 연결 필요 (ADB 연결 오류)' };
        }

        sendProgress(2, 'ADB 연결 완료');

        // ===== Step 3: Appium 서버 실행 =====
        sendProgress(3, 'Appium 서버 확인 중...');

        // Appium 상태 확인
        const appiumRunning = await new Promise((resolve) => {
            const req = http.get('http://localhost:4723/status', { timeout: 2000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        });

        if (!appiumRunning) {
            sendProgress(3, 'Appium 서버 시작 중...');

            // Appium 설치 확인
            const whereResult = spawnSync('where', ['appium'], { windowsHide: true });
            if (whereResult.status !== 0) {
                return { success: false, error: '모바일 연결 필요 (Appium 미설치)' };
            }

            // Appium 시작
            startAppium();

            // Appium 시작 대기 (최대 15초)
            let appiumStarted = false;
            for (let t = 0; t < 15; t++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const running = await new Promise((resolve) => {
                    const req = http.get('http://localhost:4723/status', { timeout: 2000 }, (res) => {
                        resolve(res.statusCode === 200);
                    });
                    req.on('error', () => resolve(false));
                    req.on('timeout', () => {
                        req.destroy();
                        resolve(false);
                    });
                });
                if (running) {
                    appiumStarted = true;
                    break;
                }
            }

            if (!appiumStarted) {
                return { success: false, error: '모바일 연결 필요 (Appium 서버 시작 실패)' };
            }
        }

        sendProgress(3, 'Appium 서버 실행 완료');

        // 모든 연결 성공
        return { success: true };

    } catch (error) {
        console.error('[Mobile Connect] Error:', error.message);
        return { success: false, error: '모바일 연결 오류: ' + error.message };
    }
});

// 모바일 연결 해제
ipcMain.handle('disconnect-mobile', async () => {
    stopAppium(false);
    return { success: true };
});

// 모바일 전체 연결 상태 확인 (에뮬레이터 + ADB + Appium)
ipcMain.handle('check-mobile-status', async () => {
    const { spawnSync } = require('child_process');
    const fs = require('fs');
    const http = require('http');

    const MUMU_MANAGER = 'C:\\Program Files\\Netease\\MuMuPlayer\\nx_main\\MuMuManager.exe';
    const ADB_PATH = 'C:\\platform-tools\\adb.exe';
    const TARGET_DEVICE = 'android_20251228_01';

    const result = {
        emulator: false,
        adb: false,
        appium: false,
        allConnected: false
    };

    // spawnSync 래퍼 (windowsHide 적용)
    function runCommand(cmd, args) {
        try {
            const result = spawnSync(cmd, args, {
                encoding: 'utf-8',
                timeout: 3000,
                windowsHide: true
            });
            return result.stdout || '';
        } catch (e) {
            return '';
        }
    }

    try {
        // 1. 에뮬레이터 실행 상태 확인
        if (fs.existsSync(MUMU_MANAGER)) {
            for (let i = 0; i <= 5; i++) {
                try {
                    const info = runCommand(MUMU_MANAGER, ['info', '-v', String(i)]);
                    if (info.includes(TARGET_DEVICE) && /"is_android_started"\s*:\s*true/.test(info)) {
                        result.emulator = true;
                        break;
                    }
                } catch (e) {}
            }
            // 폴백: 인덱스 1 확인
            if (!result.emulator) {
                try {
                    const info = runCommand(MUMU_MANAGER, ['info', '-v', '1']);
                    if (/"is_android_started"\s*:\s*true/.test(info)) {
                        result.emulator = true;
                    }
                } catch (e) {}
            }
        }

        // 2. ADB 연결 상태 확인
        if (fs.existsSync(ADB_PATH)) {
            try {
                const devices = runCommand(ADB_PATH, ['devices']);
                // 127.0.0.1:포트 device 형태로 연결되어 있는지 확인
                if (devices.includes('127.0.0.1:') && devices.includes('device') && !devices.includes('offline')) {
                    result.adb = true;
                }
            } catch (e) {}
        }

        // 3. Appium 서버 상태 확인
        result.appium = await new Promise((resolve) => {
            const req = http.get('http://localhost:4723/status', { timeout: 2000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        });

        // 모두 연결되었는지 확인
        result.allConnected = result.emulator && result.adb && result.appium;

    } catch (error) {
        console.error('[Mobile Status Check] Error:', error.message);
    }

    return result;
});
