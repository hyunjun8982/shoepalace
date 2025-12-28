/**
 * 아디다스 쿠폰 관리자 - 유틸리티 모듈
 */

// ========== 시간 포맷팅 ==========

function formatElapsedTime(startTime) {
    if (!startTime) return '-';
    const elapsed = Math.floor((new Date() - new Date(startTime)) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
}

function formatDuration(startTime, endTime) {
    if (!startTime || !endTime) return '-';
    const duration = Math.floor((new Date(endTime) - new Date(startTime)) / 1000);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
}

// ========== 데이터 파싱 ==========

function parseVouchers(vouchersJson) {
    if (!vouchersJson) return [];
    try {
        const vouchers = JSON.parse(vouchersJson);
        // API 필드명을 앱 내부 필드명으로 매핑
        return vouchers.map(v => ({
            code: v.code || '',
            description: v.name || v.description || '',  // name -> description 매핑
            expiry: v.expiryDate || v.expiry || '',      // expiryDate -> expiry 매핑
            value: v.value || '',
            sold: v.sold || false,
            soldTo: v.soldTo || ''
        }));
    } catch { return []; }
}

// ========== HTML 이스케이프 ==========

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== 토스트 알림 시스템 ==========

function getToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function notify(message, type = 'info', duration = 3000) {
    const container = getToastContainer();

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // 자동 제거
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

function notifySuccess(message, duration = 3000) {
    return notify(message, 'success', duration);
}

function notifyError(message, duration = 4000) {
    return notify(message, 'error', duration);
}

function notifyWarning(message, duration = 3500) {
    return notify(message, 'warning', duration);
}

function notifyInfo(message, duration = 3000) {
    return notify(message, 'info', duration);
}

// 기존 showToast 호환성 유지
function showToast(message) {
    notify(message, 'info', 2000);
}

// ========== 확인 모달 ==========

function showConfirm(options) {
    return new Promise((resolve) => {
        const {
            title = '확인',
            message = '진행하시겠습니까?',
            confirmText = '확인',
            cancelText = '취소',
            type = 'warning',
            isDanger = false
        } = options;

        const icons = {
            warning: '⚠',
            danger: '⚠',
            info: 'ℹ'
        };

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-modal">
                <div class="confirm-header">
                    <div class="confirm-icon ${type}">${icons[type] || icons.warning}</div>
                    <div class="confirm-title">${title}</div>
                </div>
                <div class="confirm-body">${message}</div>
                <div class="confirm-footer">
                    <button class="confirm-btn cancel">${cancelText}</button>
                    <button class="confirm-btn ${isDanger ? 'danger' : 'confirm'}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const cancelBtn = overlay.querySelector('.confirm-btn.cancel');
        const confirmBtn = overlay.querySelector('.confirm-btn.confirm, .confirm-btn.danger');

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                resolve(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        confirmBtn.focus();
    });
}
