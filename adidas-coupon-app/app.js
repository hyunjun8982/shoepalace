/**
 * 아디다스 쿠폰 관리자 - 프론트엔드 앱
 */

const API_BASE = 'http://localhost:8003/api';

// 개발 모드 플래그 (배포 시 false로 변경)
const DEV_MODE = false;

// 앱 버전
const APP_VERSION = '1.1.0';

// 바코드 로컬 생성 유틸리티
function generateBarcodeDataURL(code, opts = {}) {
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, code, {
            format: 'CODE128',
            width: opts.width || 2,
            height: opts.height || 60,
            displayValue: false,
            margin: opts.margin || 4,
        });
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error('바코드 생성 실패:', code, e);
        return null;
    }
}

function generateBarcodeBlob(code, opts = {}) {
    return new Promise((resolve, reject) => {
        try {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, code, {
                format: 'CODE128',
                width: opts.width || 2,
                height: opts.height || 80,
                displayValue: true,
                margin: opts.margin || 10,
                fontSize: 14,
            });
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('blob 생성 실패')), 'image/png');
        } catch (e) {
            reject(e);
        }
    });
}

function refreshBarcode(el, code) {
    const dataURL = generateBarcodeDataURL(code);
    if (dataURL) {
        el.src = dataURL;
        el.style.display = '';
    }
}

// 상태 관리
const state = {
    accounts: [],
    selectedIds: new Set(),
    searchText: '',
    currentPage: 1,
    pageSize: 20,
    loading: false,
    modal: null,
    editingAccount: null,
    extractMode: 'mobile', // 'web' 또는 'mobile' - 정보조회와 쿠폰발급 모두 이 모드 사용 (기본값: mobile)
    // 필터링
    filterPanelOpen: false, // 필터 패널 열림 상태
    filters: {
        minPoints: '',
        maxPoints: '',
        birthdayMonths: [], // [1, 2, 3, ...]
        couponTypes: [], // ['naver', 'starbucks', 'tier', ...]
        hasCoupon: null, // true, false, null(전체)
        status: true, // true(활성), false(비활성), null(전체) - 기본값: 활성화만
        fetchStatus: null, // 'completed', 'pending', 'error', 'password_wrong', null(전체)
        issueStatus: null, // 'success', 'error', 'warning', 'pending', null(전체)
        expiringCoupon: false, // 만료 예정 쿠폰 보유 계정만
        has100kCoupon: false, // 10만원 쿠폰 보유 계정만
        has100kCoupon2Plus: false, // 10만원 쿠폰 2장 이상 보유 계정만
        no100kCoupon: false, // 10만원 쿠폰 없는 계정만
        coupon100kCount: null, // 10만원권 수량 필터 (1, 2, 3, null=전체)
        coupon50kCount: null, // 5만원권 수량 필터 (1, 2, 3, null=전체)
        coupon100kExpiryBefore: '', // 10만원 쿠폰 만료일이 이 날짜 이전인 건 (YYYY-MM-DD)
        coupon100kExpiryAfter: '', // 10만원 쿠폰 만료일이 이 날짜 이후인 건 (YYYY-MM-DD)
        fetchBefore: '', // 조회 완료일이 이 날짜 이전인 건 (YYYY-MM-DD)
        fetchAfter: '', // 조회 완료일이 이 날짜 이후인 건 (YYYY-MM-DD)
        issueBefore: '', // 발급 완료일이 이 날짜 이전인 건 (YYYY-MM-DD)
        emailType: null, // null(전체), 'official'(공식 이메일), 'catchall'(캐치올)
    },
    // 정렬
    sort: {
        column: null, // 'email', 'name', 'points', 'birthday', ...
        direction: 'asc', // 'asc' or 'desc'
    },
    // 로그 관련
    logLines: [],
    logPaused: false,
    logWs: null,
    // 모니터링 팝업
    monitor: {
        active: false,
        type: null, // 'extract' 또는 'issue'
        title: '',
        items: [], // { id, email, status: 'waiting'|'processing'|'success'|'error', message, startTime, endTime }
        startTime: null,
        pollInterval: null,
    },
    // 전체 활성 계정 쿠폰 발급 모드
    bulkIssueAllActive: false,
    // 발급할 쿠폰 타입 선택 순서 (배열: 선택 순서대로 발급)
    selectedIssueCouponTypes: [],
    // 모바일 연결 상태 (에뮬레이터 + ADB + Appium)
    mobileConnected: false,
    mobileConnecting: false,
    mobileDeviceType: null,  // 'real_phone' 또는 'emulator'
    mobileUdid: null,
    // 설치 패널 표시 여부
    showInstallPanel: false,
    // 배치 작업 상태 (백그라운드 진행 표시용)
    batchStatus: {
        active: false,
        type: null,
        title: '',
        startTime: null,
        accountCount: 0,
    },
    // 구글시트 연동 설정
    gsheetsConfig: null,
};

// ========== API 호출 ==========

async function api(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '요청 실패');
    }

    return response.json();
}

// ========== 배치 작업 상태 관리 ==========

// 배치 상태 확인
async function checkBatchStatus() {
    try {
        const status = await api('/batch/status');
        state.batchStatus = status;
        return status;
    } catch (error) {
        console.error('배치 상태 확인 실패:', error);
        return { active: false };
    }
}

// 배치 작업 중지
async function abortBatchProcess() {
    // 서버에서 최신 배치 상태 확인
    const serverStatus = await checkBatchStatus();

    // 서버 배치 활성화 또는 모니터 hidden 상태 중 하나라도 있으면 진행
    if (!serverStatus.active && !state.monitor.hidden) {
        notifyWarning('실행 중인 작업이 없습니다.');
        return;
    }

    if (!confirm('정말 진행 중인 작업을 중지하시겠습니까?\n현재 처리 중인 계정은 완료될 수 있으며, 대기 중인 계정은 건너뜁니다.')) {
        return;
    }

    try {
        const result = await api('/batch/abort', { method: 'POST' });
        if (result.success) {
            notifySuccess(result.message);
            // 모니터 상태도 정리
            if (state.monitor.hidden) {
                state.monitor.hidden = false;
                state.monitor.active = false;
                if (state.monitor.pollInterval) {
                    clearInterval(state.monitor.pollInterval);
                    state.monitor.pollInterval = null;
                }
            }
        } else {
            notifyError(result.message);
        }
        await checkBatchStatus();
        loadAccounts();
        render();
    } catch (error) {
        notifyError('작업 중지 실패: ' + error.message);
    }
}


// 배치 상태 폴링 시작 (백그라운드 진행 바 업데이트용)
let batchStatusPollInterval = null;

function startBatchStatusPolling() {
    if (batchStatusPollInterval) {
        clearInterval(batchStatusPollInterval);
    }
    batchStatusPollInterval = setInterval(async () => {
        const status = await checkBatchStatus();
        if (!status.active && !state.monitor.hidden && batchStatusPollInterval) {
            clearInterval(batchStatusPollInterval);
            batchStatusPollInterval = null;
            await loadAccounts();  // 완료 시 최신 데이터 로드 후 렌더링
            return;
        }
        // 상단 바만 업데이트 (전체 render() 호출 안함)
        updateBatchStatusBar();
    }, 2000);
}

// 상단 바만 업데이트 (전체 렌더링 없이)
function updateBatchStatusBar() {
    const existingBar = document.querySelector('.batch-status-bar');
    if (!existingBar && (state.batchStatus.active || state.monitor.hidden)) {
        // 바가 없는데 필요하면 전체 렌더링
        render();
        return;
    }
    if (existingBar && !state.batchStatus.active && !state.monitor.hidden) {
        // 바가 있는데 필요없으면 전체 렌더링
        render();
        return;
    }
    if (!existingBar) return;

    // 상단 바 내용만 업데이트
    const stats = getMonitorStats();
    const total = stats.total;
    const completed = stats.completed;
    const processing = stats.processing;
    const currentIndex = completed + processing;
    const statusParts = [];
    if (stats.success > 0) statusParts.push(`성공 ${stats.success}`);
    if (stats.warning > 0) statusParts.push(`경고 ${stats.warning}`);
    if (stats.error > 0) statusParts.push(`실패 ${stats.error}`);
    if (stats.passwordWrong > 0) statusParts.push(`비번오류 ${stats.passwordWrong}`);
    const statusSummary = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';

    const detailEl = existingBar.querySelector('.batch-status-detail');
    if (detailEl) {
        detailEl.textContent = `${currentIndex}번째 / 총 ${total}개 처리 중${statusSummary}`;
    }

    const timeEl = existingBar.querySelector('.batch-status-time');
    if (timeEl) {
        timeEl.textContent = formatElapsedTime(state.batchStatus.active ? state.batchStatus.startTime : state.monitor.startTime);
    }
}

// ========== 쿠폰 유틸리티 함수 ==========

// 만료일 체크
function isExpired(expiryStr) {
    if (!expiryStr || expiryStr === 'N/A') return false;
    try {
        const expiry = new Date(expiryStr);
        return expiry < new Date();
    } catch {
        return false;
    }
}

// 만료일 문자열을 Date 객체로 파싱
function parseExpiryDate(expiryStr) {
    if (!expiryStr || expiryStr === 'N/A') return null;
    try {
        const date = new Date(expiryStr);
        if (isNaN(date.getTime())) return null;
        return date;
    } catch {
        return null;
    }
}

// 일주일 내 만료 체크
function isExpiringWithinWeek(expiryStr) {
    if (!expiryStr || expiryStr === 'N/A') return false;
    try {
        const expiry = new Date(expiryStr);
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return expiry >= now && expiry <= weekLater;
    } catch {
        return false;
    }
}

// 조회 상태에서 날짜 파싱 (예: "[웹] 조회 완료 12/28 14:30" 또는 "[모바일] 완료 2024-12-28")
function parseDateFromStatus(webStatus, mobileStatus) {
    const parseStatusDate = (status) => {
        if (!status) return null;

        // 패턴0: [YY-MM-DD HH:MM] (예: [25-01-06 14:30]) - 현재 사용중인 형식
        const pattern0 = /\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/;
        let match = status.match(pattern0);
        if (match) {
            const year = 2000 + parseInt(match[1]); // 25 -> 2025
            const month = parseInt(match[2]) - 1; // 0-indexed
            const day = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);
            return new Date(year, month, day, hour, minute);
        }

        // 상태에서 날짜/시간 패턴만 추출 (완료 여부와 무관하게)
        // 패턴1: MM/DD HH:mm (예: 12/28 14:30) - 올해로 가정
        const pattern1 = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/;
        match = status.match(pattern1);
        if (match) {
            const now = new Date();
            const month = parseInt(match[1]) - 1; // 0-indexed
            const day = parseInt(match[2]);
            const hour = parseInt(match[3]);
            const minute = parseInt(match[4]);
            return new Date(now.getFullYear(), month, day, hour, minute);
        }

        // 패턴2: YYYY-MM-DD HH:mm:ss 또는 YYYY-MM-DD (예: 2024-12-28 14:30:00)
        const pattern2 = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/;
        match = status.match(pattern2);
        if (match) {
            const hour = match[4] ? parseInt(match[4]) : 0;
            const minute = match[5] ? parseInt(match[5]) : 0;
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), hour, minute);
        }

        // 패턴3: YYYY/MM/DD (예: 2024/12/28)
        const pattern3 = /(\d{4})\/(\d{2})\/(\d{2})/;
        match = status.match(pattern3);
        if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }

        return null;
    };

    // 웹과 모바일 중 더 최근 날짜 반환 (둘 중 하나라도 있으면)
    const webDate = parseStatusDate(webStatus);
    const mobileDate = parseStatusDate(mobileStatus);

    if (webDate && mobileDate) {
        return webDate > mobileDate ? webDate : mobileDate;
    }
    return webDate || mobileDate;
}

// 발급 상태에서 날짜 파싱 (예: "발급 완료 12/28 14:30")
function parseDateFromIssueStatus(status) {
    if (!status || (!status.includes('완료') && !status.includes('성공'))) return null;

    // 패턴1: MM/DD HH:mm (예: 12/28 14:30)
    const pattern1 = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/;
    let match = status.match(pattern1);
    if (match) {
        const now = new Date();
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        const hour = parseInt(match[3]);
        const minute = parseInt(match[4]);
        return new Date(now.getFullYear(), month, day, hour, minute);
    }

    // 패턴2: YYYY-MM-DD
    const pattern2 = /(\d{4})-(\d{2})-(\d{2})/;
    match = status.match(pattern2);
    if (match) {
        return new Date(match[1], parseInt(match[2]) - 1, parseInt(match[3]));
    }

    // 패턴3: YYYY/MM/DD
    const pattern3 = /(\d{4})\/(\d{2})\/(\d{2})/;
    match = status.match(pattern3);
    if (match) {
        return new Date(match[1], parseInt(match[2]) - 1, parseInt(match[3]));
    }

    return null;
}

// 쿠폰 표시 정보 가져오기 - 모든 쿠폰 짙은 녹색(#00704a)
function getCouponDisplayInfo(description) {
    const GREEN = '#00704a';  // 짙은 녹색 (스타벅스 색상)

    if (!description) return { name: '기타', shortName: '기타', color: GREEN, icon: '🎫', sortValue: 0 };

    const desc = description.toLowerCase();

    // === 잘못 파싱된 할인권 보정 (1원~4원, 20원 상품권 → 5%~20% 할인권) ===
    // API value가 1,2,3,4,20인 할인권이 "1원 상품권" 등으로 잘못 저장된 경우 보정
    if (desc === '1원 상품권' || desc.match(/^1원\s*상품권$/)) {
        return { name: '5% 할인', shortName: '5% 할인', color: GREEN, icon: '🏷️', sortValue: 5000 };
    } else if (desc === '2원 상품권' || desc.match(/^2원\s*상품권$/)) {
        return { name: '10% 할인', shortName: '10% 할인', color: GREEN, icon: '🏷️', sortValue: 10000 };
    } else if (desc === '3원 상품권' || desc.match(/^3원\s*상품권$/)) {
        return { name: '15% 할인', shortName: '15% 할인', color: GREEN, icon: '🏷️', sortValue: 15000 };
    } else if (desc === '4원 상품권' || desc.match(/^4원\s*상품권$/) || desc === '20원 상품권' || desc.match(/^20원\s*상품권$/)) {
        return { name: '20% 할인', shortName: '20% 할인', color: GREEN, icon: '🏷️', sortValue: 20000 };
    }

    // 금액 쿠폰 (100,000원, 100K, _100K 형태) - sortValue가 높을수록 상위 (금액 기준)
    // _3K, _5K 등 언더스코어+숫자K 형태도 지원 (예: KR_Raffle Reimburse_3K)
    if (desc.includes('100,000') || desc.includes('100000') || desc.includes('10만') || desc.includes('100k') || desc.includes('_100k')) {
        return { name: '100000원 상품권', shortName: '100000원 상품권', color: GREEN, icon: '💰', sortValue: 100000 };
    } else if (desc.includes('50,000') || desc.includes('50000') || desc.includes('5만') || desc.includes('50k') || desc.includes('_50k')) {
        return { name: '50000원 상품권', shortName: '50000원 상품권', color: GREEN, icon: '💵', sortValue: 50000 };
    } else if (desc.includes('30,000') || desc.includes('30000') || desc.includes('3만') || desc.includes('30k') || desc.includes('_30k')) {
        return { name: '30000원 상품권', shortName: '30000원 상품권', color: GREEN, icon: '💵', sortValue: 30000 };
    } else if (desc.includes('20,000') || desc.includes('20000') || desc.includes('2만') || desc.includes('20k') || desc.includes('_20k')) {
        return { name: '20000원 상품권', shortName: '20000원 상품권', color: GREEN, icon: '💵', sortValue: 20000 };
    } else if (desc.includes('10,000') || desc.includes('10000') || desc.includes('1만') || desc.includes('10k') || desc.includes('_10k')) {
        return { name: '10000원 상품권', shortName: '10000원 상품권', color: GREEN, icon: '💵', sortValue: 10000 };
    } else if (desc.includes('5,000') || desc.includes('5000') || desc.match(/_5k\b/) || desc.match(/\b5k\b/)) {
        return { name: '5000원 상품권', shortName: '5000원 상품권', color: GREEN, icon: '💵', sortValue: 5000 };
    } else if (desc.includes('3,000') || desc.includes('3000') || desc.includes('_3k') || desc.match(/\b3k\b/)) {
        return { name: '3000원 상품권', shortName: '3000원 상품권', color: GREEN, icon: '💵', sortValue: 3000 };
    // 퍼센트 할인 쿠폰 - 10PER, 10%, 10퍼 등 다양한 형태 지원
    } else if (desc.includes('30%') || desc.includes('30per')) {
        return { name: '30% 할인', shortName: '30% 할인', color: GREEN, icon: '🏷️', sortValue: 30000 };
    } else if (desc.includes('20%') || desc.includes('20per')) {
        return { name: '20% 할인', shortName: '20% 할인', color: GREEN, icon: '🏷️', sortValue: 20000 };
    } else if (desc.includes('15%') || desc.includes('15per')) {
        return { name: '15% 할인', shortName: '15% 할인', color: GREEN, icon: '🏷️', sortValue: 15000 };
    } else if (desc.includes('10%') || desc.includes('10per')) {
        return { name: '10% 할인', shortName: '10% 할인', color: GREEN, icon: '🏷️', sortValue: 10000 };
    } else if (desc.includes('5%') || desc.includes('5per')) {
        return { name: '5% 할인', shortName: '5% 할인', color: GREEN, icon: '🏷️', sortValue: 5000 };
    // 파트너 쿠폰
    } else if (desc.includes('네이버') || desc.includes('naver')) {
        return { name: '네이버 멤버쉽', shortName: '네이버 멤버쉽', color: GREEN, icon: '🎁', sortValue: 1000 };
    } else if (desc.includes('스타벅스') || desc.includes('starbucks')) {
        return { name: '스타벅스', shortName: '스타벅스', color: GREEN, icon: '☕', sortValue: 1000 };
    } else if (desc.includes('tier') || desc.includes('티어')) {
        return { name: '티어쿠폰', shortName: '티어쿠폰', color: GREEN, icon: '⭐', sortValue: 500 };
    // 판매완료 (100,000원 판매완료 할인 형태)
    } else if (desc.includes('판매완료')) {
        return { name: '판매완료', shortName: '판매완료', color: GREEN, icon: '✅', sortValue: 0 };
    }

    // 알 수 없는 쿠폰 - 영어 쿠폰명 활용 (KR_ 접두사 제거, 언더스코어를 공백으로)
    let displayName = description;
    // KR_ 접두사 제거
    if (displayName.startsWith('KR_')) {
        displayName = displayName.substring(3);
    }
    // 언더스코어를 공백으로 변환
    displayName = displayName.replace(/_/g, ' ').trim();
    // 너무 길면 축약
    if (displayName.length > 20) {
        displayName = displayName.substring(0, 18) + '...';
    }

    return { name: displayName, shortName: displayName, color: GREEN, icon: '🎫', sortValue: 0 };
}

// 쿠폰 정렬: 판매안됨+유효>판매안됨+만료>판매됨, 같은 그룹 내에서는 가치 높은 순
function sortVouchers(vouchers) {
    return [...vouchers].sort((a, b) => {
        // 1. 판매 여부 (미판매 우선)
        if (a.sold !== b.sold) return a.sold ? 1 : -1;
        // 2. 만료 여부 (미만료 우선)
        const aExpired = isExpired(a.expiry);
        const bExpired = isExpired(b.expiry);
        if (aExpired !== bExpired) return aExpired ? 1 : -1;
        // 3. sortValue 기준 (금액/% 할인 등 통합 정렬)
        const aInfo = getCouponDisplayInfo(a.description);
        const bInfo = getCouponDisplayInfo(b.description);
        return bInfo.sortValue - aInfo.sortValue;
    });
}

