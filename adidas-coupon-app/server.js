/**
 * 로컬 Express 서버 - DB 관리 및 API 제공
 * PostgreSQL (입출고관리시스템 공용 DB: 129.212.227.252:5433) 직접 사용
 * - sql.js(SQLite) → pg(PostgreSQL) 전환 완료
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

// 쓰기 가능한 임시 폴더 경로 (app.asar 외부)
function getWritableTempDir() {
    // 1. 우선 process.resourcesPath 사용 (Electron 패키징 시)
    if (process.resourcesPath && !process.resourcesPath.includes('app.asar')) {
        const tempDir = path.join(process.resourcesPath, 'temp');
        try {
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            return tempDir;
        } catch (e) { /* fallback */ }
    }
    // 2. 시스템 임시 폴더 사용
    const tempDir = path.join(os.tmpdir(), 'adidas-coupon-app');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
}


const app = express();
app.use(cors());
app.use(express.json());

// Python 실행 경로 찾기 (Windows Store 버전 제외)
// 우선순위: 1. 설치 bat 파일이 저장한 경로 > 2. where python > 3. 하드코딩된 경로
let cachedPythonPath = null;
function getPythonPath() {
    if (cachedPythonPath) return cachedPythonPath;

    const { spawnSync } = require('child_process');

    // 1. 설치 bat 파일이 저장한 Python 경로 확인 (가장 확실한 방법)
    const savedConfigPath = path.join(process.env.LOCALAPPDATA || '', 'adidas-coupon-manager', 'python_path.txt');
    try {
        if (fs.existsSync(savedConfigPath)) {
            const savedPath = fs.readFileSync(savedConfigPath, 'utf-8').trim();
            if (savedPath && fs.existsSync(savedPath)) {
                cachedPythonPath = savedPath;
                return savedPath;
            }
        }
    } catch (e) {
        // 무시
    }

    // 2. 시스템 PATH에서 python 찾기 (WindowsApps 제외)
    try {
        const result = spawnSync('where', ['python'], { encoding: 'utf-8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const pythonPaths = (result.stdout || '')
            .split('\n')
            .map(p => p.trim())
            .filter(p => p && !p.includes('WindowsApps')); // Windows Store 버전 제외

        if (pythonPaths.length > 0 && fs.existsSync(pythonPaths[0])) {
            cachedPythonPath = pythonPaths[0];
            return pythonPaths[0];
        }
    } catch (e) {
        // 무시
    }

    // 3. 폴백: 일반적인 Python 설치 경로 확인
    const possiblePaths = [
        'C:\\Python314\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python39\\python.exe',
        'C:\\Python38\\python.exe',
        'C:\\python314\\python.exe',
        'C:\\python313\\python.exe',
        'C:\\python312\\python.exe',
        'C:\\python311\\python.exe',
        'C:\\python310\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python314\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python313\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python312\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python311\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python310\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python39\\python.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python\\Python314\\python.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
        'C:\\Program Files\\Python314\\python.exe',
        'C:\\Program Files\\Python313\\python.exe',
        'C:\\Program Files\\Python312\\python.exe',
        'C:\\Program Files\\Python311\\python.exe',
        'C:\\Program Files\\Python310\\python.exe',
    ];

    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            cachedPythonPath = p;
            return p;
        }
    }

    // 4. 기본값 (PATH에서 찾기)
    cachedPythonPath = 'python';
    return 'python';
}

// WebSocket 클라이언트 관리
let wsClients = [];

// Appium 세션 서버 관리
let appiumSessionProcess = null;
const APPIUM_SESSION_PORT = 4780;

// 로그 파일 경로
const logPath = path.join(__dirname, 'server.log');

// 로그 함수 - 콘솔과 파일에 동시 기록
function log(message) {
    const timestamp = new Date().toLocaleString('ko-KR');
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    fs.appendFileSync(logPath, logLine + '\n');
}

// 최근 로그 저장 (API로 조회용)
const recentLogs = [];

// 진행 상태 저장소 (모니터링용)
// { accountId: { type: 'extract'|'issue', status: 'waiting'|'processing'|'success'|'error', message: string } }
const progressStore = new Map();

// 현재 실행 중인 배치 프로세스 관리
let runningBatchProcess = {
    active: false,
    type: null,  // 'extract-web', 'extract-mobile', 'issue-web', 'issue-mobile'
    title: '',
    process: null,  // spawn된 Python 프로세스
    abortRequested: false,
    startTime: null,
    accountIds: [],
};

function updateProgress(accountId, type, status, message) {
    progressStore.set(accountId, { type, status, message, updatedAt: new Date() });
    // 타임아웃 없음 - 배치 완료 시 clearProgressForBatch()로 정리
}

function getProgress(accountId) {
    return progressStore.get(accountId) || null;
}

// 배치 작업 완료 후 해당 계정들의 progress 정리
function clearProgressForBatch(accountIds) {
    if (!accountIds || accountIds.length === 0) return;
    // 배치 완료 30초 후 정리 (UI에서 최종 상태 확인할 시간)
    setTimeout(() => {
        accountIds.forEach(id => progressStore.delete(id));
        addLog(`[Progress] ${accountIds.length}개 계정 상태 정리 완료`);
    }, 30 * 1000);
}

// ==================== Appium 세션 서버 관리 ====================

// Appium 세션 서버 시작
function startAppiumSessionServer() {
    if (appiumSessionProcess) {
        addLog('[Appium 세션] 이미 실행 중');
        return;
    }

    const { spawn } = require('child_process');
    const pythonPath = getPythonPath();
    const scriptPath = path.join(__dirname, 'scripts', 'appium_session.py');

    if (!fs.existsSync(scriptPath)) {
        addLog('[Appium 세션] 스크립트 없음: ' + scriptPath);
        return;
    }

    addLog('[Appium 세션] 서버 시작 중...');

    appiumSessionProcess = spawn(pythonPath, ['-u', scriptPath, '--server'], {
        env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });

    appiumSessionProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => addLog(`[Appium 세션] ${line}`));
    });

    appiumSessionProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => addLog(`[Appium 세션 ERR] ${line}`));
    });

    appiumSessionProcess.on('close', (code) => {
        addLog(`[Appium 세션] 서버 종료됨 (코드: ${code})`);
        appiumSessionProcess = null;
    });

    appiumSessionProcess.on('error', (err) => {
        addLog(`[Appium 세션] 서버 오류: ${err.message}`);
        appiumSessionProcess = null;
    });
}

// Appium 세션 서버 종료
function stopAppiumSessionServer() {
    if (appiumSessionProcess) {
        addLog('[Appium 세션] 서버 종료 중...');
        appiumSessionProcess.kill();
        appiumSessionProcess = null;
    }
}

// Appium 세션 상태 조회
async function getAppiumSessionStatus() {
    try {
        const http = require('http');
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${APPIUM_SESSION_PORT}/status`, { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ status: 'error', error: 'JSON 파싱 실패' });
                    }
                });
            });
            req.on('error', () => resolve({ status: 'disconnected', error: '세션 서버 연결 실패' }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ status: 'timeout', error: '세션 서버 타임아웃' });
            });
        });
    } catch (e) {
        return { status: 'error', error: e.message };
    }
}

// Appium 세션 연결 요청
async function connectAppiumSession() {
    try {
        const http = require('http');
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${APPIUM_SESSION_PORT}/connect`, { timeout: 30000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ success: false, error: 'JSON 파싱 실패' });
                    }
                });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: '연결 타임아웃' });
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 배치 프로세스 시작
function startBatchProcess(type, title, accountIds, process) {
    runningBatchProcess = {
        active: true,
        type,
        title,
        process,
        abortRequested: false,
        startTime: new Date(),
        accountIds,
    };
    addLog(`[배치 시작] ${title} - ${accountIds.length}개 계정`);
}

// 배치 프로세스 종료
function endBatchProcess() {
    const wasActive = runningBatchProcess.active;
    const title = runningBatchProcess.title;
    const accountIds = [...runningBatchProcess.accountIds];  // 정리 대상 복사

    runningBatchProcess = {
        active: false,
        type: null,
        title: '',
        process: null,
        abortRequested: false,
        startTime: null,
        accountIds: [],
    };

    if (wasActive) {
        addLog(`[배치 종료] ${title}`);
        // 배치 완료 후 progress 정리 (30초 후)
        clearProgressForBatch(accountIds);
    }
}

