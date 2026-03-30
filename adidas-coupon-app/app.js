/**
 * 아디다스 쿠폰 관리자 - 프론트엔드 앱
 */

const API_BASE = 'http://localhost:8003/api';

// 개발 모드 플래그 (배포 시 false로 변경)
const DEV_MODE = false;

// 앱 버전
const APP_VERSION = '2.1.0';

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

// 현재 로그인 사용자
let currentUser = JSON.parse(localStorage.getItem('couponAppUser') || 'null');

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
    extractMode: 'playwright_incognito', // 기본값: Playwright(시크릿)
    accountDelay: 10, // 계정 간 대기시간 (초)
    // 필터링
    openFilterPopover: null, // 현재 열린 필터 팝오버 이름 (null이면 모두 닫힘)
    filters: {
        minPoints: '',
        maxPoints: '',
        birthdayMonths: [], // [1, 2, 3, ...]
        couponTypes: [], // ['10만원 상품권', '5만원 상품권', ...] - 복수 선택 가능
        hasCoupon: [], // [true], [false], [true, false] - 복수 선택 가능
        excludeSoldCoupon: false, // 사용완료 쿠폰 제외
        status: [true], // [true], [false], [true, false] - 기본값: 활성만
        workStatuses: [], // ['completed', 'error', ...] - 복수 선택 가능
        expiringCoupon: false, // 만료 예정 쿠폰 보유 계정만
        has100kCoupon: false, // 10만원 쿠폰 보유 계정만 (통계 카드용)
        dateBefore: '', // 조회일시 이전 (YYYY-MM-DD)
        dateAfter: '', // 조회일시 이후 (YYYY-MM-DD)
        emailTypes: [], // ['official', 'catchall'] - 복수 선택 가능
        levels: [], // ['Level 1', 'Level 2', 'none', ...] - 복수 선택 가능
        createdAfter: '', // 추가일 이후 (YYYY-MM-DD)
        createdBefore: '', // 추가일 이전 (YYYY-MM-DD)
        couponFetchedAfter: '', // 쿠폰 발급일 이후 (YYYY-MM-DD)
        couponFetchedBefore: '', // 쿠폰 발급일 이전 (YYYY-MM-DD)
        barcodeList: '', // 바코드 리스트 필터 (줄바꿈 구분)
        emailList: '', // 이메일 리스트 필터 (줄바꿈 구분)
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

// 조회 상태에서 날짜 파싱 (예: "[웹] 조회 완료 12/28 14:30")
function parseDateFromStatus(webStatus) {
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

    return parseStatusDate(webStatus);
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
    // 판매완료/사용완료 (100,000원 판매완료 할인 형태)
    } else if (desc.includes('판매완료')) {
        return { name: '사용완료', shortName: '사용완료', color: GREEN, icon: '✅', sortValue: 0 };
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

// 쿠폰 카테고리 분류 (테이블 컬럼용)
const COUPON_CATEGORIES = [
    { key: 'amount', label: 'N만원권', match: n => n.includes('원 상품권') },
    { key: 'percent', label: '%할인권', match: n => n.includes('% 할인') },
];

function categorizeVouchers(vouchers) {
    const result = {};
    COUPON_CATEGORIES.forEach(c => { result[c.key] = []; });
    result.etc = [];
    vouchers.forEach(v => {
        const info = getCouponDisplayInfo(v.description);
        const cat = COUPON_CATEGORIES.find(c => c.match(info.name));
        if (cat) {
            result[cat.key].push(v);
        } else {
            result.etc.push(v);
        }
    });
    return result;
}

// 카테고리별 쿠폰 셀 렌더링 (간략)
function renderCategoryCouponCell(acc, vouchers) {
    if (vouchers.length === 0) return '<span style="color:#ccc;">-</span>';
    return vouchers.map(v => {
        const expiryText = v.expiry && v.expiry !== 'N/A' ? v.expiry.slice(5).replace('-', '/') : '';
        const fetchedText = v.fetched_at ? v.fetched_at.replace(/[\[\]]/g, '').slice(0, 8) : '';
        const isSold = v.sold;
        const isDeleted = v.deleted_unused;
        const isCouponExpired = isExpired(v.expiry);
        const isExpiringSoon = isExpiringWithinWeek(v.expiry);
        let cls = 'cat-coupon';
        if (isDeleted) cls += ' deleted-unused';
        else if (isSold) cls += ' sold';
        else if (isCouponExpired) cls += ' expired';
        else if (isExpiringSoon) cls += ' expiring-soon';
        const code = v.code || '';
        const soldTag = isSold ? `<span class="cat-sold">사용</span>` : '';
        const deletedTag = isDeleted ? `<span class="cat-deleted">삭제</span>` : '';
        return `<div class="${cls}" onclick="copyCouponCode('${code}')" title="${v.description || ''}&#10;코드: ${code}&#10;만료: ${v.expiry || 'N/A'}${fetchedText ? '&#10;발급: ' + fetchedText : ''}">
            <span class="cat-code">${code || '-'}</span>
            ${soldTag}${deletedTag}
            <span class="cat-dates">${fetchedText ? fetchedText + ' ~ ' : ''}${expiryText || '-'}</span>
        </div>`;
    }).join('');
}

// 쿠폰 정렬: 유효>만료>판매됨>미사용삭제, 같은 그룹 내에서는 가치 높은 순
function sortVouchers(vouchers) {
    return [...vouchers].sort((a, b) => {
        // 0. 미사용 삭제 여부 (미사용 삭제 최하위)
        if (a.deleted_unused !== b.deleted_unused) return a.deleted_unused ? 1 : -1;
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
        // 발급일자: fetched_at 있으면 사용, 없으면 만료일 한달 전 (연도 제외 MM/DD)
        let issuedText = '';
        if (v.fetched_at) {
            // [YY-MM-DD HH:MM] → MM/DD
            const m = v.fetched_at.match(/\d{2}-(\d{2})-(\d{2})/);
            issuedText = m ? m[1] + '/' + m[2] : '';
        } else if (v.expiry && v.expiry !== 'N/A') {
            const ed = new Date(v.expiry);
            ed.setMonth(ed.getMonth() - 1);
            issuedText = String(ed.getMonth()+1).padStart(2,'0') + '/' + String(ed.getDate()).padStart(2,'0');
        }
        let cardClass = 'coupon-card';
        if (v.deleted_unused) {
            cardClass += ' deleted-unused';
        } else if (v.sold) {
            cardClass += ' sold';
        } else if (isCouponExpired) {
            cardClass += ' expired';
        } else if (isExpiringSoon) {
            cardClass += ' expiring-soon';
        }
        const originalIndex = v._originalIndex;
        const voucherJson = JSON.stringify(v).replace(/"/g, '&quot;');

        const deletedTag = v.deleted_unused ? '<span class="deleted-unused-tag">미사용삭제</span>' : '';
        const soldOverlay = v.sold ? '<div class="coupon-sold-overlay">사용완료' + (v.sold_to ? ' (' + v.sold_to + ')' : '') + '</div>' : '';
        const soldToTag = (!v.sold && v.sold_to) ? '<div class="coupon-card-memo">' + v.sold_to + '</div>' : '';
        let rightContent;
        if (v.deleted_unused && v.deleted_at) {
            rightContent = '<div class="coupon-card-expiry">' + v.deleted_at.replace(/[\[\]]/g, '') + '</div>';
        } else {
            rightContent = (issuedText ? '<div class="coupon-card-issued">' + issuedText + '</div>' : '') +
                (expiryText ? '<div class="coupon-card-expiry">~' + expiryText + '</div>' : '<div class="coupon-card-expiry">-</div>');
        }

        return '<div class="' + cardClass + '" ' +
            'onclick="showVoucherModal(\'' + acc.id + '\', ' + originalIndex + ', ' + voucherJson + ')" ' +
            'title="' + v.description + '&#10;코드: ' + (v.code || 'N/A') + '&#10;만료: ' + (v.expiry || 'N/A') + (v.deleted_unused ? '&#10;상태: 미사용 삭제' : '') + '">' +
            '<div class="coupon-card-left">' +
                soldOverlay +
                '<div class="coupon-card-top">' +
                    '<img src="adidas_2.png" alt="adidas" class="coupon-card-logo">' +
                    '<div class="coupon-card-amount">' + (couponInfo.shortName || couponInfo.name) + deletedTag + '</div>' +
                '</div>' +
                (couponCode ? '<div class="coupon-card-code" onclick="event.stopPropagation(); copyCouponCode(\'' + couponCode + '\')">' + couponCode + '<span class="copy-icon">📋</span></div>' : '') +
                soldToTag +
            '</div>' +
            '<div class="coupon-card-right">' +
                rightContent +
            '</div>' +
        '</div>';
    };

    if (hasMultiple) {
        let html = '<div class="coupon-wrapper">' +
            '<div class="coupon-main">' +
                '<span class="coupon-count-badge">' + sortedVouchers.length + '개</span>' +
                renderSingleCard(firstVoucher) +
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

// 조회 현황 표시
// 상태 문자열에서 날짜/시간과 상태 추출
function parseStatus(status) {
    if (!status) return { text: '-', datetime: '', statusType: 'none' };

    // 날짜+시간 형식으로 변환
    let datetime = '';

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    // [YY-MM-DD HH:MM] 형식 파싱 (예: [25-01-01 14:30])
    const fullMatch = status.match(/\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/);
    if (fullMatch) {
        const year = '20' + fullMatch[1];
        const month = fullMatch[2];
        const day = fullMatch[3];
        const hour = fullMatch[4];
        const minute = fullMatch[5];
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const dayName = dayNames[d.getDay()];
        datetime = `${year}/${month}/${day}(${dayName}) ${hour}:${minute}`;
    } else {
        // MM/DD HH:MM 형식 파싱 (예: 12/28 14:30)
        const shortMatch = status.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (shortMatch) {
            const month = shortMatch[1].padStart(2, '0');
            const day = shortMatch[2].padStart(2, '0');
            const hour = shortMatch[3].padStart(2, '0');
            const minute = shortMatch[4];
            const now = new Date();
            const d = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day));
            const dayName = dayNames[d.getDay()];
            datetime = `${now.getFullYear()}/${month}/${day}(${dayName}) ${hour}:${minute}`;
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
        // [웹브라우저]/[웹브라우저(시크릿)] 태그 제거하고 상세 내용만 추출
        shortText = status.replace(/\[(웹브라우저\(시크릿\)|웹브라우저|웹\(시크릿\)|웹)\]\s*/g, '').replace(/\[\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}\]/, '').trim();
    } else if (status.includes('완료')) {
        statusType = 'success';
        shortText = '완료';
    } else if (status.includes('비밀번호 틀림') || status.includes('비밀번호')) {
        statusType = 'password_wrong';  // 비밀번호 오류는 별도 상태 (주황색)
        shortText = '비밀번호 오류';
    } else if (status.includes('차단') || status.includes('BOT') || status.includes('API_BLOCKED')) {
        statusType = 'error';
        shortText = '차단';
    } else if (status.includes('포인트 부족')) {
        statusType = 'warning';
        shortText = '포인트 부족';
    } else if (status.includes('버튼 없음')) {
        statusType = 'warning';
        shortText = '버튼 없음';
    } else if (status.includes('1달 미경과') || status.includes('미경과')) {
        statusType = 'warning';
        shortText = '1달 미경과';
    } else if (status.includes('실패') || status.includes('오류') || status.includes('에러') || status.toLowerCase().includes('methodnotallowed')) {
        statusType = 'error';
        shortText = status.toLowerCase().includes('methodnotallowed') ? 'API 오류' : '오류';
    } else if (status.includes('대기')) {
        statusType = 'waiting';
        shortText = '대기';
    } else {
        shortText = '-';
    }

    return { text: shortText, datetime, statusType };
}

// 최근 작업 결과 선택 (정보조회/쿠폰발급 중 최신 1개)
function pickLatestStatus(webFetchStatus, webIssueStatus) {
    const fetchParsed = parseStatus(webFetchStatus);
    const issueParsed = parseStatus(webIssueStatus);

    if (fetchParsed.statusType === 'none' && issueParsed.statusType === 'none') {
        return { parsed: { text: '-', datetime: '', statusType: 'none' }, raw: '' };
    }

    // 진행중은 항상 우선, 그 외에는 발급 > 조회 순
    if (fetchParsed.statusType === 'processing') return { parsed: fetchParsed, raw: webFetchStatus };
    if (issueParsed.statusType === 'processing') return { parsed: issueParsed, raw: webIssueStatus };
    if (issueParsed.statusType !== 'none') return { parsed: issueParsed, raw: webIssueStatus };
    return { parsed: fetchParsed, raw: webFetchStatus };
}

// 현황 컬럼 렌더링
function renderStatusCell(webFetchStatus, webIssueStatus) {
    const { parsed, raw } = pickLatestStatus(webFetchStatus, webIssueStatus);
    if (parsed.statusType === 'none') return '<span style="color:#999;">-</span>';

    const colorMap = {
        success: '#52c41a', error: '#ff4d4f', warning: '#faad14',
        password_wrong: '#ff7f00', processing: '#111', waiting: '#8c8c8c'
    };
    const color = colorMap[parsed.statusType] || '#666';

    // 다중 쿠폰 상태 (쉼표 구분)
    const isMultiCoupon = raw && (raw.includes('만원권') || raw.includes('원권')) && raw.includes(',');
    if (isMultiCoupon) {
        let clean = raw.replace(/\[(웹브라우저\(시크릿\)|웹브라우저|웹\(시크릿\)|웹)\]\s*/g, '').replace(/\[\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}\]/, '').trim();
        const parts = clean.split(',').map(s => s.trim());
        const getColor = (p) => {
            if (p.includes('발급 완료')) return '#52c41a';
            if (p.includes('1달 미경과') || p.includes('포인트 부족')) return '#faad14';
            if (p.includes('실패') || p.includes('오류') || p.toLowerCase().includes('method')) return '#ff4d4f';
            return '#666';
        };
        return parts.map(p => `<div style="color:${getColor(p)};font-size:13px;font-weight:600;white-space:normal;">${p}</div>`).join('');
    }

    return `<span style="color:${color};font-size:13px;font-weight:600;white-space:normal;">${parsed.text}</span>`;
}

// 조회일시 컬럼 렌더링
function renderDatetimeCell(webFetchStatus, webIssueStatus) {
    const { parsed } = pickLatestStatus(webFetchStatus, webIssueStatus);
    if (!parsed.datetime) return '<span style="color:#999;">-</span>';
    // "26-03-26 18:21" → 날짜와 시간을 줄바꿈
    const parts = parsed.datetime.split(' ');
    if (parts.length === 2) {
        return `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;line-height:1.4;">${parts[0]}<br>${parts[1]}</div>`;
    }
    return `<span style="font-size:11px;font-weight:500;color:#333;">${parsed.datetime}</span>`;
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
            const activeCoupons = vouchers.filter(v => !v.sold && !v.deleted_unused);

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

// 쿠폰 목록 엑셀 추출 (온라인용 - 사용완료 포함 전체)
async function exportCouponListToExcel() {
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

            if (vouchers.length === 0) {
                rows.push({
                    '이메일': acc.email || '',
                    '비밀번호': acc.password || '',
                    '쿠폰명': '',
                    '쿠폰코드': '',
                    '만료일': '',
                    '상태': '쿠폰 없음',
                });
            } else {
                for (const v of vouchers) {
                    const couponInfo = getCouponDisplayInfo(v.description);
                    let status = '보유';
                    if (v.sold) status = '사용완료';
                    else if (v.deleted_unused) status = '사용완료';
                    else if (v.expiry && isExpired(v.expiry)) status = '만료';

                    rows.push({
                        '이메일': acc.email || '',
                        '비밀번호': acc.password || '',
                        '쿠폰명': couponInfo.name,
                        '쿠폰코드': v.code || '',
                        '만료일': v.expiry || '',
                        '상태': status,
                    });
                }
            }
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        ws['!cols'] = [
            { wch: 30 }, // 이메일
            { wch: 20 }, // 비밀번호
            { wch: 20 }, // 쿠폰명
            { wch: 25 }, // 쿠폰코드
            { wch: 12 }, // 만료일
            { wch: 10 }, // 상태
        ];

        XLSX.utils.book_append_sheet(wb, ws, '쿠폰목록');

        const defaultName = `쿠폰목록_온라인_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const result = await ipcRenderer.invoke('show-save-dialog', {
            title: '쿠폰 목록 엑셀 저장',
            defaultPath: defaultName,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled || !result.filePath) return;

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        fs.writeFileSync(result.filePath, buf);
        notifySuccess(`${selectedAccounts.length}개 계정의 쿠폰 목록을 저장했습니다 (전체 ${rows.length}건)`);
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
        message: `선택한 ${state.selectedIds.size}개 계정의 쿠폰을 구글시트에 동기화합니다.\n(사용 완료 쿠폰은 제외)`,
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

async function extractAccountInfo(id, skipConfirm = false) {
    // 단건 정보조회도 모니터링 표시
    const account = state.accounts.find(acc => acc.id === id);
    if (!account) {
        notifyError('계정을 찾을 수 없습니다');
        return;
    }

    if (!skipConfirm) {
        const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
        const confirmed = await showConfirm({
            title: '정보 조회',
            message: `[${modeLabel}] ${account.email} 계정의 정보를 조회하시겠습니까?`,
            confirmText: '조회',
            type: 'info'
        });
        if (!confirmed) return;
    }

    openMonitor('extract', '정보 조회', [account]);

    try {
        await api(`/extract/${id}`, { method: 'POST' });
    } catch (error) {
        notifyError('정보 조회 실패: ' + error.message);
    }
}

async function bulkExtract(skipConfirm = false) {
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

    const ids = Array.from(state.selectedIds);
    const accounts = ids.map(id => state.accounts.find(acc => acc.id === id)).filter(Boolean);

    if (!skipConfirm) {
        const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
        const confirmed = await showConfirm({
            title: '정보 일괄 조회',
            message: `[${modeLabel}] 선택한 ${accounts.length}개 계정의 정보를 조회하시겠습니까?`,
            confirmText: '조회',
            type: 'info'
        });
        if (!confirmed) return;
    }

    openMonitor('extract', '정보 일괄 조회', accounts);
    state.selectedIds.clear();

    try {
        await api('/extract/bulk', {
            method: 'POST',
            body: { ids, actionBy: currentUser?.fullName }
        });
    } catch (error) {
        notifyError('일괄 조회 실패: ' + error.message);
    }
}

// 조회 및 발급 - 쿠폰 선택 모달 표시 (일괄)
function showIssueCouponModal() {
    if (state.selectedIds.size === 0) {
        notifyWarning('조회할 계정을 선택하세요');
        return;
    }
    state.selectedIssueCouponTypes = []; // 선택 초기화
    state.bulkIssueAllActive = false;
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

// 조회 및 발급 시작 (일괄)
async function startIssueCoupon() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        // 쿠폰 미선택 → 조회만 (selectedIds를 먼저 읽어둠)
        const ids = Array.from(state.selectedIds);
        const accounts = ids.map(id => state.accounts.find(acc => acc.id === id)).filter(Boolean);
        closeModal();

        if (accounts.length === 0) {
            notifyWarning('조회할 계정을 선택하세요');
            return;
        }

        // 중복 실행 방지
        await checkBatchStatus();
        if (state.batchStatus.active) {
            notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
            return;
        }

        openMonitor('extract', '정보 일괄 조회', accounts);
        state.selectedIds.clear();

        try {
            await api('/extract/bulk', { method: 'POST', body: { ids, actionBy: currentUser?.fullName } });
        } catch (error) {
            notifyError('일괄 조회 실패: ' + error.message);
        }
        return;
    }
    await issueCoupon(couponTypes);
}

// 조회 및 발급 시작 (전체 활성 계정)
async function startIssueCouponForAllActive() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        // 쿠폰 미선택 → 조회만
        const activeAccounts = state.accounts.filter(a => a.is_active);
        closeModal();

        if (activeAccounts.length === 0) {
            notifyWarning('활성화된 계정이 없습니다.');
            return;
        }

        // 중복 실행 방지
        await checkBatchStatus();
        if (state.batchStatus.active) {
            notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
            return;
        }

        const ids = activeAccounts.map(a => a.id);
        openMonitor('extract', '정보 일괄 조회', activeAccounts);

        try {
            await api('/extract/bulk', { method: 'POST', body: { ids, actionBy: currentUser?.fullName } });
        } catch (error) {
            notifyError('일괄 조회 실패: ' + error.message);
        }
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


    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        return;
    }

    const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
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
            body: { ids, coupon_types: couponTypesArray, mode: state.extractMode, actionBy: currentUser?.fullName }
        });
    } catch (error) {
        notifyError('쿠폰 발급 실패: ' + error.message);
    }
}

// 단일 계정 조회 및 발급 시작
async function startIssueCouponForAccount() {
    const couponTypes = [...state.selectedIssueCouponTypes];
    if (couponTypes.length === 0) {
        // 쿠폰 미선택 → 조회만 (accountId를 먼저 읽어둠)
        const accountId = state.singleIssueCouponAccountId;
        const account = state.accounts.find(acc => acc.id === accountId);
        closeModal();

        if (!account) {
            notifyError('계정을 찾을 수 없습니다');
            return;
        }

        openMonitor('extract', '정보 조회', [account]);
        try {
            await api(`/extract/${accountId}`, { method: 'POST' });
        } catch (error) {
            notifyError('정보 조회 실패: ' + error.message);
        }
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


    const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
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
        notifySuccess(sold ? '사용완료로 표시되었습니다' : '사용 취소되었습니다');
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
        const modeNames = { web: 'Selenium(기본)', web_incognito: 'Selenium(시크릿)', playwright: 'Playwright(기본)', playwright_incognito: 'Playwright(시크릿)', playwright_headless: 'PW(백그라운드)', playwright_headless_incognito: 'PW(백그라운드+시크릿)' };
        notifyInfo(`추출 모드: ${modeNames[mode] || mode}`);
        render();
    } catch (error) {
        notifyError('모드 변경 실패: ' + error.message);
    }
}


// 계정 간 대기시간 조회
async function loadAccountDelay() {
    try {
        const result = await api('/account-delay');
        state.accountDelay = result.delay;
    } catch (error) {
        console.error('대기시간 조회 실패:', error);
    }
}

// 계정 간 대기시간 변경
async function setAccountDelay(sec) {
    try {
        const result = await api('/account-delay', { method: 'POST', body: { delay: sec } });
        state.accountDelay = result.delay;
        notifyInfo(`계정 간 대기시간: ${sec}초`);
    } catch (error) {
        notifyError('대기시간 변경 실패: ' + error.message);
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
            acc.phone?.toLowerCase().includes(search) ||
            acc.adikr_barcode?.toLowerCase().includes(search)
        );
    }

    // 상태 필터 - 복수 선택
    if (state.filters.status.length > 0) {
        result = result.filter(acc => {
            const isActive = acc.is_active === true || acc.is_active === 1;
            return state.filters.status.includes(isActive);
        });
    }

    // 이메일 유형 필터 - 복수 선택
    if (state.filters.emailTypes.length > 0) {
        result = result.filter(acc => {
            const type = isOfficialEmail(acc.email) ? 'official' : 'catchall';
            return state.filters.emailTypes.includes(type);
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

    // 쿠폰 유무 필터 - 복수 선택
    if (state.filters.hasCoupon.length > 0) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            // 사용완료 제외 옵션이면 미사용 쿠폰만 카운트
            const effectiveVouchers = state.filters.excludeSoldCoupon
                ? vouchers.filter(v => !v.sold && !v.deleted_unused)
                : vouchers;
            const hasCoupon = effectiveVouchers.length > 0;
            return state.filters.hasCoupon.includes(hasCoupon);
        });
    }

    // 사용완료 쿠폰 제외 (hasCoupon 필터 없이 단독 사용 시)
    if (state.filters.excludeSoldCoupon && state.filters.hasCoupon.length === 0) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => !v.sold && !v.deleted_unused);
        });
    }

    // 쿠폰 종류 필터 (복수 선택) - getCouponDisplayInfo()의 name을 기준으로 필터링
    if (state.filters.couponTypes.length > 0) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => {
                const couponInfo = getCouponDisplayInfo(v.description);
                return state.filters.couponTypes.includes(couponInfo.name);
            });
        });
    }

    // 통합 현황 필터 - 복수 선택
    if (state.filters.workStatuses.length > 0) {
        result = result.filter(acc => {
            const status = getAccountWorkStatus(acc);
            return state.filters.workStatuses.includes(status);
        });
    }

    // adiClub 레벨 필터 - 복수 선택
    if (state.filters.levels.length > 0) {
        result = result.filter(acc => {
            if (!acc.adiclub_level) {
                return state.filters.levels.includes('none');
            }
            return state.filters.levels.includes(acc.adiclub_level);
        });
    }

    // 만료 예정 쿠폰 필터
    if (state.filters.expiringCoupon) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => isExpiringWithinWeek(v.expiry) && !isExpired(v.expiry));
        });
    }

    // 10만원 쿠폰 보유 필터 (통계 카드 클릭용)
    if (state.filters.has100kCoupon) {
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => {
                const desc = (v.description || '').toLowerCase();
                const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
                const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
                const notExpired = hasValidExpiry && !isExpired(v.expiry);
                const notSold = !v.sold && !v.deleted_unused;
                return is100k && hasValidExpiry && notExpired && notSold;
            });
        });
    }

    // 조회일시 기간 필터 (FROM/TO) - 조회/발급 중 최신 날짜 기준
    if (state.filters.dateAfter) {
        const filterDate = new Date(state.filters.dateAfter);
        filterDate.setHours(0, 0, 0, 0);
        result = result.filter(acc => {
            const statusDate = parseDateFromStatus(acc.web_fetch_status) || parseDateFromStatus(acc.web_issue_status);
            if (!statusDate) return false;
            return statusDate >= filterDate;
        });
    }
    if (state.filters.dateBefore) {
        const filterDate = new Date(state.filters.dateBefore);
        filterDate.setHours(23, 59, 59, 999);
        result = result.filter(acc => {
            const statusDate = parseDateFromStatus(acc.web_fetch_status) || parseDateFromStatus(acc.web_issue_status);
            if (!statusDate) return false;
            return statusDate <= filterDate;
        });
    }

    // 추가일 기간 필터
    if (state.filters.createdAfter) {
        const d = new Date(state.filters.createdAfter);
        d.setHours(0, 0, 0, 0);
        result = result.filter(acc => acc.created_at && new Date(acc.created_at) >= d);
    }
    if (state.filters.createdBefore) {
        const d = new Date(state.filters.createdBefore);
        d.setHours(23, 59, 59, 999);
        result = result.filter(acc => acc.created_at && new Date(acc.created_at) <= d);
    }

    // 쿠폰 발급일 기간 필터 (fetched_at 없으면 만료일-1개월을 발급일로 추정)
    function getVoucherIssuedDate(v) {
        if (v.fetched_at) {
            const m = v.fetched_at.match(/(\d{2})-(\d{2})-(\d{2})/);
            if (m) return new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        }
        if (v.expiry && v.expiry !== 'N/A') {
            const ed = new Date(v.expiry);
            ed.setMonth(ed.getMonth() - 1);
            return ed;
        }
        return null;
    }
    if (state.filters.couponFetchedAfter) {
        const d = new Date(state.filters.couponFetchedAfter);
        d.setHours(0, 0, 0, 0);
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => {
                const fd = getVoucherIssuedDate(v);
                return fd && fd >= d;
            });
        });
    }
    if (state.filters.couponFetchedBefore) {
        const d = new Date(state.filters.couponFetchedBefore);
        d.setHours(23, 59, 59, 999);
        result = result.filter(acc => {
            const vouchers = parseVouchers(acc.owned_vouchers);
            return vouchers.some(v => {
                const fd = getVoucherIssuedDate(v);
                return fd && fd <= d;
            });
        });
    }

    // 바코드 리스트 필터
    if (state.filters.barcodeList.trim()) {
        const barcodes = new Set(state.filters.barcodeList.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean));
        result = result.filter(acc => acc.adikr_barcode && barcodes.has(acc.adikr_barcode.toUpperCase()));
    }

    // 이메일 리스트 필터
    if (state.filters.emailList.trim()) {
        const emails = new Set(state.filters.emailList.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
        result = result.filter(acc => acc.email && emails.has(acc.email.toLowerCase()));
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
                case 'level':
                    // Level 1~4 숫자 추출, 없으면 0
                    const getLevelNum = (l) => { const m = (l || '').match(/\d+/); return m ? parseInt(m[0]) : 0; };
                    valA = getLevelNum(a.adiclub_level);
                    valB = getLevelNum(b.adiclub_level);
                    break;
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

    // 로그인 안 된 상태면 로그인 화면
    if (!currentUser) {
        app.innerHTML = renderLoginScreen();
        return;
    }

    // 필터링 및 정렬 적용
    const filteredAccounts = getFilteredAndSortedAccounts();

    // 페이지네이션
    const effectivePageSize = state.pageSize === 'all' ? filteredAccounts.length : state.pageSize;
    const totalPages = effectivePageSize > 0 ? Math.ceil(filteredAccounts.length / effectivePageSize) : 1;
    const start = (state.currentPage - 1) * effectivePageSize;
    const pageAccounts = state.pageSize === 'all' ? filteredAccounts : filteredAccounts.slice(start, start + effectivePageSize);

    // 통계 (전체 계정 기준 고정)
    const totalCount = state.accounts.length;
    const activeCount = state.accounts.filter(a => a.is_active).length;

    // 만료 예정 쿠폰 장수 (전체 계정, 7일 이내)
    let expiringCouponCount = 0;
    state.accounts.forEach(a => {
        const vouchers = parseVouchers(a.owned_vouchers);
        vouchers.forEach(v => {
            if (isExpiringWithinWeek(v.expiry) && !isExpired(v.expiry)) expiringCouponCount++;
        });
    });

    // 10만원 쿠폰 장수 (전체 계정, 유효+미판매)
    let has100kCouponCount = 0;
    state.accounts.forEach(a => {
        const vouchers = parseVouchers(a.owned_vouchers);
        vouchers.forEach(v => {
            const desc = (v.description || '').toLowerCase();
            const is100k = desc.includes('100k') || desc.includes('100000') || desc.includes('10만') || desc.includes('100,000');
            const hasValidExpiry = v.expiry && v.expiry !== 'N/A' && v.expiry.trim() !== '';
            const notExpired = hasValidExpiry && !isExpired(v.expiry);
            const notSold = !v.sold;
            if (is100k && notExpired && notSold) has100kCouponCount++;
        });
    });

    app.innerHTML = `
        <!-- 헤더 -->
        <div class="header">
            <h1><img src="adidas.png" alt="adidas" style="height:28px;margin-right:10px;vertical-align:middle;filter:brightness(0) invert(1);"> 아디다스 쿠폰 관리 <span class="version-badge">v${APP_VERSION}</span></h1>
            <div class="header-actions">
                <div class="mode-buttons">
                    <span class="mode-label">모드:</span>
                    <select class="mode-select" onchange="setExtractMode(this.value)" style="padding:6px 10px;font-size:14px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer;">
                        <option value="playwright_incognito" ${state.extractMode === 'playwright_incognito' ? 'selected' : ''}>Playwright (시크릿)</option>
                        <option value="playwright" ${state.extractMode === 'playwright' ? 'selected' : ''}>Playwright (기본)</option>
                        <option value="playwright_headless_incognito" ${state.extractMode === 'playwright_headless_incognito' ? 'selected' : ''}>Playwright (BG+시크릿)</option>
                        <option value="playwright_headless" ${state.extractMode === 'playwright_headless' ? 'selected' : ''}>Playwright (BG)</option>
                        <option value="web_incognito" ${state.extractMode === 'web_incognito' ? 'selected' : ''} ${!installStatus.web ? 'disabled' : ''}>Selenium (시크릿)</option>
                        <option value="web" ${state.extractMode === 'web' ? 'selected' : ''} ${!installStatus.web ? 'disabled' : ''}>Selenium (기본)</option>
                    </select>
                    <span class="mode-label" style="margin-left:8px;">대기:</span>
                    <select class="delay-select" onchange="setAccountDelay(this.value)" style="padding:6px 10px;font-size:14px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer;">
                        <option value="0" ${state.accountDelay == 0 ? 'selected' : ''}>없음</option>
                        <option value="3" ${state.accountDelay == 3 ? 'selected' : ''}>3초</option>
                        <option value="5" ${state.accountDelay == 5 ? 'selected' : ''}>5초</option>
                        <option value="10" ${state.accountDelay == 10 ? 'selected' : ''}>10초</option>
                        <option value="20" ${state.accountDelay == 20 ? 'selected' : ''}>20초</option>
                        <option value="30" ${state.accountDelay == 30 ? 'selected' : ''}>30초</option>
                        <option value="60" ${state.accountDelay == 60 ? 'selected' : ''}>60초</option>
                        <option value="120" ${state.accountDelay == 120 ? 'selected' : ''}>2분</option>
                    </select>
                </div>
                <button class="btn-header-action" onclick="openProxyModal()" title="프록시 관리">
                    🌐
                </button>
                <button class="btn-install-toggle ${state.showInstallPanel ? 'active' : ''}" onclick="toggleInstallPanel()" title="필수 프로그램 설치">
                    ⚙
                </button>
                <div class="user-info">
                    <span class="user-name">${currentUser?.fullName || ''}</span>
                    <button class="btn-logout" onclick="logout()">로그아웃</button>
                </div>
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
                            <div class="install-item-title">웹크롤러 프로그램 설치</div>
                        </div>
                        <button class="${installStatus.playwright ? 'btn btn-success btn-sm' : 'btn btn-primary btn-sm'}" onclick="runInstaller('playwright')">
                            ${installStatus.playwright ? '설치 완료' : '설치'}
                        </button>
                    </div>
                    <div style="padding:4px 8px;font-size:11px;color:#94a3b8;">
                        Python: ${installStatus.details?.web?.python ? '<span style="color:#22c55e;">OK</span>' : '<span style="color:#f87171;">미설치</span>'}
                        &nbsp;|&nbsp; Playwright: ${installStatus.playwright ? '<span style="color:#22c55e;">OK</span>' : '<span style="color:#f87171;">미설치</span>'}
                        &nbsp;|&nbsp; Selenium: ${installStatus.web ? '<span style="color:#22c55e;">OK</span>' : '<span style="color:#f87171;">미설치</span>'}
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

        <!-- 통계 카드 + 기능 카드 (좌우 50:50) -->
        <div style="padding: 20px 24px 0;">
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
                            <div class="value">${expiringCouponCount}장</div>
                            <div class="stat-subtitle">7일 이내 만료</div>
                        </div>
                    </div>
                    <div class="stat-card clickable ${state.filters.has100kCoupon ? 'active' : ''}" onclick="toggle100kCouponFilter()">
                        <div class="stat-card-left"><h4>10만원 상품권</h4></div>
                        <div class="stat-card-right">
                            <div class="value">${has100kCouponCount}장</div>
                            <div class="stat-subtitle">유효 쿠폰</div>
                        </div>
                    </div>
                </div>
                <div class="main-action-buttons">
                    <button class="btn btn-main-action ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="showIssueCouponModal()">
                        <span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></span>
                        <div class="btn-content">
                            <span class="btn-text">조회 및 발급</span>
                            <span class="btn-desc">정보조회 + 쿠폰발급</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="bulkDownloadBarcodes()">
                        <span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
                        <div class="btn-content">
                            <span class="btn-text">바코드 다운로드</span>
                            <span class="btn-desc">zip 압축 파일</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="extractEmailList()">
                        <span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
                        <div class="btn-content">
                            <span class="btn-text">아이디 추출</span>
                            <span class="btn-desc">이메일 목록 복사</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action" onclick="showAccountRegisterMenu()">
                        <span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></span>
                        <div class="btn-content">
                            <span class="btn-text">계정 등록</span>
                            <span class="btn-desc">개별 / 일괄 등록</span>
                        </div>
                    </button>
                    <button class="btn btn-main-action ${state.selectedIds.size === 0 ? 'disabled' : ''}" onclick="exportCouponListToExcel()">
                        <span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
                        <div class="btn-content">
                            <span class="btn-text">엑셀 추출</span>
                            <span class="btn-desc">쿠폰 목록 (온라인용)</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>

        <!-- 툴바 -->
        <div class="toolbar">
            <div class="toolbar-left">
                <input type="text" class="search-input" id="searchInput" placeholder="이메일, 이름, 바코드 검색..."
                    value="${state.searchText}"
                    oninput="updateSearch(this.value)"
                    oncompositionstart="isComposing=true"
                    oncompositionend="isComposing=false; updateSearch(this.value)">
                <button class="btn btn-default" onclick="loadAccounts()">↻ 새로고침</button>
            </div>
            <div class="toolbar-right">
                ${state.selectedIds.size > 0 ? `
                    <span class="selection-text">${state.selectedIds.size}개 선택</span>
                    <div class="segment-toggle">
                        <button class="segment-btn segment-on" onclick="bulkToggleActive(true)">ON</button>
                        <button class="segment-btn segment-off" onclick="bulkToggleActive(false)">OFF</button>
                    </div>
                    <button class="btn btn-delete" onclick="bulkDelete()">삭제</button>
                ` : ''}
            </div>
        </div>

        <!-- 팝오버 필터 바 -->
        ${renderFilterBar()}

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
                                <th class="resizable" style="width:62px;">등록일</th>
                                <th class="resizable sortable ${state.sort.column === 'email' ? 'sorted' : ''}" style="width:160px;" onclick="toggleSort('email')">
                                    계정정보 ${renderSortIcon('email')}
                                </th>
                                <th class="resizable sortable ${state.sort.column === 'name' ? 'sorted' : ''}" style="width:110px;" onclick="toggleSort('name')">
                                    이름/생일/전화 ${renderSortIcon('name')}
                                </th>
                                <th class="resizable sortable ${state.sort.column === 'level' ? 'sorted' : ''}" style="width:68px;" onclick="toggleSort('level')">
                                    레벨/포인트 ${renderSortIcon('level')}
                                </th>
                                <th class="resizable" style="width:145px;">바코드</th>
                                ${COUPON_CATEGORIES.map(c => `<th class="resizable col-coupon-cat">${c.label}</th>`).join('')}
                                <th class="resizable col-coupon-cat">기타쿠폰</th>
                                <th class="resizable" style="width:75px;">현황</th>
                                <th class="resizable" style="width:55px;">작업자</th>
                                <th class="resizable" style="width:85px;">조회일시</th>
                                <th class="resizable" style="width:80px;">작업</th>
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

    const rowBorderColor = acc.is_active ? '#52c41a' : '#ef4444';

    // 등록일
    const createdDate = acc.created_at ? new Date(acc.created_at).toLocaleDateString('ko-KR', {year:'2-digit',month:'2-digit',day:'2-digit'}).replace(/\. /g,'/').replace('.','') : '-';

    // 쿠폰 카테고리
    const cats = categorizeVouchers(vouchers);

    return `
        <tr class="${isSelected ? 'row-selected' : ''}" style="border-left: 3px solid ${rowBorderColor};">
            <td class="checkbox-cell">
                <div class="checkbox-wrapper" onclick="toggleSelect('${acc.id}', !state.selectedIds.has('${acc.id}'))">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}
                        onclick="event.stopPropagation(); toggleSelect('${acc.id}', this.checked);">
                </div>
            </td>
            <td style="text-align:center;font-size:11px;color:#888;white-space:nowrap;">${createdDate}</td>
            <td>
                <div style="cursor:pointer;color:#111;" onclick="copyText('${acc.email}')" title="클릭하여 복사">${acc.email}</div>
                <div style="cursor:pointer;font-size:12px;color:#888;margin-top:2px;" onclick="copyText('${acc.password}')" title="클릭하여 복사">${acc.password}</div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span>${acc.name || '-'}</span>
                    <span style="font-size:11px;color:#555;font-weight:700;">${birthday}</span>
                </div>
                ${acc.phone ? `<div style="font-size:12px;color:#888;margin-top:2px;">${acc.phone}</div>` : ''}
            </td>
            <td style="text-align:center;">
                <div>${acc.adiclub_level ? `<span style="font-weight:700;color:#16a34a;font-size:12px;">${acc.adiclub_level.replace('Level ', 'Lv.')}</span>` : '<span style="color:#ccc;font-size:11px;">-</span>'}</div>
                <div>${acc.current_points ? `<strong style="color:#2563eb;font-size:12px;">${acc.current_points.toLocaleString()}P</strong>` : ''}</div>
            </td>
            <td>
                ${barcode ? `
                    <div style="text-align:center;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
                            <img id="bc_${acc.id}" src="" alt="barcode"
                                style="height:26px;width:120px;cursor:pointer;"
                                onclick="showBarcodeModal('${barcode}', '${(acc.name || '').replace(/'/g, "\\'")}', '${acc.email}', '${(acc.phone || '').replace(/'/g, "\\'")}')"
                                title="클릭하여 확대/다운로드">
                            <span style="cursor:pointer;font-size:12px;color:#999;flex-shrink:0;" onclick="event.stopPropagation();var el=document.getElementById('bc_${acc.id}');refreshBarcode(el,'${barcode}')" title="바코드 새로고침">↻</span>
                        </div>
                        <div style="cursor:pointer;font-size:10px;font-family:monospace;font-weight:600;color:#333;" onclick="copyText('${barcode}')" title="클릭하여 복사">${barcode}</div>
                    </div>
                ` : '<span style="color:#ccc;">-</span>'}
            </td>
            ${COUPON_CATEGORIES.map(c => `<td class="cat-cell"><div class="coupon-list">${cats[c.key].length > 0 ? renderCouponCards(acc, cats[c.key]) : '<span style="color:#ccc;">-</span>'}</div></td>`).join('')}
            <td class="cat-cell"><div class="coupon-list">${cats.etc.length > 0 ? renderCouponCards(acc, cats.etc) : '<span style="color:#ccc;">-</span>'}</div></td>
            <td style="font-size:11px;">
                ${renderStatusCell(acc.web_fetch_status, acc.web_issue_status || acc.issue_status)}
            </td>
            <td style="text-align:center;font-size:11px;color:#666;">
                ${acc.last_action_by || '-'}
            </td>
            <td style="text-align:center;font-size:11px;color:#666;white-space:nowrap;">
                ${(() => {
                    const dt = renderDatetimeCell(acc.web_fetch_status, acc.web_issue_status || acc.issue_status);
                    return dt;
                })()}
            </td>
            <td>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    ${acc.is_active ? `
                        <button class="btn btn-navy btn-small" style="font-size:11px;padding:2px 6px;" onclick="showSingleIssueCouponModal('${acc.id}', '${acc.email}')">조회/발급</button>
                    ` : ''}
                    <div style="display:flex;gap:2px;">
                        <button class="btn btn-default btn-small" style="font-size:10px;padding:2px 4px;flex:1;" onclick="showEditModal('${acc.id}')">수정</button>
                        <button class="btn btn-delete btn-small" style="font-size:10px;padding:2px 4px;flex:1;" onclick="deleteAccount('${acc.id}')">삭제</button>
                    </div>
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
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
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
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${state.modal === 'edit' ? '계정 수정' : '계정 추가'}</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
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
                            <div class="form-row">
                                <div class="form-group">
                                    <label>adiClub 레벨</label>
                                    <input type="text" value="${acc.adiclub_level || '-'}" readonly style="background:#f5f5f5;color:#666;">
                                </div>
                                <div class="form-group">
                                    <label>포인트</label>
                                    <input type="text" value="${acc.current_points ? acc.current_points.toLocaleString() + 'P' : '-'}" readonly style="background:#f5f5f5;color:#666;">
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
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="submitAccountForm()">저장</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'bulk') {
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal modal-large" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>일괄 등록 (붙여넣기)</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
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
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
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
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="filter-modal" onclick="event.stopPropagation()">
                    <!-- 헤더 -->
                    <div class="filter-modal-header">
                        <div class="filter-modal-title">필터 설정</div>
                        <button class="filter-modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>

                    <!-- 바디 -->
                    <div class="filter-modal-body">
                        <!-- 상태 필터 -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">계정 상태</span>
                            </div>
                            <div class="filter-chips">
                                <button class="filter-chip ${state.filters.status.includes(true) ? 'active success' : ''}" onclick="toggleFilter('status', true)">
                                    <span class="chip-dot success"></span> 활성
                                </button>
                                <button class="filter-chip ${state.filters.status.includes(false) ? 'active danger' : ''}" onclick="toggleFilter('status', false)">
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
                                <button class="filter-chip ${state.filters.emailTypes.includes('official') ? 'active primary' : ''}" onclick="toggleFilter('emailTypes', 'official')">
                                    <span class="chip-dot primary"></span> 공식 이메일
                                </button>
                                <button class="filter-chip ${state.filters.emailTypes.includes('catchall') ? 'active warning' : ''}" onclick="toggleFilter('emailTypes', 'catchall')">
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
                                <button class="filter-chip ${state.filters.hasCoupon.includes(true) ? 'active primary' : ''}" onclick="toggleFilter('hasCoupon', true)">보유</button>
                                <button class="filter-chip ${state.filters.hasCoupon.includes(false) ? 'active warning' : ''}" onclick="toggleFilter('hasCoupon', false)">미보유</button>
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

                        <!-- 작업 현황 (통합) -->
                        <div class="filter-group">
                            <div class="filter-group-header">
                                <span class="filter-group-title">작업 현황</span>
                            </div>
                            <div class="filter-chips wrap">
                                <button class="filter-chip ${state.filters.workStatuses.includes('completed') ? 'active success' : ''}" onclick="toggleFilter('workStatuses', 'completed')">
                                    <span class="chip-dot success"></span> 완료
                                </button>
                                <button class="filter-chip ${state.filters.workStatuses.includes('error') ? 'active danger' : ''}" onclick="toggleFilter('workStatuses', 'error')">
                                    <span class="chip-dot danger"></span> 오류
                                </button>
                                <button class="filter-chip ${state.filters.workStatuses.includes('password_wrong') ? 'active danger' : ''}" onclick="toggleFilter('workStatuses', 'password_wrong')">
                                    <span class="chip-dot danger"></span> 비밀번호 오류
                                </button>
                                <button class="filter-chip ${state.filters.workStatuses.includes('point_lack') ? 'active warning' : ''}" onclick="toggleFilter('workStatuses', 'point_lack')">
                                    <span class="chip-dot warning"></span> 포인트 부족
                                </button>
                                <button class="filter-chip ${state.filters.workStatuses.includes('pending') ? 'active' : ''}" onclick="toggleFilter('workStatuses', 'pending')">
                                    <span class="chip-dot"></span> 미조회
                                </button>
                            </div>
                            <div class="filter-date-row" style="margin-top:8px;">
                                <label style="font-size:11px;color:#666;">FROM:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.dateAfter}"
                                    onchange="setDateFilter('dateAfter', this.value)" />
                                ${state.filters.dateAfter ? '<button class="filter-date-clear" onclick="setDateFilter(\'dateAfter\', \'\')">✕</button>' : ''}
                            </div>
                            <div class="filter-date-row" style="margin-top:4px;">
                                <label style="font-size:11px;color:#666;">TO:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.dateBefore}"
                                    onchange="setDateFilter('dateBefore', this.value)" />
                                ${state.filters.dateBefore ? '<button class="filter-date-clear" onclick="setDateFilter(\'dateBefore\', \'\')">✕</button>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 추가일 필터 -->
                    <div class="filter-section">
                        <div class="filter-section-title">추가일</div>
                        <div class="filter-section-content">
                            <div class="filter-date-row">
                                <label style="font-size:11px;color:#666;">FROM:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.createdAfter}"
                                    onchange="setDateFilter('createdAfter', this.value)" />
                                ${state.filters.createdAfter ? '<button class="filter-date-clear" onclick="setDateFilter(\'createdAfter\', \'\')">✕</button>' : ''}
                            </div>
                            <div class="filter-date-row" style="margin-top:4px;">
                                <label style="font-size:11px;color:#666;">TO:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.createdBefore}"
                                    onchange="setDateFilter('createdBefore', this.value)" />
                                ${state.filters.createdBefore ? '<button class="filter-date-clear" onclick="setDateFilter(\'createdBefore\', \'\')">✕</button>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 쿠폰 발급일 필터 -->
                    <div class="filter-section">
                        <div class="filter-section-title">쿠폰 발급일</div>
                        <div class="filter-section-content">
                            <div class="filter-date-row">
                                <label style="font-size:11px;color:#666;">FROM:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.couponFetchedAfter}"
                                    onchange="setDateFilter('couponFetchedAfter', this.value)" />
                                ${state.filters.couponFetchedAfter ? '<button class="filter-date-clear" onclick="setDateFilter(\'couponFetchedAfter\', \'\')">✕</button>' : ''}
                            </div>
                            <div class="filter-date-row" style="margin-top:4px;">
                                <label style="font-size:11px;color:#666;">TO:</label>
                                <input type="date" class="filter-date-input" value="${state.filters.couponFetchedBefore}"
                                    onchange="setDateFilter('couponFetchedBefore', this.value)" />
                                ${state.filters.couponFetchedBefore ? '<button class="filter-date-clear" onclick="setDateFilter(\'couponFetchedBefore\', \'\')">✕</button>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 리스트 필터 (바코드/이메일) -->
                    <div class="filter-section">
                        <div class="filter-section-title">리스트 필터</div>
                        <div class="filter-section-content">
                            <div style="margin-bottom:6px;">
                                <label style="font-size:11px;color:#666;">바코드 리스트 (줄바꿈/콤마 구분):</label>
                                <textarea class="filter-list-input" rows="3" placeholder="ADIKR12345678&#10;ADIKR87654321"
                                    onchange="state.filters.barcodeList=this.value; state.currentPage=1; render();">${state.filters.barcodeList}</textarea>
                            </div>
                            <div>
                                <label style="font-size:11px;color:#666;">이메일 리스트 (줄바꿈/콤마 구분):</label>
                                <textarea class="filter-list-input" rows="3" placeholder="user1@email.com&#10;user2@email.com"
                                    onchange="state.filters.emailList=this.value; state.currentPage=1; render();">${state.filters.emailList}</textarea>
                            </div>
                        </div>
                    </div>

                    <!-- 푸터 -->
                    <div class="filter-modal-footer">
                        <button class="filter-action-btn reset" onclick="clearAllFilters()">초기화</button>
                        <button class="filter-action-btn apply" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
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
        const statusTag = voucher.deleted_unused
            ? '<span style="font-size:11px;color:#ef4444;font-weight:500;background:#fef2f2;padding:2px 8px;border-radius:4px;">미사용 삭제</span>'
            : voucher.sold
            ? '<span style="font-size:11px;color:#3b82f6;font-weight:500;background:#eff6ff;padding:2px 8px;border-radius:4px;">사용완료</span>'
            : '';

        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:420px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>쿠폰 상세</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="padding:20px 24px;">
                        <table style="width:100%;border-collapse:collapse;font-size:14px;">
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:14px 0;color:#64748b;width:80px;font-size:13px;">쿠폰명</td>
                                <td style="padding:14px 0;">
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <span style="font-weight:700;font-size:15px;color:#0f172a;">${couponInfo.name}</span>
                                        ${statusTag}
                                    </div>
                                </td>
                            </tr>
                            ${voucher.code ? `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:14px 0;color:#64748b;font-size:13px;">쿠폰코드</td>
                                <td style="padding:14px 0;">
                                    <span style="font-weight:700;font-size:14px;color:#0f172a;cursor:pointer;letter-spacing:0.5px;border-bottom:1px dashed #94a3b8;" onclick="copyText('${voucher.code}')" title="클릭하여 복사">${voucher.code}</span>
                                </td>
                            </tr>
                            ` : ''}
                            ${expiryDate ? `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:14px 0;color:#64748b;font-size:13px;">유효기간</td>
                                <td style="padding:14px 0;font-weight:700;font-size:14px;color:#0f172a;">${expiryDate}</td>
                            </tr>
                            ` : ''}
                            ${!voucher.deleted_unused ? `
                            <tr>
                                <td style="padding:14px 0;color:#64748b;vertical-align:top;font-size:13px;">메모</td>
                                <td style="padding:14px 0;">
                                    <input type="text" id="voucherSoldTo" placeholder="12/16 백호" value="${voucher.sold_to || ''}"
                                        style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;color:#0f172a;box-sizing:border-box;"
                                        class="voucher-memo-input">
                                </td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">닫기</button>
                        ${voucher.deleted_unused ? '' : voucher.sold ? `
                            <button class="btn btn-primary" onclick="saveVoucherMemo('${accountId}', ${voucherIndex})">저장</button>
                            <button class="btn btn-danger" onclick="saveVoucherSale('${accountId}', ${voucherIndex}, false)">사용 취소</button>
                        ` : `
                            <button class="btn btn-default" onclick="saveVoucherMemo('${accountId}', ${voucherIndex})">저장</button>
                            <button class="btn btn-primary" onclick="saveVoucherSale('${accountId}', ${voucherIndex}, true)">사용완료</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'issue-coupon') {
        const isAllActive = state.bulkIssueAllActive;
        const targetCount = isAllActive
            ? state.accounts.filter(a => a.is_active).length
            : state.selectedIds.size;
        const issueFunc = isAllActive ? 'startIssueCouponForAllActive' : 'startIssueCoupon';

        const selected = state.selectedIssueCouponTypes || [];
        const getOrder = (type) => { const idx = selected.indexOf(type); return idx >= 0 ? idx + 1 : null; };
        const isSelected = (type) => selected.includes(type);
        const couponNames = { '10000': '1만원', '30000': '3만원', '50000': '5만원', '100000': '10만원' };

        const orderText = selected.length > 0
            ? selected.map((t, i) => `${couponNames[t]}`).join(' → ')
            : '';

        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:480px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>조회 및 발급</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:14px;color:#334155;margin-bottom:6px;">선택된 <strong>${targetCount}개</strong> 계정을 조회합니다.</p>
                        <p style="font-size:13px;color:#94a3b8;margin-bottom:20px;">쿠폰 발급 시 순서대로 선택하세요.</p>

                        <div class="coupon-issue-grid">
                            <div class="coupon-issue-card ${isSelected('10000') ? 'selected' : ''}" onclick="toggleIssueCouponType('10000')">
                                ${getOrder('10000') ? `<div class="coupon-order-badge">${getOrder('10000')}</div>` : ''}
                                <div class="coupon-issue-value">1만원</div>
                                <div class="coupon-issue-points">1,500P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('30000') ? 'selected' : ''}" onclick="toggleIssueCouponType('30000')">
                                ${getOrder('30000') ? `<div class="coupon-order-badge">${getOrder('30000')}</div>` : ''}
                                <div class="coupon-issue-value">3만원</div>
                                <div class="coupon-issue-points">3,000P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('50000') ? 'selected' : ''}" onclick="toggleIssueCouponType('50000')">
                                ${getOrder('50000') ? `<div class="coupon-order-badge">${getOrder('50000')}</div>` : ''}
                                <div class="coupon-issue-value">5만원</div>
                                <div class="coupon-issue-points">4,000P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('100000') ? 'selected' : ''}" onclick="toggleIssueCouponType('100000')">
                                ${getOrder('100000') ? `<div class="coupon-order-badge">${getOrder('100000')}</div>` : ''}
                                <div class="coupon-issue-value">10만원</div>
                                <div class="coupon-issue-points">6,000P</div>
                            </div>
                        </div>

                        ${selected.length > 0 ? `
                            <div class="coupon-order-summary">
                                <span class="order-label">발급 순서</span>
                                <span class="order-value">${orderText}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="${issueFunc}()">
                            ${selected.length > 0 ? `조회 + 발급 시작` : '조회 시작'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'single-issue-coupon') {
        const selected = state.selectedIssueCouponTypes || [];
        const getOrder = (type) => { const idx = selected.indexOf(type); return idx >= 0 ? idx + 1 : null; };
        const isSelected = (type) => selected.includes(type);
        const couponNames = { '10000': '1만원', '30000': '3만원', '50000': '5만원', '100000': '10만원' };

        const orderText = selected.length > 0
            ? selected.map((t, i) => `${couponNames[t]}`).join(' → ')
            : '';

        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:480px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>조회 및 발급</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:14px;color:#334155;margin-bottom:6px;"><strong>${state.singleIssueCouponEmail || ''}</strong> 계정을 조회합니다.</p>
                        <p style="font-size:13px;color:#94a3b8;margin-bottom:20px;">쿠폰 발급 시 순서대로 선택하세요.</p>

                        <div class="coupon-issue-grid">
                            <div class="coupon-issue-card ${isSelected('10000') ? 'selected' : ''}" onclick="toggleIssueCouponType('10000')">
                                ${getOrder('10000') ? `<div class="coupon-order-badge">${getOrder('10000')}</div>` : ''}
                                <div class="coupon-issue-value">1만원</div>
                                <div class="coupon-issue-points">1,500P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('30000') ? 'selected' : ''}" onclick="toggleIssueCouponType('30000')">
                                ${getOrder('30000') ? `<div class="coupon-order-badge">${getOrder('30000')}</div>` : ''}
                                <div class="coupon-issue-value">3만원</div>
                                <div class="coupon-issue-points">3,000P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('50000') ? 'selected' : ''}" onclick="toggleIssueCouponType('50000')">
                                ${getOrder('50000') ? `<div class="coupon-order-badge">${getOrder('50000')}</div>` : ''}
                                <div class="coupon-issue-value">5만원</div>
                                <div class="coupon-issue-points">4,000P</div>
                            </div>
                            <div class="coupon-issue-card ${isSelected('100000') ? 'selected' : ''}" onclick="toggleIssueCouponType('100000')">
                                ${getOrder('100000') ? `<div class="coupon-order-badge">${getOrder('100000')}</div>` : ''}
                                <div class="coupon-issue-value">10만원</div>
                                <div class="coupon-issue-points">6,000P</div>
                            </div>
                        </div>

                        ${selected.length > 0 ? `
                            <div class="coupon-order-summary">
                                <span class="order-label">발급 순서</span>
                                <span class="order-value">${orderText}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="startIssueCouponForAccount()">
                            ${selected.length > 0 ? `조회 + 발급 시작` : '조회 시작'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'bulk-sold') {
        const couponTypes = getAvailableCouponTypes();
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:500px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>🛒 쿠폰 사용 처리</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:12px;color:#666;font-size:13px;">
                            사용 완료된 계정 이메일을 입력하고 쿠폰 종류를 선택하세요.<br>
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
                            * 해당 계정의 선택된 쿠폰이 "사용 완료" 상태로 변경됩니다.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
                        <button class="btn btn-primary-dark" onclick="processBulkSold()">판매 처리</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'guide') {
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:1200px;max-width:95vw;max-height:90vh;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>📖 사용자 가이드</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="max-height:75vh;overflow-y:auto;padding:40px 60px;">
                        ${getGuideContent()}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'log') {
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:900px;max-width:95vw;height:70vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
                    <div class="modal-header" style="flex-shrink:0;">
                        <h3>서버 로그 <span id="logStatus" style="font-size:12px;color:#52c41a;">● 실시간</span></h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
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
                        <button class="btn btn-primary" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'barcode') {
        const { barcode, name, email, phone } = state.modal;
        const displayName = name || email.split('@')[0];
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:480px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>바코드 - ${displayName}</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="text-align:center;">
                        <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #e8e8e8;">
                            <canvas id="barcodeModalCanvas"></canvas>
                            <div style="margin-top:12px;font-family:monospace;font-size:16px;letter-spacing:2px;color:#333;">
                                ${barcode}
                            </div>
                        </div>
                        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                            <button class="btn btn-default" onclick="copyBarcodeImage()">이미지 복사</button>
                            <button class="btn btn-default" onclick="copyText('${barcode}')">바코드 복사</button>
                            <button class="btn btn-primary" onclick="downloadBarcode('${barcode}', '${displayName.replace(/'/g, "\\'")}', '${(phone || '').replace(/'/g, "\\'")}')">다운로드</button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal && state.modal.type === 'proxy') {
        const ps = state.modal.proxyStatus || {};
        const proxyText = state.modal.proxyText || '';
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:600px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>프록시 관리</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div style="display:flex;gap:12px;margin-bottom:16px;">
                            <div style="flex:1;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;text-align:center;">
                                <div style="font-size:24px;font-weight:700;color:#0369a1;">${ps.total || 0}</div>
                                <div style="font-size:11px;color:#64748b;">전체 계정</div>
                            </div>
                            <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center;">
                                <div style="font-size:24px;font-weight:700;color:#15803d;">${ps.assigned || 0}</div>
                                <div style="font-size:11px;color:#64748b;">프록시 배정</div>
                            </div>
                            <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center;">
                                <div style="font-size:24px;font-weight:700;color:#dc2626;">${ps.unassigned || 0}</div>
                                <div style="font-size:11px;color:#64748b;">미배정</div>
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">프록시 목록 (IP:PORT, 줄바꿈 구분)</label>
                            <textarea id="proxyListTextarea" rows="10" style="width:100%;font-family:monospace;font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:8px;resize:vertical;">${proxyText}</textarea>
                            <div style="font-size:11px;color:#64748b;margin-top:4px;">총 ${proxyText.split('\\n').filter(l => l.trim()).length}개 프록시</div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-primary" onclick="saveProxyList()">목록 저장</button>
                            <button class="btn btn-default" style="background:#15803d;color:#fff;" onclick="autoAssignProxy()">자동 배정 (미배정 계정)</button>
                            <button class="btn btn-default" style="background:#dc2626;color:#fff;" onclick="clearAllProxy()">전체 해제</button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.modal === 'google-sheets-config') {
        const cfg = state.gsheetsConfig || {};
        return `
            <div class="modal-overlay" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">
                <div class="modal" style="width:560px;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>구글시트 연동 설정</h3>
                        <button class="modal-close" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">×</button>
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
                        <button class="btn btn-default" onmousedown="this._mdTarget=event.target" onmouseup="if(event.target===this&&this._mdTarget===this)closeModal()">취소</button>
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
    return state.filters.status.length > 0 ||
        state.filters.emailTypes.length > 0 ||
        state.filters.levels.length > 0 ||
        state.filters.minPoints !== '' ||
        state.filters.maxPoints !== '' ||
        state.filters.birthdayMonths.length > 0 ||
        state.filters.couponTypes.length > 0 ||
        state.filters.workStatuses.length > 0 ||
        state.filters.expiringCoupon ||
        state.filters.has100kCoupon ||
        state.filters.excludeSoldCoupon ||
        state.filters.dateAfter !== '' ||
        state.filters.dateBefore !== '' ||
        state.filters.createdAfter !== '' ||
        state.filters.createdBefore !== '' ||
        state.filters.couponFetchedAfter !== '' ||
        state.filters.couponFetchedBefore !== '' ||
        state.filters.barcodeList.trim() !== '' ||
        state.filters.emailList.trim() !== '';
}

function getActiveFilterCount() {
    let count = 0;
    count += state.filters.status.length;
    count += state.filters.emailTypes.length;
    count += state.filters.levels.length;
    if (state.filters.minPoints !== '' || state.filters.maxPoints !== '') count++;
    if (state.filters.excludeSoldCoupon) count++;
    count += state.filters.workStatuses.length;
    if (state.filters.expiringCoupon) count++;
    if (state.filters.has100kCoupon) count++;
    if (state.filters.dateAfter !== '') count++;
    if (state.filters.dateBefore !== '') count++;
    count += state.filters.birthdayMonths.length;
    count += state.filters.couponTypes.length;
    if (state.filters.createdAfter !== '' || state.filters.createdBefore !== '') count++;
    if (state.filters.couponFetchedAfter !== '' || state.filters.couponFetchedBefore !== '') count++;
    if (state.filters.barcodeList.trim() !== '') count++;
    if (state.filters.emailList.trim() !== '') count++;
    return count;
}

function showFilterModal() {
    state.modal = 'filter';
    render();
}

// 필터 팝오버 토글
function toggleFilterPopover(name, event) {
    if (event) event.stopPropagation();
    state.openFilterPopover = (state.openFilterPopover === name) ? null : name;
    render();
    // 팝오버 열렸을 때 포커스 가능한 input에 포커스
    if (state.openFilterPopover) {
        setTimeout(() => {
            const popover = document.querySelector('.filter-popover.show');
            if (popover) {
                const input = popover.querySelector('input[type="number"], input[type="date"]');
                if (input) input.focus();
            }
        }, 50);
    }
}

function closeFilterPopover() {
    if (state.openFilterPopover) {
        state.openFilterPopover = null;
        render();
    }
}

// 계정의 통합 작업 현황 반환
function getAccountWorkStatus(acc) {
    const { parsed } = pickLatestStatus(acc.web_fetch_status, acc.web_issue_status || acc.issue_status);
    switch (parsed.statusType) {
        case 'success': return 'completed';
        case 'error': return 'error';
        case 'password_wrong': return 'password_wrong';
        case 'warning': return 'point_lack';
        case 'processing': return 'processing';
        case 'waiting': return 'pending';
        case 'none': return 'pending';
        default: return 'pending';
    }
}

// 실제 존재하는 레벨 목록 반환
function getAvailableLevels() {
    const levels = new Set();
    let hasNone = false;
    state.accounts.forEach(acc => {
        if (acc.adiclub_level) {
            levels.add(acc.adiclub_level);
        } else {
            hasNone = true;
        }
    });
    // Level 4, 3, 2, 1 순으로 정렬
    const sorted = [...levels].sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.match(/\d+/)?.[0] || 0);
        return numB - numA;
    });
    return { levels: sorted, hasNone };
}