function renderCouponCards(acc, vouchers) {
    // 원본 인덱스를 포함하여 정렬
    const vouchersWithIndex = vouchers.map((v, idx) => ({ ...v, _originalIndex: idx }));
    const sortedVouchers = sortVouchers(vouchersWithIndex);
    const hasMultiple = sortedVouchers.length > 1;
    const firstVoucher = sortedVouchers[0];
    const restVouchers = sortedVouchers.slice(1);

    // 단일 쿠폰 카드 렌더링 - 새 디자인
    const renderSingleCard = (v) => {
        const couponInfo = getCouponDisplayInfo(v.description);
        const expiryText = v.expiry && v.expiry !== 'N/A' ? v.expiry.slice(5).replace('-', '/') : '';
        const couponCode = v.code || '';
        const isExpiringSoon = isExpiringWithinWeek(v.expiry);
        const isCouponExpired = isExpired(v.expiry);
        let cardClass = 'coupon-card';
        if (v.sold) {
            cardClass += ' sold';
        } else if (isCouponExpired) {
            cardClass += ' expired';
        } else if (isExpiringSoon) {
            cardClass += ' expiring-soon';
        }
        const originalIndex = v._originalIndex;
        const voucherJson = JSON.stringify(v).replace(/"/g, '&quot;');

        return '<div class="' + cardClass + '" ' +
            'onclick="showVoucherModal(\'' + acc.id + '\', ' + originalIndex + ', ' + voucherJson + ')" ' +
            'title="' + v.description + '&#10;코드: ' + (v.code || 'N/A') + '&#10;만료: ' + (v.expiry || 'N/A') + '">' +
            '<div class="coupon-card-left">' +
                '<div class="coupon-card-top">' +
                    '<img src="adidas_2.png" alt="adidas" class="coupon-card-logo">' +
                    '<div class="coupon-card-amount">' + (couponInfo.shortName || couponInfo.name) + '</div>' +
                '</div>' +
                (couponCode ? '<div class="coupon-card-code" onclick="event.stopPropagation(); copyCouponCode(\'' + couponCode + '\')">' + couponCode + '<span class="copy-icon">📋</span></div>' : '') +
            '</div>' +
            '<div class="coupon-card-right">' +
                (expiryText ? '<div class="coupon-card-expiry">' + expiryText + '</div>' : '<div class="coupon-card-expiry">-</div>') +
            '</div>' +
        '</div>';
    };

    if (hasMultiple) {
        // 둥근 사각형 버튼을 쿠폰 오른쪽에 배치 (개수 + 화살표)
        let html = '<div class="coupon-wrapper">' +
            '<div class="coupon-main">' + renderSingleCard(firstVoucher) + '</div>' +
            '<div class="coupon-expand-container" data-acc-id="' + acc.id + '" onclick="event.stopPropagation(); toggleCoupons(\'' + acc.id + '\')">' +
                '<span class="expand-count">' + sortedVouchers.length + '개</span>' +
                '<span class="expand-arrow">▼</span>' +
            '</div>' +
            '<div class="coupon-hidden-list" data-acc-id="' + acc.id + '">';

        restVouchers.forEach(v => {
            html += renderSingleCard(v);
        });

        html += '</div></div>';
        return html;
    } else {
        return renderSingleCard(firstVoucher);
    }
}

// ========== 조회 현황 렌더링 ==========

// 웹/모바일 조회 현황을 모두 표시
// 상태 문자열에서 날짜/시간과 상태 추출
function parseStatus(status) {
    if (!status) return { text: '-', datetime: '', statusType: 'none' };

    // 날짜+시간 형식으로 변환
    let datetime = '';

    // [YY-MM-DD HH:MM] 형식 파싱 (예: [25-01-01 14:30])
    const fullMatch = status.match(/\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/);
    if (fullMatch) {
        const month = fullMatch[2];
        const day = fullMatch[3];
        const hour = fullMatch[4];
        const minute = fullMatch[5];
        datetime = `${parseInt(month)}/${parseInt(day)} ${hour}:${minute}`;
    } else {
        // MM/DD HH:MM 형식 파싱 (예: 12/28 14:30)
        const shortMatch = status.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (shortMatch) {
            const month = shortMatch[1];
            const day = shortMatch[2];
            const hour = shortMatch[3].padStart(2, '0');
            const minute = shortMatch[4];
            datetime = `${month}/${day} ${hour}:${minute}`;
        }
    }

    // 상태 타입 결정
    let statusType = 'none';
    let shortText = '';

    // 다중 쿠폰 발급 상태 감지 (예: "10만원권 1달 미경과, 5만원권 발급 완료")
    const isMultiCouponStatus = (status.includes('만원권') || status.includes('원권')) && status.includes(',');

    if (status.includes('중...')) {
        statusType = 'processing';
        shortText = '진행중';
    } else if (isMultiCouponStatus) {
        // 다중 쿠폰 상태: 상세 내용 표시
        // 오류 조건 체크 (methodnotallowed, 실패 포함)
        const hasError = status.includes('실패') || status.toLowerCase().includes('methodnotallowed') || status.toLowerCase().includes('method');
        const hasSuccess = status.includes('발급 완료');
        const hasWarning = status.includes('1달 미경과') || status.includes('포인트 부족');

        // 상태 결정: 오류 있으면 error 우선 (partial failure 표시)
        if (hasError) {
            statusType = hasSuccess ? 'warning' : 'error';  // 성공+실패 혼합이면 warning, 전부 실패면 error
        } else if (hasWarning) {
            statusType = hasSuccess ? 'success' : 'warning';  // 성공+warning 혼합이면 success
        } else if (hasSuccess) {
            statusType = 'success';
        } else {
            statusType = 'error';
        }
        // [모바일]/[웹브라우저]/[웹브라우저(시크릿)] 태그 제거하고 상세 내용만 추출
        shortText = status.replace(/\[(모바일|웹브라우저\(시크릿\)|웹브라우저|웹\(시크릿\)|웹)\]\s*/g, '').replace(/\[\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}\]/, '').trim();
    } else if (status.includes('완료')) {
        statusType = 'success';
        shortText = '완료';
    } else if (status.includes('비밀번호 틀림') || status.includes('비밀번호')) {
        statusType = 'password_wrong';  // 비밀번호 오류는 별도 상태 (주황색)
        shortText = '비번오류';
    } else if (status.includes('차단') || status.includes('BOT') || status.includes('API_BLOCKED')) {
        statusType = 'error';
        shortText = '차단';
    } else if (status.includes('포인트 부족')) {
        statusType = 'warning';
        shortText = 'P부족';
    } else if (status.includes('버튼 없음')) {
        statusType = 'warning';
        shortText = '버튼없음';
    } else if (status.includes('1달 미경과') || status.includes('미경과')) {
        statusType = 'warning';
        shortText = '1달미경과';
    } else if (status.includes('실패') || status.includes('오류') || status.includes('에러') || status.toLowerCase().includes('methodnotallowed')) {
        statusType = 'error';
        shortText = status.toLowerCase().includes('methodnotallowed') ? 'API오류' : '오류';
    } else if (status.includes('대기')) {
        statusType = 'waiting';
        shortText = '대기';
    } else {
        shortText = '-';
    }

    return { text: shortText, datetime, statusType };
}

// 상태 렌더링 (웹/모바일 모두 표시)
function renderStatusTable(webFetchStatus, mobileFetchStatus, webIssueStatus, mobileIssueStatus) {
    const webFetchParsed = parseStatus(webFetchStatus);
    const mobileFetchParsed = parseStatus(mobileFetchStatus);
    const webIssueParsed = parseStatus(webIssueStatus);
    const mobileIssueParsed = parseStatus(mobileIssueStatus);

    // 모든 상태가 없으면 간단히 표시
    const allNone = webFetchParsed.statusType === 'none' && mobileFetchParsed.statusType === 'none' &&
                    webIssueParsed.statusType === 'none' && mobileIssueParsed.statusType === 'none';
    if (allNone) {
        return '<span style="color:#999;font-size:11px;">-</span>';
    }

    const getStatusClass = (statusType) => {
        switch (statusType) {
            case 'success': return 'cell-success';
            case 'error': return 'cell-error';
            case 'warning': return 'cell-warning';
            case 'password_wrong': return 'cell-password-wrong';
            case 'processing': return 'cell-processing';
            case 'waiting': return 'cell-waiting';
            default: return 'cell-none';
        }
    };

    // 다중 쿠폰 상태인지 확인하고 줄바꿈 처리
    const renderIssueContent = (parsed, originalStatus) => {
        if (parsed.statusType === 'none') return '-';

        // 다중 쿠폰 상태 감지 (쉼표로 구분된 경우)
        const isMultiCoupon = originalStatus && (originalStatus.includes('만원권') || originalStatus.includes('원권')) && originalStatus.includes(',');

        if (isMultiCoupon) {
            // [모바일]/[웹브라우저]/[웹브라우저(시크릿)] 태그와 타임스탬프 제거 후 쉼표로 분리
            let cleanStatus = originalStatus.replace(/\[(모바일|웹브라우저\(시크릿\)|웹브라우저|웹\(시크릿\)|웹)\]\s*/g, '').replace(/\[\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}\]/, '').trim();
            const parts = cleanStatus.split(',').map(s => s.trim());

            // 각 쿠폰 상태별 클래스 지정
            const getPartClass = (part) => {
                if (part.includes('발급 완료')) return 'cell-success';
                if (part.includes('1달 미경과') || part.includes('포인트 부족')) return 'cell-warning';
                if (part.includes('실패') || part.includes('오류') || part.toLowerCase().includes('methodnotallowed') || part.toLowerCase().includes('method')) return 'cell-error';
                return '';
            };

            return parts.map(part => `<div class="coupon-status-line ${getPartClass(part)}">${part}</div>`).join('');
        }

        return parsed.text;
    };

    // 웹/모바일 개별 상태 라인 렌더링
    const renderStatusLine = (label, parsed, originalStatus, isIssue) => {
        if (parsed.statusType === 'none') return '';
        const cls = getStatusClass(parsed.statusType);
        const content = isIssue ? renderIssueContent(parsed, originalStatus) : parsed.text;
        const time = parsed.datetime ? `<span class="cell-time">(${parsed.datetime})</span>` : '';
        return `<div class="status-line ${cls}"><span class="mode-label">${label}</span>${isIssue ? `<span class="cell-content">${content}</span>` : `<span class="cell-text">${content}</span>`}${time}</div>`;
    };

    // 정보조회 상태 (웹+모바일)
    const hasFetch = webFetchParsed.statusType !== 'none' || mobileFetchParsed.statusType !== 'none';
    const bothFetch = webFetchParsed.statusType !== 'none' && mobileFetchParsed.statusType !== 'none';
    let fetchHtml = '';
    if (hasFetch) {
        if (bothFetch) {
            fetchHtml = renderStatusLine('웹', webFetchParsed, webFetchStatus, false) + renderStatusLine('모바일', mobileFetchParsed, mobileFetchStatus, false);
        } else {
            const fp = webFetchParsed.statusType !== 'none' ? webFetchParsed : mobileFetchParsed;
            const fs = webFetchParsed.statusType !== 'none' ? webFetchStatus : mobileFetchStatus;
            const cls = getStatusClass(fp.statusType);
            fetchHtml = `<span class="cell-text ${cls}">${fp.text}</span>${fp.datetime ? `<span class="cell-time">(${fp.datetime})</span>` : ''}`;
        }
    } else {
        fetchHtml = '-';
    }

    // 쿠폰발급 상태 (웹+모바일)
    const hasIssue = webIssueParsed.statusType !== 'none' || mobileIssueParsed.statusType !== 'none';
    const bothIssue = webIssueParsed.statusType !== 'none' && mobileIssueParsed.statusType !== 'none';
    let issueHtml = '';
    if (hasIssue) {
        if (bothIssue) {
            issueHtml = renderStatusLine('웹', webIssueParsed, webIssueStatus, true) + renderStatusLine('모바일', mobileIssueParsed, mobileIssueStatus, true);
        } else {
            const ip = webIssueParsed.statusType !== 'none' ? webIssueParsed : mobileIssueParsed;
            const is = webIssueParsed.statusType !== 'none' ? webIssueStatus : mobileIssueStatus;
            const cls = getStatusClass(ip.statusType);
            const content = renderIssueContent(ip, is);
            issueHtml = `<div class="cell-content ${cls}">${content}</div>${ip.datetime ? `<span class="cell-time">(${ip.datetime})</span>` : ''}`;
        }
    } else {
        issueHtml = '-';
    }

    // 대표 상태 클래스 결정 (셀 배경색용 - 양쪽 다 있으면 중립)
    const fetchClass = bothFetch ? '' : getStatusClass((webFetchParsed.statusType !== 'none' ? webFetchParsed : mobileFetchParsed).statusType);
    const issueClass = bothIssue ? '' : getStatusClass((webIssueParsed.statusType !== 'none' ? webIssueParsed : mobileIssueParsed).statusType);

    return `
        <table class="status-table-simple">
            <tbody>
                <tr>
                    <td class="row-label">정보조회</td>
                    <td class="status-cell ${fetchClass}">
                        ${fetchHtml}
                    </td>
                </tr>
                <tr>
                    <td class="row-label">쿠폰발급</td>
                    <td class="status-cell ${issueClass}">
                        ${issueHtml}
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

// 기존 함수 (호환성 유지)
function renderFetchStatusMulti(webStatus, mobileStatus) {
    const lines = [];

    if (webStatus) {
        const statusClass = getStatusClass(webStatus);
        lines.push(`<div class="status-line ${statusClass}">${webStatus}</div>`);
    }

    if (mobileStatus) {
        const statusClass = getStatusClass(mobileStatus);
        lines.push(`<div class="status-line ${statusClass}">${mobileStatus}</div>`);
    }

    if (lines.length === 0) {
        return '<span style="color:#999;">-</span>';
    }

    return lines.join('');
}

// 상태에 따른 CSS 클래스 반환
function getStatusClass(status) {
    if (!status) return '';
    if (status.includes('완료')) return 'status-success';
    if (status.includes('비밀번호 틀림')) return 'status-password-wrong';  // 비밀번호 오류 (주황색)
    if (status.includes('차단 의심')) return 'status-error';
    if (status.includes('실패') || status.includes('오류') || status.toLowerCase().includes('methodnotallowed')) return 'status-error';
    if (status.includes('중...')) return 'status-processing';
    return '';
}

// 쿠폰 발급 현황 렌더링
function renderIssueStatus(status) {
    if (!status) return '';
    const statusClass = getIssueStatusClass(status);
    return `<div class="status-line ${statusClass}">${status}</div>`;
}

// 쿠폰 발급 상태에 따른 CSS 클래스 반환
function getIssueStatusClass(status) {
    if (!status) return '';
    if (status.includes('발급 완료')) return 'status-success';
    if (status.includes('포인트 부족') || status.includes('버튼 없음')) return 'status-warning';
    if (status.includes('비밀번호') || status.includes('차단') || status.includes('오류') || status.includes('실패')) return 'status-error';
    if (status.includes('중...')) return 'status-processing';
    return '';
}

async function loadAccounts() {
    state.loading = true;
    render();

    try {
        state.accounts = await api('/accounts');
    } catch (error) {
        notifyError('계정 목록 로드 실패: ' + error.message);
    }

    state.loading = false;
    render();
}

async function saveAccount(data) {
    try {
        if (state.editingAccount) {
            await api(`/accounts/${state.editingAccount.id}`, { method: 'PUT', body: data });
            notifySuccess('계정이 수정되었습니다');
        } else {
            await api('/accounts', { method: 'POST', body: data });
            notifySuccess('계정이 추가되었습니다');
        }
        closeModal();
        loadAccounts();
    } catch (error) {
        notifyError('저장 실패: ' + error.message);
    }
}

async function deleteAccount(id) {
    const confirmed = await showConfirm({
        title: '계정 삭제',
        message: '정말 이 계정을 삭제하시겠습니까?',
        confirmText: '삭제',
        type: 'danger',
        isDanger: true
    });
    if (!confirmed) return;

    try {
        await api(`/accounts/${id}`, { method: 'DELETE' });
        notifySuccess('계정이 삭제되었습니다');
        loadAccounts();
    } catch (error) {
        notifyError('삭제 실패: ' + error.message);
    }
}

async function bulkDelete() {
    if (state.selectedIds.size === 0) {
        notifyWarning('삭제할 계정을 선택하세요');
        return;
    }

    const confirmed = await showConfirm({
        title: '일괄 삭제',
        message: `선택한 ${state.selectedIds.size}개 계정을 삭제하시겠습니까?`,
        confirmText: '삭제',
        type: 'danger',
        isDanger: true
    });
    if (!confirmed) return;

    try {
        await api('/accounts/bulk-delete', { method: 'POST', body: { ids: Array.from(state.selectedIds) } });
        notifySuccess(`${state.selectedIds.size}개 계정이 삭제되었습니다`);
        state.selectedIds.clear();
        loadAccounts();
    } catch (error) {
        notifyError('삭제 실패: ' + error.message);
    }
}

async function bulkToggleActive(isActive) {
    if (state.selectedIds.size === 0) {
        notifyWarning('계정을 선택하세요');
        return;
    }

    try {
        await api('/accounts/bulk-toggle-active', {
            method: 'POST',
            body: { ids: Array.from(state.selectedIds), is_active: isActive }
        });
        notifySuccess(`${state.selectedIds.size}개 계정이 ${isActive ? '활성화' : '비활성화'}되었습니다`);
        state.selectedIds.clear();
        loadAccounts();
    } catch (error) {
        notifyError('상태 변경 실패: ' + error.message);
    }
}

async function exportSelectedToExcel() {
    if (state.selectedIds.size === 0) {
        notifyWarning('내보낼 계정을 선택하세요');
        return;
    }

    try {
        const XLSX = require('xlsx');
        const fs = require('fs');
        const { ipcRenderer } = require('electron');

        const selectedAccounts = state.accounts.filter(acc => state.selectedIds.has(acc.id));
        const rows = [];

        for (const acc of selectedAccounts) {
            const vouchers = parseVouchers(acc.owned_vouchers);
            const activeCoupons = vouchers.filter(v => !v.sold);

            if (activeCoupons.length === 0) {
                rows.push({
                    '이메일': acc.email || '',
                    '비밀번호': acc.password || '',
                    '쿠폰명': '',
                    '쿠폰코드': '',
                    '만료일': '',
                });
            } else {
                for (const v of activeCoupons) {
                    const couponInfo = getCouponDisplayInfo(v.description);
                    rows.push({
                        '이메일': acc.email || '',
                        '비밀번호': acc.password || '',
                        '쿠폰명': couponInfo.name,
                        '쿠폰코드': v.code || '',
                        '만료일': v.expiry || '',
                    });
                }
            }
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // 열 너비 설정
        ws['!cols'] = [
            { wch: 30 }, // 이메일
            { wch: 20 }, // 비밀번호
            { wch: 20 }, // 쿠폰명
            { wch: 25 }, // 쿠폰코드
            { wch: 12 }, // 만료일
        ];

        XLSX.utils.book_append_sheet(wb, ws, '쿠폰목록');

        const defaultName = `쿠폰목록_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const result = await ipcRenderer.invoke('show-save-dialog', {
            title: '엑셀 파일 저장',
            defaultPath: defaultName,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled || !result.filePath) return;

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        fs.writeFileSync(result.filePath, buf);
        notifySuccess(`${selectedAccounts.length}개 계정의 쿠폰 정보를 저장했습니다`);
    } catch (error) {
        console.error('Excel export error:', error);
        notifyError('엑셀 저장 실패: ' + error.message);
    }
}

// ========== 구글시트 동기화 ==========

async function loadGSheetsConfig() {
    try {
        const resp = await api('/google-sheets/config');
        state.gsheetsConfig = resp;
    } catch (e) {
        state.gsheetsConfig = { configured: false };
    }
}

function showGSheetsConfigModal() {
    state.modal = 'google-sheets-config';
    render();
}

async function selectGSheetsKeyFile() {
    try {
        const { ipcRenderer } = require('electron');
        const result = await ipcRenderer.invoke('show-open-dialog', {
            title: '서비스 계정 JSON 키 파일 선택',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile'],
        });
        if (result && result.filePaths && result.filePaths.length > 0) {
            const fs = require('fs');
            const content = fs.readFileSync(result.filePaths[0], 'utf-8');
            const parsed = JSON.parse(content);
            document.getElementById('gsheetsKeyContent').value = content;
            document.getElementById('gsheetsKeyFileName').textContent = `✅ ${parsed.client_email || result.filePaths[0]}`;
        }
    } catch (e) {
        notifyError('파일 읽기 실패: ' + e.message);
    }
}

function extractSpreadsheetId(input) {
    if (!input) return '';
    // URL 형태: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return input.trim();
}

async function saveGSheetsConfig() {
    try {
        const keyContent = document.getElementById('gsheetsKeyContent').value;
        const rawId = document.getElementById('gsheetsSpreadsheetId').value;
        const sheetName = document.getElementById('gsheetsSheetName').value || 'Sheet1';
        const spreadsheetId = extractSpreadsheetId(rawId);

        if (!spreadsheetId) {
            notifyWarning('스프레드시트 URL 또는 ID를 입력하세요');
            return;
        }

        // keyContent가 없으면 기존 설정 유지 (시트ID/이름만 변경)
        const body = { spreadsheetId, sheetName };
        if (keyContent) {
            body.serviceAccountKey = keyContent;
        } else if (!state.gsheetsConfig?.configured) {
            notifyWarning('서비스 계정 JSON 키 파일을 선택하세요');
            return;
        }

        const resp = await api('/google-sheets/config', {
            method: 'POST',
            body: body,
        });
        notifySuccess(resp.message || '설정 저장 완료');
        await loadGSheetsConfig();
        closeModal();
    } catch (e) {
        notifyError('설정 저장 실패: ' + e.message);
    }
}

