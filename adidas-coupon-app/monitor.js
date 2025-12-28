/**
 * 아디다스 쿠폰 관리자 - 모니터링 및 로그 모듈
 */

// ========== 모니터링 팝업 ==========

async function openMonitor(type, title, accounts) {
    state.monitor = {
        active: true,
        type,
        title,
        items: accounts.map(acc => ({
            id: acc.id,
            email: acc.email,
            status: 'waiting',
            message: '대기 중',
            startTime: null,
            endTime: null,
        })),
        startTime: new Date(),
        pollInterval: null,
    };
    render();

    // 서버에 진행 상태 초기화 요청
    try {
        const ids = accounts.map(acc => acc.id);
        await api('/progress/init', {
            method: 'POST',
            body: { ids, type }
        });
    } catch (error) {
        console.error('진행 상태 초기화 실패:', error);
    }

    // 진행 상태 폴링 시작
    startMonitorPolling();
}

function closeMonitor() {
    if (state.monitor.pollInterval) {
        clearInterval(state.monitor.pollInterval);
    }
    state.monitor = {
        active: false,
        type: null,
        title: '',
        items: [],
        startTime: null,
        pollInterval: null,
    };
    loadAccounts();
    render();
}

// 모니터링 팝업만 숨기기 (백그라운드로 전환)
// 폴링은 계속 유지하여 상태 추적
function hideMonitorPopup() {
    // 모니터 active를 false로 하면 팝업이 렌더링되지 않음
    // 하지만 폴링은 계속 유지
    const wasActive = state.monitor.active;
    const items = state.monitor.items;
    const type = state.monitor.type;
    const title = state.monitor.title;
    const startTime = state.monitor.startTime;
    const pollInterval = state.monitor.pollInterval;

    // 팝업만 숨기고 폴링은 유지
    state.monitor.active = false;
    render();

    // 상태 복원 (폴링 유지를 위해)
    state.monitor = {
        active: false,  // 팝업은 숨긴 상태
        type,
        title,
        items,
        startTime,
        pollInterval,
        hidden: true,  // 숨김 상태 플래그
    };

    // 배치 상태 폴링 시작 (상단 바 업데이트용)
    startBatchStatusPolling();
    checkBatchStatus().then(() => render());

    notifyInfo('백그라운드에서 계속 진행됩니다. 상단 바에서 상태를 확인하세요.');
}

// 모니터링 팝업 다시 열기
function reopenMonitor() {
    // 숨겨진 모니터가 있으면 다시 표시
    if (state.monitor.hidden && state.monitor.items.length > 0) {
        state.monitor.active = true;
        state.monitor.hidden = false;
        render();

        // 폴링이 중지되었으면 다시 시작
        if (!state.monitor.pollInterval) {
            startMonitorPolling();
        }
        return;
    }

    // 배치 작업이 진행 중이면 새로 모니터링 시작
    if (state.batchStatus && state.batchStatus.active) {
        notifyInfo('진행 중인 작업이 있습니다. 상세 정보를 불러오는 중...');
        // 현재 진행 상태를 기반으로 모니터 재구성
        // (완벽한 복원은 어렵지만, 배치 상태는 확인 가능)
    } else {
        notifyWarning('실행 중인 작업이 없습니다.');
    }
}

function startMonitorPolling() {
    if (state.monitor.pollInterval) {
        clearInterval(state.monitor.pollInterval);
    }

    state.monitor.pollInterval = setInterval(async () => {
        await pollMonitorStatus();
    }, 1000);

    pollMonitorStatus();
}

