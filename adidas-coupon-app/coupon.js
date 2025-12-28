/**
 * 아디다스 쿠폰 관리자 - 쿠폰 관련 모듈
 */

// 쿠폰명 한글 변환 및 아이콘 매핑 (shortName: 카드 표시용 짧은 이름)
const COUPON_MAP = {
    // 금액 상품권 (우선순위 최상위)
    '100k': { name: '10만원 상품권', shortName: '100000원', icon: '💰', color: '#2e8b57' },
    '100000': { name: '10만원 상품권', shortName: '100000원', icon: '💰', color: '#2e8b57' },
    '50k': { name: '5만원 상품권', shortName: '50000원', icon: '💰', color: '#2e8b57' },
    '50000': { name: '5만원 상품권', shortName: '50000원', icon: '💰', color: '#2e8b57' },
    '30k': { name: '3만원 상품권', shortName: '30000원', icon: '💰', color: '#2e8b57' },
    '30000': { name: '3만원 상품권', shortName: '30000원', icon: '💰', color: '#2e8b57' },
    '20k': { name: '2만원 상품권', shortName: '20000원', icon: '💰', color: '#2e8b57' },
    '20000': { name: '2만원 상품권', shortName: '20000원', icon: '💰', color: '#2e8b57' },
    '10k': { name: '1만원 상품권', shortName: '10000원', icon: '💰', color: '#2e8b57' },
    '10000': { name: '1만원 상품권', shortName: '10000원', icon: '💰', color: '#2e8b57' },
    '3k': { name: '3천원 상품권', shortName: '3000원', icon: '💰', color: '#2e8b57' },
    '3000': { name: '3천원 상품권', shortName: '3000원', icon: '💰', color: '#2e8b57' },
    // 아디클럽 티어 할인 (짙은 녹색으로 통일)
    'tier1': { name: '아디클럽 5%', shortName: '5%', icon: '🏷️', color: '#2e8b57' },
    'tier_1': { name: '아디클럽 5%', shortName: '5%', icon: '🏷️', color: '#2e8b57' },
    'tier 1': { name: '아디클럽 5%', shortName: '5%', icon: '🏷️', color: '#2e8b57' },
    '5%': { name: '아디클럽 5%', shortName: '5%', icon: '🏷️', color: '#2e8b57' },
    'tier2': { name: '아디클럽 10%', shortName: '10%', icon: '🏷️', color: '#2e8b57' },
    'tier_2': { name: '아디클럽 10%', shortName: '10%', icon: '🏷️', color: '#2e8b57' },
    'tier 2': { name: '아디클럽 10%', shortName: '10%', icon: '🏷️', color: '#2e8b57' },
    '10%': { name: '아디클럽 10%', shortName: '10%', icon: '🏷️', color: '#2e8b57' },
    'tier3': { name: '아디클럽 15%', shortName: '15%', icon: '🏷️', color: '#2e8b57' },
    'tier_3': { name: '아디클럽 15%', shortName: '15%', icon: '🏷️', color: '#2e8b57' },
    'tier 3': { name: '아디클럽 15%', shortName: '15%', icon: '🏷️', color: '#2e8b57' },
    '15%': { name: '아디클럽 15%', shortName: '15%', icon: '🏷️', color: '#2e8b57' },
    'tier4': { name: '아디클럽 20%', shortName: '20%', icon: '🏷️', color: '#2e8b57' },
    'tier_4': { name: '아디클럽 20%', shortName: '20%', icon: '🏷️', color: '#2e8b57' },
    'tier 4': { name: '아디클럽 20%', shortName: '20%', icon: '🏷️', color: '#2e8b57' },
    '20%': { name: '아디클럽 20%', shortName: '20%', icon: '🏷️', color: '#2e8b57' },
    // 웰컴 쿠폰
    'welcome': { name: '웰컴 쿠폰', shortName: 'Welcome', icon: '🎉', color: '#faad14' },
    // 생일 쿠폰
    'birthday': { name: '생일 쿠폰', shortName: '생일', icon: '🎂', color: '#eb2f96' },
    // 무료배송
    'free shipping': { name: '무료배송', shortName: '무료배송', icon: '🚚', color: '#13c2c2' },
    'freeshipping': { name: '무료배송', shortName: '무료배송', icon: '🚚', color: '#13c2c2' },
    // 네이버 멤버십
    'naver membership': { name: '네이버 멤버십', shortName: '네이버 멤버십', icon: '🟢', color: '#03C75A' },
    'naver_membership': { name: '네이버 멤버십', shortName: '네이버 멤버십', icon: '🟢', color: '#03C75A' },
    // 스타벅스
    'starbucks': { name: '스타벅스', shortName: '스타벅스', icon: '☕', color: '#00704A' },
    'kr_starbucks': { name: '스타벅스', shortName: '스타벅스', icon: '☕', color: '#00704A' },
};