async function syncToGoogleSheets() {
    if (state.selectedIds.size === 0) {
        notifyWarning('동기화할 계정을 선택하세요');
        return;
    }

    // 설정 확인
    if (!state.gsheetsConfig?.configured) {
        await loadGSheetsConfig();
        if (!state.gsheetsConfig?.configured) {
            showGSheetsConfigModal();
            return;
        }
    }

    const confirmed = await showConfirm({
        title: '구글시트 동기화',
        message: `선택한 ${state.selectedIds.size}개 계정의 쿠폰을 구글시트에 동기화합니다.\n(판매 완료 쿠폰은 제외)`,
        confirmText: '동기화',
        cancelText: '취소',
    });
    if (!confirmed) return;

    try {
        const resp = await api('/google-sheets/sync', {
            method: 'POST',
            body: { accountIds: Array.from(state.selectedIds) },
        });
        notifySuccess(resp.message || '동기화 완료');
    } catch (e) {
        notifyError('동기화 실패: ' + e.message);
    }
}

async function extractAccountInfo(id) {
    // 모바일 모드에서 연결 상태 확인 (실시간 체크)
    if (state.extractMode === 'mobile') {
        await checkMobileStatus(); // 실시간 상태 확인
        if (!state.mobileConnected) {
            const doConnect = await showConfirm({
                title: '모바일 연결 필요',
                message: '모바일 모드로 정보를 조회하려면 모바일 연결이 필요합니다.\n\n모바일 연결을 시작하시겠습니까?',
                confirmText: '연결',
                cancelText: '취소',
                type: 'warning'
            });
            if (doConnect) {
                connectMobile();
            }
            return;
        }
    }

    // 단건 정보조회도 모니터링 표시
    const account = state.accounts.find(acc => acc.id === id);
    if (!account) {
        notifyError('계정을 찾을 수 없습니다');
        return;
    }

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    const confirmed = await showConfirm({
        title: '정보 조회',
        message: `[${modeLabel}] ${account.email} 계정의 정보를 조회하시겠습니까?`,
        confirmText: '조회',
        type: 'info'
    });
    if (!confirmed) return;

    openMonitor('extract', '정보 조회', [account]);

    try {
        await api(`/extract/${id}`, { method: 'POST' });
    } catch (error) {
        notifyError('정보 조회 실패: ' + error.message);
    }
}

async function bulkExtract() {
    if (state.selectedIds.size === 0) {
        notifyWarning('조회할 계정을 선택하세요');
        return;
    }

    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        return;
    }

    // 모바일 모드에서 연결 상태 확인 (실시간 체크)
    if (state.extractMode === 'mobile') {
        await checkMobileStatus(); // 실시간 상태 확인
        if (!state.mobileConnected) {
            const doConnect = await showConfirm({
                title: '모바일 연결 필요',
                message: '모바일 모드로 정보를 조회하려면 모바일 연결이 필요합니다.\n\n모바일 연결을 시작하시겠습니까?',
                confirmText: '연결',
                cancelText: '취소',
                type: 'warning'
            });
            if (doConnect) {
                connectMobile();
            }
            return;
        }
    }

    const ids = Array.from(state.selectedIds);
    const accounts = ids.map(id => state.accounts.find(acc => acc.id === id)).filter(Boolean);

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    const confirmed = await showConfirm({
        title: '정보 일괄 조회',
        message: `[${modeLabel}] 선택한 ${accounts.length}개 계정의 정보를 조회하시겠습니까?`,
        confirmText: '조회',
        type: 'info'
    });
    if (!confirmed) return;

    openMonitor('extract', '정보 일괄 조회', accounts);
    state.selectedIds.clear();

    try {
        await api('/extract/bulk', {
            method: 'POST',
            body: { ids }
        });
    } catch (error) {
        notifyError('일괄 조회 실패: ' + error.message);
    }
}

// 쿠폰 발급 - 쿠폰 선택 모달 표시 (일괄)
function showIssueCouponModal() {
    if (state.selectedIds.size === 0) {
        notifyWarning('쿠폰을 발급할 계정을 선택하세요');
        return;
    }
    state.selectedIssueCouponTypes = []; // 선택 초기화
    state.modal = 'issue-coupon';
    render();
}

// 쿠폰 발급 - 개별 계정용 모달 표시
function showSingleIssueCouponModal(accountId, email) {
    state.singleIssueCouponAccountId = accountId;
    state.singleIssueCouponEmail = email;
    state.selectedIssueCouponTypes = []; // 선택 초기화
    state.modal = 'single-issue-coupon';
    render();
}

// 쿠폰 타입 선택 토글 (순서대로 추가/제거)
function toggleIssueCouponType(couponType) {
    const idx = state.selectedIssueCouponTypes.indexOf(couponType);
    if (idx >= 0) {
        // 이미 선택됨 → 제거
        state.selectedIssueCouponTypes.splice(idx, 1);
    } else {
        // 새로 선택 → 끝에 추가
        state.selectedIssueCouponTypes.push(couponType);
    }
    render();
}

// 다중 쿠폰 발급 시작 (일괄)
async function startIssueCoupon() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        notifyWarning('발급할 쿠폰을 선택하세요');
        return;
    }
    await issueCoupon(couponTypes);
}

// 다중 쿠폰 발급 시작 (전체 활성 계정)
async function startIssueCouponForAllActive() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        notifyWarning('발급할 쿠폰을 선택하세요');
        return;
    }
    await issueCouponForAllActive(couponTypes);
}

// 쿠폰 발급 실행 (일괄) - couponTypes: 배열 또는 단일값
async function issueCoupon(couponTypes) {
    const ids = Array.from(state.selectedIds);
    const accounts = ids.map(id => state.accounts.find(acc => acc.id === id)).filter(Boolean);

    closeModal();

    // 배열로 정규화
    const couponTypesArray = Array.isArray(couponTypes) ? couponTypes : [couponTypes];
    const couponNames = { '10000': '1만원권', '30000': '3만원권', '50000': '5만원권', '100000': '10만원권' };
    const couponTypesStr = couponTypesArray.map(ct => couponNames[ct] || `${ct}원`).join(', ');

    // 모바일 모드일 때 연결 상태 확인
    if (state.extractMode === 'mobile') {
        await checkMobileStatus();
        if (!state.mobileConnected) {
            notifyWarning('모바일 발급을 위해 먼저 모바일 연결을 해주세요.');
            return;
        }
    }

    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        return;
    }

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    const confirmed = await showConfirm({
        title: '쿠폰 일괄 발급',
        message: `[${modeLabel}] 선택한 ${accounts.length}개 계정에 ${couponTypesStr} 쿠폰을 발급하시겠습니까?`,
        confirmText: '발급',
        type: 'info'
    });
    if (!confirmed) return;

    openMonitor('issue', `[${modeLabel}] 쿠폰 일괄 발급 (${couponTypesStr})`, accounts);
    state.selectedIds.clear();

    try {
        await api('/issue-coupon/bulk', {
            method: 'POST',
            body: { ids, coupon_types: couponTypesArray, mode: state.extractMode }
        });
    } catch (error) {
        notifyError('쿠폰 발급 실패: ' + error.message);
    }
}

// 단일 계정 다중 쿠폰 발급 시작
async function startIssueCouponForAccount() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        notifyWarning('발급할 쿠폰을 선택하세요');
        return;
    }
    await issueCouponForAccount(state.singleIssueCouponAccountId, couponTypes);
}

// 단일 계정 쿠폰 발급 - couponTypes: 배열 또는 단일값
async function issueCouponForAccount(accountId, couponTypes) {
    const account = state.accounts.find(acc => acc.id === accountId);
    if (!account) {
        notifyError('계정을 찾을 수 없습니다');
        return;
    }

    closeModal();

    // 배열로 정규화
    const couponTypesArray = Array.isArray(couponTypes) ? couponTypes : [couponTypes];
    const couponNames = { '10000': '1만원권', '30000': '3만원권', '50000': '5만원권', '100000': '10만원권' };
    const couponTypesStr = couponTypesArray.map(ct => couponNames[ct] || `${ct}원`).join(', ');

    // 모바일 모드일 때 연결 상태 확인
    if (state.extractMode === 'mobile') {
        await checkMobileStatus();
        if (!state.mobileConnected) {
            notifyWarning('모바일 발급을 위해 먼저 모바일 연결을 해주세요.');
            return;
        }
    }

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    const confirmed = await showConfirm({
        title: '쿠폰 발급',
        message: `[${modeLabel}] ${account.email} 계정에 ${couponTypesStr} 쿠폰을 발급하시겠습니까?`,
        confirmText: '발급',
        type: 'info'
    });
    if (!confirmed) return;

    openMonitor('issue', `[${modeLabel}] 쿠폰 발급 (${couponTypesStr})`, [account]);

    try {
        // 단일 계정도 bulk 엔드포인트 사용 (다중 쿠폰 지원)
        await api('/issue-coupon/bulk', {
            method: 'POST',
            body: { ids: [accountId], coupon_types: couponTypesArray, mode: state.extractMode }
        });
    } catch (error) {
        notifyError('쿠폰 발급 실패: ' + error.message);
    }
}

async function bulkUpsertAccounts(accounts) {
    try {
        const result = await api('/accounts/bulk-upsert', { method: 'POST', body: accounts });
        notifySuccess(`총 ${result.total}개 중 ${result.created}개 등록, ${result.updated}개 수정`);
        closeModal();
        loadAccounts();
    } catch (error) {
        notifyError('등록 실패: ' + error.message);
    }
}

async function updateVoucherSale(accountId, voucherIndex, sold, soldTo) {
    try {
        await api(`/accounts/${accountId}/voucher-sale`, {
            method: 'POST',
            body: { voucher_index: voucherIndex, sold, sold_to: soldTo }
        });
        notifySuccess(sold ? '판매완료로 표시되었습니다' : '판매 취소되었습니다');
        closeModal();
        loadAccounts();
    } catch (error) {
        notifyError('업데이트 실패: ' + error.message);
    }
}

// 추출 모드 조회
async function loadExtractMode() {
    try {
        const result = await api('/extract-mode');
        state.extractMode = result.mode;
        render();
    } catch (error) {
        console.error('모드 조회 실패:', error);
    }
}

// 추출 모드 변경
async function setExtractMode(mode) {
    try {
        const result = await api('/extract-mode', { method: 'POST', body: { mode } });
        state.extractMode = result.mode;
        const modeNames = { web: '웹브라우저(기본)', web_incognito: '웹브라우저(시크릿)', mobile: '모바일', hybrid: '웹+모바일' };
        notifyInfo(`추출 모드: ${modeNames[mode] || mode}`);
        render();
    } catch (error) {
        notifyError('모드 변경 실패: ' + error.message);
    }
}


// ========== UI 렌더링 ==========

const OFFICIAL_EMAIL_DOMAINS = [
    'naver.com', 'nate.com', 'daum.net', 'hanmail.net', 'kakao.com',
    'gmail.com', 'yahoo.com', 'yahoo.co.kr', 'hotmail.com', 'outlook.com', 'live.com',
    'icloud.com', 'me.com', 'mac.com',
    'naver.com', 'korea.com', 'empas.com', 'dreamwiz.com', 'freechal.com', 'lycos.co.kr',
    'paran.com', 'chol.com', 'hitel.net', 'hanmir.com', 'netian.com',
];

function isOfficialEmail(email) {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return domain ? OFFICIAL_EMAIL_DOMAINS.includes(domain) : false;
}

function getFilteredAndSortedAccounts() {
    let result = [...state.accounts];

    // 텍스트 검색
    if (state.searchText) {
        const search = state.searchText.toLowerCase();
        result = result.filter(acc =>
            acc.email?.toLowerCase().includes(search) ||
            acc.name?.toLowerCase().includes(search) ||
            acc.phone?.toLowerCase().includes(search)
        );
    }

    // 상태 필터 - is_active가 1/0 또는 true/false일 수 있음
    if (state.filters.status !== null) {
        result = result.filter(acc => {
            const isActive = acc.is_active === true || acc.is_active === 1;
            return state.filters.status ? isActive : !isActive;
        });
    }

    // 이메일 유형 필터 (공식 vs 캐치올)
    if (state.filters.emailType !== null) {
        result = result.filter(acc => {
            const isOfficial = isOfficialEmail(acc.email);
            return state.filters.emailType === 'official' ? isOfficial : !isOfficial;
        });
    }

    // 포인트 필터
    if (state.filters.minPoints !== '') {
        const min = parseInt(state.filters.minPoints) || 0;
        result = result.filter(acc => (acc.current_points || 0) >= min);
    }
    if (state.filters.maxPoints !== '') {
        const max = parseInt(state.filters.maxPoints) || Infinity;
        result = result.filter(acc => (acc.current_points || 0) <= max);
    }

    // 생일 월 필터
    if (state.filters.birthdayMonths.length > 0) {
        result = result.filter(acc => {
            if (!acc.birthday) return false;
            const month = parseInt(acc.birthday.split('-')[1]);
            return state.filters.birthdayMonths.includes(month);
        });
    }

    // 쿠폰 유무 필터
    if (state.filters.hasCoupon !== null) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            const hasCoupon = vouchers.length > 0;
            return state.filters.hasCoupon ? hasCoupon : !hasCoupon;
        });
    }

    // 쿠폰 종류 필터 - getCouponDisplayInfo()의 name을 기준으로 필터링
    if (state.filters.couponTypes.length > 0) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => {
                // 목록에서 사용하는 동일한 함수로 쿠폰명 가져오기
                const couponInfo = getCouponDisplayInfo(v.description);
                return state.filters.couponTypes.includes(couponInfo.name);
            });
        });
    }

    // 조회 현황 필터 (웹/모바일 모두 확인)
    if (state.filters.fetchStatus !== null) {
        result = result.filter(acc => {
            const webStatus = acc.web_fetch_status || '';
            const mobileStatus = acc.mobile_fetch_status || '';
            const combinedStatus = webStatus + ' ' + mobileStatus;
            const hasCompleted = combinedStatus.includes('완료');
            const hasError = (combinedStatus.includes('오류') || combinedStatus.includes('실패')) && !combinedStatus.includes('비밀번호');
            const hasPasswordError = combinedStatus.includes('비밀번호') || combinedStatus.includes('로그인실패');

            switch (state.filters.fetchStatus) {
                case 'completed':
                    return hasCompleted;
                case 'pending':
                    return (!webStatus && !mobileStatus) || combinedStatus.includes('조회 중');
                case 'error':
                    // 오류가 있고, 완료가 없는 경우만 (모바일 완료 시 제외)
                    return hasError && !hasCompleted;
                case 'password_wrong':
                    // 비밀번호 오류가 있고, 완료가 없는 경우만
                    return hasPasswordError && !hasCompleted;
                default:
                    return true;
            }
        });
    }

    // 발급 현황 필터 (웹/모바일 모두 확인)
    if (state.filters.issueStatus !== null) {
        result = result.filter(acc => {
            // 웹/모바일 발급 상태 가져오기 (기존 issue_status fallback 포함)
            let webStatus = acc.web_issue_status || '';
            let mobileStatus = acc.mobile_issue_status || '';
            if (!webStatus && !mobileStatus && acc.issue_status) {
                if (acc.issue_status.includes('[모바일]')) {
                    mobileStatus = acc.issue_status;
                } else {
                    webStatus = acc.issue_status;
                }
            }
            const combinedStatus = webStatus + ' ' + mobileStatus;

            switch (state.filters.issueStatus) {
                case 'success':
                    return combinedStatus.includes('발급 완료') || combinedStatus.includes('완료');
                case 'pending':
                    return (!webStatus && !mobileStatus) || combinedStatus.includes('발급 중');
                case 'warning':
                    return combinedStatus.includes('포인트 부족') || combinedStatus.includes('버튼 없음') || combinedStatus.includes('1달 미경과');
                case 'password_wrong':
                    return combinedStatus.includes('비밀번호') || combinedStatus.includes('PASSWORD_WRONG');
                case 'error':
                    return (combinedStatus.includes('오류') || combinedStatus.includes('실패') || combinedStatus.includes('차단'))
                        && !combinedStatus.includes('포인트 부족') && !combinedStatus.includes('버튼 없음')
                        && !combinedStatus.includes('1달 미경과') && !combinedStatus.includes('비밀번호');
                default:
                    return true;
            }
        });
    }

    // 만료 예정 쿠폰 필터
    if (state.filters.expiringCoupon) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => isExpiringWithinWeek(v.expiry) && !isExpired(v.expiry));
        });
    }

    // 10만원 쿠폰 보유 필터 (유효기간 입력됨 + 만료되지 않음 + 판매되지 않음)
    if (state.filters.has100kCoupon || state.filters.has100kCoupon2Plus || state.filters.no100kCoupon) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            // 유효한 10만원 쿠폰 개수 세기
            const valid100kCount = vouchers.filter(v => {
                const desc = (v.description || '').toLowerCase();
                // 10만원 쿠폰 인식: 100k, 100000, 10만, 100,000 등 다양한 형식 지원
                const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is100k && hasValidExpiry && notExpired && notSold;
            }).length;
            if (state.filters.has100kCoupon2Plus) return valid100kCount >= 2;
            if (state.filters.has100kCoupon) return valid100kCount >= 1;
            if (state.filters.no100kCoupon) return valid100kCount === 0;
            return true;
        });
    }

    // 10만원권 수량 필터 (정확히 N장 보유)
    if (state.filters.coupon100kCount !== null) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            const valid100kCount = vouchers.filter(v => {
                const desc = (v.description || '').toLowerCase();
                const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is100k && hasValidExpiry && notExpired && notSold;
            }).length;
            return valid100kCount === state.filters.coupon100kCount;
        });
    }

    // 5만원권 수량 필터 (정확히 N장 보유)
    if (state.filters.coupon50kCount !== null) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            const valid50kCount = vouchers.filter(v => {
                const desc = (v.description || '').toLowerCase();
                const is50k = desc.includes('50k') || desc.includes('50000') || desc.includes('5만') || desc.includes('50,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is50k && hasValidExpiry && notExpired && notSold;
            }).length;
            return valid50kCount === state.filters.coupon50kCount;
        });
    }

    // 10만원 쿠폰 만료일 필터 (지정 날짜 이전에 만료되는 쿠폰만)
    if (state.filters.coupon100kExpiryBefore) {
        const filterDate = new Date(state.filters.coupon100kExpiryBefore);
        filterDate.setHours(23, 59, 59, 999); // 해당 날짜 끝까지 포함

        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            // 10만원 쿠폰 중 유효한 것만 찾기
            const valid100kVouchers = vouchers.filter(v => {
                const desc = (v.description || '').toLowerCase();
                // 10만원 쿠폰 인식: 100k, 100000, 10만, 100,000 등 다양한 형식 지원
                const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is100k && hasValidExpiry && notExpired && notSold;
            });

            if (valid100kVouchers.length === 0) return false; // 10만원 쿠폰이 없으면 제외

            // 쿠폰 중 만료일이 필터 날짜 이전인 것이 있는지 확인
            return valid100kVouchers.some(v => {
                const expiryDate = parseExpiryDate(v.expiry);
                if (!expiryDate) return false;
                return expiryDate <= filterDate;
            });
        });
    }

    // 10만원 쿠폰 만료일 필터 (지정 날짜 이후에 만료되는 쿠폰만)
    if (state.filters.coupon100kExpiryAfter) {
        const filterDate = new Date(state.filters.coupon100kExpiryAfter);
        filterDate.setHours(0, 0, 0, 0); // 해당 날짜 시작부터 포함

        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            // 10만원 쿠폰 중 유효한 것만 찾기
            const valid100kVouchers = vouchers.filter(v => {
                const desc = (v.description || '').toLowerCase();
                // 10만원 쿠폰 인식: 100k, 100000, 10만, 100,000 등 다양한 형식 지원
                const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is100k && hasValidExpiry && notExpired && notSold;
            });

            if (valid100kVouchers.length === 0) return false; // 10만원 쿠폰이 없으면 제외

            // 쿠폰 중 만료일이 필터 날짜 이후인 것이 있는지 확인
            return valid100kVouchers.some(v => {
                const expiryDate = parseExpiryDate(v.expiry);
                if (!expiryDate) return false;
                return expiryDate >= filterDate;
            });
        });
    }

    // 조회일 이전 필터 (특정 날짜 이전에 조회된 건만)
    if (state.filters.fetchBefore) {
        const filterDate = new Date(state.filters.fetchBefore);
        filterDate.setHours(23, 59, 59, 999); // 해당 날짜 끝까지 포함
        result = result.filter(acc => {
            const statusDate = parseDateFromStatus(acc.web_fetch_status, acc.mobile_fetch_status);
            if (!statusDate) return false; // 날짜 파싱 실패 시 제외
            return statusDate <= filterDate;
        });
    }

    // 조회일 이후 필터 (특정 날짜 이후에 조회 시도한 건 - 성공/실패 모두 포함)
    if (state.filters.fetchAfter) {
        const filterDate = new Date(state.filters.fetchAfter);
        filterDate.setHours(0, 0, 0, 0); // 해당 날짜 시작부터 포함
        result = result.filter(acc => {
            const statusDate = parseDateFromStatus(acc.web_fetch_status, acc.mobile_fetch_status);
            if (!statusDate) return false; // 날짜 파싱 실패 시 제외
            return statusDate >= filterDate;
        });
    }

    // 발급일 이전 필터 (특정 날짜 이전에 발급된 건만)
    if (state.filters.issueBefore) {
        const filterDate = new Date(state.filters.issueBefore);
        filterDate.setHours(23, 59, 59, 999);
        result = result.filter(acc => {
            const statusDate = parseDateFromIssueStatus(acc.issue_status);
            if (!statusDate) return false;
            return statusDate <= filterDate;
        });
    }

    // 정렬
    if (state.sort.column) {
        result.sort((a, b) => {
            let valA, valB;
            switch (state.sort.column) {
                case 'email': valA = a.email || ''; valB = b.email || ''; break;
                case 'name': valA = a.name || ''; valB = b.name || ''; break;
                case 'birthday':
                    // 월/일 순으로 정렬 (MMDD 형태로 변환)
                    const getBirthdayMMDD = (bd) => {
                        if (!bd) return '9999'; // 생일 없는 경우 맨 뒤로
                        const parts = bd.split('-');
                        if (parts.length >= 3) {
                            return parts[1] + parts[2]; // MM + DD
                        }
                        return '9999';
                    };
                    valA = getBirthdayMMDD(a.birthday);
                    valB = getBirthdayMMDD(b.birthday);
                    break;
                case 'points': valA = a.current_points || 0; valB = b.current_points || 0; break;
                case 'couponCount':
                    valA = parseVouchers(a.owned_vouchers).length;
                    valB = parseVouchers(b.owned_vouchers).length;
                    break;
                default: return 0;
            }
            if (typeof valA === 'string') {
                const cmp = valA.localeCompare(valB);
                return state.sort.direction === 'asc' ? cmp : -cmp;
            } else {
                return state.sort.direction === 'asc' ? valA - valB : valB - valA;
            }
        });
    }

    return result;
}

