'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

const PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { value: 'id:desc', label: '최신순' },
  { value: 'id:asc', label: '오래된순' },
  { value: 'email:asc', label: '이메일' },
  { value: 'name:asc', label: '이름' },
  { value: 'points:desc', label: '포인트높은순' },
  { value: 'points:asc', label: '포인트낮은순' },
  { value: 'birthday:asc', label: '생일' },
  { value: 'updated_at:desc', label: '조회일' },
];

const COUPON_TYPES = [
  { value: '10만원', label: '10만원권' },
  { value: '5만원', label: '5만원권' },
  { value: '3만원', label: '3만원권' },
  { value: '1만원', label: '1만원권' },
  { value: '3천원', label: '3천원권' },
  { value: '20%', label: '20% (생일)' },
  { value: '15%', label: '15%' },
  { value: '10%', label: '10% (웰컴)' },
  { value: '5%', label: '5%' },
  { value: '스타벅스', label: '스타벅스' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }));

const KNOWN_DOMAINS = ['gmail.com', 'naver.com', 'nate.com', 'kakao.com', 'daum.net', 'hanmail.net', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'me.com', 'live.com', 'msn.com'];

interface Voucher {
  code: string;
  description?: string;
  expiry?: string;
  value?: string | number;
  sold?: boolean;
  soldTo?: string;
}

interface Account {
  id: number;
  email: string;
  name: string;
  birthday: string;
  is_active: boolean;
  current_points: number;
  owned_vouchers: any;
  web_fetch_status: string;
  updated_at: string;
}

function parseVouchers(v: any): Voucher[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
}

function getCouponType(v: Voucher): string {
  const desc = (v.description || '').toLowerCase();
  const code = (v.code || '').toUpperCase();
  const val = String(v.value || '');
  if (code.startsWith('REKR100-')) return '10만원';
  if (code.startsWith('REKR50-')) return '5만원';
  if (code.startsWith('REKR30-')) return '3만원';
  if (code.startsWith('REKR10-')) return '1만원';
  if (code.startsWith('RAFFLE_3K-')) return '3천원';
  if (val === '20') return '20%';
  if (val === '3') return '15%';
  if (val === '10' || val === '2') return '10%';
  if (val === '5' || val === '1') return '5%';
  if (desc.includes('starbucks')) return '스타벅스';
  return '기타';
}

// 조회현황 파싱: 한글 DB 값 → 완료/오류/미조회
function getStatusInfo(s: string | null | undefined): { label: string; color: string } {
  if (!s) return { label: '미조회', color: 'text-gray-400 bg-gray-100' };
  if (s.includes('완료')) return { label: '완료', color: 'text-emerald-700 bg-emerald-50' };
  // 오류, 차단, 비밀번호 틀림 등 모두 오류로 표시
  return { label: '오류', color: 'text-red-600 bg-red-50' };
}

// 쿠폰 정렬 우선순위
const COUPON_ORDER: Record<string, number> = {
  '10만원': 0, '5만원': 1, '3만원': 2, '1만원': 3, '3천원': 4,
  '20%': 5, '15%': 6, '10%': 7, '5%': 8,
  '스타벅스': 9, '기타': 10,
};

function sortVouchers(vouchers: Voucher[]): Voucher[] {
  return [...vouchers].sort((a, b) => {
    if (a.sold !== b.sold) return a.sold ? 1 : -1;
    const oa = COUPON_ORDER[getCouponType(a)] ?? 99;
    const ob = COUPON_ORDER[getCouponType(b)] ?? 99;
    return oa - ob;
  });
}

// 쿠폰 카드: 짙은 녹색 계열
const COUPON_ACCENT: Record<string, string> = {
  '10만원': '#065f46', '5만원': '#047857', '3만원': '#059669', '1만원': '#10b981', '3천원': '#34d399',
  '20%': '#065f46', '15%': '#047857', '10%': '#059669', '5%': '#10b981',
  '스타벅스': '#065f46', '기타': '#6b7280',
};

