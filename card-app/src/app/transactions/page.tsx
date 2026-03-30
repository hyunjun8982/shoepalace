'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  CardTransaction,
  ORGANIZATION_MAP,
  PAYMENT_TYPE_MAP,
  CANCEL_STATUS_MAP,
  ORG_COLORS,
} from '@/types';
import dayjs from 'dayjs';

function formatAmount(n: number) {
  return Math.floor(n).toLocaleString('ko-KR');
}

function orgName(code: string) {
  return ORGANIZATION_MAP[code] || code;
}

function orgColor(code: string) {
  return ORG_COLORS[code] || '#6b7280';
}

export default function TransactionsPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<CardTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [detail, setDetail] = useState<CardTransaction | null>(null);

  // filters
  const [startDate, setStartDate] = useState(() => dayjs().subtract(1, 'month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [search, setSearch] = useState('');
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [clientType, setClientType] = useState<'' | 'P' | 'B'>('');

  // available filter options (from DB)
  const [availableOrgs, setAvailableOrgs] = useState<string[]>([]);
  const [availableOwners, setAvailableOwners] = useState<string[]>([]);
  const [availableAssignedUsers, setAvailableAssignedUsers] = useState<string[]>([]);
  const [selectedAssignedUser, setSelectedAssignedUser] = useState('');

  // stats
  const [stats, setStats] = useState({ total_amount: 0, total_count: 0 });

  const PAGE_SIZE = 30;

  // Fetch available filter options
  useEffect(() => {
    apiFetch('/api/transactions/filters')
      .then(r => r.json())
      .then(data => {
        setAvailableOrgs(data.organizations || []);
        setAvailableOwners(data.owners || []);
        setAvailableAssignedUsers(data.assigned_users || []);
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
    if (clientType) params.set('client_type', clientType);
    if (selectedAssignedUser) params.set('assigned_user', selectedAssignedUser);

    try {
      const res = await apiFetch(`/api/transactions?${params}`);
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
  }, [apiFetch, page, startDate, endDate, search, selectedOrgs, selectedOwners, clientType, selectedAssignedUser, availableOrgs.length, availableOwners.length]);

  const fetchStats = useCallback(async () => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (selectedOrgs.size > 0 && selectedOrgs.size < availableOrgs.length) {
      params.set('organizations', Array.from(selectedOrgs).join(','));
    }
    if (selectedOwners.size > 0 && selectedOwners.size < availableOwners.length) {
      params.set('owners', Array.from(selectedOwners).join(','));
    }
    if (clientType) params.set('client_type', clientType);
    if (selectedAssignedUser) params.set('assigned_user', selectedAssignedUser);
    try {
      const res = await apiFetch(`/api/transactions/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } catch {
      // ignore
    }
  }, [apiFetch, startDate, endDate, selectedOrgs, selectedOwners, clientType, selectedAssignedUser, availableOrgs.length, availableOwners.length]);

  useEffect(() => {
    fetchData(true);
    fetchStats();
  }, [startDate, endDate, selectedOrgs, selectedOwners, clientType, selectedAssignedUser]);

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
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs text-gray-500">총 이용금액</span>
          <span className="text-xs text-gray-400">{stats.total_count}건</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {formatAmount(stats.total_amount)}원
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="가맹점, 카드번호, 승인번호"
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

        {/* Client Type Filter */}
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">구분</label>
          <div className="flex gap-2">
            {[
              { label: '전체', value: '' as const },
              { label: '개인', value: 'P' as const },
              { label: '법인', value: 'B' as const },
            ].map(btn => (
              <button
                key={btn.value}
                onClick={() => setClientType(btn.value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition
                  ${clientType === btn.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                    : 'border-gray-200 text-gray-400'}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Card Company Multi-Select */}
        {availableOrgs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">카드사</label>
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
                  {orgName(org)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Assigned User Filter */}
        {availableAssignedUsers.length > 0 && (
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">카드사용자</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedAssignedUser('')}
                className={`px-2.5 py-1 text-xs rounded-full border transition
                  ${selectedAssignedUser === ''
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-400'}`}
              >
                전체
              </button>
              {availableAssignedUsers.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedAssignedUser(selectedAssignedUser === name ? '' : name)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition
                    ${selectedAssignedUser === name
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-400'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Owner Multi-Select */}
        {availableOwners.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">소유자</label>
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
        {items.map(tx => (
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
                    style={{ backgroundColor: orgColor(tx.organization) }}
                  />
                  <span className="text-[11px] text-gray-400">
                    {orgName(tx.organization)}{tx.client_type ? `[${tx.client_type === 'B' ? '법인' : '개인'}]` : ''}
                  </span>
                  {tx.assigned_user ? (
                    <span className="text-[11px] text-blue-600 font-medium">{tx.assigned_user}</span>
                  ) : tx.owner_name ? (
                    <span className="text-[11px] text-gray-400 font-medium">{tx.owner_name}</span>
                  ) : null}
                  {tx.cancel_status !== 'normal' && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 text-red-500">
                      {CANCEL_STATUS_MAP[tx.cancel_status] || tx.cancel_status}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">
                  {tx.merchant_name || '(가맹점 없음)'}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {tx.used_date} {tx.used_time?.slice(0, 5)}
                  {tx.card_no && ` · ${tx.card_no.slice(-4)}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                {tx.cancel_status === 'partial' ? (
                  <>
                    <p className="text-sm font-bold text-gray-900">
                      {formatAmount(tx.used_amount - (tx.cancel_amount || 0))}원
                    </p>
                    <p className="text-[11px] text-red-400 line-through">
                      {formatAmount(tx.used_amount)}원
                    </p>
                  </>
                ) : (
                  <p className={`text-sm font-bold ${tx.cancel_status !== 'normal' ? 'text-red-500 line-through' : 'text-gray-900'}`}>
                    {formatAmount(tx.used_amount)}원
                  </p>
                )}
                {tx.payment_type && (
                  <p className="text-[11px] text-gray-400">
                    {PAYMENT_TYPE_MAP[tx.payment_type] || tx.payment_type}
                    {tx.installment_month && tx.installment_month > 1 && ` ${tx.installment_month}개월`}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
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
          이용내역이 없습니다
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
                <p className="text-lg font-bold text-gray-900">{detail.merchant_name || '(가맹점 없음)'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{orgName(detail.organization)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              {detail.cancel_status === 'partial' ? (
                <>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatAmount(detail.used_amount - (detail.cancel_amount || 0))}원
                    <span className="text-sm text-red-500 ml-2">(부분취소)</span>
                  </div>
                  <div className="text-sm text-gray-400 line-through mt-0.5">
                    원래 {formatAmount(detail.used_amount)}원 → 취소 {formatAmount(detail.cancel_amount || 0)}원
                  </div>
                </>
              ) : (
                <div className="text-2xl font-bold text-gray-900">
                  {formatAmount(detail.used_amount)}원
                  {detail.cancel_status !== 'normal' && (
                    <span className="text-sm text-red-500 ml-2">({CANCEL_STATUS_MAP[detail.cancel_status]})</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['이용일시', `${detail.used_date} ${detail.used_time || ''}`],
                ['카드번호', detail.card_no],
                ['카드명', detail.card_name],
                ['소유자', detail.owner_name],
                ['사용자', detail.assigned_user],
                ['구분', detail.client_type === 'B' ? '법인' : detail.client_type === 'P' ? '개인' : null],
                ['결제유형', detail.payment_type ? (PAYMENT_TYPE_MAP[detail.payment_type] || detail.payment_type) : null],
                ['할부', detail.installment_month && detail.installment_month > 1 ? `${detail.installment_month}개월` : null],
                ['승인번호', detail.approval_no],
                ['가맹점 주소', detail.merchant_addr],
                ['가맹점 전화', detail.merchant_tel],
                ['부가세', detail.vat != null ? `${formatAmount(detail.vat)}원` : null],
                ['수수료', detail.service_fee != null ? `${formatAmount(detail.service_fee)}원` : null],
                ['결제예정일', detail.payment_due_date],
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