async function pollMonitorStatus() {
    // 팝업이 숨김 상태이거나 활성 상태일 때만 폴링 (hidden 플래그 체크)
    if (!state.monitor.active && !state.monitor.hidden) return;

    try {
        const ids = state.monitor.items.map(item => item.id);
        const result = await api('/progress', {
            method: 'POST',
            body: { ids, type: state.monitor.type }
        });

        result.items.forEach(update => {
            const item = state.monitor.items.find(i => i.id === update.id);
            if (item) {
                const prevStatus = item.status;
                item.status = update.status;
                item.message = update.message;

                if (update.status === 'processing' && prevStatus === 'waiting') {
                    item.startTime = new Date();
                }
                // warning도 완료 상태로 처리 (1달 미경과 등)
                if ((update.status === 'success' || update.status === 'error' || update.status === 'warning') && !item.endTime) {
                    item.endTime = new Date();
                }
            }
        });

        // 스크롤 위치 저장 후 렌더링, 복원
        const monitorBody = document.querySelector('.monitor-body');
        const scrollTop = monitorBody ? monitorBody.scrollTop : 0;

        render();

        // 스크롤 위치 복원
        requestAnimationFrame(() => {
            const newMonitorBody = document.querySelector('.monitor-body');
            if (newMonitorBody && scrollTop > 0) {
                newMonitorBody.scrollTop = scrollTop;
            }
        });

        const allDone = state.monitor.items.every(
            item => item.status === 'success' || item.status === 'error' || item.status === 'warning'
        );
        if (allDone && state.monitor.pollInterval) {
            clearInterval(state.monitor.pollInterval);
            state.monitor.pollInterval = null;
            state.monitor.hidden = false;  // 완료 시 숨김 상태 해제 (상단바 숨김)
            loadAccounts();
        }
    } catch (error) {
        console.error('모니터링 상태 조회 실패:', error);
    }
}

function getMonitorStats() {
    const items = state.monitor.items;
    const total = items.length;
    const success = items.filter(i => i.status === 'success').length;
    const warning = items.filter(i => i.status === 'warning').length;
    const error = items.filter(i => i.status === 'error').length;
    const processing = items.filter(i => i.status === 'processing').length;
    const waiting = items.filter(i => i.status === 'waiting').length;
    const completed = success + warning + error;  // warning도 완료에 포함
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, success, warning, error, processing, waiting, completed, progress };
}

// ========== 로그 뷰어 (WebSocket) ==========

// WebSocket 재연결 타이머
let wsReconnectTimer = null;

async function showLogModal() {
    state.modal = { type: 'log' };
    state.logLines = [];
    state.logPaused = false;
    render();

    await loadLogs();
    connectLogWebSocket();
}

function connectLogWebSocket() {
    // 기존 연결이 있으면 정리
    if (state.logWs) {
        if (state.logWs.readyState === WebSocket.OPEN) {
            console.log('[WebSocket] 이미 연결됨');
            updateLogStatus('connected');
            return;
        }
        // CONNECTING 또는 CLOSING 상태면 기다림
        if (state.logWs.readyState === WebSocket.CONNECTING) {
            console.log('[WebSocket] 연결 중...');
            return;
        }
        // CLOSED 상태면 정리
        state.logWs = null;
    }

    // 재연결 타이머 정리
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }

    const wsUrl = 'ws://localhost:8003/ws';
    console.log('[WebSocket] 연결 시도:', wsUrl);
    updateLogStatus('connecting');

    try {
        state.logWs = new WebSocket(wsUrl);

        state.logWs.onopen = () => {
            updateLogStatus('connected');
            console.log('[WebSocket] 로그 연결됨');
        };

        state.logWs.onmessage = (event) => {
            if (state.logPaused) return;

            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') {
                    appendLogLine(data.data);
                }
            } catch (e) {
                appendLogLine(event.data);
            }
        };

        state.logWs.onclose = () => {
            console.log('[WebSocket] 로그 연결 종료');
            state.logWs = null;

            // 모달이 열려있으면 자동 재연결 시도
            if (state.modal && state.modal.type === 'log') {
                updateLogStatus('disconnected');
                wsReconnectTimer = setTimeout(() => {
                    console.log('[WebSocket] 자동 재연결 시도...');
                    connectLogWebSocket();
                }, 3000);
            }
        };

        state.logWs.onerror = (error) => {
            console.error('[WebSocket] 오류:', error);
            updateLogStatus('error');
        };
    } catch (error) {
        console.error('[WebSocket] 연결 실패:', error);
        updateLogStatus('error');
    }
}

// 수동 재연결 함수
function reconnectLogWebSocket() {
    disconnectLogWebSocket();
    setTimeout(() => {
        connectLogWebSocket();
    }, 500);
}

function disconnectLogWebSocket() {
    // 재연결 타이머 정리
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
    // WebSocket 연결 종료
    if (state.logWs) {
        state.logWs.close();
        state.logWs = null;
    }
}

