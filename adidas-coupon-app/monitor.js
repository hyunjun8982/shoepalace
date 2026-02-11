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
    const items = state.monitor.items;
    const type = state.monitor.type;
    const title = state.monitor.title;
    const startTime = state.monitor.startTime;
    const pollInterval = state.monitor.pollInterval;
    const selectedIds = state.monitor.selectedIds;

    // 스크롤 위치 저장 (나중에 복원용)
    const monitorBody = document.querySelector('.monitor-body');
    const savedScrollTop = monitorBody ? monitorBody.scrollTop : 0;

    // 상태 변경 (한 번에)
    state.monitor = {
        active: false,  // 팝업은 숨긴 상태
        type,
        title,
        items,
        startTime,
        pollInterval,
        selectedIds,
        hidden: true,  // 숨김 상태 플래그
        savedScrollTop,  // 스크롤 위치 저장
    };

    // 배치 상태 폴링 시작 (상단 바 업데이트용)
    startBatchStatusPolling();
    checkBatchStatus().then(() => render());  // 한 번만 렌더링

    notifyInfo('백그라운드에서 계속 진행됩니다. 상단 바에서 상태를 확인하세요.');
}

// 모니터링 팝업 다시 열기
function reopenMonitor() {
    // 숨겨진 모니터가 있으면 다시 표시
    if (state.monitor.hidden && state.monitor.items.length > 0) {
        const savedScrollTop = state.monitor.savedScrollTop || 0;
        state.monitor.active = true;
        state.monitor.hidden = false;
        render();

        // 저장된 스크롤 위치 복원
        if (savedScrollTop > 0) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const monitorBody = document.querySelector('.monitor-body');
                    if (monitorBody) {
                        monitorBody.scrollTop = savedScrollTop;
                    }
                });
            });
        }

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

        let hasChanges = false;
        result.items.forEach(update => {
            const item = state.monitor.items.find(i => i.id === update.id);
            if (item) {
                // 실제 변경이 있을 때만 업데이트
                if (item.status !== update.status || item.message !== update.message) {
                    hasChanges = true;
                    const prevStatus = item.status;
                    item.status = update.status;
                    item.message = update.message;

                    if (update.status === 'processing' && prevStatus === 'waiting') {
                        item.startTime = new Date();
                    }
                    // warning, password_wrong도 완료 상태로 처리
                    if ((update.status === 'success' || update.status === 'error' || update.status === 'warning' || update.status === 'password_wrong') && !item.endTime) {
                        item.endTime = new Date();
                    }
                }
            }
        });

        // 팝업이 활성 상태이고 변경사항이 있을 때만 렌더링
        if (state.monitor.active && hasChanges) {
            // 스크롤 위치 저장 후 렌더링, 복원
            const monitorBody = document.querySelector('.monitor-body');
            const scrollTop = monitorBody ? monitorBody.scrollTop : 0;

            render();

            // 스크롤 위치 복원 (더 안정적인 복원)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const newMonitorBody = document.querySelector('.monitor-body');
                    if (newMonitorBody && scrollTop > 0) {
                        newMonitorBody.scrollTop = scrollTop;
                    }
                });
            });
        }
        // 백그라운드(hidden) 상태일 때는 상태만 업데이트하고 render() 호출 안함

        const allDone = state.monitor.items.every(
            item => item.status === 'success' || item.status === 'error' || item.status === 'warning' || item.status === 'password_wrong'
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
    const passwordWrong = items.filter(i => i.status === 'password_wrong').length;
    const processing = items.filter(i => i.status === 'processing').length;
    const waiting = items.filter(i => i.status === 'waiting').length;
    const completed = success + warning + error + passwordWrong;  // password_wrong도 완료에 포함
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, success, warning, error, passwordWrong, processing, waiting, completed, progress };
}

// 모니터 항목 개별 선택
function toggleMonitorSelect(id) {
    if (!state.monitor.selectedIds) {
        state.monitor.selectedIds = new Set();
    }
    if (state.monitor.selectedIds.has(id)) {
        state.monitor.selectedIds.delete(id);
    } else {
        state.monitor.selectedIds.add(id);
    }
    render();
}

// 모니터 전체 선택/해제
function toggleMonitorSelectAll(checked) {
    if (!state.monitor.selectedIds) {
        state.monitor.selectedIds = new Set();
    }
    if (checked) {
        state.monitor.items.forEach(item => state.monitor.selectedIds.add(item.id));
    } else {
        state.monitor.selectedIds.clear();
    }
    render();
}

// 실패한 항목만 선택
function selectFailedItems() {
    if (!state.monitor.selectedIds) {
        state.monitor.selectedIds = new Set();
    }
    state.monitor.selectedIds.clear();
    state.monitor.items
        .filter(i => i.status === 'error')
        .forEach(item => state.monitor.selectedIds.add(item.id));
    render();
}

// 선택한 항목 재처리
async function retrySelectedItems() {
    if (!state.monitor.selectedIds || state.monitor.selectedIds.size === 0) {
        notifyWarning('재처리할 항목을 선택하세요.');
        return;
    }

    const selectedIds = Array.from(state.monitor.selectedIds);
    const selectedItems = state.monitor.items.filter(i => selectedIds.includes(i.id));
    const accounts = selectedItems.map(i => ({ id: i.id, email: i.email }));

    const type = state.monitor.type;
    const title = state.monitor.title;

    // 모니터 닫기
    closeMonitor();

    // 타입에 따라 재처리
    if (type === 'extract') {
        try {
            const response = await api('/extract/bulk', {
                method: 'POST',
                body: { ids: selectedIds }
            });
            if (response.message) {
                await openMonitor('extract', `${title} (재처리)`, accounts);
            }
        } catch (error) {
            notifyError('재처리 시작 실패: ' + error.message);
        }
    } else if (type === 'issue') {
        state.selectedIds = new Set(selectedIds);
        state.modal = 'issue-coupon';
        render();
    }
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
