'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BankTransaction, BANK_ORGANIZATION_MAP, BANK_COLORS } from '@/types';
import dayjs from 'dayjs';

function formatAmount(n: number) {
  return Math.floor(n).toLocaleString('ko-KR');
}

function bankName(code: string) {
  return BANK_ORGANIZATION_MAP[code] || code;
}

function bankColor(code: string) {
  return BANK_COLORS[code] || '#6b7280';
}

function formatTime(t?: string) {
  if (!t || t.length < 4) return '';
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
}

export default function BankPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [detail, setDetail] = useState<BankTransaction | null>(null);

  // filters
  const [startDate, setStartDate] = useState(() => dayjs().subtract(1, 'month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [search, setSearch] = useState('');
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());

  // available filter options (from DB)
  const [availableOrgs, setAvailableOrgs] = useState<string[]>([]);
  const [availableOwners, setAvailableOwners] = useState<string[]>([]);

  // stats
  const [stats, setStats] = useState({ total_in: 0, total_out: 0, total_count: 0 });

  const PAGE_SIZE = 30;

  // Fetch available filter options
  useEffect(() => {
    apiFetch('/api/bank/filters')
      .then(r => r.json())
      .then(data => {
        setAvailableOrgs(data.organizations || []);
        setAvailableOwners(data.owners || []);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (reset = false) => {
    setLoading(true);
    const skip = reset ? 0 : page * PAGE_SIZE;
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(PAGE_SIZE),
      start_date: startDate,
      end_date: endDate,
    });
    if (search) params.set('search', search);
    if (selectedOrgs.size > 0 && selectedOrgs.size < availableOrgs.length) {
      params.set('organizations', Array.from(selectedOrgs).join(','));
    }
    if (selectedOwners.size > 0 && selectedOwners.size < availableOwners.length) {
      params.set('owners', Array.from(selectedOwners).join(','));
    }

    try {
      const res = await apiFetch(`/api/bank?${params}`);
      const data = await res.json();
      if (reset) {
        setItems(data.items);
        setPage(1);
      } else {
        setItems(prev => [...prev, ...data.items]);
        setPage(prev => prev + 1);
      }
      setTotal(data.total);
      setHasMore(skip + data.items.length < data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, startDate, endDate, search, selectedOrgs, selectedOwners, availableOrgs.length, availableOwners.length]);

  const fetchStats = useCallback(async () => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (selectedOrgs.size > 0 && selectedOrgs.size < availableOrgs.length) {
      params.set('organizations', Array.from(selectedOrgs).join(','));
    }
    if (selectedOwners.size > 0 && selectedOwners.size < availableOwners.length) {
      params.set('owners', Array.from(selectedOwners).join(','));
    }
    try {
      const res = await apiFetch(`/api/bank/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } catch {
      // ignore
    }
  }, [apiFetch, startDate, endDate, selectedOrgs, selectedOwners, availableOrgs.length, availableOwners.length]);

  useEffect(() => {
    fetchData(true);
    fetchStats();
  }, [startDate, endDate, selectedOrgs, selectedOwners]);

  const handleSearch = () => {
    fetchData(true);
    fetchStats();
  };

  const toggleOrg = (org: string) => {
    setSelectedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });
  };

  const toggleOwner = (owner: string) => {
    setSelectedOwners(prev => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  };

  return (
    <div className="px-4 pt-3">
      {/* Stats Summary */}
      <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-xs text-gray-500">입출금 요약</span>
          <span className="text-xs text-gray-400">{stats.total_count}건</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <span className="text-[11px] text-blue-400">입금</span>
            <p className="text-lg font-bold text-blue-600">{formatAmount(stats.total_in)}원</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <span className="text-[11px] text-red-400">출금</span>
            <p className="text-lg font-bold text-red-500">{formatAmount(stats.total_out)}원</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="적요, 계좌번호 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none"
          />
          <button
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter Panel (always visible) */}
      <div className="bg-white rounded-xl p-4 mb-3 shadow-sm space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { label: '오늘', fn: () => { setStartDate(dayjs().format('YYYY-MM-DD')); setEndDate(dayjs().format('YYYY-MM-DD')); } },
            { label: '1주', fn: () => { setStartDate(dayjs().subtract(7, 'day').format('YYYY-MM-DD')); setEndDate(dayjs().format('YYYY-MM-DD')); } },
            { label: '1개월', fn: () => { setStartDate(dayjs().subtract(1, 'month').format('YYYY-MM-DD')); setEndDate(dayjs().format('YYYY-MM-DD')); } },
            { label: '3개월', fn: () => { setStartDate(dayjs().subtract(3, 'month').format('YYYY-MM-DD')); setEndDate(dayjs().format('YYYY-MM-DD')); } },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.fn}
              className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Bank Multi-Select */}
        {availableOrgs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">은행</label>
              <button
                onClick={() => setSelectedOrgs(selectedOrgs.size === 0 ? new Set(availableOrgs) : new Set())}
                className="text-[11px] text-primary-600"
              >
                {selectedOrgs.size === 0 ? '전체 선택' : '전체 해제'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableOrgs.map(org => (
                <button
                  key={org}
                  onClick={() => toggleOrg(org)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition
                    ${selectedOrgs.has(org)
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-400'}`}
                >
                  {bankName(org)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Owner Multi-Select */}
        {availableOwners.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">사용자</label>
              <button
                onClick={() => setSelectedOwners(selectedOwners.size === 0 ? new Set(availableOwners) : new Set())}
                className="text-[11px] text-primary-600"
              >
                {selectedOwners.size === 0 ? '전체 선택' : '전체 해제'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableOwners.map(owner => (
                <button
                  key={owner}
                  onClick={() => toggleOwner(owner)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition
                    ${selectedOwners.has(owner)
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-400'}`}
                >
                  {owner}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="space-y-2 mb-4">
        {items.map(tx => {
          const isIn = tx.tr_amount_in > 0;
          const amount = isIn ? tx.tr_amount_in : tx.tr_amount_out;
          const desc = tx.description1 || tx.description2 || '(내용 없음)';

          return (
            <button
              key={tx.id}
              onClick={() => setDetail(tx)}
              className="w-full bg-white rounded-xl p-3 shadow-sm text-left active:bg-gray-50 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: bankColor(tx.organization) }}
                    />
                    <span className="text-[11px] text-gray-400">
                      {bankName(tx.organization)}{tx.client_type ? `[${tx.client_type === 'B' ? '법인' : '개인'}]` : ''}
                    </span>
                    {tx.owner_name && (
                      <span className="text-[11px] text-gray-400 font-medium">{tx.owner_name}</span>
                    )}
                    {tx.account_no && (
                      <span className="text-[11px] text-gray-300">
                        {tx.account_no.slice(-4)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{desc}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {tx.tr_date} {formatTime(tx.tr_time)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className={`text-sm font-bold ${isIn ? 'text-blue-600' : 'text-gray-900'}`}>
                    {isIn ? '+' : '-'}{formatAmount(amount)}원
                  </p>
                  <p className="text-[11px] text-gray-400">
                    잔액 {formatAmount(tx.balance)}원
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center pb-4">
          <button
            onClick={() => fetchData(false)}
            disabled={loading}
            className="px-6 py-2 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50 transition"
          >
            {loading ? '로딩 중...' : '더 보기'}
          </button>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          입출금 내역이 없습니다
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {detail.description1 || detail.description2 || '(내용 없음)'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{bankName(detail.organization)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              {detail.tr_amount_in > 0 && (
                <p className="text-2xl font-bold text-blue-600">+{formatAmount(detail.tr_amount_in)}원</p>
              )}
              {detail.tr_amount_out > 0 && (
                <p className="text-2xl font-bold text-gray-900">-{formatAmount(detail.tr_amount_out)}원</p>
              )}
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['거래일시', `${detail.tr_date} ${formatTime(detail.tr_time)}`],
                ['계좌번호', detail.account_no],
                ['계좌명', detail.account_name],
                ['예금주', detail.account_holder],
                ['소유자', detail.owner_name],
                ['구분', detail.client_type === 'B' ? '법인' : detail.client_type === 'P' ? '개인' : null],
                ['적요1', detail.description1],
                ['적요2', detail.description2],
                ['메모', detail.description3],
                ['거래구분', detail.description4],
                ['거래후잔액', `${formatAmount(detail.balance)}원`],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-gray-800 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