function updateLogStatus(status) {
    const statusEl = document.getElementById('logStatus');
    if (!statusEl) return;

    switch (status) {
        case 'connected':
            statusEl.innerHTML = '● 실시간';
            statusEl.style.color = '#52c41a';
            break;
        case 'connecting':
            statusEl.innerHTML = '◌ 연결 중...';
            statusEl.style.color = '#1890ff';
            break;
        case 'disconnected':
            statusEl.innerHTML = '○ 연결 끊김';
            statusEl.style.color = '#999';
            break;
        case 'paused':
            statusEl.innerHTML = '❚❚ 일시중지';
            statusEl.style.color = '#faad14';
            break;
        case 'error':
            statusEl.innerHTML = '✕ 오류';
            statusEl.style.color = '#ff4d4f';
            break;
    }
}

// 로그 새로고침 (파일 로드 + WebSocket 재연결)
async function refreshLogs() {
    await loadLogs();
    reconnectLogWebSocket();
}

function appendLogLine(logEntry) {
    const logContainer = document.getElementById('logContent');
    if (!logContainer) return;

    const lineDiv = document.createElement('div');
    lineDiv.className = 'log-line';
    lineDiv.style.cssText = 'font-family:monospace;font-size:12px;padding:2px 0;border-bottom:1px solid #333;';

    const timestamp = logEntry.timestamp || '';
    const message = logEntry.message || logEntry;

    if (typeof message === 'string') {
        let color = '#e0e0e0';
        if (message.includes('ERROR') || message.includes('오류') || message.includes('실패')) {
            color = '#ff6b6b';
        } else if (message.includes('성공') || message.includes('완료')) {
            color = '#69db7c';
        } else if (message.includes('시작') || message.includes('연결')) {
            color = '#74c0fc';
        }

        lineDiv.innerHTML = `<span style="color:#888;">${escapeHtml(timestamp)}</span> <span style="color:${color};">${escapeHtml(message)}</span>`;
    } else {
        lineDiv.textContent = JSON.stringify(logEntry);
    }

    logContainer.appendChild(lineDiv);
    state.logLines.push(logEntry);

    while (logContainer.children.length > 500) {
        logContainer.removeChild(logContainer.firstChild);
        state.logLines.shift();
    }

    if (!state.logPaused) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

function toggleLogPause() {
    state.logPaused = !state.logPaused;

    const btn = document.getElementById('logPauseBtn');
    if (btn) {
        btn.textContent = state.logPaused ? '▶ 재생' : '❚❚ 일시중지';
        btn.className = `btn ${state.logPaused ? 'btn-success' : 'btn-warning'}`;
    }

    if (state.logPaused) {
        updateLogStatus('paused');
    } else {
        updateLogStatus(state.logWs && state.logWs.readyState === WebSocket.OPEN ? 'connected' : 'disconnected');
        const logContainer = document.getElementById('logContent');
        if (logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }
}

function clearLogView() {
    const logContainer = document.getElementById('logContent');
    if (logContainer) {
        logContainer.innerHTML = '';
    }
    state.logLines = [];
}

async function loadLogs() {
    const logContainer = document.getElementById('logContent');
    if (!logContainer) return;

    logContainer.innerHTML = '<div style="color:#888;">로그 로딩 중...</div>';

    try {
        const response = await fetch(`${API_BASE}/logs/file`);
        const data = await response.json();

        // 로그 라인에 색상 적용
        const formattedLogs = data.logs.map(line => {
            let color = '#e0e0e0';
            if (line.includes('ERROR') || line.includes('오류') || line.includes('실패')) {
                color = '#ff6b6b';
            } else if (line.includes('성공') || line.includes('완료')) {
                color = '#69db7c';
            } else if (line.includes('시작') || line.includes('연결') || line.includes('WebSocket')) {
                color = '#74c0fc';
            }
            return `<div class="log-line" style="font-family:monospace;font-size:12px;padding:2px 0;border-bottom:1px solid #333;color:${color};">${escapeHtml(line)}</div>`;
        }).join('');

        logContainer.innerHTML = formattedLogs;
        state.logLines = data.logs;

        // 최신 로그로 스크롤 (약간의 딜레이 후)
        setTimeout(() => {
            logContainer.scrollTop = logContainer.scrollHeight;
        }, 100);
    } catch (error) {
        logContainer.innerHTML = '<div style="color:#ff6b6b;">로그 로드 실패: ' + escapeHtml(error.message) + '</div>';
    }
}