// 유효기간 파싱 (다양한 형식 대응)
function parseExpiry(expiry: string | undefined): Date | null {
  if (!expiry || expiry === '-') return null;
  // "2025-03-31", "25-03-31", "2025.03.31", "25.03.31" 등
  const cleaned = expiry.replace(/\./g, '-').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  // YY-MM-DD
  const m = cleaned.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

function getDaysLeft(expiry: string | undefined): number | null {
  const d = parseExpiry(expiry);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface ExpiringCoupon {
  voucher: Voucher;
  accountId: number;
  email: string;
  type: string;
  daysLeft: number;
}

export default function AccountsPage() {
  const { apiFetch } = useAuth();
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('id:desc');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // 주요 필터
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('true');
  const [status, setStatus] = useState<'' | 'success' | 'error'>('');
  const [couponFilter, setCouponFilter] = useState('');

  // 상세 필터
  const [showMore, setShowMore] = useState(false);
  const [emailType, setEmailType] = useState<'' | 'official' | 'catchall'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minPoints, setMinPoints] = useState('');
  const [maxPoints, setMaxPoints] = useState('');
  const [couponTypes, setCouponTypes] = useState<string[]>([]);
  const [birthMonths, setBirthMonths] = useState<string[]>([]);

  const moreFilterCount = [
    emailType ? 1 : 0,
    dateFrom || dateTo ? 1 : 0,
    minPoints || maxPoints ? 1 : 0,
    couponTypes.length > 0 ? 1 : 0,
    birthMonths.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const effectiveCouponTypes = couponTypes.length > 0
    ? couponTypes
    : couponFilter ? [couponFilter] : [];

  const fetchAccounts = useCallback(async (pageNum: number) => {
    setLoading(true);
    const [sortBy, sortOrder] = sort.split(':');
    const params = new URLSearchParams({
      page: String(pageNum),
      limit: String(PAGE_SIZE),
      sortBy,
      sortOrder,
    });
    if (search) params.set('search', search);
    if (activeFilter) params.set('active', activeFilter);
    if (emailType) params.set('emailType', emailType);
    if (status) params.set('status', status);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (minPoints) params.set('minPoints', minPoints);
    if (maxPoints) params.set('maxPoints', maxPoints);
    if (effectiveCouponTypes.length > 0) params.set('couponTypes', effectiveCouponTypes.join(','));
    if (birthMonths.length > 0) params.set('birthMonths', birthMonths.join(','));

    const res = await apiFetch(`/api/accounts?${params}`);
    const data = await res.json();

    setAccounts(data.accounts || []);
    setPage(pageNum);
    setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, sort, search, activeFilter, emailType, status, dateFrom, dateTo, minPoints, maxPoints, effectiveCouponTypes.join(','), birthMonths]);

  useEffect(() => { fetchAccounts(1); }, [fetchAccounts]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  // 만료 임박 쿠폰 (미사용, 30일 이내)
  const expiringCoupons = useMemo(() => {
    const result: ExpiringCoupon[] = [];
    for (const acc of accounts) {
      const vouchers = parseVouchers(acc.owned_vouchers);
      for (const v of vouchers) {
        if (v.sold || !v.code || v.code === 'N/A') continue;
        const days = getDaysLeft(v.expiry);
        if (days !== null && days >= 0 && days <= 30) {
          result.push({
            voucher: v,
            accountId: acc.id,
            email: acc.email,
            type: getCouponType(v),
            daysLeft: days,
          });
        }
      }
    }
    return result.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [accounts]);

  const goPage = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    fetchAccounts(p);
    window.scrollTo({ top: 0 });
  };

  const resetMore = () => {
    setEmailType('');
    setDateFrom(''); setDateTo('');
    setMinPoints(''); setMaxPoints('');
    setCouponTypes([]); setBirthMonths([]);
  };

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  return (
    <div className="px-4 py-4 space-y-3">
      {/* 만료 임박 쿠폰 */}
      {expiringCoupons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[12px] font-bold text-amber-800">만료 임박 쿠폰 ({expiringCoupons.length})</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {expiringCoupons.slice(0, 20).map((ec, i) => (
              <button key={`${ec.voucher.code}-${i}`}
                onClick={() => router.push(`/accounts/${ec.accountId}`)}
                className="flex-shrink-0 bg-white rounded-xl border border-amber-200 px-3 py-2 text-left active:bg-amber-50 transition shadow-sm"
                style={{ minWidth: '140px' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-800">{ec.type}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    ec.daysLeft <= 3 ? 'bg-red-100 text-red-600' :
                    ec.daysLeft <= 7 ? 'bg-orange-100 text-orange-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {ec.daysLeft === 0 ? '오늘' : `D-${ec.daysLeft}`}
                  </span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5 truncate">{ec.email}</div>
                <div className="font-mono text-[8px] text-gray-400 mt-0.5 truncate">{ec.voucher.code}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="이메일, 이름 검색"
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white shadow-sm transition" />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-2.5 py-2.5 rounded-xl border border-gray-200 text-[11px] outline-none flex-shrink-0 bg-white shadow-sm">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 주요 필터 */}
      <div className="flex gap-1.5">
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as any)}
          className="flex-1 px-2 py-2 rounded-xl border border-gray-200 text-[11px] outline-none min-w-0 bg-white shadow-sm">
          <option value="true">활성</option>
          <option value="false">비활성</option>
          <option value="">전체</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value as any)}
          className="flex-1 px-2 py-2 rounded-xl border border-gray-200 text-[11px] outline-none min-w-0 bg-white shadow-sm">
          <option value="">조회 전체</option>
          <option value="success">완료</option>
          <option value="error">오류</option>
        </select>
        <select value={couponFilter} onChange={e => { setCouponFilter(e.target.value); if (e.target.value) setCouponTypes([]); }}
          className="flex-1 px-2 py-2 rounded-xl border border-gray-200 text-[11px] outline-none min-w-0 bg-white shadow-sm">
          <option value="">쿠폰 전체</option>
          {COUPON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => setShowMore(!showMore)}
          className={`w-9 h-9 flex items-center justify-center rounded-xl border text-[12px] flex-shrink-0 transition shadow-sm
            ${showMore || moreFilterCount > 0 ? 'border-primary-400 bg-primary-50 text-primary-600 font-bold' : 'border-gray-200 bg-white text-gray-400'}`}>
          {moreFilterCount > 0 ? moreFilterCount : '+'}
        </button>
      </div>

      {/* 상세 필터 패널 */}
      {showMore && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <FilterSection title="이메일 종류">
            <div className="flex gap-1.5">
              {[{ v: '', l: '전체' }, { v: 'official', l: '공식이메일' }, { v: 'catchall', l: '캐치올' }].map(o => (
                <button key={o.v} onClick={() => setEmailType(o.v as any)}
                  className={`px-3 py-1.5 text-[11px] rounded-lg transition
                    ${emailType === o.v ? 'bg-primary-500 text-white font-medium shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="조회일">
            <div className="flex gap-2 items-center">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
              <span className="text-xs text-gray-300">~</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
            </div>
          </FilterSection>

          <FilterSection title="포인트">
            <div className="flex gap-2 items-center">
              <input type="number" placeholder="최소" value={minPoints} onChange={e => setMinPoints(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
              <span className="text-xs text-gray-300">~</span>
              <input type="number" placeholder="최대" value={maxPoints} onChange={e => setMaxPoints(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
            </div>
          </FilterSection>

          <FilterSection title={`쿠폰 복수선택${couponTypes.length > 0 ? ` (${couponTypes.length})` : ''}`}>
            <div className="flex flex-wrap gap-1.5">
              {COUPON_TYPES.map(t => (
                <button key={t.value} onClick={() => { setCouponTypes(toggleArrayItem(couponTypes, t.value)); setCouponFilter(''); }}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition
                    ${couponTypes.includes(t.value) ? 'bg-primary-500 border-primary-500 text-white font-medium' : 'border-gray-200 text-gray-400 bg-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title={`생일${birthMonths.length > 0 ? ` (${birthMonths.length})` : ''}`}>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map(m => (
                <button key={m.value} onClick={() => setBirthMonths(toggleArrayItem(birthMonths, m.value))}
                  className={`w-10 py-1 text-[11px] rounded-lg border text-center transition
                    ${birthMonths.includes(m.value) ? 'bg-primary-500 border-primary-500 text-white font-medium' : 'border-gray-200 text-gray-400 bg-white'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {moreFilterCount > 0 && (
            <button onClick={resetMore}
              className="w-full py-2.5 text-xs text-gray-500 border border-gray-200 rounded-xl active:bg-gray-50 transition">
              상세 필터 초기화
            </button>
          )}
        </div>
      )}

      {/* 계정 카드 목록 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">계정이 없습니다</div>
      ) : (
        <>
          <div className="space-y-3">
            {accounts.map(acc => {
              const vouchers = sortVouchers(parseVouchers(acc.owned_vouchers));
              const statusInfo = getStatusInfo(acc.web_fetch_status);

              return (
                <div key={acc.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* 상단: 계정 정보 한 줄 */}
                  <button onClick={() => router.push(`/accounts/${acc.id}`)}
                    className="w-full px-3 py-2.5 text-left active:bg-gray-50/50 transition">
                    <div className="grid items-center gap-0" style={{ gridTemplateColumns: '6px 1fr 44px 44px 60px 38px 16px' }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                      <span className="text-[12px] font-semibold text-gray-800 truncate">
                        {acc.email}
                      </span>
                      <span className="text-[10px] text-gray-500 text-center truncate">{acc.name || '-'}</span>
                      <span className="text-[10px] text-gray-400 text-center">
                        {acc.birthday ? acc.birthday.slice(5) : '-'}
                      </span>
                      <span className="text-[10px] font-bold text-primary-600 text-left">
                        P {(acc.current_points || 0).toLocaleString()}
                      </span>
                      <span className={`text-[9px] font-semibold text-center py-0.5 rounded ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <svg className="w-3.5 h-3.5 text-gray-300 justify-self-end" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* 하단: 쿠폰 목록 (2열 그리드) */}
                  {vouchers.length > 0 && (
                    <div className="border-t border-gray-50 px-3 pb-3 pt-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        {vouchers.map((v, i) => {
                          const type = getCouponType(v);
                          const accent = COUPON_ACCENT[type] || COUPON_ACCENT['기타'];
                          const daysLeft = getDaysLeft(v.expiry);
                          const isExpiring = daysLeft !== null && daysLeft <= 7 && !v.sold;

                          return (
                            <div key={`${v.code}-${i}`}
                              className={`relative rounded-lg overflow-hidden ${v.sold ? 'opacity-40' : ''}`}
                              style={{ borderLeft: `3px solid ${v.sold ? '#d1d5db' : accent}`, background: v.sold ? '#f9fafb' : '#ecfdf5' }}>
                              <div className="px-2 py-1.5">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[11px] font-bold ${v.sold ? 'text-gray-400' : 'text-emerald-800'}`}>
                                    {type}
                                  </span>
                                  {v.sold ? (
                                    <span className="text-[8px] font-bold text-white bg-gray-400 px-1 py-px rounded">사용</span>
                                  ) : (
                                    <span className="text-[8px] font-bold text-white bg-emerald-600 px-1 py-px rounded">보유</span>
                                  )}
                                </div>
                                <div className={`font-mono text-[9px] mt-0.5 truncate ${v.sold ? 'text-gray-400 line-through' : 'text-emerald-700/70'}`}>
                                  {v.code}
                                </div>
                                {v.expiry && v.expiry !== '-' && (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className={`text-[8px] ${v.sold ? 'text-gray-400' : 'text-emerald-600/60'}`}>~{v.expiry}</span>
                                    {isExpiring && daysLeft !== null && (
                                      <span className={`text-[8px] font-bold ${daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                                        D-{daysLeft}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 페이징 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-3 pb-6">
              <button onClick={() => goPage(page - 1)} disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center text-sm rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 bg-white shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {pageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dot-${i}`} className="px-1 text-xs text-gray-300">...</span>
                ) : (
                  <button key={p} onClick={() => goPage(p as number)}
                    className={`min-w-[32px] h-8 text-xs rounded-lg border transition shadow-sm
                      ${page === p ? 'bg-primary-600 text-white border-primary-600 font-bold' : 'border-gray-200 text-gray-500 bg-white active:bg-gray-50'}`}>
                    {p}
                  </button>
                )
              )}
              <button onClick={() => goPage(page + 1)} disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center text-sm rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 bg-white shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function pageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