function render() {
    const app = document.getElementById('app');

    // 필터링 및 정렬 적용
    const filteredAccounts = getFilteredAndSortedAccounts();

    // 페이지네이션
    const effectivePageSize = state.pageSize === 'all' ? filteredAccounts.length : state.pageSize;
    const totalPages = effectivePageSize > 0 ? Math.ceil(filteredAccounts.length / effectivePageSize) : 1;
    const start = (state.currentPage - 1) * effectivePageSize;
    const pageAccounts = state.pageSize === 'all' ? filteredAccounts : filteredAccounts.slice(start, start + effectivePageSize);

    // 통계
    const totalCount = state.accounts.length;
    const activeCount = state.accounts.filter(a => a.is_active).length;

    // 만료 예정 쿠폰 보유 계정 수 (7일 이내)
    const expiringCouponAccountCount = state.accounts.filter(a => {
        if (!a.owned_vouchers) return false;
        try {
            const vouchers = JSON.parse(a.owned_vouchers);
            return vouchers.some(v => isExpiringWithinWeek(v.expiry) && !isExpired(v.expiry));
        } catch { return false; }
    }).length;

    // 10만원 쿠폰 보유 계정 수 (유효기간 입력됨 + 만료되지 않음 + 판매되지 않음)
    const has100kCouponCount = state.accounts.filter(a => {
        if (!a.owned_vouchers) return false;
        try {
            const vouchers = JSON.parse(a.owned_vouchers);
            return vouchers.some(v => {
                const desc = (v.description || '').toLowerCase();
                const is100k = desc.includes('100k') || desc.includes('100000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold;
                return is100k && hasValidExpiry && notExpired && notSold;
            });
        } catch { return false; }
    }).length;

    app.innerHTML = `
        <!-- 헤더 -->
        <div class="header">
            <h1><img src="adidas.png" alt="adidas" style="height:28px;margin-right:10px;vertical-align:middle;filter:brightness(0) invert(1);"> 아디다스 쿠폰 관리 <span class="version-badge">v${APP_VERSION}</span></h1>
            <div class="header-actions">
                <div class="mode-buttons">
                    <span class="mode-label">사용 모드:</span>
                    <button class="btn btn-mode ${state.extractMode === 'web' ? 'active' : ''} ${!installStatus.web ? 'needs-install' : ''}"
                            onclick="${installStatus.web ? "setExtractMode('web')" : 'showInstallRequired("web")'}"
                            ${!installStatus.web ? 'data-tooltip="웹크롤러 설치 필요"' : ''}>
                        웹브라우저(기본) ${!installStatus.web ? '🔒' : ''}
                    </button>
                    <button class="btn btn-mode ${state.extractMode === 'web_incognito' ? 'active' : ''} ${!installStatus.web ? 'needs-install' : ''}"
                            onclick="${installStatus.web ? "setExtractMode('web_incognito')" : 'showInstallRequired("web")'}"
                            ${!installStatus.web ? 'data-tooltip="웹크롤러 설치 필요"' : ''}>
                        웹브라우저(시크릿) ${!installStatus.web ? '🔒' : ''}
                    </button>
                    <button class="btn btn-mode ${state.extractMode === 'mobile' ? 'active' : ''}"
                            onclick="setExtractMode('mobile')">
                        모바일
                    </button>
                    <button class="btn btn-mode ${state.extractMode === 'hybrid' ? 'active' : ''}"
                            onclick="setExtractMode('hybrid')">
                        웹+모바일
                    </button>
                </div>
                <button class="btn ${state.mobileConnected ? 'btn-success' : 'btn-danger'}" onclick="connectMobile()" ${state.mobileConnecting ? 'disabled' : ''} style="min-width: 180px; padding: 4px 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                    ${state.mobileConnecting ? '<span style="font-size: 12px;">연결 중...</span>' : (state.mobileConnected ? `<span style="font-size: 12px;">${state.mobileDeviceType === 'real_phone' ? '📱 실제 폰 연결됨' : '모바일 연결됨'}</span><span style="font-size: 9px; opacity: 0.8;">${state.mobileDeviceType === 'real_phone' ? state.mobileUdid || '' : '에뮬레이터 모드'}</span>` : '<span style="font-size: 12px;">모바일 연결되지 않음</span><span style="font-size: 9px; opacity: 0.8;">버튼을 누르면 연결됩니다</span>')}
                </button>
                <button class="btn btn-default" onclick="showLogModal()">
                    ◎ 로그
                </button>
                <button class="btn-icon" onclick="showGuideModal()" title="사용자 가이드">
                    ?
                </button>
                <button class="btn-install-toggle ${state.showInstallPanel ? 'active' : ''}" onclick="toggleInstallPanel()" title="필수 프로그램 설치">
                    ⚙
                </button>
            </div>

            <!-- 필수 프로그램 설치 슬라이드 패널 -->
            <div class="install-panel ${state.showInstallPanel ? 'open' : ''}">
                <div class="install-panel-header">
                    <span>필수 프로그램 설치</span>
                    <button class="install-panel-close" onclick="toggleInstallPanel()">&times;</button>
                </div>
                <div class="install-panel-body">
                    <div class="install-item">
                        <div class="install-item-info">
                            <div class="install-item-title">🌐 웹크롤러 프로그램</div>
                            <div class="install-item-desc">Python, Chrome, Selenium</div>
                        </div>
                        <button class="${installStatus.web ? 'btn btn-success btn-sm' : 'btn btn-primary btn-sm'}" onclick="runInstaller('web')">
                            ${installStatus.web ? '설치 완료' : '설치'}
                        </button>
                    </div>
                    <div class="install-item">
                        <div class="install-item-info">
                            <div class="install-item-title">📱 모바일 연결 프로그램</div>
                            <div class="install-item-desc">MuMu Player, ADB, Appium</div>
                        </div>
                        <button class="${installStatus.mobile ? 'btn btn-success btn-sm' : 'btn btn-primary btn-sm'}" onclick="runInstaller('mobile')">
                            ${installStatus.mobile ? '설치 완료' : '설치'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 배치 작업 진행 상태 바 (백그라운드 작업 중일 때 또는 모니터가 숨김 상태일 때 표시) -->
        ${(state.batchStatus.active || state.monitor.hidden) ? (() => {
            const stats = getMonitorStats();
            const total = stats.total;
            const completed = stats.completed;
            const processing = stats.processing;
            const currentIndex = completed + processing;
            const statusParts = [];
            if (stats.success > 0) statusParts.push(`성공 ${stats.success}`);
            if (stats.warning > 0) statusParts.push(`경고 ${stats.warning}`);
            if (stats.error > 0) statusParts.push(`실패 ${stats.error}`);
            if (stats.passwordWrong > 0) statusParts.push(`비번오류 ${stats.passwordWrong}`);
            const statusSummary = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';
            return `
        <div class="batch-status-bar">
            <div class="batch-status-info">
                <span class="batch-status-icon">⏳</span>
                <span class="batch-status-title">${state.batchStatus.active ? state.batchStatus.title : state.monitor.title}</span>
                <span class="batch-status-detail">${currentIndex}번째 / 총 ${total}개 처리 중${statusSummary}</span>
                <span class="batch-status-time">${formatElapsedTime(state.batchStatus.active ? state.batchStatus.startTime : state.monitor.startTime)}</span>
            </div>
            <div class="batch-status-actions">
                <button class="btn btn-sm btn-primary" onclick="reopenMonitor()">상세 보기</button>
                <button class="btn btn-sm btn-danger" onclick="abortBatchProcess()">중지</button>
            </div>
        </div>
        `;
        })() : ''}

        <!-- 통계 카드 + 주요 액션 버튼 -->
        <div style="padding: 24px 24px 0;">
            <div class="stats-action-container">
                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-card-left"><h4>계정</h4></div>
                        <div class="stat-card-right">
                            <div class="value">${activeCount} / ${totalCount}개</div>
                            <div class="stat-subtitle">활성 / 전체</div>
                        </div>
                    </div>
                    <div class="stat-card clickable ${state.filters.expiringCoupon ? 'active' : ''}" onclick="toggleExpiringCouponFilter()">
                        <div class="stat-card-left"><h4>만료 예정 쿠폰</h4></div>
                        <div class="stat-card-right">
                            <div class="value">${expiringCouponAccountCount}개</div>
                            <div class="stat-subtitle">7일 이내 만료</div>
                        </div>
                    </div>
                    <div class="stat-card clickable ${state.filters.has100kCoupon ? 'active' : ''}" onclick="toggle100kCouponFilter()">
                        <div class="stat-card-left"><h4>10만원 상품권</h4></div>
                        <div class="stat-card-right">
                            <div class="value">${has100kCouponCount}개</div>
                            <div class="stat-subtitle">보유 계정</div>
                        </div>
                    </div>
                </div>
                <div class="main-action-buttons">
                    <button class="btn btn-main-action btn-info ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="bulkExtract()">
                        <span class="btn-icon">🔍</span>
                        <div class="btn-content">
                            <span class="btn-text">정보 조회 시작</span>
                            <span class="btn-desc">이메일,이름,포인트,쿠폰 등</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action btn-success ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="showIssueCouponModal()">
                        <span class="btn-icon">🎫</span>
                        <div class="btn-content">
                            <span class="btn-text">쿠폰 발급 시작</span>
                            <span class="btn-desc">포인트로 상품권 교환</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action btn-download ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="bulkDownloadBarcodes()">
                        <span class="btn-icon">📥</span>
                        <div class="btn-content">
                            <span class="btn-text">바코드 다운로드</span>
                            <span class="btn-desc">zip 압축 파일</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action btn-secondary ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="extractEmailList()">
                        <span class="btn-icon">📋</span>
                        <div class="btn-content">
                            <span class="btn-text">아이디 추출</span>
                            <span class="btn-desc">이메일 목록 복사</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>

        <!-- 툴바 -->
        <div class="toolbar">
            <div class="toolbar-left">
                <input type="text" class="search-input" id="searchInput" placeholder="이메일, 이름 검색..."
                    value="${state.searchText}"
                    oninput="updateSearch(this.value)"
                    oncompositionstart="isComposing=true"
                    oncompositionend="isComposing=false; updateSearch(this.value)">
                <button class="btn btn-default" onclick="loadAccounts()">↻ 새로고침</button>
                <button class="btn ${hasActiveFilters() ? 'btn-filter-active' : 'btn-default'}" onclick="toggleFilterPanel()">
                    전체 ${hasActiveFilters() ? `(${getActiveFilterCount()})` : ''} ${state.filterPanelOpen ? '∧' : '∨'}
                </button>
                ${hasActiveFilters() ? `<button class="btn btn-filter-reset" onclick="clearAllFilters()">✕ 초기화</button>` : ''}
            </div>
            <div class="toolbar-right">
                ${state.selectedIds.size > 0 ? `
                    <span class="selection-text">${state.selectedIds.size}개 선택</span>
                    <div class="segment-toggle">
                        <button class="segment-btn segment-on" onclick="bulkToggleActive(true)">ON</button>
                        <button class="segment-btn segment-off" onclick="bulkToggleActive(false)">OFF</button>
                    </div>
                    <button class="btn btn-default" onclick="exportSelectedToExcel()">엑셀 추출</button>
                    <button class="btn btn-default" onclick="syncToGoogleSheets()" style="background:#34a853;color:#fff;border-color:#34a853">구글시트 동기화</button>
                    <button class="btn btn-delete" onclick="bulkDelete()">삭제</button>
                ` : ''}
                <button class="btn btn-default" onclick="showAccountRegisterMenu()">계정 등록</button>
                <button class="btn btn-default" onclick="showBulkSoldModal()">쿠폰 판매 처리</button>
                <button class="btn btn-default" onclick="showGSheetsConfigModal()" title="구글시트 연동 설정">⚙ 구글시트</button>
            </div>
        </div>

        <!-- 확장형 필터 패널 -->
        ${renderFilterExpandPanel()}

        <!-- 메인 컨텐츠 -->
        <div class="main-content">
            ${state.loading ? '<div class="loading">로딩 중</div>' : `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th class="checkbox-cell">
                                    <div class="checkbox-wrapper">
                                        <input type="checkbox" ${state.selectedIds.size === pageAccounts.length && pageAccounts.length > 0 ? 'checked' : ''}
                                            onchange="toggleSelectAll(this.checked)">
                                    </div>
                                </th>
                                <th class="resizable" style="width:30px;">No</th>
                                <th class="resizable" style="width:30px;">상태</th>
                                <th class="resizable sortable ${state.sort.column === 'email' ? 'sorted' : ''}" style="width:100px;" onclick="toggleSort('email')">
                                    계정정보 ${renderSortIcon('email')}
                                </th>
                                <th class="resizable sortable ${state.sort.column === 'birthday' ? 'sorted' : ''}" style="width:50px;" onclick="toggleSort('birthday')">
                                    생일 ${renderSortIcon('birthday')}
                                </th>
                                <th class="resizable sortable ${state.sort.column === 'name' ? 'sorted' : ''}" style="width:70px;" onclick="toggleSort('name')">
                                    이름/전화 ${renderSortIcon('name')}
                                </th>
                                <th class="resizable" style="width:95px;">바코드</th>
                                <th class="resizable" style="width:95px;">바코드이미지</th>
                                <th class="resizable sortable ${state.sort.column === 'points' ? 'sorted' : ''}" style="width:55px;" onclick="toggleSort('points')">
                                    포인트 ${renderSortIcon('points')}
                                </th>
                                <th class="resizable sortable ${state.sort.column === 'couponCount' ? 'sorted' : ''}" style="width:180px;" onclick="toggleSort('couponCount')">
                                    보유 쿠폰 ${renderSortIcon('couponCount')}
                                </th>
                                <th class="resizable" style="width:260px;">조회현황</th>
                                <th class="resizable" style="width:100px;">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageAccounts.map((acc, idx) => renderAccountRow(acc, start + idx + 1)).join('')}
                        </tbody>
                    </table>

                    ${pageAccounts.length === 0 ? '<div style="text-align:center;padding:40px;color:#999;">계정이 없습니다</div>' : ''}

                    <!-- 페이지네이션 -->
                    <div class="pagination-container">
                        <div class="page-size-selector">
                            <span class="page-size-label">표시 개수:</span>
                            <select class="page-size-select" onchange="changePageSize(this.value)">
                                <option value="20" ${state.pageSize === 20 ? 'selected' : ''}>20개</option>
                                <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>50개</option>
                                <option value="100" ${state.pageSize === 100 ? 'selected' : ''}>100개</option>
                                <option value="200" ${state.pageSize === 200 ? 'selected' : ''}>200개</option>
                                <option value="500" ${state.pageSize === 500 ? 'selected' : ''}>500개</option>
                                <option value="all" ${state.pageSize === 'all' ? 'selected' : ''}>전체 보기</option>
                                <option value="custom" ${state.pageSize !== 'all' && ![20,50,100,200,500].includes(state.pageSize) ? 'selected' : ''}>직접 입력</option>
                            </select>
                            ${state.pageSize !== 'all' && ![20,50,100,200,500].includes(state.pageSize) ? `
                                <input type="number" class="page-size-input" value="${state.pageSize}" min="1" max="9999"
                                    onchange="changePageSize(this.value)" onkeydown="if(event.key==='Enter'){changePageSize(this.value)}">
                            ` : ''}
                            <span class="page-size-info">(총 ${filteredAccounts.length}개)</span>
                        </div>
                        ${totalPages > 1 ? `
                            <div class="pagination">
                                <button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)">«</button>
                                <button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">‹</button>
                                <span style="margin: 0 16px;">${state.currentPage} / ${totalPages}</span>
                                <button ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">›</button>
                                <button ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})">»</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `}
        </div>

        <!-- 모달 -->
        ${state.modal ? renderModal() : ''}

        <!-- 모니터링 팝업 -->
        ${state.monitor.active ? renderMonitorPopup() : ''}
    `;

    // 바코드 이미지 로컬 생성 (렌더링 후)
    requestAnimationFrame(() => {
        document.querySelectorAll('img[id^="bc_"]').forEach(img => {
            const acc = state.accounts.find(a => 'bc_' + a.id === img.id);
            if (acc && acc.adikr_barcode) {
                const dataURL = generateBarcodeDataURL(acc.adikr_barcode, { height: 30, margin: 1 });
                if (dataURL) img.src = dataURL;
            }
        });
    });

}

function renderAccountRow(acc, rowNum) {
    const isSelected = state.selectedIds.has(acc.id);
    const birthday = acc.birthday ? acc.birthday.split('-').slice(1).join('/') : '-';
    const vouchers = parseVouchers(acc.owned_vouchers);
    const barcode = acc.adikr_barcode || '';

    return `
        <tr class="${isSelected ? 'row-selected' : ''}">
            <td class="checkbox-cell">
                <div class="checkbox-wrapper" onclick="toggleSelect('${acc.id}', !state.selectedIds.has('${acc.id}'))">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}
                        onclick="event.stopPropagation(); toggleSelect('${acc.id}', this.checked);">
                </div>
            </td>
            <td>${rowNum}</td>
            <td style="text-align:center;">
                ${acc.is_active ? '<span class="status-active">●</span>' : '<span class="status-inactive">○</span>'}
            </td>
            <td>
                <div style="cursor:pointer;font-size:13px;color:#1890ff;" onclick="copyText('${acc.email}')" title="클릭하여 복사">${acc.email}</div>
                <div style="cursor:pointer;font-size:12px;color:#666;margin-top:2px;" onclick="copyText('${acc.password}')" title="클릭하여 복사">${acc.password}</div>
            </td>
            <td><strong>${birthday}</strong></td>
            <td>
                <div style="font-size:12px;">${acc.name || '-'}</div>
                ${acc.phone ? `<div style="font-size:11px;color:#999;">${acc.phone}</div>` : ''}
            </td>
            <td style="cursor:pointer;font-size:12px;font-family:monospace;font-weight:600;" onclick="copyText('${barcode}')" title="클릭하여 복사">
                ${barcode || '-'}
            </td>
            <td>
                ${barcode ? `
                    <div style="display:flex;align-items:center;gap:4px;">
                        <img id="bc_${acc.id}" src="" alt="barcode"
                            style="height:30px;max-width:100%;cursor:pointer;"
                            onclick="showBarcodeModal('${barcode}', '${(acc.name || '').replace(/'/g, "\\'")}', '${acc.email}', '${(acc.phone || '').replace(/'/g, "\\'")}')"
                            title="클릭하여 확대/다운로드">
                        <span style="cursor:pointer;font-size:11px;color:#999;" onclick="event.stopPropagation();var el=document.getElementById('bc_${acc.id}');refreshBarcode(el,'${barcode}')" title="바코드 새로고침">↻</span>
                    </div>
                ` : '-'}
            </td>
            <td>
                ${acc.current_points ? `<strong style="color:#1890ff;">${acc.current_points.toLocaleString()}P</strong>` : '-'}
            </td>
            <td>
                <div class="coupon-list">
                ${vouchers.length > 0 ? renderCouponCards(acc, vouchers) : '<span style="color:#999;">-</span>'}
                </div>
            </td>
            <td>
                ${(() => {
                    // 기존 issue_status fallback 처리 (마이그레이션 전 데이터 호환)
                    let webIssue = acc.web_issue_status;
                    let mobileIssue = acc.mobile_issue_status;
                    if (!webIssue && !mobileIssue && acc.issue_status) {
                        if (acc.issue_status.includes('[모바일]')) {
                            mobileIssue = acc.issue_status;
                        } else {
                            webIssue = acc.issue_status;
                        }
                    }
                    return renderStatusTable(acc.web_fetch_status, acc.mobile_fetch_status, webIssue, mobileIssue);
                })()}
            </td>
            <td>
                <div class="action-btn-grid">
                    ${acc.is_active ? `
                        <button class="btn btn-navy btn-small" onclick="extractAccountInfo('${acc.id}')">정보조회</button>
                        <button class="btn btn-default btn-small" onclick="showEditModal('${acc.id}')">수정</button>
                        <button class="btn btn-navy btn-small" onclick="showSingleIssueCouponModal('${acc.id}', '${acc.email}')">쿠폰발급</button>
                        <button class="btn btn-delete btn-small" onclick="deleteAccount('${acc.id}')">삭제</button>
                    ` : `
                        <button class="btn btn-default btn-small" onclick="showEditModal('${acc.id}')">수정</button>
                        <button class="btn btn-delete btn-small" onclick="deleteAccount('${acc.id}')">삭제</button>
                    `}
                </div>
            </td>
        </tr>
    `;
}

function renderMonitorPopup() {
    const stats = getMonitorStats();
    const isRunning = stats.waiting > 0 || stats.processing > 0;
    const elapsedTime = formatElapsedTime(state.monitor.startTime);

    // 아이콘 결정
    const getItemIcon = (status) => {
        switch (status) {
            case 'waiting': return '○';
            case 'processing': return '◎';
            case 'success': return '✓';
            case 'error': return '✕';
            case 'warning': return '⚠';
            case 'password_wrong': return '🔑';  // 비밀번호 오류 (주황색 키 아이콘)
            default: return '○';
        }
    };

    return `
        <div class="modal-overlay">
            <div class="monitor-modal" onclick="event.stopPropagation()">
                <!-- 헤더 -->
                <div class="monitor-header">
                    <div class="monitor-header-left">
                        <span class="monitor-title">${state.monitor.title}</span>
                        <span class="monitor-badge ${isRunning ? 'running' : 'completed'}">
                            ${isRunning ? '● 진행 중' : '● 완료'}
                        </span>
                    </div>
                    <button class="monitor-close" onclick="closeMonitor()">×</button>
                </div>

                <!-- 통계 -->
                <div class="monitor-stats">
                    <div class="monitor-stat">
                        <div class="monitor-stat-value">${stats.total}</div>
                        <div class="monitor-stat-label">전체</div>
                    </div>
                    <div class="monitor-stat">
                        <div class="monitor-stat-value processing">${stats.processing}</div>
                        <div class="monitor-stat-label">진행</div>
                    </div>
                    <div class="monitor-stat">
                        <div class="monitor-stat-value success">${stats.success}</div>
                        <div class="monitor-stat-label">완료</div>
                    </div>
                    <div class="monitor-stat">
                        <div class="monitor-stat-value warning">${stats.warning}</div>
                        <div class="monitor-stat-label">패스</div>
                    </div>
                    <div class="monitor-stat">
                        <div class="monitor-stat-value password-wrong">${stats.passwordWrong}</div>
                        <div class="monitor-stat-label">비번오류</div>
                    </div>
                    <div class="monitor-stat">
                        <div class="monitor-stat-value error">${stats.error}</div>
                        <div class="monitor-stat-label">실패</div>
                    </div>
                </div>

                <!-- 진행률 -->
                <div class="monitor-progress">
                    <div class="monitor-progress-bar">
                        <div class="monitor-progress-fill" style="width: ${stats.progress}%;"></div>
                    </div>
                    <div class="monitor-progress-text">
                        <span>${stats.completed}/${stats.total} 완료 (${stats.progress}%)</span>
                        <span>경과 시간: ${elapsedTime}</span>
                    </div>
                </div>

                <!-- 항목 목록 -->
                <div class="monitor-body">
                    <ul class="monitor-list">
                        ${state.monitor.items.map((item, index) => `
                            <li class="monitor-item ${item.status}">
                                ${!isRunning ? `
                                    <div class="monitor-item-check">
                                        <input type="checkbox"
                                            ${state.monitor.selectedIds?.has(item.id) ? 'checked' : ''}
                                            onchange="toggleMonitorSelect(${item.id})"
                                        />
                                    </div>
                                ` : `
                                    <div class="monitor-item-index">${index + 1}</div>
                                `}
                                <div class="monitor-item-info">
                                    <div class="monitor-item-email">${item.email}</div>
                                    <div class="monitor-item-status">${item.message}</div>
                                </div>
                                <div class="monitor-item-time">
                                    ${item.status === 'success' || item.status === 'error' || item.status === 'warning' || item.status === 'password_wrong'
                                        ? formatDuration(item.startTime, item.endTime)
                                        : item.status === 'processing'
                                            ? formatElapsedTime(item.startTime)
                                            : '-'}
                                </div>
                                <div class="monitor-item-icon">${getItemIcon(item.status)}</div>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <!-- 푸터 -->
                <div class="monitor-footer">
                    <div class="monitor-footer-info">
                        ${!isRunning ? `
                            <label class="monitor-select-all">
                                <input type="checkbox" onchange="toggleMonitorSelectAll(this.checked)"
                                    ${state.monitor.selectedIds?.size === state.monitor.items.length ? 'checked' : ''}
                                /> 전체선택
                            </label>
                            <span class="monitor-selected-count">${state.monitor.selectedIds?.size || 0}건 선택</span>
                        ` : `
                            시작: <span>${state.monitor.startTime ? new Date(state.monitor.startTime).toLocaleTimeString('ko-KR') : '-'}</span>
                        `}
                    </div>
                    <div class="monitor-footer-actions">
                        ${!isRunning ? `
                            ${(state.monitor.selectedIds?.size || 0) > 0 ? `<button class="btn btn-warning" onclick="retrySelectedItems()">선택 ${state.monitor.selectedIds.size}건 재처리</button>` : ''}
                            ${stats.error > 0 ? `<button class="btn btn-outline-warning" onclick="selectFailedItems()">실패만 선택</button>` : ''}
                            <button class="btn btn-primary" onclick="closeMonitor()">닫기</button>
                        ` : `
                            <button class="btn btn-danger" onclick="abortBatchProcess()">중지</button>
                            <button class="btn btn-default" onclick="hideMonitorPopup()">백그라운드로 전환</button>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderModal() {
    if (state.modal === 'registerMenu') {
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="register-menu-popup" onclick="event.stopPropagation()">
                    <button class="btn btn-primary-dark register-menu-btn" onclick="closeModal(); showAddModal();">
                        단일 등록
                    </button>
                    <button class="btn btn-primary-dark register-menu-btn" onclick="closeModal(); showBulkPasteModal();">
                        일괄 등록
                    </button>
                </div>
            </div>
        `;
    }

    if (state.modal === 'add' || state.modal === 'edit') {
        const acc = state.editingAccount || {};
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${state.modal === 'edit' ? '계정 수정' : '계정 추가'}</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="accountForm">
                            <div class="form-group">
                                <label>이메일 *</label>
                                <input type="email" name="email" value="${acc.email || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>비밀번호 *</label>
                                <input type="text" name="password" value="${acc.password || ''}" required>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>이름</label>
                                    <input type="text" name="name" value="${acc.name || ''}">
                                </div>
                                <div class="form-group">
                                    <label>생일 (YYYY-MM-DD)</label>
                                    <input type="text" name="birthday" value="${acc.birthday || ''}" placeholder="1990-01-01">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>전화번호</label>
                                    <input type="text" name="phone" value="${acc.phone || ''}">
                                </div>
                                <div class="form-group">
                                    <label>ADIKR 바코드</label>
                                    <input type="text" name="adikr_barcode" value="${acc.adikr_barcode || ''}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>메모</label>
                                <textarea name="memo" rows="2">${acc.memo || ''}</textarea>
                            </div>
                            <div class="form-group toggle-group">
                                <span class="toggle-label-text">활성화</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" name="is_active" ${acc.is_active !== false ? 'checked' : ''} onchange="updateToggleLabel(this.parentElement)">
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-status">${acc.is_active !== false ? 'ON' : 'OFF'}</span>
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="submitAccountForm()">저장</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'bulk') {
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal modal-large" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>일괄 등록 (붙여넣기)</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="bulk-paste-container">
                            <div class="bulk-paste-left">
                                <p style="margin-bottom:8px;font-weight:500;">데이터를 붙여넣으세요</p>
                                <p style="color:#999;font-size:12px;margin-bottom:8px;">
                                    형식: 이름 &nbsp; 이메일 &nbsp; 비밀번호 &nbsp; 전화번호 &nbsp; 생일
                                </p>
                                <textarea id="bulkText" placeholder="김철수   test@email.com   Password1!   010 1234 5678   1990 01 15"
                                    oninput="parseBulkText()"></textarea>
                            </div>
                            <div class="bulk-paste-right">
                                <p style="margin-bottom:8px;font-weight:500;">미리보기 (<span id="bulkCount">0</span>개)</p>
                                <div class="bulk-preview">
                                    <table id="bulkPreview">
                                        <thead>
                                            <tr>
                                                <th>이름</th>
                                                <th>이메일</th>
                                                <th>비밀번호</th>
                                                <th>전화번호</th>
                                                <th>생일</th>
                                            </tr>
                                        </thead>
                                        <tbody></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="submitBulkAccounts()">등록</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'filter') {
        // 실제 보유 쿠폰 종류 동적 추출
        const availableCouponTypes = getAvailableCouponTypes();

        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="filter-modal" onclick="event.stopPropagation()">
                    <!-- 헤더 -->
                    <div class="filter-modal-header">
                        <div class="filter-modal-title">필터 설정</div>
                        <button class="filter-modal-close" onclick="closeModal()">×</button>
                    </div>

                    <!-- 바디 -->
                    <div class="filter-modal-body">
                        <!-- 상태 필터 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">계정 상태</span>
                            </div>
                            <div class="filter-chips">
                                <button class="filter-chip ${state.filters.status === null ? 'active' : ''}" onclick="toggleFilter('status', null)">전체</button>
                                <button class="filter-chip ${state.filters.status === true ? 'active success' : ''}" onclick="toggleFilter('status', true)">
                                    <span class="chip-dot success"></span> 활성
                                </button>
                                <button class="filter-chip ${state.filters.status === false ? 'active danger' : ''}" onclick="toggleFilter('status', false)">
                                    <span class="chip-dot danger"></span> 비활성
                                </button>
                            </div>
                        </div>

                        <!-- 이메일 유형 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">이메일 유형</span>
                            </div>
                            <div class="filter-chips">
                                <button class="filter-chip ${state.filters.emailType === null ? 'active' : ''}" onclick="toggleFilter('emailType', null)">전체</button>
                                <button class="filter-chip ${state.filters.emailType === 'official' ? 'active primary' : ''}" onclick="toggleFilter('emailType', 'official')">
                                    <span class="chip-dot primary"></span> 공식 이메일
                                </button>
                                <button class="filter-chip ${state.filters.emailType === 'catchall' ? 'active warning' : ''}" onclick="toggleFilter('emailType', 'catchall')">
                                    <span class="chip-dot warning"></span> 캐치올
                                </button>
                            </div>
                        </div>

                        <!-- 포인트 필터 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">포인트 범위</span>
                            </div>
                            <div class="filter-range">
                                <div class="filter-range-input">
                                    <input type="number" class="range-input" placeholder="0" value="${state.filters.minPoints}"
                                        oninput="setFilterValue('minPoints', this.value)">
                                    <span class="range-unit">P</span>
                                </div>
                                <span class="range-separator">~</span>
                                <div class="filter-range-input">
                                    <input type="number" class="range-input" placeholder="∞" value="${state.filters.maxPoints}"
                                        oninput="setFilterValue('maxPoints', this.value)">
                                    <span class="range-unit">P</span>
                                </div>
                            </div>
                        </div>

                        <!-- 쿠폰 유무 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">쿠폰 보유</span>
                            </div>
                            <div class="filter-chips">
                                <button class="filter-chip ${state.filters.hasCoupon === null ? 'active' : ''}" onclick="toggleFilter('hasCoupon', null)">전체</button>
                                <button class="filter-chip ${state.filters.hasCoupon === true ? 'active primary' : ''}" onclick="toggleFilter('hasCoupon', true)">보유</button>
                                <button class="filter-chip ${state.filters.hasCoupon === false ? 'active warning' : ''}" onclick="toggleFilter('hasCoupon', false)">미보유</button>
                            </div>
                        </div>

                        <!-- 쿠폰 종류 (동적) -->
                        ${availableCouponTypes.length > 0 ? `
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">쿠폰 종류</span>
                                <span class="filter-group-hint">복수 선택</span>
                            </div>
                            <div class="filter-chips wrap">
                                ${availableCouponTypes.map(({ type, label, color, count }) => `
                                    <button class="filter-chip coupon ${state.filters.couponTypes.includes(type) ? 'active' : ''}"
                                        onclick="toggleCouponType('${type.replace(/'/g, "\\'")}')"
                                        style="${state.filters.couponTypes.includes(type) ? `background:${color};border-color:${color};` : ''}">
                                        <span class="coupon-filter-name">${label}</span>
                                        <span class="chip-count">${count}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- 생일 월 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">생일 월</span>
                                <span class="filter-group-hint">복수 선택</span>
                            </div>
                            <div class="filter-months">
                                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
                                    <button class="filter-month ${state.filters.birthdayMonths.includes(m) ? 'active' : ''}"
                                        onclick="toggleBirthdayMonth(${m})">
                                        ${m}월
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 조회 현황 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">조회 현황</span>
                            </div>
                            <div class="filter-chips wrap">
                                <button class="filter-chip ${state.filters.fetchStatus === null ? 'active' : ''}" onclick="toggleFilter('fetchStatus', null)">전체</button>
                                <button class="filter-chip ${state.filters.fetchStatus === 'completed' ? 'active success' : ''}" onclick="toggleFilter('fetchStatus', 'completed')">
                                    <span class="chip-dot success"></span> 조회완료
                                </button>
                                <button class="filter-chip ${state.filters.fetchStatus === 'pending' ? 'active' : ''}" onclick="toggleFilter('fetchStatus', 'pending')">
                                    <span class="chip-dot"></span> 미조회
                                </button>
                                <button class="filter-chip ${state.filters.fetchStatus === 'password_wrong' ? 'active danger' : ''}" onclick="toggleFilter('fetchStatus', 'password_wrong')">
                                    <span class="chip-dot danger"></span> 비밀번호 오류
                                </button>
                                <button class="filter-chip ${state.filters.fetchStatus === 'error' ? 'active warning' : ''}" onclick="toggleFilter('fetchStatus', 'error')">
                                    <span class="chip-dot warning"></span> 기타 오류
                                </button>
                            </div>
                            <div class="filter-date-row" style="margin-top:8px;">
                                <label style="font-size:11px;color:#666;">조회일 이후:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.fetchAfter}"
                                    onchange="setDateFilter('fetchAfter', this.value)" />
                                ${state.filters.fetchAfter ? '<button class="filter-date-clear" onclick="setDateFilter(\'fetchAfter\', \'\')">✕</button>' : ''}
                            </div>
                            <div class="filter-date-row" style="margin-top:4px;">
                                <label style="font-size:11px;color:#666;">조회일 이전:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.fetchBefore}"
                                    onchange="setDateFilter('fetchBefore', this.value)" />
                                ${state.filters.fetchBefore ? '<button class="filter-date-clear" onclick="setDateFilter(\'fetchBefore\', \'\')">✕</button>' : ''}
                            </div>
                        </div>

                        <!-- 발급 현황 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">발급 현황</span>
                            </div>
                            <div class="filter-chips wrap">
                                <button class="filter-chip ${state.filters.issueStatus === null ? 'active' : ''}" onclick="toggleFilter('issueStatus', null)">전체</button>
                                <button class="filter-chip ${state.filters.issueStatus === 'success' ? 'active success' : ''}" onclick="toggleFilter('issueStatus', 'success')">
                                    <span class="chip-dot success"></span> 발급완료
                                </button>
                                <button class="filter-chip ${state.filters.issueStatus === 'pending' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'pending')">
                                    <span class="chip-dot"></span> 미발급
                                </button>
                                <button class="filter-chip ${state.filters.issueStatus === 'warning' ? 'active warning' : ''}" onclick="toggleFilter('issueStatus', 'warning')">
                                    <span class="chip-dot warning"></span> 포인트 부족
                                </button>
                                <button class="filter-chip ${state.filters.issueStatus === 'password_wrong' ? 'active danger' : ''}" onclick="toggleFilter('issueStatus', 'password_wrong')">
                                    <span class="chip-dot password-wrong"></span> 비밀번호 오류
                                </button>
                                <button class="filter-chip ${state.filters.issueStatus === 'error' ? 'active danger' : ''}" onclick="toggleFilter('issueStatus', 'error')">
                                    <span class="chip-dot danger"></span> 발급 오류
                                </button>
                            </div>
                            <div class="filter-date-row" style="margin-top:8px;">
                                <label style="font-size:11px;color:#666;">발급일 이전:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.issueBefore}"
                                    onchange="setDateFilter('issueBefore', this.value)" />
                                ${state.filters.issueBefore ? '<button class="filter-date-clear" onclick="setDateFilter(\'issueBefore\', \'\')">✕</button>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 푸터 -->
                    <div class="filter-modal-footer">
                        <button class="filter-action-btn reset" onclick="clearAllFilters()">초기화</button>
                        <button class="filter-action-btn apply" onclick="closeModal()">
                            ${hasActiveFilters() ? `${getActiveFilterCount()}개 필터 적용` : '적용'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'voucher') {
        const { accountId, voucherIndex, voucher } = state.voucherData;
        const couponInfo = getCouponDisplayInfo(voucher.description);
        const expiryDate = voucher.expiry && voucher.expiry !== 'N/A' ? voucher.expiry : '';
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:420px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>쿠폰 판매 관리</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin-bottom:16px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <span style="font-size:28px;">${couponInfo.icon}</span>
                                <div>
                                    <div style="font-size:16px;font-weight:600;color:${couponInfo.color};">
                                        ${voucher.sold ? '✓ ' : ''}${couponInfo.name}
                                    </div>
                                    <div style="font-size:11px;color:#999;margin-top:2px;">${voucher.description}</div>
                                </div>
                            </div>
                            ${voucher.code ? `
                            <div style="margin-top:12px;padding:8px;background:#fff;border-radius:4px;font-family:monospace;font-size:13px;text-align:center;cursor:pointer;"
                                onclick="copyText('${voucher.code}')" title="클릭하여 복사">
                                📋 ${voucher.code}
                            </div>
                            ` : ''}
                            ${expiryDate ? `
                            <div style="margin-top:8px;font-size:12px;color:#666;text-align:center;">
                                유효기간: ${expiryDate}
                            </div>
                            ` : ''}
                        </div>
                        <div class="form-group">
                            <label>판매 정보</label>
                            <input type="text" id="voucherSoldTo" placeholder="예: 12/16 백호" value="${voucher.sold_to || ''}">
                            <p style="color:#999;font-size:12px;margin-top:8px;">언제, 누구에게 판매했는지 메모할 수 있습니다.</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">닫기</button>
                        ${voucher.sold ? `
                            <button class="btn btn-primary" onclick="saveVoucherSale(${accountId}, ${voucherIndex}, true)">수정</button>
                            <button class="btn btn-danger" onclick="saveVoucherSale(${accountId}, ${voucherIndex}, false)">판매 취소</button>
                        ` : `
                            <button class="btn btn-success" onclick="saveVoucherSale(${accountId}, ${voucherIndex}, true)">판매완료</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'issue-coupon') {
        // 전체 활성 계정 or 선택된 계정
        const isAllActive = state.bulkIssueAllActive;
        const targetCount = isAllActive
            ? state.accounts.filter(a => a.is_active).length
            : state.selectedIds.size;
        const targetText = isAllActive
            ? `전체 활성 계정 ${targetCount}개`
            : `선택된 ${targetCount}개 계정`;
        const issueFunc = isAllActive ? 'startIssueCouponForAllActive' : 'startIssueCoupon';
        const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
        const timeEstimate = ({ web: '20~30초', web_incognito: '20~30초', mobile: '30~40초', hybrid: '20초~1분' }[state.extractMode] || '20~30초');

        // 선택된 쿠폰 타입들
        const selected = state.selectedIssueCouponTypes || [];
        const getOrder = (type) => {
            const idx = selected.indexOf(type);
            return idx >= 0 ? idx + 1 : null;
        };
        const isSelected = (type) => selected.includes(type);

        // 선택 순서 표시 텍스트
        const couponNames = { '10000': '1만원권', '30000': '3만원권', '50000': '5만원권', '100000': '10만원권' };
        const selectedText = selected.length > 0
            ? selected.map((t, i) => `${i+1}. ${couponNames[t]}`).join(' → ')
            : '선택된 쿠폰 없음';

        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:500px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>🎫 쿠폰 발급</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:16px;color:#666;">
                            <strong>${targetText}</strong>에 쿠폰을 발급합니다.<br>
                            <span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#e6f4ff;color:#1890ff;border-radius:4px;font-size:12px;font-weight:600;">${modeLabel} 모드</span>
                            <span style="display:block;margin-top:8px;">발급할 쿠폰을 <strong>클릭 순서대로</strong> 선택하세요. (다중 선택 가능)</span>
                        </p>
                        <div class="coupon-issue-grid">
                            <div class="coupon-issue-card ${isSelected('10000') ? 'selected' : ''}" onclick="toggleIssueCouponType('10000')">
                                ${getOrder('10000') ? `<div class="coupon-order-badge">${getOrder('10000')}</div>` : ''}
                                <div class="coupon-issue-points">1,500P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">10,000원</div>
                                <div class="coupon-issue-name">1만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('30000') ? 'selected' : ''}" onclick="toggleIssueCouponType('30000')">
                                ${getOrder('30000') ? `<div class="coupon-order-badge">${getOrder('30000')}</div>` : ''}
                                <div class="coupon-issue-points">3,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">30,000원</div>
                                <div class="coupon-issue-name">3만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('50000') ? 'selected' : ''}" onclick="toggleIssueCouponType('50000')">
                                ${getOrder('50000') ? `<div class="coupon-order-badge">${getOrder('50000')}</div>` : ''}
                                <div class="coupon-issue-points">4,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">50,000원</div>
                                <div class="coupon-issue-name">5만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('100000') ? 'selected' : ''}" onclick="toggleIssueCouponType('100000')">
                                ${getOrder('100000') ? `<div class="coupon-order-badge">${getOrder('100000')}</div>` : ''}
                                <div class="coupon-issue-points">6,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">100,000원</div>
                                <div class="coupon-issue-name">10만원 상품권</div>
                            </div>
                        </div>
                        <div style="margin-top:12px;padding:10px;background:#f6f6f6;border-radius:8px;font-size:13px;">
                            <strong>발급 순서:</strong> ${selectedText}
                        </div>
                        <p style="margin-top:12px;font-size:12px;color:#999;">
                            * 포인트가 부족한 계정은 해당 쿠폰 발급에 실패합니다.<br>
                            * 발급은 순차적으로 진행되며, 계정당 약 <strong>${timeEstimate}</strong> 소요됩니다.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="${issueFunc}()" ${selected.length === 0 ? 'disabled' : ''}>
                            ${selected.length > 0 ? `${selected.length}개 쿠폰 발급 시작` : '쿠폰을 선택하세요'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'single-issue-coupon') {
        const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
        const timeEstimate = ({ web: '20~30초', web_incognito: '20~30초', mobile: '30~40초', hybrid: '20초~1분' }[state.extractMode] || '20~30초');

        // 선택된 쿠폰 타입들
        const selected = state.selectedIssueCouponTypes || [];
        const getOrder = (type) => {
            const idx = selected.indexOf(type);
            return idx >= 0 ? idx + 1 : null;
        };
        const isSelected = (type) => selected.includes(type);

        // 선택 순서 표시 텍스트
        const couponNames = { '10000': '1만원권', '30000': '3만원권', '50000': '5만원권', '100000': '10만원권' };
        const selectedText = selected.length > 0
            ? selected.map((t, i) => `${i+1}. ${couponNames[t]}`).join(' → ')
            : '선택된 쿠폰 없음';

        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:500px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>🎫 쿠폰 발급</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:16px;color:#666;">
                            <strong>${state.singleIssueCouponEmail || ''}</strong> 계정에 쿠폰을 발급합니다.<br>
                            <span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#e6f4ff;color:#1890ff;border-radius:4px;font-size:12px;font-weight:600;">${modeLabel} 모드</span>
                            <span style="display:block;margin-top:8px;">발급할 쿠폰을 <strong>클릭 순서대로</strong> 선택하세요. (다중 선택 가능)</span>
                        </p>
                        <div class="coupon-issue-grid">
                            <div class="coupon-issue-card ${isSelected('10000') ? 'selected' : ''}" onclick="toggleIssueCouponType('10000')">
                                ${getOrder('10000') ? `<div class="coupon-order-badge">${getOrder('10000')}</div>` : ''}
                                <div class="coupon-issue-points">1,500P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">10,000원</div>
                                <div class="coupon-issue-name">1만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('30000') ? 'selected' : ''}" onclick="toggleIssueCouponType('30000')">
                                ${getOrder('30000') ? `<div class="coupon-order-badge">${getOrder('30000')}</div>` : ''}
                                <div class="coupon-issue-points">3,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">30,000원</div>
                                <div class="coupon-issue-name">3만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('50000') ? 'selected' : ''}" onclick="toggleIssueCouponType('50000')">
                                ${getOrder('50000') ? `<div class="coupon-order-badge">${getOrder('50000')}</div>` : ''}
                                <div class="coupon-issue-points">4,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">50,000원</div>
                                <div class="coupon-issue-name">5만원 상품권</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('100000') ? 'selected' : ''}" onclick="toggleIssueCouponType('100000')">
                                ${getOrder('100000') ? `<div class="coupon-order-badge">${getOrder('100000')}</div>` : ''}
                                <div class="coupon-issue-points">6,000P</div>
                                <div class="coupon-issue-arrow">→</div>
                                <div class="coupon-issue-value">100,000원</div>
                                <div class="coupon-issue-name">10만원 상품권</div>
                            </div>
                        </div>
                        <div style="margin-top:12px;padding:10px;background:#f6f6f6;border-radius:8px;font-size:13px;">
                            <strong>발급 순서:</strong> ${selectedText}
                        </div>
                        <p style="margin-top:12px;font-size:12px;color:#999;">
                            * 포인트가 부족하면 해당 쿠폰 발급에 실패합니다.<br>
                            * 발급에 약 <strong>${timeEstimate}</strong> 소요됩니다.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="startIssueCouponForAccount()" ${selected.length === 0 ? 'disabled' : ''}>
                            ${selected.length > 0 ? `${selected.length}개 쿠폰 발급 시작` : '쿠폰을 선택하세요'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'bulk-sold') {
        const couponTypes = getAvailableCouponTypes();
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:500px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>🛒 쿠폰 판매 처리</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:12px;color:#666;font-size:13px;">
                            판매 완료된 계정 이메일을 입력하고 쿠폰 종류를 선택하세요.<br>
                            <span style="color:#999;">한 줄에 하나의 이메일을 입력합니다.</span>
                        </p>
                        <textarea id="bulkSoldEmails" rows="10" style="width:100%;padding:10px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;resize:vertical;" placeholder="chunwowon@naver.com
teasankmmm@naver.com
teayoouun1@naver.com
..."></textarea>
                        <div style="margin-top:16px;">
                            <label style="font-size:13px;font-weight:600;color:#333;">쿠폰 종류 선택</label>
                            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
                                ${couponTypes.length > 0 ? couponTypes.map(({ type, label, count }) => `
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '${type.replace(/'/g, "\\'")}')">
                                        ${label} <span class="count">${count}</span>
                                    </button>
                                `).join('') : `
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '3000원 상품권')">3000원 상품권</button>
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '10000원 상품권')">10000원 상품권</button>
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '30000원 상품권')">30000원 상품권</button>
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '50000원 상품권')">50000원 상품권</button>
                                    <button class="filter-coupon-btn" onclick="selectSoldCouponType(this, '100000원 상품권')">100000원 상품권</button>
                                `}
                            </div>
                            <input type="hidden" id="selectedSoldCouponType" value="">
                        </div>
                        <p style="margin-top:12px;font-size:12px;color:#999;">
                            * 해당 계정의 선택된 쿠폰이 "판매 완료" 상태로 변경됩니다.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary-dark" onclick="processBulkSold()">판매 처리</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'guide') {
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:1200px;max-width:95vw;max-height:90vh;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>📖 사용자 가이드</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="max-height:75vh;overflow-y:auto;padding:40px 60px;">
                        ${getGuideContent()}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'log') {
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:900px;max-width:95vw;height:70vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
                    <div class="modal-header" style="flex-shrink:0;">
                        <h3>서버 로그 <span id="logStatus" style="font-size:12px;color:#52c41a;">● 실시간</span></h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="padding:0;flex:1;overflow:hidden;display:flex;flex-direction:column;">
                        <div id="logContent" style="flex:1;overflow-y:auto;overflow-x:hidden;background:#1a1a2e;color:#e0e0e0;padding:16px;font-family:monospace;font-size:12px;">
                            로그 연결 중...
                        </div>
                    </div>
                    <div class="modal-footer" style="flex-shrink:0;border-top:1px solid #333;">
                        <button class="btn btn-default" onclick="refreshLogs()">🔄 새로고침</button>
                        <button class="btn ${state.logPaused ? 'btn-success' : 'btn-warning'}" onclick="toggleLogPause()" id="logPauseBtn">
                            ${state.logPaused ? '▶ 재생' : '❚❚ 일시중지'}
                        </button>
                        <button class="btn btn-default" onclick="clearLogView()">🗑 지우기</button>
                        <button class="btn btn-primary" onclick="closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'barcode') {
        const { barcode, name, email, phone } = state.modal;
        const displayName = name || email.split('@')[0];
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:400px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>바코드 - ${displayName}</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="text-align:center;">
                        <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #e8e8e8;">
                            <canvas id="barcodeModalCanvas"></canvas>
                            <div style="margin-top:12px;font-family:monospace;font-size:16px;letter-spacing:2px;color:#333;">
                                ${barcode}
                            </div>
                        </div>
                        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
                            <button class="btn btn-default" onclick="copyText('${barcode}')">📋 바코드 복사</button>
                            <button class="btn btn-primary" onclick="downloadBarcode('${barcode}', '${displayName.replace(/'/g, "\\'")}', '${(phone || '').replace(/'/g, "\\'")}')">⬇ 다운로드</button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'google-sheets-config') {
        const cfg = state.gsheetsConfig || {};
        return `
            <div class="modal-overlay" onclick="closeModal()">
                <div class="modal" style="width:560px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>구글시트 연동 설정</h3>
                        <button class="modal-close" onclick="closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom:16px;">
                            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">서비스 계정 JSON 키 파일</label>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <button class="btn btn-default" onclick="selectGSheetsKeyFile()" style="white-space:nowrap;">파일 선택</button>
                                <span id="gsheetsKeyFileName" style="font-size:12px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                    ${cfg.serviceAccountEmail ? `✅ ${cfg.serviceAccountEmail}` : '선택된 파일 없음'}
                                </span>
                            </div>
                            <input type="hidden" id="gsheetsKeyContent" value="">
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">스프레드시트 URL 또는 ID</label>
                            <input type="text" id="gsheetsSpreadsheetId" value="${cfg.spreadsheetId || ''}"
                                placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit 또는 시트 ID"
                                style="width:100%;padding:8px 12px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;">
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">시트 이름</label>
                            <input type="text" id="gsheetsSheetName" value="${cfg.sheetName || 'Sheet1'}"
                                placeholder="Sheet1"
                                style="width:100%;padding:8px 12px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;">
                        </div>
                        <div style="padding:12px;background:#f6f8fa;border-radius:6px;font-size:12px;color:#666;">
                            <strong>설정 방법:</strong><br>
                            1. Google Cloud Console에서 서비스 계정 생성 후 JSON 키 다운로드<br>
                            2. 구글 시트에서 서비스 계정 이메일을 편집자로 공유<br>
                            3. 위에 시트 URL과 시트 이름 입력 후 저장
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onclick="closeModal()">취소</button>
                        <button class="btn btn-primary-dark" onclick="saveGSheetsConfig()">저장</button>
                    </div>
                </div>
            </div>
        `;
    }

    return '';
}