// 실제 존재하는 작업 현황 목록 반환
function getAvailableWorkStatuses() {
    const statusMap = { completed: 0, error: 0, password_wrong: 0, point_lack: 0, pending: 0, processing: 0 };
    state.accounts.forEach(acc => {
        const ws = getAccountWorkStatus(acc);
        if (statusMap[ws] !== undefined) statusMap[ws]++;
    });
    const labels = {
        completed: '완료',
        error: '오류',
        password_wrong: '비밀번호 오류',
        point_lack: '포인트 부족',
        processing: '진행중',
        pending: '미조회'
    };
    return Object.entries(statusMap)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ key, label: labels[key], count }));
}

// 팝오버 필터 바 렌더링
function renderFilterBar() {
    const availableCouponTypes = getAvailableCouponTypes();
    const { levels: availableLevels, hasNone: hasNoLevel } = getAvailableLevels();
    const availableWorkStatuses = getAvailableWorkStatuses();
    const op = state.openFilterPopover;

    const statusCount = state.filters.status.length;
    const emailCount = state.filters.emailTypes.length;
    const levelCount = state.filters.levels.length;
    const workCount = state.filters.workStatuses.length;
    const couponTypeCount = state.filters.couponTypes.length;
    const hasDateFilter = state.filters.dateAfter || state.filters.dateBefore;
    const birthdayCount = state.filters.birthdayMonths.length;
    const hasCreatedFilter = state.filters.createdAfter || state.filters.createdBefore;
    const hasFetchedFilter = state.filters.couponFetchedAfter || state.filters.couponFetchedBefore;
    const emailListCount = state.filters.emailList.trim() ? state.filters.emailList.trim().split(/[\n,]+/).filter(Boolean).length : 0;
    const barcodeListCount = state.filters.barcodeList.trim() ? state.filters.barcodeList.trim().split(/[\n,]+/).filter(Boolean).length : 0;

    function chip(name, label, countNum) {
        const hasVal = countNum > 0;
        return `
            <div class="filter-trigger ${hasVal ? 'has-value' : ''} ${op === name ? 'open' : ''}" onclick="toggleFilterPopover('${name}', event)">
                ${label}
                ${countNum > 0 ? `<span class="ft-count">${countNum}</span>` : ''}
                ${hasVal ? `<span class="ft-clear" onclick="event.stopPropagation(); clearSingleFilter('${name}')">&times;</span>` : `<span class="ft-arrow">&#9662;</span>`}
            </div>`;
    }

    return `
        <div class="filter-bar">
            <span class="filter-bar-label">필터</span>

            <!-- 계정 상태 -->
            <div style="position:relative; display:inline-block;">
                ${chip('status', '상태', statusCount)}
                <div class="filter-popover ${op === 'status' ? 'show' : ''}">
                    <button class="fp-option ${state.filters.status.includes(true) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('status', true)">
                        <span class="fp-check">${state.filters.status.includes(true) ? '&#10003;' : ''}</span> 활성
                    </button>
                    <button class="fp-option ${state.filters.status.includes(false) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('status', false)">
                        <span class="fp-check">${state.filters.status.includes(false) ? '&#10003;' : ''}</span> 비활성
                    </button>
                </div>
            </div>

            <!-- 이메일 유형 -->
            <div style="position:relative; display:inline-block;">
                ${chip('email', '이메일', emailCount)}
                <div class="filter-popover ${op === 'email' ? 'show' : ''}">
                    <button class="fp-option ${state.filters.emailTypes.includes('official') ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('emailTypes', 'official')">
                        <span class="fp-check">${state.filters.emailTypes.includes('official') ? '&#10003;' : ''}</span> 공식 이메일
                    </button>
                    <button class="fp-option ${state.filters.emailTypes.includes('catchall') ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('emailTypes', 'catchall')">
                        <span class="fp-check">${state.filters.emailTypes.includes('catchall') ? '&#10003;' : ''}</span> 캐치올
                    </button>
                </div>
            </div>

            <!-- adiClub 레벨 -->
            ${availableLevels.length > 0 || hasNoLevel ? `
            <div style="position:relative; display:inline-block;">
                ${chip('level', '레벨', levelCount)}
                <div class="filter-popover ${op === 'level' ? 'show' : ''}">
                    ${availableLevels.map(lv => `
                        <button class="fp-option ${state.filters.levels.includes(lv) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('levels', '${lv}')">
                            <span class="fp-check">${state.filters.levels.includes(lv) ? '&#10003;' : ''}</span> ${lv}
                        </button>
                    `).join('')}
                    ${hasNoLevel ? `
                        <button class="fp-option ${state.filters.levels.includes('none') ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('levels', 'none')">
                            <span class="fp-check">${state.filters.levels.includes('none') ? '&#10003;' : ''}</span> 미조회
                        </button>
                    ` : ''}
                </div>
            </div>
            ` : ''}

            <!-- 작업 현황 -->
            <div style="position:relative; display:inline-block;">
                ${chip('work', '현황', workCount + (hasDateFilter ? 1 : 0))}
                <div class="filter-popover ${op === 'work' ? 'show' : ''}" style="min-width:240px;">
                    ${availableWorkStatuses.map(({ key, label, count }) => `
                        <button class="fp-option ${state.filters.workStatuses.includes(key) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFilter('workStatuses', '${key}')">
                            <span class="fp-check">${state.filters.workStatuses.includes(key) ? '&#10003;' : ''}</span> ${label}
                            <span class="fp-count">${count}</span>
                        </button>
                    `).join('')}
                    <div class="fp-divider"></div>
                    <div class="filter-popover-title">기간</div>
                    <div class="fp-date-row">
                        <label>FROM</label>
                        <input type="date" value="${state.filters.dateAfter}" onchange="setDateFilter('dateAfter', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.dateAfter ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('dateAfter', '')">&#10005;</button>` : ''}
                    </div>
                    <div class="fp-date-row">
                        <label>TO</label>
                        <input type="date" value="${state.filters.dateBefore}" onchange="setDateFilter('dateBefore', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.dateBefore ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('dateBefore', '')">&#10005;</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- 쿠폰 -->
            <div style="position:relative; display:inline-block;">
                ${chip('couponType', '쿠폰', couponTypeCount + (state.filters.excludeSoldCoupon ? 1 : 0))}
                <div class="filter-popover ${op === 'couponType' ? 'show' : ''}" style="min-width:220px;">
                    <button class="fp-option ${state.filters.excludeSoldCoupon ? 'active' : ''}" onclick="event.stopPropagation(); toggleExcludeSoldCoupon()">
                        <span class="fp-check">${state.filters.excludeSoldCoupon ? '&#10003;' : ''}</span> 사용완료 제외
                    </button>
                    ${availableCouponTypes.length > 0 ? `
                    <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
                    <div class="fp-coupon-list">
                        ${availableCouponTypes.map(({ type, label, count }) => `
                            <button class="fp-option ${state.filters.couponTypes.includes(type) ? 'active' : ''}" onclick="event.stopPropagation(); toggleCouponType('${type.replace(/'/g, "\\'")}')">
                                <span class="fp-check">${state.filters.couponTypes.includes(type) ? '&#10003;' : ''}</span>
                                ${label}
                                <span class="fp-count">${count}</span>
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- 생일 월 -->
            <div style="position:relative; display:inline-block;">
                ${chip('birthday', '생일', birthdayCount)}
                <div class="filter-popover ${op === 'birthday' ? 'show' : ''}" style="min-width:200px;">
                    <div class="filter-popover-title">생일 월</div>
                    <div class="fp-month-grid">
                        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
                            <button class="fp-month ${state.filters.birthdayMonths.includes(m) ? 'active' : ''}" onclick="event.stopPropagation(); toggleBirthdayMonth(${m})">${m}월</button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- 등록일 -->
            <div style="position:relative; display:inline-block;">
                ${chip('created', '등록일', hasCreatedFilter ? 1 : 0)}
                <div class="filter-popover ${op === 'created' ? 'show' : ''}" style="min-width:220px;">
                    <div class="filter-popover-title">등록일 기간</div>
                    <div class="fp-date-row">
                        <label>FROM</label>
                        <input type="date" value="${state.filters.createdAfter}" onchange="setDateFilter('createdAfter', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.createdAfter ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('createdAfter', '')">&#10005;</button>` : ''}
                    </div>
                    <div class="fp-date-row">
                        <label>TO</label>
                        <input type="date" value="${state.filters.createdBefore}" onchange="setDateFilter('createdBefore', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.createdBefore ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('createdBefore', '')">&#10005;</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- 발급일자 -->
            <div style="position:relative; display:inline-block;">
                ${chip('fetched', '발급일자', hasFetchedFilter ? 1 : 0)}
                <div class="filter-popover ${op === 'fetched' ? 'show' : ''}" style="min-width:220px;">
                    <div class="filter-popover-title">쿠폰 발급일 기간</div>
                    <div class="fp-date-row">
                        <label>FROM</label>
                        <input type="date" value="${state.filters.couponFetchedAfter}" onchange="setDateFilter('couponFetchedAfter', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.couponFetchedAfter ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('couponFetchedAfter', '')">&#10005;</button>` : ''}
                    </div>
                    <div class="fp-date-row">
                        <label>TO</label>
                        <input type="date" value="${state.filters.couponFetchedBefore}" onchange="setDateFilter('couponFetchedBefore', this.value)" onclick="event.stopPropagation()">
                        ${state.filters.couponFetchedBefore ? `<button class="fp-date-clear" onclick="event.stopPropagation(); setDateFilter('couponFetchedBefore', '')">&#10005;</button>` : ''}
                    </div>
                </div>
            </div>

            <!-- 목록 필터 버튼 -->
            <div class="filter-trigger ${emailListCount || barcodeListCount ? 'has-value' : ''}" onclick="openListFilterModal()">
                목록필터
                ${emailListCount || barcodeListCount ? `<span class="ft-count">${emailListCount + barcodeListCount}</span>` : ''}
                ${emailListCount || barcodeListCount ? `<span class="ft-clear" onclick="event.stopPropagation(); clearListFilters()">&times;</span>` : ''}
            </div>

            <!-- 포인트 (인라인 입력) -->
            <div class="filter-points-inline">
                <label>포인트 :</label>
                <input type="number" placeholder="최소" value="${state.filters.minPoints}" oninput="setFilterValue('minPoints', this.value)">
                <span>~</span>
                <input type="number" placeholder="최대" value="${state.filters.maxPoints}" oninput="setFilterValue('maxPoints', this.value)">
            </div>

            ${hasActiveFilters() ? `
                <div class="filter-reset-wrap">
                    <button class="filter-reset-btn" onclick="clearAllFilters()">초기화</button>
                </div>
            ` : ''}
        </div>
    `;
}

// 개별 필터 초기화
function clearSingleFilter(name) {
    switch (name) {
        case 'status': state.filters.status = []; break;
        case 'email': state.filters.emailTypes = []; break;
        case 'level': state.filters.levels = []; break;
        case 'work': state.filters.workStatuses = []; state.filters.dateAfter = ''; state.filters.dateBefore = ''; break;
        case 'couponType': state.filters.couponTypes = []; state.filters.excludeSoldCoupon = false; break;
        case 'points': state.filters.minPoints = ''; state.filters.maxPoints = ''; break;
        case 'birthday': state.filters.birthdayMonths = []; break;
        case 'created': state.filters.createdAfter = ''; state.filters.createdBefore = ''; break;
        case 'fetched': state.filters.couponFetchedAfter = ''; state.filters.couponFetchedBefore = ''; break;
        case 'emailList': state.filters.emailList = ''; break;
        case 'barcodeList': state.filters.barcodeList = ''; break;
    }
    state.currentPage = 1;
    render();
}

// 배열 기반 토글 (복수 선택)
function toggleArrayFilter(arr, value) {
    const idx = arr.indexOf(value);
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.push(value);
    }
}

function toggleFilter(key, value) {
    toggleArrayFilter(state.filters[key], value);
    state.currentPage = 1;
    render();
}

function toggleExcludeSoldCoupon() {
    state.filters.excludeSoldCoupon = !state.filters.excludeSoldCoupon;
    state.currentPage = 1;
    render();
}

// 목록 필터 모달
// ========== 프록시 관리 ==========
async function openProxyModal() {
    try {
        const [statusRes, listRes] = await Promise.all([
            fetch(`${API_BASE}/proxy/status`).then(r => r.json()),
            fetch(`${API_BASE}/proxy/list`).then(r => r.json())
        ]);
        state.modal = {
            type: 'proxy',
            proxyStatus: statusRes,
            proxyText: (listRes.proxies || []).join('\n')
        };
        render();
    } catch (e) {
        notifyError('프록시 정보 로드 실패: ' + e.message);
    }
}

async function saveProxyList() {
    const textarea = document.getElementById('proxyListTextarea');
    if (!textarea) return;
    try {
        const res = await fetch(`${API_BASE}/proxy/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxies: textarea.value })
        });
        const data = await res.json();
        if (data.success) {
            notifySuccess(`프록시 ${data.count}개 저장 완료`);
            openProxyModal(); // 새로고침
        } else {
            notifyError('저장 실패: ' + data.error);
        }
    } catch (e) {
        notifyError('저장 실패: ' + e.message);
    }
}

