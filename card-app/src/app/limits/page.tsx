'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ORGANIZATION_MAP, ORG_COLORS } from '@/types';

function formatAmount(n: number) {
  return Math.floor(n).toLocaleString('ko-KR');
}

function orgName(code: string) {
  return ORGANIZATION_MAP[code] || code;
}

function orgColor(code: string) {
  return ORG_COLORS[code] || '#6b7280';
}

interface LimitItem {
  organization: string;
  client_type: string;
  owner_name: string;
  total_limit?: number | null;
  used_limit?: number | null;
  remaining_limit?: number | null;
  one_time_limit?: number | null;
  installment_limit?: number | null;
  cash_advance_limit?: number | null;
  error?: string;
}

export default function LimitsPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<LimitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<LimitItem | null>(null);
  const [refreshingOrg, setRefreshingOrg] = useState<string | null>(null);

  // 개별 카드사 갱신
  const handleRefreshOne = (org: string, clientType: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = `${org}_${clientType}`;
    setRefreshingOrg(key);
    apiFetch('/api/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization: org, client_type: clientType }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.error && data.cards?.length) {
          const updated = data.cards[0];
          setItems(prev => prev.map(item =>
            item.organization === org && item.client_type === clientType ? { ...item, ...updated } : item
          ));
          setLastFetchedAt(new Date().toLocaleString('ko-KR'));
        }
      })
      .catch(() => {})
      .finally(() => setRefreshingOrg(null));
  };

  // DB에서 이전 조회 결과 로드
  useEffect(() => {
    apiFetch('/api/limits')
      .then(r => r.json())
      .then(data => {
        if (!data.error && data.cards?.length) {
          setItems(data.cards);
          if (data.fetched_at) {
            setLastFetchedAt(new Date(data.fetched_at).toLocaleString('ko-KR'));
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleFetch = () => {
    setLoading(true);
    setError('');
    apiFetch('/api/limits', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setItems(data.cards || []);
          setLastFetchedAt(new Date().toLocaleString('ko-KR'));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const validItems = items.filter(c => c.total_limit != null);
  const errorItems = items.filter(c => c.error && c.total_limit == null);

  // 총합
  const totalLimit = validItems.reduce((s, c) => s + (c.total_limit || 0), 0);
  const totalUsed = validItems.reduce((s, c) => s + (c.used_limit || 0), 0);
  const totalRemaining = validItems.reduce((s, c) => s + (c.remaining_limit || 0), 0);
  const totalUsageRate = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  return (
    <div className="px-4 pt-3">
      {/* 조회 버튼 */}
      <div className="mb-3">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
            hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              조회 중...
            </>
          ) : (
            '카드 한도 조회'
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 rounded-xl p-4 text-sm text-red-600 mb-3">{error}</div>
      )}

      {!lastFetchedAt && !loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          조회 버튼을 눌러 카드 한도를 확인하세요
        </div>
      )}

      {lastFetchedAt && (
        <p className="text-[11px] text-gray-400 text-right mb-2">마지막 조회: {lastFetchedAt}</p>
      )}

      {/* Summary */}
      {validItems.length > 0 && (
        <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-gray-500">총 한도 / 사용</span>
            <span className="text-xs text-gray-400">{validItems.length}개 카드사</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatAmount(totalRemaining)}원 <span className="text-sm font-normal text-gray-400">잔여</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(100, totalUsageRate)}%`,
                backgroundColor: totalUsageRate > 80 ? '#ef4444' : totalUsageRate > 60 ? '#f59e0b' : '#3b82f6',
              }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-400">사용 {formatAmount(totalUsed)}원</span>
            <span className="text-gray-400">한도 {formatAmount(totalLimit)}원</span>
          </div>
        </div>
      )}

      {/* 카드사별 한도 */}
      <div className="space-y-2 mb-4">
        {validItems.map((item, idx) => {
          const color = orgColor(item.organization);
          const usageRate = item.total_limit && item.total_limit > 0
            ? ((item.used_limit || 0) / item.total_limit) * 100 : 0;

          return (
            <button
              key={idx}
              onClick={() => setDetail(item)}
              className="w-full bg-white rounded-xl shadow-sm p-4 text-left active:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {orgName(item.organization).slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-800">
                    {orgName(item.organization)}[{item.client_type === 'B' ? '법인' : '개인'}]
                  </span>
                  {item.owner_name && (
                    <span className="text-xs text-gray-400 ml-2">{item.owner_name}</span>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {formatAmount(item.remaining_limit || 0)}원
                    </p>
                    <p className="text-[11px] text-gray-400">잔여</p>
                  </div>
                  <button
                    onClick={(e) => handleRefreshOne(item.organization, item.client_type, e)}
                    disabled={refreshingOrg === `${item.organization}_${item.client_type}`}
                    className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition"
                    title="갱신"
                  >
                    <svg
                      className={`w-4 h-4 text-gray-400 ${refreshingOrg === `${item.organization}_${item.client_type}` ? 'animate-spin' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, usageRate)}%`,
                    backgroundColor: usageRate > 80 ? '#ef4444' : usageRate > 60 ? '#f59e0b' : color,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] mt-0.5">
                <span className="text-gray-400">사용 {formatAmount(item.used_limit || 0)}원</span>
                <span className="text-gray-400">한도 {formatAmount(item.total_limit || 0)}원</span>
              </div>
            </button>
          );
        })}
      </div>

      {lastFetchedAt && validItems.length === 0 && errorItems.length === 0 && !error && (
        <div className="text-center py-12 text-gray-400 text-sm">
          연결된 카드가 없습니다
        </div>
      )}

      {/* Error items */}
      {errorItems.length > 0 && (
        <div className="bg-red-50 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-500 font-medium mb-1">조회 실패</p>
          {errorItems.map((c, i) => (
            <div key={i} className="flex items-center justify-between">
              <p className="text-xs text-red-400">
                {orgName(c.organization)}[{c.client_type === 'B' ? '법인' : '개인'}]: {c.error}
              </p>
              <button
                onClick={() => {
                  const key = `${c.organization}_${c.client_type}`;
                  setRefreshingOrg(key);
                  apiFetch('/api/limits', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organization: c.organization, client_type: c.client_type }),
                  })
                    .then(r => r.json())
                    .then(data => {
                      if (!data.error && data.cards?.length) {
                        const updated = data.cards[0];
                        setItems(prev => prev.map(item =>
                          item.organization === c.organization && item.client_type === c.client_type
                            ? { ...item, ...updated } : item
                        ));
                      }
                    })
                    .catch(() => {})
                    .finally(() => setRefreshingOrg(null));
                }}
                disabled={refreshingOrg === `${c.organization}_${c.client_type}`}
                className="text-xs text-red-500 underline ml-2 disabled:opacity-50"
              >
                {refreshingOrg === `${c.organization}_${c.client_type}` ? '조회 중...' : '재시도'}
              </button>
            </div>
          ))}
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
                  {orgName(detail.organization)}[{detail.client_type === 'B' ? '법인' : '개인'}]
                </p>
                {detail.owner_name && (
                  <p className="text-xs text-gray-400 mt-0.5">{detail.owner_name}</p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['총 한도', detail.total_limit != null ? `${formatAmount(detail.total_limit)}원` : null],
                ['사용 금액', detail.used_limit != null ? `${formatAmount(detail.used_limit)}원` : null],
                ['잔여 한도', detail.remaining_limit != null ? `${formatAmount(detail.remaining_limit)}원` : null],
                ['1회 한도', detail.one_time_limit != null ? `${formatAmount(detail.one_time_limit)}원` : null],
                ['할부 한도', detail.installment_limit != null ? `${formatAmount(detail.installment_limit)}원` : null],
                ['현금서비스 한도', detail.cash_advance_limit != null ? `${formatAmount(detail.cash_advance_limit)}원` : null],
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