// ========== 필터 및 정렬 함수 ==========

function hasActiveFilters() {
    return state.filters.status !== null ||
        state.filters.emailType !== null ||
        state.filters.minPoints !== '' ||
        state.filters.maxPoints !== '' ||
        state.filters.hasCoupon !== null ||
        state.filters.birthdayMonths.length > 0 ||
        state.filters.couponTypes.length > 0 ||
        state.filters.fetchStatus !== null ||
        state.filters.issueStatus !== null ||
        state.filters.expiringCoupon ||
        state.filters.has100kCoupon ||
        state.filters.has100kCoupon2Plus ||
        state.filters.no100kCoupon ||
        state.filters.coupon100kCount !== null ||
        state.filters.coupon50kCount !== null ||
        state.filters.coupon100kExpiryBefore !== '' ||
        state.filters.coupon100kExpiryAfter !== '' ||
        state.filters.fetchBefore !== '' ||
        state.filters.fetchAfter !== '' ||
        state.filters.issueBefore !== '';
}

function getActiveFilterCount() {
    let count = 0;
    if (state.filters.status !== null) count++;
    if (state.filters.emailType !== null) count++;
    if (state.filters.minPoints !== '') count++;
    if (state.filters.maxPoints !== '') count++;
    if (state.filters.hasCoupon !== null) count++;
    if (state.filters.fetchStatus !== null) count++;
    if (state.filters.issueStatus !== null) count++;
    if (state.filters.expiringCoupon) count++;
    if (state.filters.has100kCoupon) count++;
    if (state.filters.has100kCoupon2Plus) count++;
    if (state.filters.no100kCoupon) count++;
    if (state.filters.coupon100kCount !== null) count++;
    if (state.filters.coupon50kCount !== null) count++;
    if (state.filters.coupon100kExpiryBefore !== '') count++;
    if (state.filters.coupon100kExpiryAfter !== '') count++;
    if (state.filters.fetchBefore !== '') count++;
    if (state.filters.fetchAfter !== '') count++;
    if (state.filters.issueBefore !== '') count++;
    count += state.filters.birthdayMonths.length;
    count += state.filters.couponTypes.length;
    return count;
}