async function autoAssignProxy() {
    try {
        const res = await fetch(`${API_BASE}/proxy/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.success) {
            notifySuccess(`${data.assigned}개 계정에 프록시 배정 완료`);
            openProxyModal();
            loadAccounts();
        } else {
            notifyError('배정 실패: ' + (data.error || data.message));
        }
    } catch (e) {
        notifyError('배정 실패: ' + e.message);
    }
}

async function clearAllProxy() {
    if (!confirm('모든 계정의 프록시 배정을 해제하시겠습니까?')) return;
    try {
        const res = await fetch(`${API_BASE}/proxy/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.success) {
            notifySuccess(`${data.cleared}개 계정 프록시 해제 완료`);
            openProxyModal();
            loadAccounts();
        } else {
            notifyError('해제 실패: ' + data.error);
        }
    } catch (e) {
        notifyError('해제 실패: ' + e.message);
    }
}

function openListFilterModal() {
    const overlay = document.createElement('div');
    overlay.className = 'list-filter-overlay';
    overlay.onmousedown = (e) => { overlay._mdTarget = e.target; };
    overlay.onmouseup = (e) => { if (e.target === overlay && overlay._mdTarget === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div class="list-filter-modal">
            <div class="list-filter-header">
                <span>목록 필터</span>
                <button onclick="this.closest('.list-filter-overlay').remove()">×</button>
            </div>
            <div class="list-filter-body">
                <div class="list-filter-section">
                    <label>이메일 목록 <span style="color:#9ca3af;font-size:11px;">(줄바꿈 또는 콤마로 구분)</span></label>
                    <textarea id="listFilterEmail" class="fp-list-textarea" rows="8" placeholder="example1@naver.com&#10;example2@naver.com&#10;...">${state.filters.emailList}</textarea>
                </div>
                <div class="list-filter-section">
                    <label>바코드 목록 <span style="color:#9ca3af;font-size:11px;">(줄바꿈 또는 콤마로 구분)</span></label>
                    <textarea id="listFilterBarcode" class="fp-list-textarea" rows="8" placeholder="ADIKR1234567890&#10;ADIKR0987654321&#10;...">${state.filters.barcodeList}</textarea>
                </div>
            </div>
            <div class="list-filter-footer">
                <button class="list-filter-btn cancel" onclick="this.closest('.list-filter-overlay').remove()">취소</button>
                <button class="list-filter-btn apply" onclick="applyListFilter()">적용</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function applyListFilter() {
    const overlay = document.querySelector('.list-filter-overlay');
    state.filters.emailList = document.getElementById('listFilterEmail').value;
    state.filters.barcodeList = document.getElementById('listFilterBarcode').value;
    state.currentPage = 1;
    if (overlay) overlay.remove();
    render();
}

function clearListFilters() {
    state.filters.emailList = '';
    state.filters.barcodeList = '';
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
        hasCoupon: [],
        excludeSoldCoupon: false,
        status: [],
        emailTypes: [],
        levels: [],
        workStatuses: [],
        expiringCoupon: false,
        has100kCoupon: false,
        dateAfter: '',
        dateBefore: '',
        createdAfter: '',
        createdBefore: '',
        couponFetchedAfter: '',
        couponFetchedBefore: '',
        barcodeList: '',
        emailList: '',
    };
    state.currentPage = 1;
    render();
}

// 만료 예정 쿠폰 필터 토글
function toggleExpiringCouponFilter() {
    state.filters.expiringCoupon = !state.filters.expiringCoupon;
    if (state.filters.expiringCoupon) {
        state.filters.has100kCoupon = false;
    }
    state.currentPage = 1;
    render();
}

// 10만원 쿠폰 보유 필터 토글
function toggle100kCouponFilter() {
    state.filters.has100kCoupon = !state.filters.has100kCoupon;
    if (state.filters.has100kCoupon) {
        state.filters.expiringCoupon = false;
    }
    state.currentPage = 1;
    render();
}


// 전체 활성 계정 정보 조회
async function bulkExtractAll(skipConfirm = false) {
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

    if (!skipConfirm) {
        const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
        if (!confirm(`[${modeLabel}] 전체 활성 계정 ${activeAccounts.length}개의 정보를 조회하시겠습니까?`)) {
            return;
        }
    }

    const ids = activeAccounts.map(a => a.id);
    try {
        const result = await api('/extract/bulk', { method: 'POST', body: { ids, actionBy: currentUser?.fullName } });
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

    // 중복 실행 방지 - 이미 배치 작업이 진행 중인지 확인
    await checkBatchStatus();
    if (state.batchStatus.active) {
        notifyWarning(`이미 "${state.batchStatus.title}" 작업이 진행 중입니다. 완료 후 다시 시도하세요.`);
        state.bulkIssueAllActive = false;
        return;
    }

    const activeAccounts = state.accounts.filter(a => a.is_active);
    const ids = activeAccounts.map(a => a.id);

    const modeLabel = ({ web: 'Selenium', web_incognito: 'Selenium(시크릿)', playwright: 'PW', playwright_incognito: 'PW(시크릿)', playwright_headless: 'PW(BG)', playwright_headless_incognito: 'PW(BG+시크릿)' }[state.extractMode] || '웹');
    state.bulkIssueAllActive = false;
    openMonitor('issue', `[${modeLabel}] 쿠폰 일괄 발급 (${couponTypesStr})`, activeAccounts);

    try {
        await api('/issue-coupon/bulk', {
            method: 'POST',
            body: { ids, coupon_types: couponTypesArray, mode: state.extractMode, actionBy: currentUser?.fullName }
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

async function saveVoucherMemo(accountId, voucherIndex) {
    const soldTo = document.getElementById('voucherSoldTo').value;
    try {
        await api(`/accounts/${accountId}/voucher-memo`, {
            method: 'POST',
            body: { voucher_index: voucherIndex, sold_to: soldTo }
        });
        // 모달에 표시된 voucher 객체도 업데이트
        if (state.voucherData) {
            state.voucherData.voucher.sold_to = soldTo;
        }
        notifySuccess('메모가 저장되었습니다');
        loadAccounts();
    } catch (error) {
        notifyError('메모 저장 실패: ' + error.message);
    }
}

function copyText(text) {
    navigator.clipboard.writeText(text);
    notifySuccess('복사됨', 1500);
}

async function copyBarcodeImage() {
    const canvas = document.getElementById('barcodeModalCanvas');
    if (!canvas) { notifyError('바코드를 찾을 수 없습니다'); return; }
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        notifySuccess('바코드 이미지가 복사되었습니다');
    } catch (e) {
        notifyError('이미지 복사 실패: ' + e.message);
    }
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
    playwright: false,
    details: null
};

// 앱 시작 시 설치 상태 확인
async function checkInstallStatus() {
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        try {
            const result = await ipcRenderer.invoke('check-install-status');
            installStatus.web = result.web.allInstalled;
            installStatus.playwright = result.web.playwrightReady;
            installStatus.details = result;
            console.log('[Install Check] Web:', installStatus.web, 'Playwright:', installStatus.playwright);
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

// 설치 필요 안내
function getMissingInstallTooltip() {
    if (!installStatus.web) return '웹크롤러 설치 필요';
    return '';
}

function showInstallRequired(type) {
    if (type === 'web') {
        state.showInstallPanel = true;
        render();
        notifyWarning('웹 브라우저 모드를 사용하려면 웹 크롤러를 먼저 설치해야 합니다.');
    }
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
                        }
                        if (type === 'playwright' && status.web.playwrightReady) {
                            installStatus.playwright = true;
                            clearInterval(checkInterval);
                            render();
                            notifySuccess('Playwright 설치가 완료되었습니다!');
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
    loadAccountDelay();
    loadGSheetsConfig();
    checkInstallStatus(); // 프로그램 설치 상태 확인

    // 필터 팝오버 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (!state.openFilterPopover) return;
        const trigger = e.target.closest('.filter-trigger');
        const popover = e.target.closest('.filter-popover');
        if (!trigger && !popover) {
            closeFilterPopover();
        }
    });

    // 쿠폰 목록 호버 확장
    document.addEventListener('mouseenter', (e) => {
        const wrapper = e.target.closest('.coupon-wrapper');
        if (!wrapper) return;
        wrapper.classList.add('hover-active');
        const td = wrapper.closest('td');
        if (td) td.classList.add('coupon-hover-active');
        const tr = wrapper.closest('tr');
        if (tr) tr.classList.add('coupon-hover-active');
    }, true);

    document.addEventListener('mouseleave', (e) => {
        if (!e.target || !e.target.closest) return;
        const wrapper = e.target.closest('.coupon-wrapper');
        if (!wrapper) return;
        wrapper.classList.remove('hover-active');
        const td = wrapper.closest('td');
        if (td) td.classList.remove('coupon-hover-active');
        const tr = wrapper.closest('tr');
        if (tr) tr.classList.remove('coupon-hover-active');
    }, true);
});


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

// ========== 로그인 / 회원가입 ==========

let loginMode = 'login'; // 'login' or 'register'

function renderLoginScreen() {
    const isLogin = loginMode === 'login';
    return `
        <div class="login-container">
            <div class="login-card">
                <div class="login-logo">
                    <img src="adidas.png" alt="adidas" style="height:36px;">
                    <span>아디다스 쿠폰 관리자</span>
                </div>
                <div class="login-tabs">
                    <button class="login-tab ${isLogin ? 'active' : ''}" onclick="loginMode='login'; render();">로그인</button>
                    <button class="login-tab ${!isLogin ? 'active' : ''}" onclick="loginMode='register'; render();">회원가입</button>
                </div>
                <div id="loginError" class="login-error" style="display:none;"></div>
                ${isLogin ? `
                    <div class="login-form">
                        <input type="text" id="loginUsername" class="login-input" placeholder="아이디" onkeydown="if(event.key==='Enter')doLogin()">
                        <input type="password" id="loginPassword" class="login-input" placeholder="비밀번호" onkeydown="if(event.key==='Enter')doLogin()">
                        <button class="login-btn" onclick="doLogin()">로그인</button>
                    </div>
                ` : `
                    <div class="login-form">
                        <input type="text" id="regUsername" class="login-input" placeholder="아이디 (3자 이상)">
                        <input type="text" id="regFullName" class="login-input" placeholder="이름">
                        <input type="password" id="regPassword" class="login-input" placeholder="비밀번호 (4자 이상)">
                        <input type="password" id="regPasswordConfirm" class="login-input" placeholder="비밀번호 확인" onkeydown="if(event.key==='Enter')doRegister()">
                        <button class="login-btn" onclick="doRegister()">회원가입</button>
                    </div>
                `}
                <div class="login-version">v${APP_VERSION}</div>
            </div>
        </div>
    `;
}

async function doLogin() {
    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const errEl = document.getElementById('loginError');
    if (!username || !password) {
        errEl.textContent = '아이디와 비밀번호를 입력하세요.';
        errEl.style.display = 'block';
        return;
    }
    try {
        const res = await fetch(API_BASE.replace('/api', '') + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('couponAppUser', JSON.stringify(currentUser));
            loadAccounts();
            render();
        } else {
            errEl.textContent = data.error;
            errEl.style.display = 'block';
        }
    } catch (err) {
        errEl.textContent = '서버 연결에 실패했습니다.';
        errEl.style.display = 'block';
    }
}

async function doRegister() {
    const username = document.getElementById('regUsername')?.value.trim();
    const fullName = document.getElementById('regFullName')?.value.trim();
    const password = document.getElementById('regPassword')?.value;
    const passwordConfirm = document.getElementById('regPasswordConfirm')?.value;
    const errEl = document.getElementById('loginError');

    if (!username || !fullName || !password) {
        errEl.textContent = '모든 항목을 입력하세요.';
        errEl.style.display = 'block';
        return;
    }
    if (password !== passwordConfirm) {
        errEl.textContent = '비밀번호가 일치하지 않습니다.';
        errEl.style.display = 'block';
        return;
    }
    try {
        const res = await fetch(API_BASE.replace('/api', '') + '/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, fullName })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('couponAppUser', JSON.stringify(currentUser));
            loadAccounts();
            render();
        } else {
            errEl.textContent = data.error;
            errEl.style.display = 'block';
        }
    } catch (err) {
        errEl.textContent = '서버 연결에 실패했습니다.';
        errEl.style.display = 'block';
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('couponAppUser');
    render();
}