// 쿠폰 정렬 우선순위 (낮을수록 먼저 표시)
function getCouponSortPriority(description) {
    if (!description) return 999;
    const lowerDesc = description.toLowerCase();

    // 금액권 (최우선)
    if (lowerDesc.includes('100k') || lowerDesc.includes('100000')) return 10;
    if (lowerDesc.includes('50k') || lowerDesc.includes('50000')) return 20;
    if (lowerDesc.includes('30k') || lowerDesc.includes('30000')) return 30;
    if (lowerDesc.includes('20k') || lowerDesc.includes('20000')) return 40;
    if (lowerDesc.includes('10k') || lowerDesc.includes('10000')) return 50;
    if (lowerDesc.includes('3k') || lowerDesc.includes('3000')) return 60;

    // 할인율 쿠폰
    if (lowerDesc.includes('20%') || lowerDesc.includes('tier4') || lowerDesc.includes('tier_4') || lowerDesc.includes('tier 4')) return 100;
    if (lowerDesc.includes('15%') || lowerDesc.includes('tier3') || lowerDesc.includes('tier_3') || lowerDesc.includes('tier 3')) return 110;
    if (lowerDesc.includes('10%') || lowerDesc.includes('tier2') || lowerDesc.includes('tier_2') || lowerDesc.includes('tier 2')) return 120;
    if (lowerDesc.includes('5%') || lowerDesc.includes('tier1') || lowerDesc.includes('tier_1') || lowerDesc.includes('tier 1')) return 130;

    // 생일 쿠폰
    if (lowerDesc.includes('birthday')) return 200;

    // 무료배송
    if (lowerDesc.includes('free shipping') || lowerDesc.includes('freeshipping')) return 210;

    // 기타 쿠폰 (네이버 멤버십, 웰컴 등)
    if (lowerDesc.includes('naver') || lowerDesc.includes('membership')) return 300;
    if (lowerDesc.includes('welcome')) return 310;
    if (lowerDesc.includes('starbucks')) return 320;

    return 500; // 기타
}

// 쿠폰 목록 정렬 함수
function sortVouchers(vouchers) {
    if (!vouchers || vouchers.length === 0) return vouchers;
    return [...vouchers].sort((a, b) => {
        const priorityA = getCouponSortPriority(a.description);
        const priorityB = getCouponSortPriority(b.description);
        return priorityA - priorityB;
    });
}

function getCouponDisplayInfo(description) {
    if (!description) return { name: description || '쿠폰', icon: '🎫', color: '#666' };

    const lowerDesc = description.toLowerCase();

    // 매핑 테이블에서 찾기
    for (const [key, value] of Object.entries(COUPON_MAP)) {
        if (lowerDesc.includes(key)) {
            return value;
        }
    }

    // 기본값
    return { name: description, icon: '🎫', color: '#666' };
}

// 필터용 쿠폰 타입명 조회
function getCouponTypeName(type) {
    const typeMap = {
        '100k': '10만원',
        '50k': '5만원',
        '30k': '3만원',
        '20k': '2만원',
        '10k': '1만원',
        '3k': '3천원',
        'tier1': '아디클럽 5%',
        'tier2': '아디클럽 10%',
        'tier3': '아디클럽 15%',
        'tier4': '아디클럽 20%',
        'birthday': '생일',
        'welcome': '웰컴',
        'freeshipping': '무료배송',
        'naver': '네이버페이',
        'starbucks': '스타벅스',
    };
    return typeMap[type] || type;
}

// 유효기간이 1주일 이내인지 체크 (당일 포함)
function isExpiringWithinWeek(expiryDate) {
    if (!expiryDate || expiryDate === 'N/A') return false;
    try {
        const expiry = new Date(expiryDate);
        expiry.setHours(23, 59, 59, 999);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const oneWeekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        return expiry <= oneWeekLater && expiry >= today;
    } catch {
        return false;
    }
}

// 유효기간이 만료되었는지 체크 (만료일 당일은 아직 유효)
function isExpired(expiryDate) {
    if (!expiryDate || expiryDate === 'N/A') return false;
    try {
        const expiry = new Date(expiryDate);
        expiry.setHours(23, 59, 59, 999);
        const now = new Date();
        return expiry < now;
    } catch {
        return false;
    }
}

// 상태 렌더링 함수
function renderFetchStatus(status, label = '조회') {
    if (!status) return '';

    const lines = status.split('\n');
    const tags = lines.map(line => {
        let tagClass = 'tag-default';

        if (line.includes('조회 중')) {
            tagClass = 'tag-processing';
        } else if (line.includes('완료')) {
            tagClass = 'tag-success';
        } else if (line.includes('비밀번호 틀림') || line.includes('PASSWORD_WRONG')) {
            tagClass = 'tag-error';
        } else if (line.includes('오류') || line.includes('실패')) {
            tagClass = 'tag-error';
        } else if (line.includes('발급일')) {
            tagClass = 'tag-warning';
        }

        return `<span class="tag ${tagClass}">${line}</span>`;
    }).join(' ');

    return `<div class="status-row fetch-status">${tags}</div>`;
}

function renderIssueStatus(status) {
    if (!status) return '';

    let tagClass = 'tag-default';

    if (status.includes('발급 중')) {
        tagClass = 'tag-issue-processing';
    } else if (status.includes('발급 완료')) {
        tagClass = 'tag-issue-success';
    } else if (status.includes('비밀번호 틀림') || status.includes('PASSWORD_WRONG')) {
        tagClass = 'tag-issue-error';
    } else if (status.includes('포인트 부족') || status.includes('쿠폰 버튼 없음')) {
        tagClass = 'tag-issue-warning';
    } else if (status.includes('오류') || status.includes('실패') || status.includes('없음')) {
        tagClass = 'tag-issue-error';
    }

    return `<div class="status-row issue-status"><span class="tag ${tagClass}">${status}</span></div>`;
}