function showFilterModal() {
    state.modal = 'filter';
    render();
}

// 필터 패널 토글
function toggleFilterPanel() {
    state.filterPanelOpen = !state.filterPanelOpen;
    render();
}

// 확장형 필터 패널 렌더링
function renderFilterExpandPanel() {
    const availableCouponTypes = getAvailableCouponTypes();

    return `
        <div class="filter-expand-panel ${state.filterPanelOpen ? 'open' : ''}">
            <div class="filter-expand-header">
                <div class="filter-expand-title" style="cursor:pointer;" onclick="toggleFilterPanel()">
                    <span class="total-count">전체 (${getFilteredAndSortedAccounts().length}개)</span>
                    <span style="color:#999;font-size:12px;">∧</span>
                </div>
                <button class="filter-expand-close" onclick="toggleFilterPanel()">×</button>
            </div>

            <!-- 계정 상태 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">계정 상태</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.status === null ? 'active' : ''}" onclick="toggleFilter('status', null)">전체</button>
                    <button class="filter-link ${state.filters.status === true ? 'active' : ''}" onclick="toggleFilter('status', true)">활성</button>
                    <button class="filter-link ${state.filters.status === false ? 'active' : ''}" onclick="toggleFilter('status', false)">비활성</button>
                </div>
            </div>

            <!-- 이메일 유형 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">이메일 유형</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.emailType === null ? 'active' : ''}" onclick="toggleFilter('emailType', null)">전체</button>
                    <button class="filter-link ${state.filters.emailType === 'official' ? 'active' : ''}" onclick="toggleFilter('emailType', 'official')">공식 이메일</button>
                    <button class="filter-link ${state.filters.emailType === 'catchall' ? 'active' : ''}" onclick="toggleFilter('emailType', 'catchall')">캐치올</button>
                </div>
            </div>

            <!-- 조회 현황 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">조회 현황</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.fetchStatus === null ? 'active' : ''}" onclick="toggleFilter('fetchStatus', null)">전체</button>
                    <button class="filter-link ${state.filters.fetchStatus === 'completed' ? 'active' : ''}" onclick="toggleFilter('fetchStatus', 'completed')">조회완료</button>
                    <button class="filter-link ${state.filters.fetchStatus === 'pending' ? 'active' : ''}" onclick="toggleFilter('fetchStatus', 'pending')">미조회</button>
                    <button class="filter-link ${state.filters.fetchStatus === 'password_wrong' ? 'active' : ''}" onclick="toggleFilter('fetchStatus', 'password_wrong')">비밀번호 오류</button>
                    <button class="filter-link ${state.filters.fetchStatus === 'error' ? 'active' : ''}" onclick="toggleFilter('fetchStatus', 'error')">기타 오류</button>

                    <div class="filter-date-wrapper">
                        <label>조회일 이후:</label>
                        <input type="date" value="${state.filters.fetchAfter}" onchange="setDateFilter('fetchAfter', this.value)">
                        ${state.filters.fetchAfter ? `<button class="clear-btn" onclick="setDateFilter('fetchAfter', '')">✕</button>` : ''}
                    </div>
                    <div class="filter-date-wrapper">
                        <label>조회일 이전:</label>
                        <input type="date" value="${state.filters.fetchBefore}" onchange="setDateFilter('fetchBefore', this.value)">
                        ${state.filters.fetchBefore ? `<button class="clear-btn" onclick="setDateFilter('fetchBefore', '')">✕</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- 발급 현황 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">발급 현황</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.issueStatus === null ? 'active' : ''}" onclick="toggleFilter('issueStatus', null)">전체</button>
                    <button class="filter-link ${state.filters.issueStatus === 'success' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'success')">발급완료</button>
                    <button class="filter-link ${state.filters.issueStatus === 'pending' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'pending')">미발급</button>
                    <button class="filter-link ${state.filters.issueStatus === 'warning' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'warning')">포인트 부족</button>
                    <button class="filter-link ${state.filters.issueStatus === 'password_wrong' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'password_wrong')">비밀번호 오류</button>
                    <button class="filter-link ${state.filters.issueStatus === 'error' ? 'active' : ''}" onclick="toggleFilter('issueStatus', 'error')">발급 오류</button>

                    <div class="filter-date-wrapper">
                        <label>발급일 이전:</label>
                        <input type="date" value="${state.filters.issueBefore}" onchange="setDateFilter('issueBefore', this.value)">
                        ${state.filters.issueBefore ? `<button class="clear-btn" onclick="setDateFilter('issueBefore', '')">✕</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- 쿠폰 보유 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">쿠폰 보유</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.hasCoupon === null ? 'active' : ''}" onclick="toggleFilter('hasCoupon', null)">전체</button>
                    <button class="filter-link ${state.filters.hasCoupon === true ? 'active' : ''}" onclick="toggleFilter('hasCoupon', true)">보유</button>
                    <button class="filter-link ${state.filters.hasCoupon === false ? 'active' : ''}" onclick="toggleFilter('hasCoupon', false)">미보유</button>
                </div>
            </div>

            <!-- 10만원 상품권 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">10만원 상품권</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${!state.filters.has100kCoupon && !state.filters.has100kCoupon2Plus && !state.filters.no100kCoupon ? 'active' : ''}" onclick="set100kFilter(null)">전체</button>
                    <button class="filter-link ${state.filters.has100kCoupon ? 'active' : ''}" onclick="set100kFilter('has')">있음</button>
                    <button class="filter-link ${state.filters.has100kCoupon2Plus ? 'active' : ''}" onclick="set100kFilter('2plus')">2장↑</button>
                    <button class="filter-link ${state.filters.no100kCoupon ? 'active' : ''}" onclick="set100kFilter('no')">없음</button>
                </div>
            </div>

            <!-- 10만원권 수량 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">10만원권 수량</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.coupon100kCount === null ? 'active' : ''}" onclick="setCouponCountFilter('100k', null)">전체</button>
                    <button class="filter-link ${state.filters.coupon100kCount === 1 ? 'active' : ''}" onclick="setCouponCountFilter('100k', 1)">1장</button>
                    <button class="filter-link ${state.filters.coupon100kCount === 2 ? 'active' : ''}" onclick="setCouponCountFilter('100k', 2)">2장</button>
                    <button class="filter-link ${state.filters.coupon100kCount === 3 ? 'active' : ''}" onclick="setCouponCountFilter('100k', 3)">3장</button>
                    <button class="filter-link ${state.filters.coupon100kCount === 0 ? 'active' : ''}" onclick="setCouponCountFilter('100k', 0)">0장</button>
                </div>
            </div>

            <!-- 5만원권 수량 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">5만원권 수량</div>
                <div class="filter-expand-content">
                    <button class="filter-link ${state.filters.coupon50kCount === null ? 'active' : ''}" onclick="setCouponCountFilter('50k', null)">전체</button>
                    <button class="filter-link ${state.filters.coupon50kCount === 1 ? 'active' : ''}" onclick="setCouponCountFilter('50k', 1)">1장</button>
                    <button class="filter-link ${state.filters.coupon50kCount === 2 ? 'active' : ''}" onclick="setCouponCountFilter('50k', 2)">2장</button>
                    <button class="filter-link ${state.filters.coupon50kCount === 3 ? 'active' : ''}" onclick="setCouponCountFilter('50k', 3)">3장</button>
                    <button class="filter-link ${state.filters.coupon50kCount === 0 ? 'active' : ''}" onclick="setCouponCountFilter('50k', 0)">0장</button>
                </div>
            </div>

            <!-- 10만원 쿠폰 만료일 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">10만원 만료일</div>
                <div class="filter-expand-content">
                    <div class="filter-date-group">
                        <input type="date" value="${state.filters.coupon100kExpiryBefore}" onchange="setDateFilter('coupon100kExpiryBefore', this.value)">
                        ${state.filters.coupon100kExpiryBefore ? `<button class="clear-btn" onclick="setDateFilter('coupon100kExpiryBefore', '')">✕</button>` : ''}
                    </div>
                    <span class="filter-hint">이전</span>
                    <span class="filter-separator-text">/</span>
                    <div class="filter-date-group">
                        <input type="date" value="${state.filters.coupon100kExpiryAfter}" onchange="setDateFilter('coupon100kExpiryAfter', this.value)">
                        ${state.filters.coupon100kExpiryAfter ? `<button class="clear-btn" onclick="setDateFilter('coupon100kExpiryAfter', '')">✕</button>` : ''}
                    </div>
                    <span class="filter-hint">이후</span>
                </div>
            </div>

            <!-- 포인트 범위 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">포인트</div>
                <div class="filter-expand-content">
                    <div class="filter-range-wrapper">
                        <input type="number" placeholder="최소" value="${state.filters.minPoints}" oninput="setFilterValue('minPoints', this.value)">
                        <span>~</span>
                        <input type="number" placeholder="최대" value="${state.filters.maxPoints}" oninput="setFilterValue('maxPoints', this.value)">
                        <span>P</span>
                    </div>
                </div>
            </div>

            <!-- 생일 월 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">생일 월</div>
                <div class="filter-expand-content">
                    ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
                        <button class="filter-month-btn ${state.filters.birthdayMonths.includes(m) ? 'active' : ''}" onclick="toggleBirthdayMonth(${m})">${m}월</button>
                    `).join('')}
                </div>
            </div>

            ${availableCouponTypes.length > 0 ? `
            <!-- 쿠폰 종류 -->
            <div class="filter-expand-row">
                <div class="filter-expand-label">쿠폰 종류</div>
                <div class="filter-expand-content">
                    ${availableCouponTypes.map(({ type, label, count }) => `
                        <button class="filter-coupon-btn ${state.filters.couponTypes.includes(type) ? 'active' : ''}" onclick="toggleCouponType('${type.replace(/'/g, "\\'")}')">
                            ${label} <span class="count">${count}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