// 배치 프로세스 중지 요청
function abortBatchProcess() {
    if (!runningBatchProcess.active) {
        return { success: false, message: '실행 중인 배치 작업이 없습니다.' };
    }

    runningBatchProcess.abortRequested = true;
    addLog(`[배치 중지 요청] ${runningBatchProcess.title}`);

    // Python 프로세스 강제 종료
    if (runningBatchProcess.process) {
        try {
            // Windows에서 프로세스 트리 전체 종료
            const { spawnSync } = require('child_process');
            spawnSync('taskkill', ['/pid', String(runningBatchProcess.process.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
            addLog(`[배치 중지] 프로세스 종료됨 (PID: ${runningBatchProcess.process.pid})`);
        } catch (e) {
            // taskkill 실패해도 kill 시도
            try {
                runningBatchProcess.process.kill('SIGKILL');
            } catch (e2) {}
        }
    }

    // 대기 중인 계정들 상태 업데이트
    for (const accId of runningBatchProcess.accountIds) {
        const progress = getProgress(accId);
        if (progress && progress.status === 'waiting') {
            updateProgress(accId, progress.type, 'error', '사용자에 의해 중지됨');
        }
    }

    endBatchProcess();
    return { success: true, message: '배치 작업이 중지되었습니다.' };
}

function addLog(message) {
    const timestamp = new Date().toLocaleString('ko-KR');
    const logEntry = { timestamp, message };
    recentLogs.push(logEntry);
    if (recentLogs.length > 100) recentLogs.shift(); // 최대 100개 유지
    log(message);

    // WebSocket으로 실시간 전송
    broadcastLog(logEntry);
}

// WebSocket으로 로그 브로드캐스트
function broadcastLog(logEntry) {
    const message = JSON.stringify({ type: 'log', data: logEntry });
    wsClients = wsClients.filter(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(message);
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    });
}

// PostgreSQL 연결 설정
const { Pool } = require('pg');
const pool = new Pool({
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass',
});

// DB 헬퍼 함수 (async)
async function query(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
}

async function queryOne(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
}

async function runQuery(sql, params = []) {
    return pool.query(sql, params);
}

async function initDB() {
    try {
        await pool.query('SELECT 1');
        addLog('[DB] PostgreSQL 연결 완료 (129.212.227.252:5433)');
    } catch (err) {
        addLog(`[DB] PostgreSQL 연결 실패: ${err.message}`);
        throw err;
    }
}

/**
 * 쿠폰 병합: 새 목록 + 이전에 있었지만 사라진 쿠폰(코드 기준) 보존
 * - 아디다스 오프라인 사용 후 API에서 제거돼도 코드가 남아 온라인 재사용 가능
 */
function mergeVouchers(newVouchers, existingVouchersJson) {
    let existing = [];
    try { existing = JSON.parse(existingVouchersJson || '[]'); } catch {}
    const newCodes = new Set(
        newVouchers.filter(v => v.code && v.code !== 'N/A').map(v => v.code)
    );
    // 이전에 있었지만 새 목록에 없는 쿠폰 → 코드가 있는 것만 보존
    const historical = existing.filter(v =>
        v.code && v.code !== 'N/A' && !newCodes.has(v.code)
    );
    return [...newVouchers, ...historical];
}

// 현재 시간을 [YY-MM-DD HH:MM] 형식으로 반환
function getNowTime() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(2); // 2025 -> 25
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `[${year}-${month}-${day} ${hours}:${minutes}]`;
}

// ========== 계정 API ==========

// 계정 목록 조회
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await query('SELECT * FROM adidas_accounts ORDER BY created_at DESC');
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 추가
app.post('/api/accounts', async (req, res) => {
    try {
        const { email, password, name, birthday, phone, adikr_barcode, memo, is_active } = req.body;

        const result = await pool.query(`
            INSERT INTO adidas_accounts (email, password, name, birthday, phone, adikr_barcode, memo, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [email, password, name || null, birthday || null, phone || null, adikr_barcode || null, memo || null, is_active !== false]);

        res.json({ id: result.rows[0].id, message: '계정이 추가되었습니다' });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: '이미 존재하는 이메일입니다' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// 계정 일괄 등록/수정
app.post('/api/accounts/bulk-upsert', async (req, res) => {
    try {
        const accounts = req.body;
        let created = 0, updated = 0, errors = [];

        for (const acc of accounts) {
            try {
                const existing = await queryOne('SELECT id FROM adidas_accounts WHERE email = $1', [acc.email]);
                if (existing) {
                    await runQuery(`
                        UPDATE adidas_accounts SET password = $1, name = $2, birthday = $3, phone = $4, updated_at = NOW()
                        WHERE email = $5
                    `, [acc.password, acc.name || null, acc.birthday || null, acc.phone || null, acc.email]);
                    updated++;
                } else {
                    await runQuery(`
                        INSERT INTO adidas_accounts (email, password, name, birthday, phone, is_active)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [acc.email, acc.password, acc.name || null, acc.birthday || null, acc.phone || null, true]);
                    created++;
                }
            } catch (e) {
                errors.push({ email: acc.email, error: e.message });
            }
        }

        res.json({ total: accounts.length, created, updated, errors });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 수정
app.put('/api/accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, name, birthday, phone, adikr_barcode, memo, is_active } = req.body;

        await runQuery(`
            UPDATE adidas_accounts
            SET email = $1, password = $2, name = $3, birthday = $4, phone = $5, adikr_barcode = $6, memo = $7, is_active = $8, updated_at = NOW()
            WHERE id = $9
        `, [email, password, name || null, birthday || null, phone || null, adikr_barcode || null, memo || null, is_active !== false, id]);

        res.json({ message: '계정이 수정되었습니다' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 삭제
app.delete('/api/accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await runQuery('DELETE FROM adidas_accounts WHERE id = $1', [id]);
        res.json({ message: '계정이 삭제되었습니다' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 일괄 삭제
app.post('/api/accounts/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await runQuery(`DELETE FROM adidas_accounts WHERE id IN (${placeholders})`, ids);
        res.json({ message: `${ids.length}개 계정이 삭제되었습니다` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 활성화/비활성화 토글
app.post('/api/accounts/bulk-toggle-active', async (req, res) => {
    try {
        const { ids, is_active } = req.body;
        const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
        await runQuery(`UPDATE adidas_accounts SET is_active = $1, updated_at = NOW() WHERE id IN (${placeholders})`, [is_active === true, ...ids]);
        res.json({ message: `${ids.length}개 계정이 ${is_active ? '활성화' : '비활성화'}되었습니다` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 정보 업데이트 (Appium 결과)
app.post('/api/accounts/:id/update-info', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, birthday, phone, adikr_barcode, current_points, owned_vouchers, fetch_status } = req.body;

        // 기존 데이터 조회
        const existing = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ error: '계정을 찾을 수 없습니다' });
        }

        await runQuery(`
            UPDATE adidas_accounts
            SET name = $1, birthday = $2, phone = $3, adikr_barcode = $4,
                current_points = $5, owned_vouchers = $6, fetch_status = $7,
                updated_at = NOW()
            WHERE id = $8
        `, [
            name || existing.name,
            birthday || existing.birthday,
            phone || existing.phone,
            adikr_barcode || existing.adikr_barcode,
            current_points !== undefined ? current_points : existing.current_points,
            owned_vouchers !== undefined ? owned_vouchers : existing.owned_vouchers,
            fetch_status || existing.fetch_status,
            id
        ]);

        res.json({ message: '계정 정보가 업데이트되었습니다' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 쿠폰 판매 상태 업데이트
app.post('/api/accounts/:id/voucher-sale', async (req, res) => {
    try {
        const { id } = req.params;
        const { voucher_index, sold, sold_to } = req.body;

        const account = await queryOne('SELECT owned_vouchers FROM adidas_accounts WHERE id = $1', [id]);
        if (!account || !account.owned_vouchers) {
            return res.status(404).json({ error: '계정 또는 쿠폰을 찾을 수 없습니다' });
        }

        const vouchers = JSON.parse(account.owned_vouchers);
        if (voucher_index >= 0 && voucher_index < vouchers.length) {
            vouchers[voucher_index].sold = sold;
            vouchers[voucher_index].sold_to = sold_to || '';
        }

        await runQuery('UPDATE adidas_accounts SET owned_vouchers = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(vouchers), id]);

        res.json({ message: sold ? '판매완료로 표시되었습니다' : '판매 취소되었습니다' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== Appium 자동화 API ==========

// 현재 사용 모드 (web 또는 mobile) - 정보조회와 쿠폰발급 모두 이 모드 사용 (기본값: mobile)
let extractMode = 'mobile';

// Python 스크립트 경로 (하이브리드 스크립트 사용)
function getPythonScriptPath() {
    // 배포 환경 (extraResources로 복사된 경로)
    if (process.resourcesPath) {
        const prodHybridPath = path.join(process.resourcesPath, 'scripts', 'extract_hybrid.py');
        if (fs.existsSync(prodHybridPath)) {
            return prodHybridPath;
        }
        const prodPath = path.join(process.resourcesPath, 'scripts', 'extract_account.py');
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }
    }

    // 개발 환경 (프로젝트 폴더 내)
    const hybridPath = path.join(__dirname, 'scripts', 'extract_hybrid.py');
    if (fs.existsSync(hybridPath)) {
        return hybridPath;
    }

    const devPath = path.join(__dirname, 'scripts', 'extract_account.py');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    // 기존 backend 경로 (폴백)
    const backendPath = path.join(__dirname, '..', 'backend', 'test_mobile_webview_login.py');
    return backendPath;
}

// 모바일 전용 스크립트 경로 (extract_account.py - 배치 모드 지원)
function getMobileExtractScriptPath() {
    // 배포 환경
    if (process.resourcesPath) {
        const prodPath = path.join(process.resourcesPath, 'scripts', 'extract_account.py');
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }
    }

    // 개발 환경
    const devPath = path.join(__dirname, 'scripts', 'extract_account.py');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    // 폴백 - 일반 스크립트 경로 사용
    return getPythonScriptPath();
}

// 추출 모드 조회 API
app.get('/api/extract-mode', (req, res) => {
    res.json({ mode: extractMode });
});

// 추출 모드 변경 API
app.post('/api/extract-mode', (req, res) => {
    const { mode } = req.body;
    const validModes = ['web', 'mobile', 'hybrid'];
    const modeLabels = { web: '웹 브라우저', mobile: '모바일 Appium', hybrid: '웹+모바일' };

    if (validModes.includes(mode)) {
        extractMode = mode;
        addLog(`[모드] 추출 모드 변경: ${mode}`);
        res.json({ message: `추출 모드가 ${modeLabels[mode]}(으)로 변경되었습니다`, mode });
    } else {
        res.status(400).json({ error: '유효하지 않은 모드입니다. web, mobile, hybrid 중 하나만 가능합니다.' });
    }
});

// 일괄 정보 추출 (반드시 /api/extract/:id 앞에 위치해야 함!)
app.post('/api/extract/bulk', async (req, res) => {
    const { ids } = req.body;

    try {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '추출할 계정 ID가 없습니다' });
        }

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const accountsMap = new Map();
        (await query(`SELECT * FROM adidas_accounts WHERE id IN (${placeholders})`, ids)).forEach(acc => {
            accountsMap.set(acc.id, acc);
        });

        // ids 순서대로 accounts 배열 생성
        const accounts = ids.map(id => accountsMap.get(id)).filter(Boolean);

        if (accounts.length === 0) {
            return res.status(404).json({ error: '선택한 계정을 찾을 수 없습니다' });
        }

        // 모바일 모드 → extract_account.py 배치 모드 사용
        if (extractMode === 'mobile') {
            addLog(`[일괄추출] 모바일 배치 모드로 ${accounts.length}개 계정 처리 (Appium 1회 연결)`);
            res.json({ message: `${accounts.length}개 계정 정보 조회를 시작합니다. (모바일 배치 모드 - Appium 1회 연결)` });

            // 백그라운드에서 배치 처리
            processAccountsBatchMode(accounts);
        } else {
            // 웹 모드 또는 하이브리드 모드 → 기존 순차 처리 방식
            addLog(`[일괄추출] 순차 처리 모드로 ${accounts.length}개 계정 처리`);
            res.json({ message: `${accounts.length}개 계정 정보 조회를 시작합니다. 순차적으로 처리됩니다.` });

            // 백그라운드에서 순차 처리
            processAccountsSequentially(accounts);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 계정 정보 추출 (Appium) - 단일 계정
app.post('/api/extract/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const account = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [id]);
        if (!account) {
            addLog(`[추출] 계정 ID ${id} 찾을 수 없음`);
            return res.status(404).json({ error: '계정을 찾을 수 없습니다' });
        }

        // 상태 업데이트 (DB + 모니터링) - 모드에 따라 적절한 컬럼 업데이트
        // hybrid 모드는 웹 먼저 시도하므로 web_fetch_status에 기록
        const effectiveMode = extractMode === 'hybrid' ? 'web' : extractMode;
        const modeLabel = extractMode === 'hybrid' ? '[웹+모바일]' : (effectiveMode === 'web' ? '[웹브라우저]' : '[모바일]');
        const statusColumn = effectiveMode === 'web' ? 'web_fetch_status' : 'mobile_fetch_status';
        addLog(`[추출] 시작 - extractMode=${extractMode}, effectiveMode=${effectiveMode}, statusColumn=${statusColumn}`);
        runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [`${modeLabel} 조회 중... ${getNowTime()}`, id]).catch(e => addLog(`[DB 오류] ${e.message}`));
        updateProgress(id, 'extract', 'processing', `조회 중... ${account.email}`);

        const scriptPath = getPythonScriptPath();
        const androidHome = (process.env.ANDROID_HOME || 'C:\\platform-tools').trim();
        const isHybridScript = scriptPath.includes('extract_hybrid.py');

        const { spawn } = require('child_process');

        // 하이브리드 스크립트면 모드 인자 추가 (hybrid 모드도 그대로 전달)
        // --id 인자를 추가하여 진행 상태 출력에 사용
        const pythonArgs = isHybridScript
            ? ['-u', scriptPath, account.email, account.password, '--mode', extractMode, '--id', id.toString()]
            : ['-u', scriptPath, account.email, account.password];

        const pythonPath = getPythonPath();

        const pythonProcess = spawn(pythonPath, pythonArgs, {
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                ANDROID_SDK_ROOT: androidHome,
                PATH: `${androidHome};${process.env.PATH}`,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString('utf-8');
            stdout += chunk;

            // [PROGRESS] 라인 파싱하여 진행 상태 업데이트
            const lines = chunk.split('\n');
            for (const line of lines) {
                // 모든 Python 출력 로그 표시 (디버깅용)
                const trimmedLine = line.trim();
                if (trimmedLine && trimmedLine.length > 0) {
                    addLog(`[PY] ${trimmedLine.substring(0, 200)}`);
                }

                if (line.startsWith('[PROGRESS]')) {
                    try {
                        const jsonStr = line.substring('[PROGRESS]'.length).trim();
                        const progress = JSON.parse(jsonStr);
                        if (progress.id && progress.status && progress.message) {
                            updateProgress(progress.id, 'extract', progress.status, progress.message);
                        }
                    } catch (e) {
                        // JSON 파싱 실패 무시
                    }
                }
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            // stderr도 로그에 표시 (디버깅용)
            addLog(`[PY-ERR] ${chunk.substring(0, 200)}`);
        });

        pythonProcess.on('close', (code) => {
            // 성공 조건: '토큰 획득 성공' 또는 'API 테스트' 또는 '이름:' 포함
            const hasToken = stdout.includes('토큰 획득 성공') || stdout.includes('토큰 획득 성공!');
            const hasApiResult = stdout.includes('이름:') && stdout.includes('바코드:');

            // 하이브리드 모드 성공 여부 확인 (모바일 폴백으로 성공한 경우)
            const hybridMobileSuccess = stdout.includes('토큰 획득 성공! (사용 모드: mobile)');

            // 에러 조건: BOT_BLOCKED, PASSWORD_WRONG, 또는 [ERROR] 메시지
            // 단, 하이브리드 모드에서 모바일 성공 시 웹 실패 에러는 무시
            // 프로필 화면 타임아웃은 로그아웃 실패일 뿐이므로 제외 (토큰 획득 + API 성공이면 OK)
            const hasCriticalError = (stdout.includes('BOT_BLOCKED') ||
                             stdout.includes('PASSWORD_WRONG')) && !hybridMobileSuccess;
            const hasNonCriticalError = stdout.includes('[ERROR]') &&
                             !stdout.includes('프로필 화면 타임아웃') &&
                             !stdout.includes('로그아웃 실패') &&
                             !hybridMobileSuccess;
            const hasError = hasCriticalError || hasNonCriticalError;
            const isSuccess = code === 0 && (hasToken || hasApiResult) && !hasError;

            if (isSuccess) {
                // 결과 파싱
                const result = parseExtractResult(stdout, account.email);

                // 이메일 불일치 검증 - 다른 계정 정보가 반환된 경우 업데이트 방지
                if (result.emailMismatch) {
                    const mismatchMsg = `${modeLabel} 이메일 불일치 (응답: ${result.foundEmail}) ${getNowTime()}`;
                    addLog(`[추출] 실패 - 이메일 불일치: 요청=${account.email}, 응답=${result.foundEmail}`);
                    runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [mismatchMsg, id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    updateProgress(id, 'extract', 'error', mismatchMsg);
                } else {
                    // DB 업데이트 - 모드에 따라 적절한 컬럼 업데이트
                    // 하이브리드 모드에서 웹/모바일 결과 표시
                    let successStatus;
                    if (extractMode === 'hybrid') {
                        let webResult = '';
                        let mobileResult = '';

                        // 웹 결과 파싱
                        if (stdout.includes('→ 웹 로그인 실패') || stdout.includes('웹 로그인 오류')) {
                            webResult = '실패';
                        } else if (stdout.includes('→ 웹 로그인 차단') || stdout.includes('BOT_BLOCKED')) {
                            webResult = '차단';
                        } else if (stdout.includes('토큰 획득 성공! (사용 모드: web)')) {
                            webResult = '성공';
                        }

                        // 모바일 결과 파싱
                        if (stdout.includes('[2차] 모바일')) {
                            if (stdout.includes('토큰 획득 성공! (사용 모드: mobile)')) {
                                mobileResult = '성공';
                            }
                        }

                        // 웹/모바일 결과 조합
                        if (webResult && mobileResult) {
                            successStatus = `웹:${webResult} / 모바일:${mobileResult} ${getNowTime()}`;
                        } else if (webResult) {
                            successStatus = `웹:${webResult} ${getNowTime()}`;
                        } else {
                            successStatus = `${modeLabel} 조회 완료 ${getNowTime()}`;
                        }
                    } else {
                        successStatus = `${modeLabel} 조회 완료 ${getNowTime()}`;
                    }

                    // 하이브리드 모드에서 웹/모바일 각각 컬럼 업데이트
                    if (extractMode === 'hybrid') {
                        // 웹 결과와 모바일 결과를 각각의 컬럼에 저장
                        let webStatus = null;
                        let mobileStatus = null;

                        // 디버그: stdout에서 패턴 확인
                        const hasWebSuccess = stdout.includes('토큰 획득 성공! (사용 모드: web)');
                        const hasMobileSuccess = stdout.includes('토큰 획득 성공! (사용 모드: mobile)');
                        addLog(`[추출] 하이브리드 패턴 확인: hasWebSuccess=${hasWebSuccess}, hasMobileSuccess=${hasMobileSuccess}`);

                        if (stdout.includes('→ 웹 로그인 실패') || stdout.includes('웹 로그인 오류')) {
                            webStatus = `[웹] 실패 ${getNowTime()}`;
                        } else if (stdout.includes('→ 웹 로그인 차단') || stdout.includes('BOT_BLOCKED')) {
                            webStatus = `[웹] 차단 ${getNowTime()}`;
                        } else if (hasWebSuccess) {
                            webStatus = `[웹] 조회 완료 ${getNowTime()}`;
                        }

                        if (hasMobileSuccess) {
                            mobileStatus = `[모바일] 조회 완료 ${getNowTime()}`;
                        } else if (stdout.includes('[2차] 모바일') && !hasMobileSuccess) {
                            mobileStatus = `[모바일] 실패 ${getNowTime()}`;
                        }

                        addLog(`[추출] 하이브리드 상태 저장: webStatus=${webStatus}, mobileStatus=${mobileStatus}, id=${id}`);

                        runQuery(`
                            UPDATE adidas_accounts
                            SET name = $1, phone = $2, adikr_barcode = $3, current_points = $4, owned_vouchers = $5,
                                web_fetch_status = COALESCE($6, web_fetch_status),
                                mobile_fetch_status = COALESCE($7, mobile_fetch_status),
                                updated_at = NOW()
                            WHERE id = $8
                        `, [
                            result.name || account.name,
                            result.phone || account.phone,
                            result.barcode || account.adikr_barcode,
                            result.points || account.current_points,
                            JSON.stringify(mergeVouchers(result.vouchers || [], account.owned_vouchers)),
                            webStatus,
                            mobileStatus,
                            id
                        ]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    } else {
                        addLog(`[추출] 단일모드 상태 저장: statusColumn=${statusColumn}, successStatus=${successStatus}, id=${id}`);
                        runQuery(`
                            UPDATE adidas_accounts
                            SET name = $1, phone = $2, adikr_barcode = $3, current_points = $4, owned_vouchers = $5,
                                ${statusColumn} = $6, updated_at = NOW()
                            WHERE id = $7
                        `, [
                            result.name || account.name,
                            result.phone || account.phone,
                            result.barcode || account.adikr_barcode,
                            result.points || account.current_points,
                            JSON.stringify(mergeVouchers(result.vouchers || [], account.owned_vouchers)),
                            successStatus,
                            id
                        ]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    }
                    addLog(`[추출] 성공 완료 - ${account.email}, extractMode=${extractMode}`);
                    updateProgress(id, 'extract', 'success', successStatus);
                }
            } else {
                // 에러 케이스: 비밀번호 틀림, 봇 차단, [ERROR] 메시지, 그 외 알 수 없는 오류
                let errorMsg;

                // 하이브리드 모드에서 웹/모바일 각각의 결과 파싱
                if (extractMode === 'hybrid') {
                    let webResult = '';
                    let mobileResult = '';

                    // 웹 결과 파싱
                    if (stdout.includes('→ 웹 로그인 실패') || stdout.includes('웹 로그인 오류')) {
                        webResult = '실패';
                    } else if (stdout.includes('→ 웹 로그인 차단') || stdout.includes('BOT_BLOCKED')) {
                        webResult = '차단';
                    } else if (stdout.includes('PASSWORD_WRONG') && stdout.includes('웹')) {
                        webResult = '비밀번호오류';
                    }

                    // 모바일 결과 파싱
                    if (stdout.includes('[2차] 모바일')) {
                        if (stdout.includes('토큰 획득 실패') || stdout.includes('로그인 실패!')) {
                            mobileResult = '실패';
                        } else if (stdout.includes('토큰 획득 성공! (사용 모드: mobile)')) {
                            mobileResult = '성공';
                        }
                    }

                    // 웹/모바일 결과 조합
                    if (webResult && mobileResult) {
                        errorMsg = `웹:${webResult} / 모바일:${mobileResult} ${getNowTime()}`;
                    } else if (webResult) {
                        errorMsg = `웹:${webResult} ${getNowTime()}`;
                    } else {
                        errorMsg = `${modeLabel} 알 수 없는 오류 ${getNowTime()}`;
                    }
                } else if (stdout.includes('연결된 디바이스가 없습니다') || stdout.includes('NO_DEVICE') || stderr.includes('no devices')) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (에뮬레이터 미연결) ${getNowTime()}`;
                } else if (stdout.includes('APPIUM_NOT_AVAILABLE') || stdout.includes('Appium이 설치되지 않았습니다')) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (Appium 미설치) ${getNowTime()}`;
                } else if (stderr.includes('Connection refused') || stderr.includes('Could not find a connected Android device') || stdout.includes('Appium 세션 없음')) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (Appium 서버 미실행) ${getNowTime()}`;
                } else if (stdout.includes('[ERROR] PASSWORD_WRONG') || stdout.includes('잘못된 이메일/비밀번호')) {
                    errorMsg = `${modeLabel} 비밀번호 틀림 ${getNowTime()}`;
                    addLog(`[추출] 실패 - ${account.email}: ${errorMsg}`);
                    runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    updateProgress(id, 'extract', 'password_wrong', errorMsg);
                    return;
                } else if (stdout.includes('[ERROR] BOT_BLOCKED') || stdout.includes('BOT_BLOCKED')) {
                    // BOT_BLOCKED:에러메시지 형식에서 에러 메시지 추출
                    const botBlockMatch = stdout.match(/BOT_BLOCKED:([^\n\r]+)/);
                    const botBlockMsg = botBlockMatch ? botBlockMatch[1].trim() : '';
                    errorMsg = botBlockMsg ? `${modeLabel} 차단 의심 : ${botBlockMsg} ${getNowTime()}` : `${modeLabel} 차단 의심 ${getNowTime()}`;
                } else if (stdout.includes('[ERROR]')) {
                    // [ERROR] 메시지에서 세부 내용 추출
                    const errorMatch = stdout.match(/\[ERROR\]\s*([^\n\r]+)/);
                    const errorDetail = errorMatch ? errorMatch[1].trim() : '';
                    errorMsg = errorDetail ? `${modeLabel} 오류: ${errorDetail} ${getNowTime()}` : `${modeLabel} 오류 발생 ${getNowTime()}`;
                } else {
                    errorMsg = `${modeLabel} 알 수 없는 오류 ${getNowTime()}`;
                }
                addLog(`[추출] 실패 - ${account.email}: ${errorMsg}`);
                runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                updateProgress(id, 'extract', 'error', errorMsg);
            }
        });

        pythonProcess.on('error', (err) => {
            addLog(`[추출] Python 실행 오류: ${err.message}`);
            const errorMsg = `${modeLabel} 실행 오류 ${getNowTime()}`;
            runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, id]).catch(e => addLog(`[DB 오류] ${e.message}`));
            updateProgress(id, 'extract', 'error', errorMsg);
        });

        res.json({ message: `${account.email} 정보 조회를 시작합니다` });
    } catch (error) {
        addLog(`[추출] 예외 발생: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

async function processAccountsSequentially(accounts) {
    // 배치 프로세스 시작 등록 (순차 처리는 process 없이 등록)
    const accountIds = accounts.map(a => a.id);
    startBatchProcess('extract-web', '웹 정보 조회', accountIds, null);

    try {
        for (const account of accounts) {
            // 중지 요청 확인
            if (runningBatchProcess.abortRequested) {
                addLog(`[일괄추출] 사용자 중지 요청 - 남은 계정 건너뜀`);
                // 남은 계정 상태 업데이트
                const idx = accounts.indexOf(account);
                for (let i = idx; i < accounts.length; i++) {
                    updateProgress(accounts[i].id, 'extract', 'error', '사용자에 의해 중지됨');
                }
                break;
            }

            await extractAccountInfo(account);
            // 다음 계정 전 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } finally {
        // 배치 프로세스 종료
        endBatchProcess();
    }
}

// 모바일 배치 모드 처리 (Appium 1회 연결)
async function processAccountsBatchMode(accounts) {
    const modeLabel = '[모바일]';
    const statusColumn = 'mobile_fetch_status';

    // 모든 계정 상태를 '대기 중'으로 초기화
    for (const account of accounts) {
        runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [`${modeLabel} 대기 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
        updateProgress(account.id, 'extract', 'waiting', `대기 중... ${account.email}`);
    }

    // 모바일 배치 모드에서는 extract_account.py를 직접 사용 (배치 모드 지원)
    const scriptPath = getMobileExtractScriptPath();
    const androidHome = (process.env.ANDROID_HOME || 'C:\\platform-tools').trim();

    // 계정 목록을 JSON 파일로 저장
    const batchData = accounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        password: acc.password
    }));

    const batchJsonPath = path.join(getWritableTempDir(), 'batch_accounts.json');
    fs.writeFileSync(batchJsonPath, JSON.stringify(batchData, null, 2), 'utf-8');

    const { spawn } = require('child_process');
    const pythonPath = getPythonPath();

    // 배치 모드로 Python 스크립트 실행
    const pythonProcess = spawn(pythonPath, ['-u', scriptPath, '--batch', batchJsonPath], {
        env: {
            ...process.env,
            ANDROID_HOME: androidHome,
            ANDROID_SDK_ROOT: androidHome,
            PATH: `${androidHome};${process.env.PATH}`,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
        },
        windowsHide: true
    });

    // 배치 프로세스 등록 (중지 기능용)
    const accountIds = accounts.map(a => a.id);
    startBatchProcess('extract-mobile', '모바일 정보 조회', accountIds, pythonProcess);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString('utf-8');
        stdout += chunk;

        // [BATCH_RESULT] 라인을 실시간으로 파싱하여 DB 업데이트
        const lines = chunk.split('\n');
        for (const line of lines) {
            // 모든 Python 출력 로그 표시 (디버깅용)
            const trimmedLine = line.trim();
            if (trimmedLine && trimmedLine.length > 0) {
                // 모든 Python stdout 출력을 로그에 추가
                addLog(`[PY] ${trimmedLine.substring(0, 200)}`);
            }

            if (line.includes('[BATCH_RESULT]')) {
                try {
                    const jsonStart = line.indexOf('{');
                    if (jsonStart !== -1) {
                        const jsonStr = line.substring(jsonStart);
                        const result = JSON.parse(jsonStr);
                        processBatchResult(result, modeLabel, statusColumn).catch(e => addLog(`[배치추출] DB 오류: ${e.message}`));
                    }
                } catch (e) {
                    addLog(`[배치추출] 결과 파싱 오류: ${e.message}`);
                }
            }

            // 처리 중 상태 업데이트 (실시간 로그)
            if (line.includes('처리 중:')) {
                const emailMatch = line.match(/처리 중:\s*(\S+)/);
                if (emailMatch) {
                    const email = emailMatch[1];
                    const account = accounts.find(a => a.email === email);
                    if (account) {
                        runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [`${modeLabel} 조회 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                        updateProgress(account.id, 'extract', 'processing', `조회 중... ${email}`);
                    }
                }
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // 모든 stderr 출력 (디버깅용)
        const lines = chunk.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && trimmedLine.length > 0) {
                addLog(`[PY-ERR] ${trimmedLine.substring(0, 200)}`);
            }
        }
    });

    pythonProcess.on('close', (code) => {
        // JSON 파일 정리
        try {
            if (fs.existsSync(batchJsonPath)) {
                fs.unlinkSync(batchJsonPath);
            }
        } catch (e) {
            // 무시
        }

        // [BATCH_COMPLETE] 파싱하여 최종 결과 확인
        if (stdout.includes('[BATCH_COMPLETE]')) {
            try {
                const completeIndex = stdout.indexOf('[BATCH_COMPLETE]');
                const jsonStart = stdout.indexOf('{', completeIndex);
                if (jsonStart !== -1) {
                    // 중첩 JSON 파싱
                    let depth = 0;
                    let jsonEnd = jsonStart;
                    for (let i = jsonStart; i < stdout.length; i++) {
                        if (stdout[i] === '{') depth++;
                        else if (stdout[i] === '}') depth--;
                        if (depth === 0) {
                            jsonEnd = i + 1;
                            break;
                        }
                    }
                    const jsonStr = stdout.substring(jsonStart, jsonEnd);
                    const completeResult = JSON.parse(jsonStr);
                    addLog(`[배치추출] 완료 - 성공: ${completeResult.success}/${completeResult.total}`);
                }
            } catch (e) {
                addLog(`[배치추출] 완료 결과 파싱 오류: ${e.message}`);
            }
        }

        // 처리되지 않은 계정들(waiting/processing 상태)을 에러로 처리
        for (const account of accounts) {
            const progress = progressStore.get(account.id);
            if (progress && (progress.status === 'waiting' || progress.status === 'processing')) {
                const errorMsg = `${modeLabel} 처리 중단 ${getNowTime()}`;
                runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                updateProgress(account.id, 'extract', 'error', errorMsg);
                addLog(`[배치추출] 미처리 계정: ${account.email}`);
            }
        }

        // 배치 프로세스 종료 처리
        endBatchProcess();
    });

    pythonProcess.on('error', (err) => {
        addLog(`[배치추출] Python 실행 오류: ${err.message}`);

        // 모든 계정을 오류 상태로 업데이트
        for (const account of accounts) {
            const errorMsg = `${modeLabel} 실행 오류 ${getNowTime()}`;
            runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
            updateProgress(account.id, 'extract', 'error', errorMsg);
        }

        // 배치 프로세스 종료 처리
        endBatchProcess();
    });
}

// 배치 결과 처리 (개별 계정 결과를 DB에 업데이트)
async function processBatchResult(result, modeLabel, statusColumn) {
    const accountId = result.id;
    const email = result.email;

    if (!accountId) {
        addLog(`[배치추출] 결과에 id가 없음: ${email}`);
        return;
    }

    // 기존 계정 정보 조회
    const account = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [accountId]);
    if (!account) {
        addLog(`[배치추출] 계정을 찾을 수 없음: id=${accountId}`);
        return;
    }

    if (result.success) {
        // 성공 - API 결과에서 정보 추출
        const apiResult = result.api_result || {};
        const profile = apiResult.profile || {};
        const member = apiResult.member || {};
        const wallet = apiResult.wallet || {};
        const vouchers = apiResult.vouchers || [];

        // 이메일 불일치 검증
        const foundEmail = profile.email || '';
        if (foundEmail && foundEmail.toLowerCase() !== email.toLowerCase()) {
            const mismatchMsg = `${modeLabel} 이메일 불일치 (응답: ${foundEmail}) ${getNowTime()}`;
            addLog(`[배치추출] ${email} - 이메일 불일치: 응답=${foundEmail}`);
            await runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [mismatchMsg, accountId]);
            updateProgress(accountId, 'extract', 'error', mismatchMsg);
            return;
        }

        // 정보 추출
        const name = profile.firstName || account.name;

        // 전화번호 형식 변환
        let phone = profile.mobileNumber || account.phone;
        if (phone) {
            if (phone.startsWith('0082')) phone = '0' + phone.slice(4);
            else if (phone.startsWith('+82')) phone = '0' + phone.slice(3);
            else if (phone.startsWith('82')) phone = '0' + phone.slice(2);
            const digits = phone.replace(/\D/g, '');
            if (digits.length === 11 && digits.startsWith('010')) {
                phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
            }
        }

        const barcode = member.memberId || account.adikr_barcode;
        const points = wallet.availablePoints !== undefined ? wallet.availablePoints : account.current_points;

        // 쿠폰 정보 변환 + 기존 쿠폰과 병합 (사라진 코드도 보존)
        const formattedVouchers = Array.isArray(vouchers) ? vouchers.map(v => ({
            description: v.couponLabel || v.name || 'N/A',
            code: v.code || 'N/A',
            expiry: v.available?.to ? v.available.to.slice(0, 10) : 'N/A',
            sold: false,
            sold_to: ''
        })) : [];
        const voucherData = JSON.stringify(mergeVouchers(formattedVouchers, account.owned_vouchers));

        const successStatus = `${modeLabel} 조회 완료 ${getNowTime()}`;

        await runQuery(`
            UPDATE adidas_accounts
            SET name = $1, phone = $2, adikr_barcode = $3, current_points = $4, owned_vouchers = $5,
                ${statusColumn} = $6, updated_at = NOW()
            WHERE id = $7
        `, [name, phone, barcode, points, voucherData, successStatus, accountId]);

        addLog(`[배치추출] ${email} - 조회 완료 (이름: ${name}, 바코드: ${barcode}, 포인트: ${points})`);
        updateProgress(accountId, 'extract', 'success', successStatus);
    } else {
        // 실패
        let errorMsg;
        let progressStatus = 'error';
        const errorCode = result.error || 'UNKNOWN';

        if (errorCode === 'PASSWORD_WRONG') {
            errorMsg = `${modeLabel} 비밀번호 틀림 ${getNowTime()}`;
            progressStatus = 'warning';  // 패스로 처리
        } else if (errorCode === 'LOGIN_FAILED') {
            errorMsg = `${modeLabel} 로그인 실패 ${getNowTime()}`;
        } else if (errorCode === 'TOKEN_FAILED' || errorCode === 'NO_TOKEN') {
            errorMsg = `${modeLabel} 토큰 추출 실패 ${getNowTime()}`;
        } else if (errorCode.includes('BOT_BLOCKED')) {
            errorMsg = `${modeLabel} 차단 의심 ${getNowTime()}`;
        } else if (errorCode === 'NO_DEVICE') {
            errorMsg = `${modeLabel} 디바이스 없음 ${getNowTime()}`;
        } else if (errorCode === 'APPIUM_NOT_AVAILABLE') {
            errorMsg = `${modeLabel} Appium 없음 ${getNowTime()}`;
        } else {
            errorMsg = `${modeLabel} 알 수 없는 오류 ${getNowTime()}`;
        }

        addLog(`[배치추출] ${email} - ${errorMsg}`);
        await runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, accountId]);
        updateProgress(accountId, 'extract', progressStatus, errorMsg);
    }
}

function extractAccountInfo(account) {
    return new Promise((resolve) => {
        // 상태 업데이트 (DB + 모니터링) - 모드에 따라 적절한 컬럼 업데이트
        // hybrid 모드는 웹 먼저 시도하므로 web_fetch_status에 기록
        const effectiveMode = extractMode === 'hybrid' ? 'web' : extractMode;
        const modeLabel = extractMode === 'hybrid' ? '[웹+모바일]' : (effectiveMode === 'web' ? '[웹브라우저]' : '[모바일]');
        const statusColumn = effectiveMode === 'web' ? 'web_fetch_status' : 'mobile_fetch_status';
        runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [`${modeLabel} 조회 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
        updateProgress(account.id, 'extract', 'processing', `조회 중... ${account.email}`);

        const scriptPath = getPythonScriptPath();
        const androidHome = (process.env.ANDROID_HOME || 'C:\\platform-tools').trim();
        const isHybridScript = scriptPath.includes('extract_hybrid.py');

        const { spawn } = require('child_process');

        // 하이브리드 스크립트면 모드 인자 추가 (hybrid 모드도 그대로 전달)
        // --id 인자를 추가하여 진행 상태 출력에 사용
        const pythonArgs = isHybridScript
            ? ['-u', scriptPath, account.email, account.password, '--mode', extractMode, '--id', account.id.toString()]
            : ['-u', scriptPath, account.email, account.password];

        const pythonPath = getPythonPath();

        const pythonProcess = spawn(pythonPath, pythonArgs, {
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                ANDROID_SDK_ROOT: androidHome,
                PATH: `${androidHome};${process.env.PATH}`,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString('utf-8');
            stdout += chunk;

            // [PROGRESS] 라인 파싱하여 진행 상태 업데이트
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('[PROGRESS]')) {
                    try {
                        const jsonStr = line.substring('[PROGRESS]'.length).trim();
                        const progress = JSON.parse(jsonStr);
                        if (progress.id && progress.status && progress.message) {
                            updateProgress(progress.id, 'extract', progress.status, progress.message);
                        }
                    } catch (e) {
                        // JSON 파싱 실패 무시
                    }
                }
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
            // stderr 로깅 (Python 크래시, import 오류 등 진단용)
            if (stderr && stderr.trim().length > 0) {
                addLog(`[일괄추출] ${account.email} - Python stderr: ${stderr.substring(0, 300)}`);
            }

            // stdout에서 에러 관련 키워드 검색하여 로그 출력
            if (stdout.includes('ERROR') || stdout.includes('실패') || stdout.includes('오류')) {
                // 에러 관련 줄만 추출하여 로그에 표시
                const errorLines = stdout.split('\n').filter(line =>
                    line.includes('ERROR') || line.includes('실패') || line.includes('오류') || line.includes('비밀번호')
                );
                if (errorLines.length > 0) {
                    addLog(`[일괄추출] ${account.email} - stdout 에러: ${errorLines.join(' | ').substring(0, 150)}`);
                }
            }

            const hasToken = stdout.includes('토큰 획득 성공') || stdout.includes('토큰 획득 성공!');
            const hasApiResult = stdout.includes('이름:') && stdout.includes('바코드:');
            // 에러 조건: BOT_BLOCKED, PASSWORD_WRONG, 또는 [ERROR] 메시지
            // 단, 프로필 화면 타임아웃/로그아웃 실패는 토큰+API 성공이면 무시 (비치명적)
            const hasCriticalError = stdout.includes('BOT_BLOCKED') ||
                             stdout.includes('PASSWORD_WRONG');
            const hasNonCriticalError = stdout.includes('[ERROR]') &&
                             !stdout.includes('프로필 화면 타임아웃') &&
                             !stdout.includes('로그아웃 실패');
            const hasError = hasCriticalError || hasNonCriticalError;
            const isSuccess = code === 0 && (hasToken || hasApiResult) && !hasError;

            if (isSuccess) {
                const result = parseExtractResult(stdout, account.email);

                // 이메일 불일치 검증 - 다른 계정 정보가 반환된 경우 업데이트 방지
                if (result.emailMismatch) {
                    const mismatchMsg = `${modeLabel} 이메일 불일치 (응답: ${result.foundEmail}) ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 이메일 불일치: 응답=${result.foundEmail}`);
                    runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [mismatchMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    updateProgress(account.id, 'extract', 'error', mismatchMsg);
                } else {
                    const successStatus = `${modeLabel} 조회 완료 ${getNowTime()}`;

                    // 하이브리드 모드에서 웹/모바일 각각 컬럼 업데이트
                    if (extractMode === 'hybrid') {
                        let webStatus = null;
                        let mobileStatus = null;

                        // 웹 결과 파싱
                        const hasWebSuccess = stdout.includes('토큰 획득 성공! (사용 모드: web)');
                        const hasMobileSuccess = stdout.includes('토큰 획득 성공! (사용 모드: mobile)');

                        if (stdout.includes('→ 웹 로그인 실패') || stdout.includes('웹 로그인 오류')) {
                            webStatus = `[웹] 실패 ${getNowTime()}`;
                        } else if (stdout.includes('→ 웹 로그인 차단') || stdout.includes('BOT_BLOCKED')) {
                            webStatus = `[웹] 차단 ${getNowTime()}`;
                        } else if (hasWebSuccess) {
                            webStatus = `[웹] 조회 완료 ${getNowTime()}`;
                        }

                        if (hasMobileSuccess) {
                            mobileStatus = `[모바일] 조회 완료 ${getNowTime()}`;
                        } else if (stdout.includes('[2차] 모바일') && !hasMobileSuccess) {
                            mobileStatus = `[모바일] 실패 ${getNowTime()}`;
                        }

                        addLog(`[일괄추출] ${account.email} - 하이브리드: webStatus=${webStatus}, mobileStatus=${mobileStatus}`);

                        runQuery(`
                            UPDATE adidas_accounts
                            SET name = $1, phone = $2, adikr_barcode = $3, current_points = $4, owned_vouchers = $5,
                                web_fetch_status = COALESCE($6, web_fetch_status),
                                mobile_fetch_status = COALESCE($7, mobile_fetch_status),
                                updated_at = NOW()
                            WHERE id = $8
                        `, [
                            result.name || account.name,
                            result.phone || account.phone,
                            result.barcode || account.adikr_barcode,
                            result.points || account.current_points,
                            JSON.stringify(mergeVouchers(result.vouchers || [], account.owned_vouchers)),
                            webStatus,
                            mobileStatus,
                            account.id
                        ]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    } else {
                        runQuery(`
                            UPDATE adidas_accounts
                            SET name = $1, phone = $2, adikr_barcode = $3, current_points = $4, owned_vouchers = $5,
                                ${statusColumn} = $6, updated_at = NOW()
                            WHERE id = $7
                        `, [
                            result.name || account.name,
                            result.phone || account.phone,
                            result.barcode || account.adikr_barcode,
                            result.points || account.current_points,
                            JSON.stringify(mergeVouchers(result.vouchers || [], account.owned_vouchers)),
                            successStatus,
                            account.id
                        ]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    }
                    addLog(`[일괄추출] ${account.email} - 조회 완료`);
                    updateProgress(account.id, 'extract', 'success', successStatus);
                }
            } else {
                // 에러 케이스: 비밀번호 틀림, 봇 차단, [ERROR] 메시지, 그 외 알 수 없는 오류
                let errorMsg;

                // 비밀번호 오류 체크
                const isPasswordError =
                    stdout.includes('[ERROR] PASSWORD_WRONG') ||
                    stdout.includes('잘못된 이메일/비밀번호') ||
                    stdout.includes('PASSWORD_WRONG');

                // 봇 차단 체크 (오류가 발생했습니다 메시지)
                const isBotBlocked =
                    stdout.includes('[ERROR] BOT_BLOCKED') ||
                    stdout.includes('BOT_BLOCKED');

                // [ERROR] 메시지 체크
                const hasErrorMessage = stdout.includes('[ERROR]');

                // 웹 크롤러 라이브러리 미설치 체크
                const isLibraryMissing = stdout.includes('LIBRARY_MISSING') || stdout.includes('라이브러리가 없습니다');

                // 에뮬레이터/Appium 연결 오류 체크 (모바일 모드)
                const isNoDevice = stdout.includes('연결된 디바이스가 없습니다') || stdout.includes('NO_DEVICE') || stderr.includes('no devices');
                const isAppiumNotInstalled = stdout.includes('APPIUM_NOT_AVAILABLE') || stdout.includes('Appium이 설치되지 않았습니다');
                const isAppiumNotRunning = stderr.includes('Connection refused') || stderr.includes('Could not find a connected Android device') || stdout.includes('Appium 세션 없음');

                if (isLibraryMissing) {
                    errorMsg = `${modeLabel} 웹 크롤러 설치 필요 (undetected-chromedriver 미설치) ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 웹 크롤러 라이브러리 미설치`);
                } else if (isNoDevice) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (에뮬레이터 미연결) ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 모바일 연결 필요 (에뮬레이터 미연결)`);
                } else if (isAppiumNotInstalled) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (Appium 미설치) ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 모바일 연결 필요 (Appium 미설치)`);
                } else if (isAppiumNotRunning) {
                    errorMsg = `${modeLabel} 모바일 연결 필요 (Appium 서버 미실행) ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 모바일 연결 필요 (Appium 서버 미실행)`);
                } else if (isPasswordError) {
                    errorMsg = `${modeLabel} 비밀번호 틀림 ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 비밀번호 틀림`);
                    // 비밀번호 오류는 별도 상태로 처리 (취합용)
                    runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                    updateProgress(account.id, 'extract', 'password_wrong', errorMsg);
                    resolve();
                    return;
                } else if (isBotBlocked) {
                    // BOT_BLOCKED:에러메시지 형식에서 에러 메시지 추출
                    const botBlockMatch = stdout.match(/BOT_BLOCKED:([^\n\r]+)/);
                    const botBlockMsg = botBlockMatch ? botBlockMatch[1].trim() : '';
                    errorMsg = botBlockMsg ? `${modeLabel} 차단 의심 : ${botBlockMsg} ${getNowTime()}` : `${modeLabel} 차단 의심 ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 차단 의심${botBlockMsg ? ': ' + botBlockMsg : ''}`);
                } else if (hasErrorMessage) {
                    // [ERROR] 메시지에서 세부 내용 추출
                    const errorMatch = stdout.match(/\[ERROR\]\s*([^\n\r]+)/);
                    const errorDetail = errorMatch ? errorMatch[1].trim() : '';
                    errorMsg = errorDetail ? `${modeLabel} 오류: ${errorDetail} ${getNowTime()}` : `${modeLabel} 오류 발생 ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 오류: ${errorDetail || '알 수 없음'}`);
                } else {
                    errorMsg = `${modeLabel} 알 수 없는 오류 ${getNowTime()}`;
                    addLog(`[일괄추출] ${account.email} - 알 수 없는 오류`);
                }
                runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
                updateProgress(account.id, 'extract', 'error', errorMsg);
            }
            resolve();
        });

        pythonProcess.on('error', () => {
            const errorMsg = `${modeLabel} 실행 오류 ${getNowTime()}`;
            runQuery(`UPDATE adidas_accounts SET ${statusColumn} = $1, updated_at = NOW() WHERE id = $2`, [errorMsg, account.id]).catch(e => addLog(`[DB 오류] ${e.message}`));
            updateProgress(account.id, 'extract', 'error', errorMsg);
            resolve();
        });
    });
}

function parseExtractResult(output, email) {
    const result = { email, name: null, phone: null, barcode: null, points: null, vouchers: null, emailMismatch: false, foundEmail: null };

    // 핵심: 해당 이메일이 포함된 "Adidas API 테스트" 섹션만 파싱
    // "이메일: xxx@xxx.com" 이후의 데이터만 사용
    const emailPattern = new RegExp(`이메일:\\s*${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const emailIndex = output.search(emailPattern);

    // API 테스트 섹션 찾기 (토큰 획득 후 API 호출 결과)
    const apiTestIndex = output.indexOf('Adidas API 테스트');

    // 파싱할 섹션 결정: API 테스트 섹션이 있으면 그 이후만, 없으면 이메일 매치 이후만
    let parseSection = output;
    if (apiTestIndex > 0) {
        parseSection = output.substring(apiTestIndex);
    } else if (emailIndex > 0) {
        parseSection = output.substring(emailIndex);
    }

    // API 응답의 이메일 추출 (형식: "  이메일: xxx@xxx.com" - 앞에 공백 있음)
    const foundEmailMatch = parseSection.match(/이메일:\s*([^\s\n]+@[^\s\n]+)/);
    if (foundEmailMatch) {
        result.foundEmail = foundEmailMatch[1].trim().toLowerCase();

        // 이메일 불일치 검증 (대소문자 무시)
        if (result.foundEmail !== email.toLowerCase()) {
            result.emailMismatch = true;
            return result; // 이메일이 다르면 파싱 중단하고 반환
        }
    } else {
        // 이메일 검증: 파싱 섹션에 해당 이메일이 있는지 확인 (대소문자 무시)
        if (!parseSection.toLowerCase().includes(email.toLowerCase())) {
            // 대소문자 무시하고 이메일이 없으면 다른 계정 데이터일 가능성 높음
            result.emailMismatch = true;
            return result;
        }
    }

    // 이름 추출 - "이름:" 으로 시작하는 줄에서 값 추출 (None 제외)
    const nameMatch = parseSection.match(/이름:\s*(.+)/);
    if (nameMatch) {
        const name = nameMatch[1].trim();
        if (name && name !== 'None' && name !== 'null' && name !== 'N/A') {
            result.name = name;
        }
    }

    // 전화번호 추출
    const phoneMatch = parseSection.match(/전화번호:\s*(.+)/);
    if (phoneMatch) {
        let phone = phoneMatch[1].trim();
        if (phone && phone !== 'None' && phone !== 'null' && phone !== 'N/A') {
            // 국제번호 형식(0082...) -> 국내 형식(010-xxxx-xxxx)으로 변환
            if (phone.startsWith('0082')) {
                phone = '0' + phone.slice(4); // 0082 -> 0
            } else if (phone.startsWith('+82')) {
                phone = '0' + phone.slice(3); // +82 -> 0
            } else if (phone.startsWith('82')) {
                phone = '0' + phone.slice(2); // 82 -> 0
            }
            // 숫자만 추출 후 하이픈 형식으로 변환 (01012345678 -> 010-1234-5678)
            const digits = phone.replace(/\D/g, '');
            if (digits.length === 11 && digits.startsWith('010')) {
                phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
            } else if (digits.length === 10) {
                phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
            }
            result.phone = phone;
        }
    }

    // 바코드 추출 - "바코드: ADIKR..." 또는 "ADIKR 바코드: ADIKR..." 형식
    const barcodeMatch = parseSection.match(/바코드:\s*(ADIKR\d+|ADI[A-Z]{2}\d+)/);
    if (barcodeMatch) {
        result.barcode = barcodeMatch[1].trim();
    }

    // 포인트 추출 - "포인트: 1,234" 또는 "포인트: 1234" 형식
    const pointsMatch = parseSection.match(/포인트:\s*([\d,]+)/);
    if (pointsMatch) {
        const pointsStr = pointsMatch[1].replace(/,/g, '');
        result.points = parseInt(pointsStr);
    }

    // 쿠폰 추출 - "    - 쿠폰명: 코드 (만료: 날짜)" 형식
    const vouchers = [];

    // 새로운 형식: "    - MONETARY_ADI_KR_100K_KRW_REKR100: REKR100-7MHX-2CHT-VV24-HM4T (만료: 2026-01-20)"
    // 또는: "    - KR_Raffle Reimburse_3K: RAFFLE_3K-TAAJ-JFLN-R5U5-PUEX (만료: 2026-02-08)"
    const couponMatches = parseSection.matchAll(/^\s*-\s*(.+?):\s*([A-Z0-9_-]+)\s*\(만료:\s*(\d{4}-\d{2}-\d{2})\)/gm);
    for (const match of couponMatches) {
        vouchers.push({
            description: match[1].trim(),
            code: match[2].trim(),
            expiry: match[3].trim(),
            sold: false,
            sold_to: ''
        });
    }

    // 기존 형식 폴백: "    - 쿠폰명" 또는 "할인" 포함
    if (vouchers.length === 0) {
        const couponMatches2 = parseSection.matchAll(/-\s+(.+?할인)/g);
        for (const match of couponMatches2) {
            vouchers.push({
                description: match[1].trim(),
                code: '',
                expiry: 'N/A',
                sold: false,
                sold_to: ''
            });
        }
    }

    if (vouchers.length > 0) {
        result.vouchers = vouchers;
    }

    return result;
}

// ========== 쿠폰 발급 API ==========

// 쿠폰 발급 Python 스크립트 경로
function getIssueCouponScriptPath() {
    // 배포 환경 (extraResources로 복사된 경로)
    if (process.resourcesPath) {
        const prodPath = path.join(process.resourcesPath, 'scripts', 'issue_coupon.py');
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }
    }

    // 개발 환경
    const devPath = path.join(__dirname, 'scripts', 'issue_coupon.py');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    return null;
}

// 모바일 쿠폰 발급 Python 스크립트 경로
function getIssueCouponMobileScriptPath() {
    // 배포 환경 (extraResources로 복사된 경로)
    if (process.resourcesPath) {
        const prodPath = path.join(process.resourcesPath, 'scripts', 'issue_coupon_mobile.py');
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }
    }

    // 개발 환경
    const devPath = path.join(__dirname, 'scripts', 'issue_coupon_mobile.py');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    return null;
}

// 쿠폰 일괄 발급 (반드시 단건 발급보다 먼저 정의해야 함 - Express 라우팅 순서)
app.post('/api/issue-coupon/bulk', async (req, res) => {
    const { ids, coupon_type, coupon_types, mode } = req.body;

    try {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '발급할 계정 ID가 없습니다' });
        }

        // 여러 쿠폰 타입 지원 (coupon_types 배열 우선, 없으면 coupon_type 단일값)
        let targetCouponTypes = [];
        if (coupon_types && Array.isArray(coupon_types) && coupon_types.length > 0) {
            targetCouponTypes = coupon_types;
        } else if (coupon_type) {
            targetCouponTypes = [coupon_type];
        } else {
            return res.status(400).json({ error: '쿠폰 타입을 선택해주세요' });
        }

        // 모든 쿠폰 타입 유효성 검사
        const validTypes = ['10000', '30000', '50000', '100000'];
        for (const ct of targetCouponTypes) {
            if (!validTypes.includes(ct)) {
                return res.status(400).json({ error: `유효하지 않은 쿠폰 타입: ${ct}` });
            }
        }

        // 요청에서 모드를 전달받거나, 없으면 서버의 extractMode 사용
        const issueMode = mode || extractMode;

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const accountsMap = new Map();
        (await query(`SELECT * FROM adidas_accounts WHERE id IN (${placeholders})`, ids)).forEach(acc => {
            accountsMap.set(acc.id, acc);
        });

        // ids 순서대로 accounts 배열 생성
        const accounts = ids.map(id => accountsMap.get(id)).filter(Boolean);

        if (accounts.length === 0) {
            return res.status(404).json({ error: '선택한 계정을 찾을 수 없습니다' });
        }

        // 쿠폰 타입 이름 변환
        const couponNames = {
            '10000': '1만원권',
            '30000': '3만원권',
            '50000': '5만원권',
            '100000': '10만원권'
        };
        const couponTypesStr = targetCouponTypes.map(ct => couponNames[ct] || `${ct}원`).join(', ');

        const modeLabels = { web: '[웹]', mobile: '[모바일]', hybrid: '[웹+모바일]' };
        const modeLabel = modeLabels[issueMode] || '[웹]';
        addLog(`[쿠폰발급] ${modeLabel} ${accounts.length}개 계정 ${couponTypesStr} 발급 시작`);
        res.json({ message: `${modeLabel} ${accounts.length}개 계정 쿠폰 발급(${couponTypesStr})을 시작합니다. 순차적으로 처리됩니다.` });

        // 백그라운드에서 순차 처리 (모드에 따라 분기)
        if (issueMode === 'mobile') {
            processIssueCouponMobileSequentially(accounts, targetCouponTypes);
        } else if (issueMode === 'hybrid') {
            processIssueCouponHybridSequentially(accounts, targetCouponTypes[0]); // 하이브리드는 아직 단일만 지원
        } else {
            processIssueCouponSequentially(accounts, targetCouponTypes[0]); // 웹은 아직 단일만 지원
        }
    } catch (error) {
        addLog(`[쿠폰발급] 오류: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 쿠폰 발급 - 단일 계정
app.post('/api/issue-coupon/:id', async (req, res) => {
    const { id } = req.params;
    const { coupon_type, mode } = req.body; // 10000, 30000, 50000, 100000

    try {
        const account = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [id]);
        if (!account) {
            addLog(`[쿠폰발급] 계정 ID ${id} 찾을 수 없음`);
            return res.status(404).json({ error: '계정을 찾을 수 없습니다' });
        }

        if (!coupon_type || !['10000', '30000', '50000', '100000'].includes(coupon_type)) {
            return res.status(400).json({ error: '유효하지 않은 쿠폰 타입입니다. 10000, 30000, 50000, 100000 중 하나를 선택하세요.' });
        }

        // 요청에서 모드를 전달받거나, 없으면 서버의 extractMode 사용
        const issueMode = mode || extractMode;
        const modeLabel = issueMode === 'web' ? '[웹브라우저]' : '[모바일]';

        addLog(`[쿠폰발급] ${modeLabel} 시작 - ${account.email} (${coupon_type}원 상품권)`);

        // 모바일 모드인 경우 모바일 발급 함수 사용
        if (issueMode === 'mobile') {
            // 상태 업데이트 (mobile_issue_status 사용)
            runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2',
                [`[모바일] ${coupon_type}원 발급 중... ${getNowTime()}`, id]).catch(e => addLog(`[DB오류] ${e.message}`));
            updateProgress(id, 'issue', 'processing', `${coupon_type}원 발급 중...`);

            res.json({ message: `[모바일] ${account.email} 쿠폰 발급(${coupon_type}원)을 시작합니다.` });

            // 모바일 발급 처리 (1개 계정) - 배열 형태로 전달
            processIssueCouponMobileSequentially([account], [coupon_type]);
            return;
        }

        // 웹 브라우저 모드
        // 상태 업데이트 (web_issue_status 사용)
        runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [`[웹브라우저] ${coupon_type}원 발급 중... ${getNowTime()}`, id]).catch(e => addLog(`[DB오류] ${e.message}`));
        updateProgress(id, 'issue', 'processing', `${coupon_type}원 발급 중...`);

        const scriptPath = getIssueCouponScriptPath();
        if (!scriptPath) {
            addLog('[쿠폰발급] Python 스크립트를 찾을 수 없음');
            return res.status(500).json({ error: '쿠폰 발급 스크립트를 찾을 수 없습니다' });
        }

        const { spawn } = require('child_process');
        const pythonPath = getPythonPath();

        const pythonProcess = spawn(pythonPath, ['-u', scriptPath, account.email, account.password, coupon_type], {
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString('utf-8');
            stdout += chunk;
            // 에러 또는 중요 결과만 출력
            if (chunk.includes('ERROR') || chunk.includes('[RESULT]')) {
                addLog(`[쿠폰발급] ${chunk.substring(0, 150)}`);
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            // stderr는 심각한 오류만 출력
            if (chunk.includes('Error') || chunk.includes('Exception') || chunk.includes('Traceback')) {
                addLog(`[쿠폰발급 오류] ${chunk.substring(0, 150)}`);
            }
        });

        pythonProcess.on('close', (code) => {
            // 성공 판정: "상품권 교환 확정하기" 버튼 클릭 후 "완료" 확인
            // 또는 [RESULT] JSON 파싱 (호환성 유지)
            const confirmButtonSuccess = stdout.includes('상품권 교환 확정하기') &&
                                         (stdout.includes('완료') || stdout.includes('성공'));

            // [RESULT] JSON 파싱 시도 (중첩 JSON 처리를 위해 개선)
            let result = null;
            const resultIndex = stdout.indexOf('[RESULT]');
            if (resultIndex !== -1) {
                try {
                    // [RESULT] 이후 첫 번째 { 찾기
                    const jsonStart = stdout.indexOf('{', resultIndex);
                    if (jsonStart !== -1) {
                        // 중첩된 {} 매칭을 위한 파싱
                        let depth = 0;
                        let jsonEnd = jsonStart;
                        for (let i = jsonStart; i < stdout.length; i++) {
                            if (stdout[i] === '{') depth++;
                            else if (stdout[i] === '}') depth--;
                            if (depth === 0) {
                                jsonEnd = i + 1;
                                break;
                            }
                        }
                        const jsonStr = stdout.substring(jsonStart, jsonEnd);
                        result = JSON.parse(jsonStr);
                    }
                } catch (e) {
                    addLog(`[쿠폰발급] 결과 JSON 파싱 실패: ${e.message}`);
                }
            }

            // 성공 조건: 확인 버튼 클릭 성공 OR [RESULT].success
            const isSuccess = confirmButtonSuccess || (result && result.success);

            if (isSuccess) {
                // 발급 성공 - 포인트 및 쿠폰 목록 업데이트 (web_issue_status 사용)
                const newPoints = result.remaining_points || 0;
                const vouchers = result.vouchers ? JSON.stringify(mergeVouchers(result.vouchers, account.owned_vouchers)) : null;
                const successMsg = `[웹브라우저] ${coupon_type}원 발급 완료 ${getNowTime()}`;
                runQuery(`
                    UPDATE adidas_accounts
                    SET current_points = $1,
                        owned_vouchers = COALESCE($2, owned_vouchers),
                        web_issue_status = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [newPoints, vouchers, successMsg, id]).catch(e => addLog(`[DB오류] ${e.message}`));
                addLog(`[쿠폰발급] 성공 - ${account.email}: ${coupon_type}원 발급, 잔여 ${newPoints}P, 쿠폰 ${result.vouchers?.length || 0}개`);
                updateProgress(id, 'issue', 'success', successMsg);
            } else {
                // 발급 실패 (web_issue_status 사용)
                // 에러 케이스: 비밀번호 틀림, 봇 차단, 포인트 부족, 대기 기간, 그 외 알 수 없는 오류
                let errorMsg;
                let progressStatus = 'error'; // 기본은 에러
                if (result && result.error) {
                    const errorCode = result.error;
                    if (errorCode === 'PASSWORD_WRONG') {
                        errorMsg = `[웹브라우저] 비밀번호 틀림 ${getNowTime()}`;
                        progressStatus = 'password_wrong';  // 비밀번호 오류는 별도 상태
                    } else if (errorCode.startsWith('BOT_BLOCKED')) {
                        // BOT_BLOCKED:에러메시지 형식에서 에러 메시지 추출
                        const botBlockMsg = errorCode.includes(':') ? errorCode.split(':').slice(1).join(':').trim() : '';
                        errorMsg = botBlockMsg ? `[웹브라우저] 차단 의심 : ${botBlockMsg} ${getNowTime()}` : `[웹브라우저] 차단 의심 ${getNowTime()}`;
                    } else if (errorCode === 'INSUFFICIENT_POINTS') {
                        errorMsg = `[웹브라우저] 포인트 부족 ${getNowTime()}`;
                        progressStatus = 'warning';
                    } else if (errorCode === 'COUPON_BUTTON_NOT_FOUND') {
                        errorMsg = `[웹브라우저] ${coupon_type/10000}만원 쿠폰 버튼 없음 ${getNowTime()}`;
                        progressStatus = 'warning';
                    } else if (errorCode === 'COOLDOWN_PERIOD') {
                        errorMsg = `[웹브라우저] 1달 미경과 ${getNowTime()}`;
                        progressStatus = 'warning';
                    } else {
                        errorMsg = `[웹브라우저] 알 수 없는 오류 ${getNowTime()}`;
                    }
                } else {
                    errorMsg = `[웹브라우저] 알 수 없는 오류 ${getNowTime()}`;
                }

                // 실패해도 result에 포인트/쿠폰 정보가 있으면 업데이트
                if (result && (result.remaining_points !== undefined || result.vouchers)) {
                    const newPoints = result.remaining_points || 0;
                    const vouchers = result.vouchers ? JSON.stringify(mergeVouchers(result.vouchers, account.owned_vouchers)) : null;
                    runQuery(`
                        UPDATE adidas_accounts
                        SET current_points = $1,
                            owned_vouchers = COALESCE($2, owned_vouchers),
                            web_issue_status = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [newPoints, vouchers, errorMsg, id]).catch(e => addLog(`[DB오류] ${e.message}`));
                    addLog(`[쿠폰발급] 실패 - ${account.email}: ${errorMsg} (포인트: ${newPoints}P, 쿠폰: ${result.vouchers?.length || 0}개 업데이트됨)`);
                } else {
                    runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [errorMsg, id]).catch(e => addLog(`[DB오류] ${e.message}`));
                    addLog(`[쿠폰발급] 실패 - ${account.email}: ${errorMsg}`);
                }
                updateProgress(id, 'issue', progressStatus, errorMsg);
            }
        });

        pythonProcess.on('error', (err) => {
            addLog(`[쿠폰발급] Python 실행 오류: ${err.message}`);
            const errorMsg = `[웹브라우저] 실행 오류 ${getNowTime()}`;
            runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [errorMsg, id]).catch(e => addLog(`[DB오류] ${e.message}`));
            updateProgress(id, 'issue', 'error', errorMsg);
        });

        res.json({ message: `${account.email} 쿠폰 발급(${coupon_type}원)을 시작합니다` });
    } catch (error) {
        addLog(`[쿠폰발급] 예외 발생: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

async function processIssueCouponSequentially(accounts, coupon_type) {
    // 배치 프로세스 시작 등록 (순차 처리는 process 없이 등록)
    const accountIds = accounts.map(a => a.id);
    startBatchProcess('issue-web', `웹 쿠폰 발급 (${coupon_type}원)`, accountIds, null);

    try {
        for (const account of accounts) {
            // 중지 요청 확인
            if (runningBatchProcess.abortRequested) {
                addLog(`[일괄발급] 사용자 중지 요청 - 남은 계정 건너뜀`);
                // 남은 계정 상태 업데이트
                const idx = accounts.indexOf(account);
                for (let i = idx; i < accounts.length; i++) {
                    updateProgress(accounts[i].id, 'issue', 'error', '사용자에 의해 중지됨');
                }
                break;
            }

            await issueCouponForAccount(account, coupon_type);
            // 다음 계정 전 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    } finally {
        // 배치 프로세스 종료
        endBatchProcess();
    }
}

// 모바일 쿠폰 발급 순차 처리 (Appium 배치 모드 사용)
async function processIssueCouponMobileSequentially(accounts, coupon_types) {
    const accountIds = accounts.map(a => a.id);

    // coupon_types를 배열로 정규화 (단일값도 지원)
    const couponTypesArray = Array.isArray(coupon_types) ? coupon_types : [coupon_types];

    // 쿠폰 타입 이름 변환
    const couponNames = {
        '10000': '1만원권',
        '30000': '3만원권',
        '50000': '5만원권',
        '100000': '10만원권'
    };
    const couponTypesStr = couponTypesArray.map(ct => couponNames[ct] || `${ct}원`).join(', ');

    // 모든 계정 상태를 '대기 중'으로 초기화 (mobile_issue_status 사용)
    for (const account of accounts) {
        runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2',
            [`[모바일] ${couponTypesStr} 대기 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
        updateProgress(account.id, 'issue', 'waiting', `대기 중... ${account.email}`);
    }

    // Python 직접 실행 방식 (배치 처리)
    // 배치 정보를 임시 JSON 파일로 저장
    const batchData = {
        coupon_types: couponTypesArray,
        accounts: accounts.map(acc => ({
            id: acc.id,
            email: acc.email,
            password: acc.password,
        })),
    };

    const batchJsonPath = path.join(getWritableTempDir(), `issue_batch_${Date.now()}.json`);
    fs.writeFileSync(batchJsonPath, JSON.stringify(batchData, null, 2), 'utf-8');

    const scriptPath = getIssueCouponMobileScriptPath();
    if (!scriptPath) {
        addLog('[쿠폰발급] Python 스크립트 없음');
        accounts.forEach(acc => {
            updateProgress(acc.id, 'issue', 'error', '스크립트 없음');
        });
        return;
    }

    const { spawn } = require('child_process');
    const pythonPath = getPythonPath();
    const androidHome = (process.env.ANDROID_HOME || 'C:\\platform-tools').trim();

    // 배치 모드로 실행 (--batch 옵션)
    const pythonProcess = spawn(pythonPath, ['-u', scriptPath, '--batch', batchJsonPath], {
        env: {
            ...process.env,
            ANDROID_HOME: androidHome,
            ANDROID_SDK_ROOT: androidHome,
            PATH: `${androidHome};${process.env.PATH}`,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
        },
        windowsHide: true
    });

    // 배치 프로세스 시작 등록
    startBatchProcess('issue-mobile', `모바일 쿠폰 발급 (${couponTypesStr})`, accountIds, pythonProcess);

    let stdout = '';
    let lineBuffer = '';  // 불완전한 라인 버퍼링
    const pendingVouchers = {};  // 계정별 쿠폰 수집용

    // 완전한 라인 처리 함수
    function processLine(line) {
        // [PROGRESS] 파싱 - 상태와 포인트 정보
        if (line.includes('[PROGRESS]')) {
            try {
                const jsonStart = line.indexOf('{');
                if (jsonStart !== -1) {
                    const jsonStr = line.substring(jsonStart);
                    const progress = JSON.parse(jsonStr);

                    // 에러 코드를 사람이 읽기 쉬운 메시지로 변환
                    const displayMessage = {
                        'COOLDOWN_PERIOD': '1달 미경과',
                        'PASSWORD_WRONG': '비밀번호 틀림',
                        'INSUFFICIENT_POINTS': '포인트 부족',
                        'TOKEN_NOT_FOUND': '토큰 실패',
                        'LOGIN_FAILED': '로그인 실패',
                    }[progress.message] || progress.message;

                    updateProgress(progress.id, 'issue', progress.status, displayMessage);

                    // DB 상태 업데이트 (mobile_issue_status 사용) - 변환된 메시지 사용
                    const statusMsg = `[모바일] ${displayMessage} ${getNowTime()}`;
                    addLog(`[쿠폰발급-DEBUG] id=${progress.id}, progress.message=${progress.message}, displayMessage=${displayMessage}, statusMsg=${statusMsg}`);
                    runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2', [statusMsg, progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));

                    if (progress.status === 'success' || progress.status === 'error' || progress.status === 'warning' || progress.status === 'password_wrong') {
                        // 포인트와 쿠폰 목록 업데이트 (vouchers가 있으면 전체 대체)
                        if (progress.data) {
                            if (progress.data.vouchers && Array.isArray(progress.data.vouchers)) {
                                runQuery(`
                                    UPDATE adidas_accounts
                                    SET current_points = COALESCE($1, current_points),
                                        owned_vouchers = $2,
                                        updated_at = NOW()
                                    WHERE id = $3
                                `, [progress.data.remaining_points, JSON.stringify(progress.data.vouchers), progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                            } else if (progress.data.remaining_points !== undefined) {
                                runQuery(`
                                    UPDATE adidas_accounts
                                    SET current_points = $1,
                                        updated_at = NOW()
                                    WHERE id = $2
                                `, [progress.data.remaining_points, progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                            }
                        }

                        // 결과 로그 (간결하게)
                        const statusIcon = progress.status === 'success' ? '✓' :
                                          progress.status === 'warning' ? '!' :
                                          progress.status === 'password_wrong' ? '🔑' : '✗';
                        const pointsInfo = progress.data?.remaining_points ? ` (${progress.data.remaining_points}P)` : '';
                        addLog(`[쿠폰발급] id=${progress.id} ${statusIcon} ${progress.message}${pointsInfo}`);
                    }
                }
            } catch (e) {
                // 파싱 실패 시 무시
            }
        }

        // [VOUCHER] 파싱 - 개별 쿠폰
        if (line.includes('[VOUCHER]') && !line.includes('[VOUCHERS]')) {
            try {
                const jsonStart = line.indexOf('{');
                if (jsonStart !== -1) {
                    const jsonStr = line.substring(jsonStart);
                    const voucherData = JSON.parse(jsonStr);
                    if (voucherData.id && voucherData.voucher) {
                        const accId = voucherData.id;
                        if (!pendingVouchers[accId]) {
                            pendingVouchers[accId] = [];
                        }
                        pendingVouchers[accId].push(voucherData.voucher);
                    }
                }
            } catch (e) {
                // 파싱 실패 시 무시
            }
        }
    }

    pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString('utf-8');
        stdout += chunk;

        // 버퍼에 추가하고 완전한 라인만 처리
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');

        // 마지막 요소는 불완전할 수 있으므로 버퍼에 유지
        lineBuffer = lines.pop() || '';

        // 완전한 라인들 처리
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                // [DEBUG] 모든 Python 출력 로그 (디버깅용)
                addLog(`[PY] ${trimmedLine.substring(0, 200)}`);


                // "발급 중:" 패턴으로 실시간 상태 업데이트 (정보 조회와 동일 방식)
                if (trimmedLine.includes('발급 중:')) {
                    const emailMatch = trimmedLine.match(/발급 중:\s*(\S+)/);
                    if (emailMatch) {
                        const email = emailMatch[1];
                        const account = accounts.find(a => a.email === email);
                        if (account) {
                            runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2',
                                [`[모바일] ${couponTypesStr} 발급 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                            updateProgress(account.id, 'issue', 'processing', `${couponTypesStr} 발급 중...`);
                        }
                    }
                }

                // 비밀번호 오류 패턴 직접 감지 (fallback - [PROGRESS] 없이도 감지)
                if ((trimmedLine.includes('비밀번호 오류:') || trimmedLine.includes('PASSWORD_WRONG') || trimmedLine.includes('[ERROR] PASSWORD_WRONG')) && !trimmedLine.includes('[PROGRESS]')) {
                    const emailMatch = trimmedLine.match(/비밀번호 오류:\s*(\S+)/) || trimmedLine.match(/:\s*(\S+@\S+)/);
                    if (emailMatch) {
                        const email = emailMatch[1];
                        const account = accounts.find(a => a.email === email);
                        if (account) {
                            const statusMsg = `[모바일] 비밀번호 틀림 ${getNowTime()}`;
                            addLog(`[쿠폰발급-fallback] ${email} - 비밀번호 오류 감지`);
                            runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2', [statusMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                            updateProgress(account.id, 'issue', 'password_wrong', `비밀번호 틀림`);
                        }
                    }
                }

                processLine(trimmedLine);
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const errMsg = data.toString().trim();
        if (errMsg && !errMsg.includes('DevTools') && !errMsg.includes('Bluetooth')) {
            addLog(`[쿠폰발급 오류] ${errMsg.substring(0, 200)}`);
        }
    });

    pythonProcess.on('close', (code) => {
        // 남은 버퍼 처리
        if (lineBuffer.trim()) {
            processLine(lineBuffer.trim());
        }

        // 수집된 쿠폰 정보 DB에 저장
        for (const accId in pendingVouchers) {
            const vouchers = pendingVouchers[accId];
            if (vouchers.length > 0) {
                const vouchersJson = JSON.stringify(vouchers);
                runQuery(`
                    UPDATE adidas_accounts
                    SET owned_vouchers = $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [vouchersJson, accId]).catch(e => addLog(`[DB오류] ${e.message}`));
            }
        }

        // 임시 파일 삭제
        try {
            if (fs.existsSync(batchJsonPath)) {
                fs.unlinkSync(batchJsonPath);
            }
        } catch (e) {
            // 무시
        }

        // 배치 프로세스 종료
        endBatchProcess();
    });

    pythonProcess.on('error', (err) => {
        addLog(`[모바일일괄발급] Python 실행 오류: ${err.message}`);
        accounts.forEach(acc => {
            updateProgress(acc.id, 'issue', 'error', `실행 오류: ${err.message}`);
        });
        endBatchProcess();
    });
}

// isHybridMode: true면 결과만 반환하고 상태 업데이트는 호출자가 처리
function issueCouponForAccount(account, coupon_type, isHybridMode = false) {
    return new Promise((resolve) => {
        // 상태 업데이트 (web_issue_status 사용)
        runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [`[웹브라우저] ${coupon_type}원 발급 중... ${getNowTime()}`, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
        if (!isHybridMode) {
            updateProgress(account.id, 'issue', 'processing', `[웹브라우저] ${coupon_type}원 발급 중...`);
        }

        const scriptPath = getIssueCouponScriptPath();
        if (!scriptPath) {
            const errorMsg = `[웹브라우저] 스크립트 없음 ${getNowTime()}`;
            runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [errorMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
            if (!isHybridMode) {
                updateProgress(account.id, 'issue', 'error', errorMsg);
            }
            resolve({ success: false, error: 'SCRIPT_NOT_FOUND', needMobileFallback: true });
            return;
        }

        const { spawn } = require('child_process');
        const pythonPath = getPythonPath();

        const pythonProcess = spawn(pythonPath, ['-u', scriptPath, account.email, account.password, coupon_type], {
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let stdout = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString('utf-8');
        });

        pythonProcess.on('close', (code) => {
            // 성공 판정: "상품권 교환 확정하기" 버튼 클릭 후 "완료" 확인
            const confirmButtonSuccess = stdout.includes('상품권 교환 확정하기') &&
                                         (stdout.includes('완료') || stdout.includes('성공'));

            // [RESULT] JSON 파싱 시도 (중첩 JSON 처리를 위해 개선)
            let result = null;
            const resultIndex = stdout.indexOf('[RESULT]');
            if (resultIndex !== -1) {
                try {
                    const jsonStart = stdout.indexOf('{', resultIndex);
                    if (jsonStart !== -1) {
                        let depth = 0;
                        let jsonEnd = jsonStart;
                        for (let i = jsonStart; i < stdout.length; i++) {
                            if (stdout[i] === '{') depth++;
                            else if (stdout[i] === '}') depth--;
                            if (depth === 0) {
                                jsonEnd = i + 1;
                                break;
                            }
                        }
                        const jsonStr = stdout.substring(jsonStart, jsonEnd);
                        result = JSON.parse(jsonStr);
                    }
                } catch (e) {
                    // 파싱 실패 무시
                }
            }

            // 성공 조건: 확인 버튼 클릭 성공 OR [RESULT].success
            const isSuccess = confirmButtonSuccess || (result && result.success);

            if (isSuccess) {
                const newPoints = result.remaining_points || 0;
                const vouchers = result.vouchers ? JSON.stringify(mergeVouchers(result.vouchers, account.owned_vouchers)) : null;
                const successMsg = `[웹브라우저] ${coupon_type}원 발급 완료 ${getNowTime()}`;
                // web_issue_status 사용, 쿠폰 목록도 업데이트
                runQuery(`
                    UPDATE adidas_accounts
                    SET current_points = $1,
                        owned_vouchers = COALESCE($2, owned_vouchers),
                        web_issue_status = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [newPoints, vouchers, successMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                addLog(`[쿠폰발급] id=${account.id} ✓ ${coupon_type}원 발급완료 (${newPoints}P)`);
                if (!isHybridMode) {
                    updateProgress(account.id, 'issue', 'success', successMsg);
                }
                resolve({ success: true, remaining_points: newPoints, vouchers: result.vouchers, needMobileFallback: false });
            } else {
                // 에러 케이스: 비밀번호 틀림, 봇 차단, 포인트 부족, 대기 기간, 그 외 알 수 없는 오류
                let errorMsg;
                let progressStatus = 'error'; // 기본은 에러
                let needMobileFallback = false; // 모바일로 재시도 필요 여부
                const errorCode = result?.error || '';

                if (errorCode === 'PASSWORD_WRONG') {
                    errorMsg = `[웹브라우저] 비밀번호 틀림 ${getNowTime()}`;
                    progressStatus = 'password_wrong';  // 비밀번호 오류는 별도 상태
                } else if (errorCode.startsWith('BOT_BLOCKED')) {
                    // BOT_BLOCKED:에러메시지 형식에서 에러 메시지 추출
                    const botBlockMsg = errorCode.includes(':') ? errorCode.split(':').slice(1).join(':').trim() : '';
                    errorMsg = botBlockMsg ? `[웹브라우저] 차단 의심 : ${botBlockMsg} ${getNowTime()}` : `[웹브라우저] 차단 의심 ${getNowTime()}`;
                    needMobileFallback = true; // 봇 차단 시 모바일로 재시도
                } else if (errorCode === 'INSUFFICIENT_POINTS') {
                    errorMsg = `[웹브라우저] 포인트 부족 ${getNowTime()}`;
                    progressStatus = 'warning';
                } else if (errorCode === 'COUPON_BUTTON_NOT_FOUND') {
                    errorMsg = `[웹브라우저] ${coupon_type/10000}만원 쿠폰 버튼 없음 ${getNowTime()}`;
                    progressStatus = 'warning';
                } else if (errorCode === 'COOLDOWN_PERIOD') {
                    errorMsg = `[웹브라우저] 1달 미경과 ${getNowTime()}`;
                    progressStatus = 'warning';
                } else if (errorCode === 'TOKEN_NOT_FOUND' || errorCode === 'LOGIN_FAILED') {
                    errorMsg = `[웹브라우저] 로그인/토큰 실패 ${getNowTime()}`;
                    needMobileFallback = true; // 토큰 실패 시 모바일로 재시도
                } else {
                    errorMsg = `[웹브라우저] 알 수 없는 오류 ${getNowTime()}`;
                    needMobileFallback = true; // 알 수 없는 오류도 모바일로 재시도
                }

                // 에러 코드를 사람이 읽기 쉬운 메시지로 변환
                const displayError = {
                    'PASSWORD_WRONG': '비밀번호 틀림',
                    'INSUFFICIENT_POINTS': '포인트 부족',
                    'COOLDOWN_PERIOD': '1달 미경과',
                    'COUPON_BUTTON_NOT_FOUND': '쿠폰 버튼 없음',
                    'TOKEN_NOT_FOUND': '토큰 실패',
                    'LOGIN_FAILED': '로그인 실패',
                }[errorCode] || (errorCode.startsWith('BOT_BLOCKED') ? '봇 차단' : errorCode);

                // 실패해도 result에 포인트/쿠폰 정보가 있으면 업데이트
                if (result && (result.remaining_points !== undefined || result.vouchers)) {
                    const newPoints = result.remaining_points || 0;
                    const vouchers = result.vouchers ? JSON.stringify(mergeVouchers(result.vouchers, account.owned_vouchers)) : null;
                    runQuery(`
                        UPDATE adidas_accounts
                        SET current_points = $1,
                            owned_vouchers = COALESCE($2, owned_vouchers),
                            web_issue_status = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [newPoints, vouchers, errorMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                    const statusIcon = progressStatus === 'warning' ? '!' : '✗';
                    addLog(`[쿠폰발급] id=${account.id} ${statusIcon} ${displayError} (${newPoints}P)`);
                } else {
                    runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [errorMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                    addLog(`[쿠폰발급] id=${account.id} ✗ ${displayError}`);
                }
                if (!isHybridMode) {
                    updateProgress(account.id, 'issue', progressStatus, errorMsg);
                }
                resolve({
                    success: false,
                    error: errorCode,
                    progressStatus,
                    remaining_points: result?.remaining_points,
                    vouchers: result?.vouchers,
                    needMobileFallback
                });
            }
        });

        pythonProcess.on('error', (err) => {
            const errorMsg = `[웹브라우저] 실행 오류 ${getNowTime()}`;
            runQuery('UPDATE adidas_accounts SET web_issue_status = $1, updated_at = NOW() WHERE id = $2', [errorMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
            if (!isHybridMode) {
                updateProgress(account.id, 'issue', 'error', errorMsg);
            }
            resolve({ success: false, error: 'EXECUTION_ERROR', needMobileFallback: true });
        });
    });
}

// 웹+모바일 하이브리드 발급 순차 처리
// 정보조회와 동일: 한 계정씩 웹 시도 → 실패 시 바로 모바일 재시도
async function processIssueCouponHybridSequentially(accounts, coupon_type) {
    const accountIds = accounts.map(a => a.id);
    startBatchProcess('issue-hybrid', `웹+모바일 쿠폰 발급 (${coupon_type}원)`, accountIds, null);

    try {
        addLog(`[하이브리드] ${accounts.length}개 계정 처리 시작 (계정별 웹→모바일 순차)`);

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];

            if (runningBatchProcess.abortRequested) {
                addLog(`[하이브리드] 사용자 중지 요청 - 남은 계정 건너뜀`);
                for (let j = i; j < accounts.length; j++) {
                    updateProgress(accounts[j].id, 'issue', 'error', '사용자에 의해 중지됨');
                }
                break;
            }

            addLog(`[하이브리드] [${i + 1}/${accounts.length}] id=${account.id} 처리 시작`);

            // 1. 웹 발급 시도
            updateProgress(account.id, 'issue', 'processing', `[웹] ${coupon_type}원 발급 시도 중...`);
            const webResult = await issueCouponForAccount(account, coupon_type, true);

            if (webResult.success) {
                // 웹 성공 - 완료
                updateProgress(account.id, 'issue', 'success', `[웹] ${coupon_type}원 발급 완료`);
                addLog(`[하이브리드] id=${account.id} 웹 발급 성공`);
            } else if (webResult.needMobileFallback) {
                // 2. 웹 실패 → 즉시 모바일 재시도
                addLog(`[하이브리드] id=${account.id} 웹 실패 → 모바일 재시도`);
                updateProgress(account.id, 'issue', 'processing', `[모바일] ${coupon_type}원 발급 시도 중...`);

                const mobileResult = await issueCouponMobileSingle(account, coupon_type);

                if (mobileResult.success) {
                    updateProgress(account.id, 'issue', 'success', `[모바일] ${coupon_type}원 발급 완료`);
                    addLog(`[하이브리드] id=${account.id} 모바일 발급 성공`);
                } else if (mobileResult.error_type === 'cooldown_period') {
                    updateProgress(account.id, 'issue', 'warning', `[모바일] ${mobileResult.message || '1달 미경과'}`);
                    addLog(`[하이브리드] id=${account.id} 1달 미경과`);
                } else {
                    updateProgress(account.id, 'issue', 'error', `[모바일] ${mobileResult.message || '발급 실패'}`);
                    addLog(`[하이브리드] id=${account.id} 모바일 발급 실패: ${mobileResult.message}`);
                }
            } else {
                // 포인트 부족, 1달 미경과 등 - 모바일 재시도 불필요
                const status = webResult.progressStatus || 'error';
                // 에러 코드를 사람이 읽기 쉬운 메시지로 변환
                const displayError = {
                    'COOLDOWN_PERIOD': '1달 미경과',
                    'PASSWORD_WRONG': '비밀번호 틀림',
                    'INSUFFICIENT_POINTS': '포인트 부족',
                    'TOKEN_NOT_FOUND': '토큰 실패',
                    'LOGIN_FAILED': '로그인 실패',
                    'COUPON_BUTTON_NOT_FOUND': '쿠폰 버튼 없음',
                }[webResult.error] || webResult.error || '오류';
                updateProgress(account.id, 'issue', status, `[웹] ${displayError}`);
                addLog(`[하이브리드] id=${account.id} 웹 결과: ${displayError}`);
            }

            // 다음 계정 전 잠시 대기
            if (i < accounts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

    } finally {
        endBatchProcess();
    }
}

// 단일 계정 모바일 발급 (하이브리드용)
function issueCouponMobileSingle(account, coupon_type) {
    return new Promise((resolve) => {
        const scriptPath = getIssueCouponMobileScriptPath();
        if (!scriptPath) {
            resolve({ success: false, message: '모바일 스크립트 없음' });
            return;
        }

        const { spawn } = require('child_process');
        const pythonPath = getPythonPath();

        const pythonProcess = spawn(pythonPath, ['-u', scriptPath, account.email, account.password, coupon_type], {
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let stdout = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString('utf-8');
        });

        pythonProcess.stderr.on('data', (data) => {
            // stderr 무시
        });

        pythonProcess.on('close', (code) => {
            // [RESULT] JSON 파싱
            let result = null;
            const resultIndex = stdout.indexOf('[RESULT]');
            if (resultIndex !== -1) {
                try {
                    const jsonStart = stdout.indexOf('{', resultIndex);
                    if (jsonStart !== -1) {
                        let depth = 0;
                        let jsonEnd = jsonStart;
                        for (let j = jsonStart; j < stdout.length; j++) {
                            if (stdout[j] === '{') depth++;
                            else if (stdout[j] === '}') depth--;
                            if (depth === 0) {
                                jsonEnd = j + 1;
                                break;
                            }
                        }
                        const jsonStr = stdout.substring(jsonStart, jsonEnd);
                        result = JSON.parse(jsonStr);
                    }
                } catch (e) {
                    // 파싱 실패
                }
            }

            if (result) {
                // DB 업데이트 (성공/실패 모두 vouchers가 있으면 갱신)
                const newPoints = result.remaining_points;
                const vouchers = result.vouchers ? JSON.stringify(mergeVouchers(result.vouchers, account.owned_vouchers)) : null;
                const statusMsg = result.success
                    ? `[모바일] ${coupon_type}원 발급 완료 ${getNowTime()}`
                    : `[모바일] ${result.message || '실패'} ${getNowTime()}`;

                if (newPoints !== undefined && vouchers) {
                    // 포인트와 쿠폰 정보가 있으면 함께 갱신 (1달 미경과 등도 포함)
                    runQuery(`
                        UPDATE adidas_accounts
                        SET current_points = $1,
                            owned_vouchers = $2,
                            mobile_issue_status = $3,
                            mobile_fetch_status = $4,
                            updated_at = NOW()
                        WHERE id = $5
                    `, [newPoints, vouchers, statusMsg, `조회 완료 ${getNowTime()}`, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                } else {
                    // 정보가 없으면 상태만 갱신
                    runQuery(`
                        UPDATE adidas_accounts
                        SET mobile_issue_status = $1,
                            updated_at = NOW()
                        WHERE id = $2
                    `, [statusMsg, account.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                }
                resolve(result);
            } else {
                // RESULT 없으면 stdout에서 판단
                if (stdout.includes('발급 완료') || stdout.includes('교환 성공')) {
                    resolve({ success: true, message: '발급 완료' });
                } else if (stdout.includes('1달 미경과') || stdout.includes('cooldown')) {
                    resolve({ success: false, message: '1달 미경과', error_type: 'cooldown_period' });
                } else if (stdout.includes('포인트 부족')) {
                    resolve({ success: false, message: '포인트 부족' });
                } else {
                    resolve({ success: false, message: '발급 실패' });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            resolve({ success: false, message: `실행 오류: ${err.message}` });
        });
    });
}

// 하이브리드 모드용 모바일 발급 처리 (Promise 래퍼)
function processIssueCouponMobileForHybrid(accounts, coupon_type) {
    return new Promise((resolve) => {
        // 배치 정보를 임시 JSON 파일로 저장
        const batchData = {
            coupon_type: coupon_type,
            accounts: accounts.map(acc => ({
                id: acc.id,
                email: acc.email,
                password: acc.password,
            })),
        };

        const batchJsonPath = path.join(getWritableTempDir(), `issue_hybrid_batch_${Date.now()}.json`);
        fs.writeFileSync(batchJsonPath, JSON.stringify(batchData, null, 2), 'utf-8');

        const scriptPath = getIssueCouponMobileScriptPath();
        if (!scriptPath) {
            addLog('[하이브리드] 모바일 Python 스크립트 없음');
            accounts.forEach(acc => {
                updateProgress(acc.id, 'issue', 'error', '[모바일] 스크립트 없음');
            });
            resolve();
            return;
        }

        const { spawn } = require('child_process');
        const pythonPath = getPythonPath();

        // 첫 번째 계정 상태 업데이트
        if (accounts.length > 0) {
            updateProgress(accounts[0].id, 'issue', 'processing', '[모바일] Appium 연결 중...');
        }

        const pythonProcess = spawn(pythonPath, ['-u', scriptPath, '--batch', batchJsonPath], {
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            },
            windowsHide: true
        });

        let lineBuffer = '';

        pythonProcess.stdout.on('data', (data) => {
            lineBuffer += data.toString('utf-8');
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
                if (line.includes('[PROGRESS]')) {
                    try {
                        const jsonStart = line.indexOf('{');
                        if (jsonStart !== -1) {
                            const jsonStr = line.substring(jsonStart);
                            const progress = JSON.parse(jsonStr);

                            // 에러 코드를 사람이 읽기 쉬운 메시지로 변환
                            const displayMessage = {
                                'COOLDOWN_PERIOD': '1달 미경과',
                                'PASSWORD_WRONG': '비밀번호 틀림',
                                'INSUFFICIENT_POINTS': '포인트 부족',
                                'TOKEN_NOT_FOUND': '토큰 실패',
                                'LOGIN_FAILED': '로그인 실패',
                            }[progress.message] || progress.message;

                            updateProgress(progress.id, 'issue', progress.status, `[모바일] ${displayMessage}`);

                            // DB 상태 업데이트 - 변환된 메시지 사용
                            const statusMsg = `[모바일] ${displayMessage} ${getNowTime()}`;
                            runQuery('UPDATE adidas_accounts SET mobile_issue_status = $1, updated_at = NOW() WHERE id = $2', [statusMsg, progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));

                            if (progress.status === 'success' || progress.status === 'error' || progress.status === 'warning' || progress.status === 'password_wrong') {
                                if (progress.data) {
                                    // 포인트와 쿠폰 목록 업데이트 (vouchers가 있으면 전체 대체)
                                    if (progress.data.vouchers && Array.isArray(progress.data.vouchers)) {
                                        runQuery('UPDATE adidas_accounts SET current_points = COALESCE($1, current_points), owned_vouchers = $2, updated_at = NOW() WHERE id = $3',
                                            [progress.data.remaining_points, JSON.stringify(progress.data.vouchers), progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                                    } else if (progress.data.remaining_points !== undefined) {
                                        runQuery('UPDATE adidas_accounts SET current_points = $1, updated_at = NOW() WHERE id = $2',
                                            [progress.data.remaining_points, progress.id]).catch(e => addLog(`[DB오류] ${e.message}`));
                                    }
                                }
                            }

                            const statusIcon = progress.status === 'success' ? '✓' : (progress.status === 'warning' ? '!' : (progress.status === 'password_wrong' ? '🔑' : '✗'));
                            if (progress.status !== 'processing') {
                                addLog(`[하이브리드-모바일] id=${progress.id} ${statusIcon} ${displayMessage}`);
                            }
                        }
                    } catch (e) {
                        // 파싱 오류 무시
                    }
                }

                if (line.includes('[VOUCHER]')) {
                    (async () => {
                        try {
                            const jsonStart = line.indexOf('{');
                            if (jsonStart !== -1) {
                                const jsonStr = line.substring(jsonStart);
                                const voucherData = JSON.parse(jsonStr);
                                const accId = voucherData.id;
                                const voucher = voucherData.voucher;

                                const existing = await queryOne('SELECT owned_vouchers FROM adidas_accounts WHERE id = $1', [accId]);
                                let vouchers = [];
                                if (existing && existing.owned_vouchers) {
                                    try { vouchers = JSON.parse(existing.owned_vouchers); } catch {}
                                }
                                const exists = vouchers.some(v => v.code === voucher.code);
                                if (!exists) {
                                    vouchers.push(voucher);
                                    runQuery('UPDATE adidas_accounts SET owned_vouchers = $1, updated_at = NOW() WHERE id = $2',
                                        [JSON.stringify(vouchers), accId]).catch(e => addLog(`[DB오류] ${e.message}`));
                                }
                            }
                        } catch (e) {
                            // 파싱 오류 무시
                        }
                    })();
                }
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('[하이브리드-모바일] stderr:', data.toString());
        });

        pythonProcess.on('close', (code) => {
            // 임시 파일 삭제
            try { fs.unlinkSync(batchJsonPath); } catch {}
            addLog(`[하이브리드] 모바일 처리 완료 (exit: ${code})`);
            resolve();
        });

        pythonProcess.on('error', (err) => {
            addLog(`[하이브리드] 모바일 Python 실행 오류: ${err.message}`);
            accounts.forEach(acc => {
                updateProgress(acc.id, 'issue', 'error', `[모바일] 실행 오류: ${err.message}`);
            });
            resolve();
        });
    });
}

// ========== 진행 상태 API (모니터링용) ==========

// 모니터링 시작 시 상태 초기화
app.post('/api/progress/init', (req, res) => {
    const { ids, type } = req.body;

    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids 배열이 필요합니다' });
    }

    // 이미 진행 중이거나 완료된 상태는 덮어쓰지 않음
    // (배치 작업이 먼저 시작되어 이미 처리된 경우 보호)
    ids.forEach(id => {
        const existing = getProgress(id);
        if (!existing || existing.type !== type) {
            // 기존 상태가 없거나 다른 타입이면 초기화
            updateProgress(id, type, 'waiting', '대기 중');
        }
        // 이미 해당 타입의 상태가 있으면 유지 (덮어쓰지 않음)
    });

    res.json({ success: true, count: ids.length });
});

// 진행 상태 조회
app.post('/api/progress', (req, res) => {
    const { ids, type } = req.body;

    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids 배열이 필요합니다' });
    }

    const items = ids.map(id => {
        const progress = getProgress(id);
        // progressStore에 해당 타입의 상태가 있으면 사용 (모니터링 중인 작업)
        if (progress && progress.type === type) {
            return {
                id,
                status: progress.status,
                message: progress.message
            };
        }
        // progressStore에 없으면 아직 모니터링 시작 전이거나 다른 타입 → 대기 중
        return { id, status: 'waiting', message: '대기 중' };
    });

    res.json({ items });
});

// 배치 작업 상태 조회
app.get('/api/batch/status', (req, res) => {
    const { active, type, title, abortRequested, startTime, accountIds } = runningBatchProcess;
    res.json({
        active,
        type,
        title,
        abortRequested,
        startTime,
        accountCount: accountIds.length,
    });
});

// 배치 작업 중지
app.post('/api/batch/abort', (req, res) => {
    const result = abortBatchProcess();
    res.json(result);
});

// ========== Appium 세션 API ==========

// 세션 상태 조회
app.get('/api/appium/status', async (req, res) => {
    const status = await getAppiumSessionStatus();
    status.serverRunning = appiumSessionProcess !== null;
    res.json(status);
});

// 세션 서버 시작
app.post('/api/appium/start-server', (req, res) => {
    startAppiumSessionServer();
    res.json({ success: true, message: '세션 서버 시작됨' });
});

// 세션 서버 종료
app.post('/api/appium/stop-server', (req, res) => {
    stopAppiumSessionServer();
    res.json({ success: true, message: '세션 서버 종료됨' });
});

// Appium 세션 연결
app.post('/api/appium/connect', async (req, res) => {
    // 서버가 안 돌고 있으면 먼저 시작
    if (!appiumSessionProcess) {
        startAppiumSessionServer();
        // 서버 시작 대기
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const result = await connectAppiumSession();
    res.json(result);
});

// 세션으로 로그인 요청
app.post('/api/appium/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email과 password 필요' });
    }

    try {
        const http = require('http');
        const postData = JSON.stringify({ email, password });

        const result = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: APPIUM_SESSION_PORT,
                path: '/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 60000
            }, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ success: false, error: 'JSON 파싱 실패' });
                    }
                });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: '로그인 타임아웃' });
            });
            req.write(postData);
            req.end();
        });

        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 세션으로 쿠폰 발급 요청
app.post('/api/appium/issue', async (req, res) => {
    const { email, password, coupon_type } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email과 password 필요' });
    }

    try {
        const http = require('http');
        const postData = JSON.stringify({ email, password, coupon_type: coupon_type || '100000' });

        const result = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: APPIUM_SESSION_PORT,
                path: '/issue',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 120000
            }, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ success: false, error: 'JSON 파싱 실패' });
                    }
                });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: '쿠폰 발급 타임아웃' });
            });
            req.write(postData);
            req.end();
        });

        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 로그 API ==========

// 최근 로그 조회
app.get('/api/logs', (req, res) => {
    res.json(recentLogs);
});

// 로그 파일 내용 조회
app.get('/api/logs/file', (req, res) => {
    try {
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf-8');
            const lines = content.split('\n').slice(-200); // 최근 200줄
            res.json({ logs: lines });
        } else {
            res.json({ logs: [] });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 서버 시작 함수
async function start(port = 8003) {
    await initDB();

    const server = app.listen(port, () => {
        addLog(`서버 시작됨 - http://localhost:${port}`);
    });

    // WebSocket 서버 설정
    const wss = new WebSocket.Server({ server, path: '/ws' });
    wss.on('connection', (ws) => {
        addLog('[WebSocket] 클라이언트 연결됨');
        wsClients.push(ws);

        ws.on('close', () => {
            addLog('[WebSocket] 클라이언트 연결 해제');
            wsClients = wsClients.filter(client => client !== ws);
        });

        ws.on('error', (err) => {
            console.error('[WebSocket] 에러:', err);
        });
    });

    // 프로세스 종료 시 정리
    process.on('SIGINT', () => {
        addLog('[서버] 종료 신호 수신');
        stopAppiumSessionServer();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        addLog('[서버] 종료 신호 수신');
        stopAppiumSessionServer();
        process.exit(0);
    });

    return server;
}

module.exports = { start };