function toggleFilter(key, value) {
    state.filters[key] = value;
    state.currentPage = 1;
    render();
}

// 포인트 필터 디바운스 타이머
let filterDebounceTimer = null;

function setFilterValue(key, value) {
    state.filters[key] = value;
    state.currentPage = 1;

    // 디바운스: 입력 중에는 렌더링하지 않고, 입력 멈추면 렌더링
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }
    filterDebounceTimer = setTimeout(() => {
        render();
    }, 500);
}

// 날짜 필터 설정 (조회일/발급일 이전 필터)
function setDateFilter(key, value) {
    state.filters[key] = value;
    state.currentPage = 1;
    render();
}

function toggleBirthdayMonth(month) {
    const idx = state.filters.birthdayMonths.indexOf(month);
    if (idx >= 0) {
        state.filters.birthdayMonths.splice(idx, 1);
    } else {
        state.filters.birthdayMonths.push(month);
    }
    state.currentPage = 1;
    render();
}

function toggleCouponType(type) {
    const idx = state.filters.couponTypes.indexOf(type);
    if (idx >= 0) {
        state.filters.couponTypes.splice(idx, 1);
    } else {
        state.filters.couponTypes.push(type);
    }
    state.currentPage = 1;
    render();
}

function getCouponTypeName(type) {
    // type이 이제 쿠폰 표시명 자체이므로 그대로 반환
    return type;
}

function getFetchStatusName(status) {
    switch (status) {
        case 'completed': return '조회완료';
        case 'pending': return '미조회';
        case 'password_wrong': return '비밀번호 오류';
        case 'error': return '기타 오류';
        default: return status;
    }
}

// 실제 보유 쿠폰에서 쿠폰 종류 동적 추출 - getCouponDisplayInfo() 활용
// count는 쿠폰 개수가 아닌 해당 쿠폰을 보유한 계정 수
function getAvailableCouponTypes() {
    const types = new Map(); // displayName -> { icon, color, sortValue, accountIds: Set }

    state.accounts.forEach(acc => {
        const vouchers = parseVouchers(acc.owned_vouchers);
        const accountCouponTypes = new Set(); // 이 계정이 보유한 쿠폰 종류 (중복 방지)

        vouchers.forEach(v => {
            const couponInfo = getCouponDisplayInfo(v.description);
            const key = couponInfo.name;
            accountCouponTypes.add(key);

            if (!types.has(key)) {
                types.set(key, {
                    icon: couponInfo.icon,
                    color: couponInfo.color,
                    sortValue: couponInfo.sortValue,
                    isPercent: couponInfo.name.includes('%'),
                    isVoucher: couponInfo.name.includes('원 상품권'),
                    accountIds: new Set()
                });
            }
        });

        // 이 계정이 보유한 각 쿠폰 종류에 대해 계정 ID 추가
        accountCouponTypes.forEach(couponType => {
            if (types.has(couponType)) {
                types.get(couponType).accountIds.add(acc.id);
            }
        });
    });

    // Map을 배열로 변환
    const result = [];
    types.forEach((value, name) => {
        result.push({
            type: name,
            label: name,
            icon: value.icon,
            color: value.color,
            sortValue: value.sortValue,
            isPercent: value.isPercent,
            isVoucher: value.isVoucher,
            count: value.accountIds.size  // 계정 수
        });
    });

    // 정렬: 금액 상품권 (큰 것부터) → % 할인권 (큰 것부터) → 기타 (가나다순)
    result.sort((a, b) => {
        // 1. 금액 상품권이 최우선 (큰 금액부터)
        if (a.isVoucher && !b.isVoucher) return -1;
        if (!a.isVoucher && b.isVoucher) return 1;
        if (a.isVoucher && b.isVoucher) {
            return b.sortValue - a.sortValue; // 금액 높은 순
        }

        // 2. % 할인권이 두 번째 (큰 %부터)
        if (a.isPercent && !b.isPercent) return -1;
        if (!a.isPercent && b.isPercent) return 1;
        if (a.isPercent && b.isPercent) {
            return b.sortValue - a.sortValue; // % 높은 순
        }

        // 3. 기타는 가나다순
        return a.label.localeCompare(b.label, 'ko');
    });

    return result;
}

function clearAllFilters() {
    state.filters = {
        minPoints: '',
        maxPoints: '',
        birthdayMonths: [],
        couponTypes: [],
        hasCoupon: null,
        status: null,
        emailType: null,
        fetchStatus: null,
        issueStatus: null,
        expiringCoupon: false,
        has100kCoupon: false,
        has100kCoupon2Plus: false,
        no100kCoupon: false,
        coupon100kCount: null,
        coupon50kCount: null,
        coupon100kExpiryBefore: '',
        coupon100kExpiryAfter: '',
        fetchBefore: '',
        fetchAfter: '',
        issueBefore: '',
    };
    state.currentPage = 1;
    render();
}

// 만료 예정 쿠폰 필터 토글
function toggleExpiringCouponFilter() {
    state.filters.expiringCoupon = !state.filters.expiringCoupon;
    if (state.filters.expiringCoupon) {
        state.filters.has100kCoupon = false;
        state.filters.has100kCoupon2Plus = false;
        state.filters.no100kCoupon = false;
    }
    state.currentPage = 1;
    render();
}

// 10만원 쿠폰 보유 필터 토글
function toggle100kCouponFilter() {
    state.filters.has100kCoupon = !state.filters.has100kCoupon;
    if (state.filters.has100kCoupon) {
        state.filters.expiringCoupon = false;
        state.filters.has100kCoupon2Plus = false; // 상호 배타
        state.filters.no100kCoupon = false; // 상호 배타
    }
    state.currentPage = 1;
    render();
}

// 10만원 상품권 필터 설정 (필터 패널용)
function set100kFilter(value) {
    // 모든 10만원 관련 필터 초기화
    state.filters.has100kCoupon = false;
    state.filters.has100kCoupon2Plus = false;
    state.filters.no100kCoupon = false;

    if (value === 'has') {
        state.filters.has100kCoupon = true;
    } else if (value === '2plus') {
        state.filters.has100kCoupon2Plus = true;
    } else if (value === 'no') {
        state.filters.no100kCoupon = true;
    }
    // value === null 이면 모두 false (전체)

    state.currentPage = 1;
    render();
}

// 쿠폰 수량 필터 설정
function setCouponCountFilter(type, count) {
    if (type === '100k') {
        state.filters.coupon100kCount = count;
    } else if (type === '50k') {
        state.filters.coupon50kCount = count;
    }
    state.currentPage = 1;
    render();
}

// 전체 활성 계정 정보 조회
async function bulkExtractAll() {
    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        return;
    }

    const activeAccounts = state.accounts.filter(a => a.is_active);
    if (activeAccounts.length === 0) {
        alert('활성화된 계정이 없습니다.');
        return;
    }

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    if (!confirm(`[${modeLabel}] 전체 활성 계정 ${activeAccounts.length}개의 정보를 조회하시겠습니까?`)) {
        return;
    }

    const ids = activeAccounts.map(a => a.id);
    try {
        const result = await api('/extract/bulk', { method: 'POST', body: { ids } });
        alert(result.message);
        // 모니터링 팝업 열기
        await openMonitor('extract', '정보 조회 현황', activeAccounts);
    } catch (error) {
        alert('정보 조회 요청 실패: ' + error.message);
    }
}

// 전체 활성 계정 쿠폰 발급 모달
function showBulkIssueCouponModal() {
    const activeAccounts = state.accounts.filter(a => a.is_active);
    if (activeAccounts.length === 0) {
        alert('활성화된 계정이 없습니다.');
        return;
    }

    // 전체 활성 계정을 선택 상태로 설정하고 기존 모달 활용
    state.bulkIssueAllActive = true;
    state.selectedIssueCouponTypes = []; // 선택 초기화
    state.modal = 'issue-coupon';
    render();
}

// 전체 활성 계정 쿠폰 발급 실행 - couponTypes: 배열 또는 단일값
async function issueCouponForAllActive(couponTypes) {
    closeModal();

    // 배열로 정규화
    const couponTypesArray = Array.isArray(couponTypes) ? couponTypes : [couponTypes];
    const couponNames = { '10000': '1만원권', '30000': '3만원권', '50000': '5만원권', '100000': '10만원권' };
    const couponTypesStr = couponTypesArray.map(ct => couponNames[ct] || `${ct}원`).join(', ');

    // 모바일 모드일 때 Appium 실행 확인
    if (state.extractMode === 'mobile') {
        await checkMobileStatus();
        if (!state.mobileConnected) {
            notifyWarning('모바일 발급을 위해 먼저 모바일 연결을 해주세요.');
            state.bulkIssueAllActive = false;
            return;
        }
    }

    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        state.bulkIssueAllActive = false;
        return;
    }

    const activeAccounts = state.accounts.filter(a => a.is_active);
    const ids = activeAccounts.map(a => a.id);

    const modeLabel = ({ web: '웹', web_incognito: '웹(시크릿)', mobile: '모바일', hybrid: '웹+모바일' }[state.extractMode] || '웹');
    state.bulkIssueAllActive = false;
    openMonitor('issue', `[${modeLabel}] 쿠폰 일괄 발급 (${couponTypesStr})`, activeAccounts);

    try {
        await api('/issue-coupon/bulk', {
            method: 'POST',
            body: { ids, coupon_types: couponTypesArray, mode: state.extractMode }
        });
    } catch (error) {
        notifyError('쿠폰 발급 실패: ' + error.message);
    }
}

function toggleSort(column) {
    if (state.sort.column === column) {
        if (state.sort.direction === 'asc') {
            state.sort.direction = 'desc';
        } else {
            // 정렬 해제
            state.sort.column = null;
            state.sort.direction = 'asc';
        }
    } else {
        state.sort.column = column;
        state.sort.direction = 'asc';
    }
    render();
}

function renderSortIcon(column) {
    if (state.sort.column !== column) {
        return '<span class="sort-icon inactive">⇅</span>';
    }
    return state.sort.direction === 'asc'
        ? '<span class="sort-icon active asc">▲</span>'
        : '<span class="sort-icon active desc">▼</span>';
}

// ========== 이벤트 핸들러 ==========

// 검색 debounce 타이머
let searchDebounceTimer = null;
let isComposing = false; // 한글 IME 조합 중인지 여부

function updateSearch(value) {
    state.searchText = value;
    state.currentPage = 1;

    // 한글 조합 중이면 render하지 않음
    if (isComposing) return;

    // debounce로 render 호출
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(() => {
        renderTableOnly();
    }, 100);
}

// 테이블만 렌더링 (검색창 유지)
function renderTableOnly() {
    const tableBody = document.querySelector('.table-container table tbody');

    if (tableBody) {
        const filtered = getFilteredAndSortedAccounts();
        const effectivePageSize = state.pageSize === 'all' ? filtered.length : state.pageSize;
        const startIndex = (state.currentPage - 1) * effectivePageSize;
        const pageAccounts = state.pageSize === 'all' ? filtered : filtered.slice(startIndex, startIndex + effectivePageSize);
        const startNum = startIndex + 1;
        tableBody.innerHTML = pageAccounts.map((acc, idx) => renderAccountRow(acc, startNum + idx)).join('');

        // 페이지네이션 업데이트
        const totalPages = effectivePageSize > 0 ? Math.ceil(filtered.length / effectivePageSize) : 1;
        let paginationEl = document.querySelector('.pagination');

        if (totalPages > 1) {
            const paginationHtml = `
                <button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)">«</button>
                <button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">‹</button>
                <span style="margin: 0 16px;">${state.currentPage} / ${totalPages}</span>
                <button ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">›</button>
                <button ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})">»</button>
            `;
            if (paginationEl) {
                paginationEl.innerHTML = paginationHtml;
            }
        } else if (paginationEl) {
            paginationEl.innerHTML = '';
        }
    }
}

function goToPage(page) {
    state.currentPage = page;
    renderPreservingScroll();
}

function changePageSize(value) {
    if (value === 'custom') {
        // 직접 입력 선택 시 기본값 설정 후 렌더링
        state.pageSize = 30;
        state.currentPage = 1;
        render();
        // 입력 필드에 포커스
        setTimeout(() => {
            const input = document.querySelector('.page-size-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    } else if (value === 'all') {
        // 전체 보기
        state.pageSize = 'all';
        state.currentPage = 1;
        render();
    } else {
        const size = parseInt(value);
        if (size > 0 && size <= 9999) {
            state.pageSize = size;
            state.currentPage = 1;
            render();
        }
    }
}

function toggleSelect(id, checked) {
    if (checked) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }
    renderPreservingScroll();
}

function toggleSelectAll(checked) {
    // 필터링 및 정렬이 적용된 계정 목록 사용
    const filteredAccounts = getFilteredAndSortedAccounts();

    const effectivePageSize = state.pageSize === 'all' ? filteredAccounts.length : state.pageSize;
    const start = (state.currentPage - 1) * effectivePageSize;
    const pageAccounts = state.pageSize === 'all' ? filteredAccounts : filteredAccounts.slice(start, start + effectivePageSize);

    if (checked) {
        pageAccounts.forEach(acc => state.selectedIds.add(acc.id));
    } else {
        pageAccounts.forEach(acc => state.selectedIds.delete(acc.id));
    }
    renderPreservingScroll();
}

// 스크롤 위치를 유지하면서 렌더링
function renderPreservingScroll() {
    // 현재 스크롤 위치 저장 (여러 요소 체크)
    const tableContainer = document.querySelector('.table-container');
    const mainContent = document.querySelector('.main-content');
    const appElement = document.getElementById('app');

    const scrollPositions = {
        tableContainer: tableContainer?.scrollTop || 0,
        mainContent: mainContent?.scrollTop || 0,
        app: appElement?.scrollTop || 0,
        window: window.scrollY || window.pageYOffset || 0
    };

    render();

    // 렌더링 후 스크롤 위치 복원 (여러 번 시도)
    const restoreScroll = () => {
        const newTableContainer = document.querySelector('.table-container');
        const newMainContent = document.querySelector('.main-content');
        const newAppElement = document.getElementById('app');

        if (newTableContainer && scrollPositions.tableContainer > 0) {
            newTableContainer.scrollTop = scrollPositions.tableContainer;
        }
        if (newMainContent && scrollPositions.mainContent > 0) {
            newMainContent.scrollTop = scrollPositions.mainContent;
        }
        if (newAppElement && scrollPositions.app > 0) {
            newAppElement.scrollTop = scrollPositions.app;
        }
        if (scrollPositions.window > 0) {
            window.scrollTo(0, scrollPositions.window);
        }
    };

    // 즉시 실행 + requestAnimationFrame + setTimeout으로 여러 번 시도
    restoreScroll();
    requestAnimationFrame(restoreScroll);
    setTimeout(restoreScroll, 0);
    setTimeout(restoreScroll, 50);
}

function showAccountRegisterMenu() {
    state.modal = 'registerMenu';
    render();
}

// 쿠폰 판매 처리 모달
function showBulkSoldModal() {
    state.modal = 'bulk-sold';
    render();
}

// 쿠폰 종류 선택 (판매 처리용)
function selectSoldCouponType(btn, couponType) {
    // 기존 선택 해제
    document.querySelectorAll('#app .filter-coupon-btn').forEach(b => b.classList.remove('active'));
    // 새로 선택
    btn.classList.add('active');
    document.getElementById('selectedSoldCouponType').value = couponType;
}

// 일괄 판매 처리 실행
async function processBulkSold() {
    const emailsText = document.getElementById('bulkSoldEmails').value.trim();
    const couponType = document.getElementById('selectedSoldCouponType').value;

    if (!emailsText) {
        notifyWarning('이메일을 입력해주세요.');
        return;
    }

    if (!couponType) {
        notifyWarning('쿠폰 종류를 선택해주세요.');
        return;
    }

    // 이메일 파싱 (줄바꿈, 쉼표, 공백 등으로 구분)
    const emails = emailsText
        .split(/[\n,\s]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));

    if (emails.length === 0) {
        notifyWarning('유효한 이메일이 없습니다.');
        return;
    }

    // 계정 찾기
    const results = {
        success: [],
        notFound: [],
        noCoupon: []
    };

    for (const email of emails) {
        const account = state.accounts.find(a => a.email.toLowerCase() === email);
        if (!account) {
            results.notFound.push(email);
            continue;
        }

        // 해당 쿠폰 찾기 (인덱스 필요)
        const vouchers = parseVouchers(account.owned_vouchers);
        let targetIndex = -1;
        for (let i = 0; i < vouchers.length; i++) {
            const v = vouchers[i];
            const info = getCouponDisplayInfo(v.description);
            if (info.name === couponType && !v.sold) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            results.noCoupon.push(email);
            continue;
        }

        // 판매 완료 처리 API 호출
        try {
            await api(`/accounts/${account.id}/voucher-sale`, {
                method: 'POST',
                body: { voucher_index: targetIndex, sold: true, sold_to: '' }
            });
            results.success.push(email);
        } catch (error) {
            console.error(`판매 처리 실패: ${email}`, error);
            results.noCoupon.push(email);
        }
    }

    // 결과 표시
    let messageHtml = `<div style="text-align:left;line-height:1.8;">`;
    messageHtml += `<div style="font-size:15px;margin-bottom:12px;"><strong>✅ 성공: ${results.success.length}건</strong></div>`;
    if (results.notFound.length > 0) {
        messageHtml += `<div style="color:#ff4d4f;margin-bottom:8px;">❌ 계정 없음: ${results.notFound.length}건</div>`;
        messageHtml += `<div style="font-size:11px;color:#999;margin-bottom:8px;max-height:80px;overflow-y:auto;">${results.notFound.join('<br>')}</div>`;
    }
    if (results.noCoupon.length > 0) {
        messageHtml += `<div style="color:#faad14;margin-bottom:8px;">⚠️ 쿠폰 없음/처리실패: ${results.noCoupon.length}건</div>`;
        messageHtml += `<div style="font-size:11px;color:#999;max-height:80px;overflow-y:auto;">${results.noCoupon.join('<br>')}</div>`;
    }
    messageHtml += `</div>`;

    await showConfirm({
        title: '판매 처리 완료',
        message: messageHtml,
        confirmText: '확인',
        cancelText: '닫기',
        type: 'info'
    });

    if (results.success.length > 0) {
        closeModal();
        await loadAccounts();
    }
}

function showAddModal() {
    state.modal = 'add';
    state.editingAccount = null;
    render();
}

function showEditModal(id) {
    state.modal = 'edit';
    state.editingAccount = state.accounts.find(a => a.id === id);
    render();
}

function showBulkPasteModal() {
    state.modal = 'bulk';
    render();
}

function showVoucherModal(accountId, voucherIndex, voucher) {
    state.modal = 'voucher';
    state.voucherData = { accountId, voucherIndex, voucher };
    render();
}

function toggleCoupons(accId) {
    const hiddenList = document.querySelector(`.coupon-hidden-list[data-acc-id="${accId}"]`);
    const expandContainer = document.querySelector(`.coupon-expand-container[data-acc-id="${accId}"]`);

    if (!expandContainer || !hiddenList) return;

    const isExpanded = hiddenList.classList.contains('show');

    if (isExpanded) {
        // 접기
        hiddenList.classList.remove('show');
        expandContainer.classList.remove('expanded');
    } else {
        // 펼치기
        hiddenList.classList.add('show');
        expandContainer.classList.add('expanded');
    }
}

// 쿠폰 코드 클립보드 복사
function copyCouponCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        notifySuccess('쿠폰 코드가 복사되었습니다: ' + code);
    }).catch(err => {
        console.error('복사 실패:', err);
        notifyError('복사 실패');
    });
}

function showBarcodeModal(barcode, name, email, phone) {
    state.modal = { type: 'barcode', barcode, name, email, phone };
    render();
    // 모달 렌더링 후 canvas에 바코드 그리기
    requestAnimationFrame(() => {
        const canvas = document.getElementById('barcodeModalCanvas');
        if (canvas && barcode) {
            try {
                JsBarcode(canvas, barcode, {
                    format: 'CODE128',
                    width: 2,
                    height: 80,
                    displayValue: false,
                    margin: 10,
                });
            } catch (e) {
                console.error('모달 바코드 생성 실패:', e);
            }
        }
    });
}

// 토글 스위치 라벨 업데이트
function updateToggleLabel(toggleSwitch) {
    const checkbox = toggleSwitch.querySelector('input[type="checkbox"]');
    const statusSpan = toggleSwitch.querySelector('.toggle-status');
    if (checkbox && statusSpan) {
        statusSpan.textContent = checkbox.checked ? 'ON' : 'OFF';
    }
}

function closeModal() {
    // 로그 모달 닫을 때 WebSocket 연결 정리
    if (state.modal && state.modal.type === 'log') {
        disconnectLogWebSocket();
    }
    state.modal = null;
    state.editingAccount = null;
    state.voucherData = null;
    state.bulkIssueAllActive = false;
    render();
}

function submitAccountForm() {
    const form = document.getElementById('accountForm');
    const formData = new FormData(form);

    const data = {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name') || null,
        birthday: formData.get('birthday') || null,
        phone: formData.get('phone') || null,
        adikr_barcode: formData.get('adikr_barcode') || null,
        memo: formData.get('memo') || null,
        is_active: form.querySelector('[name="is_active"]').checked,
    };

    saveAccount(data);
}

let parsedBulkAccounts = [];

function parseBulkText() {
    const text = document.getElementById('bulkText').value;
    const lines = text.trim().split('\n');
    parsedBulkAccounts = [];

    for (const line of lines) {
        if (!line.trim()) continue;

        const cleanLine = line.replace(/\(기존\)/g, '').trim();

        // 콤마 구분 형식 감지: 이메일,비밀번호,이름,전화번호,생년월일
        if (cleanLine.includes(',')) {
            const parts = cleanLine.split(',').map(p => p.trim()).filter(p => p);
            if (parts.length >= 5) {
                const email = parts[0];
                const password = parts[1];
                const name = parts[2];
                const phoneRaw = parts[3].replace(/\s+/g, '');
                const phone = phoneRaw.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                const birthdayParts = parts.slice(4).join(' ').trim().split(/\s+/);
                let birthday = '';
                if (birthdayParts.length >= 3) {
                    birthday = `${birthdayParts[0].padStart(4, '0')}-${birthdayParts[1].padStart(2, '0')}-${birthdayParts[2].padStart(2, '0')}`;
                } else if (birthdayParts.length === 1 && birthdayParts[0].includes('-')) {
                    birthday = birthdayParts[0];
                }
                parsedBulkAccounts.push({ name, email, password, phone, birthday });
            } else if (parts.length >= 2) {
                parsedBulkAccounts.push({ name: '', email: parts[0], password: parts[1], phone: '', birthday: '' });
            }
            continue;
        }

        // 기존 탭/공백 구분 형식: 이름  이메일  비밀번호  전화번호  생년월일
        const parts = cleanLine.split(/\t+|\s{2,}/).map(p => p.trim()).filter(p => p);

        if (parts.length >= 5) {
            const name = parts[0];
            const email = parts[1];
            const password = parts[2];
            const phoneRaw = parts[3].replace(/\s+/g, '');
            const phone = phoneRaw.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
            const birthdayParts = parts.slice(4).join(' ').trim().split(/\s+/);
            let birthday = '';
            if (birthdayParts.length >= 3) {
                birthday = `${birthdayParts[0].padStart(4, '0')}-${birthdayParts[1].padStart(2, '0')}-${birthdayParts[2].padStart(2, '0')}`;
            }
            parsedBulkAccounts.push({ name, email, password, phone, birthday });
        } else if (parts.length >= 2) {
            parsedBulkAccounts.push({ name: '', email: parts[0], password: parts[1], phone: '', birthday: '' });
        }
    }

    document.getElementById('bulkCount').textContent = parsedBulkAccounts.length;

    const tbody = document.querySelector('#bulkPreview tbody');
    tbody.innerHTML = parsedBulkAccounts.map(acc => `
        <tr>
            <td>${acc.name}</td>
            <td>${acc.email}</td>
            <td>${acc.password}</td>
            <td>${acc.phone}</td>
            <td>${acc.birthday}</td>
        </tr>
    `).join('');
}

function submitBulkAccounts() {
    if (parsedBulkAccounts.length === 0) {
        notifyWarning('데이터를 입력하세요');
        return;
    }
    bulkUpsertAccounts(parsedBulkAccounts);
}

function saveVoucherSale(accountId, voucherIndex, sold) {
    const soldTo = document.getElementById('voucherSoldTo').value;
    updateVoucherSale(accountId, voucherIndex, sold, soldTo);
}

function copyText(text) {
    navigator.clipboard.writeText(text);
    notifySuccess('복사됨', 1500);
}

// 선택된 계정의 이메일 목록 추출
function extractEmailList() {
    if (state.selectedIds.size === 0) {
        notifyWarning('계정을 선택하세요');
        return;
    }
    const emails = state.accounts
        .filter(acc => state.selectedIds.has(acc.id))
        .map(acc => acc.email)
        .join('\n');
    navigator.clipboard.writeText(emails);
    notifySuccess(`${state.selectedIds.size}개 이메일이 복사되었습니다`);
}

// Electron IPC
const { ipcRenderer } = require('electron');

// 모바일 연결 상태 변경 이벤트 수신
ipcRenderer.on('mobile-connect-status', (event, data) => {
    state.mobileConnecting = data.connecting || false;
    state.mobileConnected = data.connected || false;
    if (data.error) {
        notifyError(data.message);
    } else if (data.connected) {
        notifySuccess(data.message);
    } else if (data.message) {
        notifyInfo(data.message);
    }
    render();
});

// 모바일 연결 진행 상태 이벤트 수신
ipcRenderer.on('mobile-connect-progress', (event, data) => {
    if (data.step) {
        notifyInfo(data.message);
    }
});

// 모바일 연결 (에뮬레이터 실행 → ADB 연결 → Appium 실행)
async function connectMobile() {
    if (state.mobileConnected) {
        // 이미 연결됨 - 연결 해제
        ipcRenderer.invoke('disconnect-mobile');
        state.mobileConnected = false;
        state.mobileConnecting = false;
        state.mobileDeviceType = null;
        state.mobileUdid = null;
        render();
        return;
    }

    state.mobileConnecting = true;
    render();

    try {
        const result = await ipcRenderer.invoke('connect-mobile');
        state.mobileConnecting = false;
        state.mobileConnected = result.success;
        state.mobileDeviceType = result.deviceType || null;
        state.mobileUdid = result.udid || null;

        if (result.success) {
            if (result.deviceType === 'real_phone') {
                notifySuccess(`실제 폰 연결 완료 (${result.udid})`);
            } else {
                notifySuccess('에뮬레이터 연결 완료');
            }
        } else {
            notifyError(result.error || '모바일 연결 실패');
        }
    } catch (e) {
        state.mobileConnecting = false;
        state.mobileConnected = false;
        notifyError('모바일 연결 오류: ' + e.message);
    }
    render();
}

// 기존 Appium 함수 호환성 유지 (내부적으로 connectMobile 사용)
function startAppiumServer() {
    connectMobile();
}

// ========== 바코드 다운로드 ==========

async function downloadBarcode(barcode, name, phone) {
    if (!barcode) return;

    const confirmed = await showConfirm({
        title: '바코드 다운로드',
        message: `${name || '계정'}의 바코드를 다운로드하시겠습니까?`,
        confirmText: '다운로드',
        type: 'info'
    });
    if (!confirmed) return;

    try {
        const blob = await generateBarcodeBlob(barcode);

        // 파일명: 이름_전화번호_아디다스_바코드.png
        const phonePart = phone ? `_${phone.replace(/-/g, '')}` : '';
        const fileName = `${name || 'unknown'}${phonePart}_아디다스_${barcode}.png`;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        notifySuccess('바코드 다운로드 완료');
    } catch (error) {
        notifyError('바코드 다운로드 실패: ' + error.message);
    }
}

async function bulkDownloadBarcodes() {
    // 선택된 계정만 처리
    if (state.selectedIds.size === 0) {
        notifyWarning('바코드를 다운로드할 계정을 선택하세요');
        return;
    }

    const accounts = state.accounts.filter(a => state.selectedIds.has(a.id) && a.adikr_barcode);

    if (accounts.length === 0) {
        notifyWarning('선택한 계정 중 바코드가 있는 계정이 없습니다');
        return;
    }

    if (typeof JSZip === 'undefined') {
        notifyError('JSZip 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        return;
    }

    const confirmed = await showConfirm({
        title: '바코드 다운로드',
        message: `${accounts.length}개의 바코드를 ZIP 파일로 다운로드하시겠습니까?`,
        confirmText: '다운로드',
        type: 'info'
    });
    if (!confirmed) return;

    notifyInfo(`${accounts.length}개 바코드 다운로드 중...`, 5000);

    try {
        const zip = new JSZip();
        let successCount = 0;

        for (const acc of accounts) {
            try {
                const blob = await generateBarcodeBlob(acc.adikr_barcode);
                // 파일명: 이름_전화번호_아디다스_바코드.png
                const name = acc.name || acc.email.split('@')[0];
                const phonePart = acc.phone ? `_${acc.phone.replace(/-/g, '')}` : '';
                const fileName = `${name}${phonePart}_아디다스_${acc.adikr_barcode}.png`;
                zip.file(fileName, blob);
                successCount++;
            } catch (e) {
                console.error(`바코드 다운로드 실패: ${acc.adikr_barcode}`, e);
            }
        }

        if (successCount === 0) {
            notifyError('바코드 다운로드에 실패했습니다.');
            return;
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `barcodes_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        notifySuccess(`${successCount}개 바코드 ZIP 다운로드 완료!`);
    } catch (error) {
        notifyError('바코드 다운로드 실패: ' + error.message);
    }
}

// ========== 컬럼 리사이즈 ==========

function initColumnResize() {
    const table = document.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('th.resizable');

    headers.forEach(header => {
        header.addEventListener('mousedown', (e) => {
            // 오른쪽 5px 영역에서만 리사이즈 시작
            const rect = header.getBoundingClientRect();
            if (e.clientX < rect.right - 8) return;

            e.preventDefault();
            const startX = e.clientX;
            const startWidth = header.offsetWidth;

            function onMouseMove(e) {
                const newWidth = Math.max(30, startWidth + (e.clientX - startX));
                header.style.width = newWidth + 'px';
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

// ========== 프로그램 설치 패널 ==========

// 설치 상태 추적 (앱 실행 중에만 유지)
const installStatus = {
    web: false,
    mobile: false,
    details: null // 상세 설치 정보
};

// 앱 시작 시 설치 상태 확인
async function checkInstallStatus() {
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        try {
            const result = await ipcRenderer.invoke('check-install-status');
            installStatus.web = result.web.allInstalled;
            installStatus.mobile = result.mobile.allInstalled;
            installStatus.details = result;
            console.log('[Install Check] Web:', installStatus.web, 'Mobile:', installStatus.mobile);
            console.log('[Install Check] Details:', result);
            render();
        } catch (error) {
            console.error('[Install Check] Error:', error);
        }
    }
}

function toggleInstallPanel() {
    state.showInstallPanel = !state.showInstallPanel;
    render();
}

// 웹+모바일 버튼용 툴팁 메시지 생성
function getMissingInstallTooltip() {
    const missing = [];
    if (!installStatus.web) missing.push('웹크롤러');
    if (!installStatus.mobile) missing.push('모바일크롤러');
    if (missing.length === 0) return '';
    return missing.join(', ') + ' 설치 필요';
}

function showInstallRequired(type) {
    let message = '';
    let installerType = '';

    if (type === 'web') {
        message = '웹 브라우저 모드를 사용하려면 웹 크롤러를 먼저 설치해야 합니다.';
        installerType = 'web';
    } else if (type === 'mobile') {
        message = '모바일 모드를 사용하려면 모바일 크롤러를 먼저 설치해야 합니다.\n(현재 준비 중)';
        installerType = 'mobile';
    } else if (type === 'both') {
        const missing = [];
        if (!installStatus.web) missing.push('웹 크롤러');
        if (!installStatus.mobile) missing.push('모바일 크롤러');
        message = `웹+모바일 모드를 사용하려면 ${missing.join(', ')}를 먼저 설치해야 합니다.`;
        installerType = !installStatus.web ? 'web' : 'mobile';
    }

    // 설치 패널 열고 알림 표시
    state.showInstallPanel = true;
    render();
    notifyWarning(message);
}

async function runInstaller(type) {
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        try {
            const result = await ipcRenderer.invoke('run-installer', type);
            if (result.success) {
                notifySuccess(result.message + ' 설치 완료 후 상태가 업데이트됩니다.');
                // 설치 완료까지 주기적으로 상태 체크 (바로 true로 설정하지 않음)
                // 5초 후부터 10초마다 체크, 최대 5분간
                let checkCount = 0;
                const maxChecks = 30;
                const checkInterval = setInterval(async () => {
                    checkCount++;
                    try {
                        const status = await ipcRenderer.invoke('check-install-status');
                        if (type === 'web' && status.web.allInstalled) {
                            installStatus.web = true;
                            clearInterval(checkInterval);
                            render();
                            notifySuccess('웹 크롤러 설치가 완료되었습니다!');
                        } else if (type === 'mobile' && status.mobile.allInstalled) {
                            installStatus.mobile = true;
                            clearInterval(checkInterval);
                            render();
                            notifySuccess('모바일 연결 프로그램 설치가 완료되었습니다!');
                        }
                    } catch (e) {
                        console.error('설치 상태 확인 오류:', e);
                    }
                    if (checkCount >= maxChecks) {
                        clearInterval(checkInterval);
                    }
                }, 10000); // 10초마다 체크
            } else {
                notifyError(result.error);
            }
        } catch (error) {
            notifyError('설치 실행 오류: ' + error.message);
        }
    } else {
        notifyError('Electron 환경에서만 사용 가능합니다.');
    }
}

// ========== 초기화 ==========

document.addEventListener('DOMContentLoaded', async () => {
    loadAccounts();
    loadExtractMode();
    loadGSheetsConfig();
    checkInstallStatus(); // 프로그램 설치 상태 확인
    await checkAppiumStatus(); // Appium 실행 상태 확인
});

// 모바일 연결 상태 확인 (에뮬레이터 + ADB + Appium)
async function checkMobileStatus() {
    try {
        const result = await ipcRenderer.invoke('check-mobile-status');
        const wasConnected = state.mobileConnected;
        state.mobileConnected = result.allConnected;
        state.mobileDeviceType = result.deviceType || null;
        state.mobileUdid = result.udid || null;

        // 상태가 변경된 경우에만 렌더링
        if (wasConnected !== state.mobileConnected) {
            render();
        }
    } catch (e) {
        console.error('모바일 연결 상태 확인 실패:', e);
        state.mobileConnected = false;
    }
}

// 이전 함수명과 호환성 유지
async function checkAppiumStatus() {
    return checkMobileStatus();
}

// 모바일 연결 상태 주기적 확인 (5초마다)
let mobileStatusInterval = null;
function startMobileStatusPolling() {
    if (mobileStatusInterval) return;
    mobileStatusInterval = setInterval(checkMobileStatus, 5000);
}

function stopMobileStatusPolling() {
    if (mobileStatusInterval) {
        clearInterval(mobileStatusInterval);
        mobileStatusInterval = null;
    }
}

// 앱 시작 시 모바일 상태 폴링 시작
if (typeof ipcRenderer !== 'undefined') {
    startMobileStatusPolling();
}

// 렌더링 후 컬럼 리사이즈 초기화
const originalRender = render;
render = function() {
    originalRender();
    setTimeout(initColumnResize, 0);
};

// 검색창 엔터키 이벤트 위임 (전역)
document.addEventListener('keyup', function(e) {
    if (e.target && (e.target.id === 'searchInput' || e.target.classList.contains('search-input')) && e.key === 'Enter') {
        e.preventDefault();
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }
        state.searchText = e.target.value;
        state.currentPage = 1;
        renderTableOnly();
    }
});

// ========== 로그 모달 기능 ==========

let logRefreshInterval = null;

function showLogModal() {
    state.modal = { type: 'log' };
    state.logPaused = false;
    render();

    // 로그 즉시 로드
    setTimeout(() => {
        loadLogs();
        // 2초마다 자동 새로고침
        logRefreshInterval = setInterval(() => {
            if (!state.logPaused) {
                loadLogs();
            }
        }, 2000);
    }, 100);
}

function loadLogs() {
    const logContent = document.getElementById('logContent');
    if (!logContent) return;

    fetch('http://localhost:8003/api/logs')
        .then(res => res.json())
        .then(logs => {
            if (!Array.isArray(logs)) return;

            logContent.innerHTML = '';
            logs.forEach(log => {
                const line = document.createElement('div');
                line.style.cssText = 'padding:2px 0;border-bottom:1px solid #333;word-break:break-all;';

                const msg = log.message || '';
                if (msg.startsWith('[PY]')) {
                    line.style.color = '#69b1ff';
                } else if (msg.startsWith('[PY-ERR]')) {
                    line.style.color = '#ff7875';
                } else if (msg.includes('성공')) {
                    line.style.color = '#95de64';
                } else if (msg.includes('오류') || msg.includes('실패')) {
                    line.style.color = '#ff7875';
                }

                line.textContent = `[${log.timestamp}] ${msg}`;
                logContent.appendChild(line);
            });

            logContent.scrollTop = logContent.scrollHeight;
        })
        .catch(err => {
            console.error('로그 로드 실패:', err);
            logContent.innerHTML = '<div style="color:#ff7875;">로그 로드 실패: ' + err.message + '</div>';
        });
}

function disconnectLogWebSocket() {
    if (logRefreshInterval) {
        clearInterval(logRefreshInterval);
        logRefreshInterval = null;
    }
}

function refreshLogs() {
    loadLogs();
}

function toggleLogPause() {
    state.logPaused = !state.logPaused;
    const btn = document.getElementById('logPauseBtn');
    if (btn) {
        btn.textContent = state.logPaused ? '▶ 재생' : '❚❚ 일시중지';
        btn.className = state.logPaused ? 'btn btn-success' : 'btn btn-warning';
    }
}

function clearLogView() {
    const logContent = document.getElementById('logContent');
    if (logContent) {
        logContent.innerHTML = '';
    }
}

function showGuideModal() {
    state.modal = { type: 'guide' };
    render();
}
