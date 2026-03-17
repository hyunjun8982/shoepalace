'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface Account {
  id: number;
  email: string;
  name: string;
  current_points: number;
  web_fetch_status: string;
  is_active: boolean;
}

interface FetchResult {
  accountId: number;
  email: string;
  success: boolean;
  name?: string;
  points?: number;
  couponCount?: number;
  totalTime?: number;
  error?: string;
}

export default function FetchPage() {
  const { apiFetch } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [results, setResults] = useState<FetchResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/accounts?active=true&limit=500');
    const data = await res.json();
    setAccounts(data.accounts || data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  const startFetch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setFetching(true);
    setResults([]);
    setCurrentIdx(0);
    setTotalCount(ids.length);

    // 순차 처리
    for (let i = 0; i < ids.length; i++) {
      setCurrentIdx(i + 1);
      const acc = accounts.find(a => a.id === ids[i]);
      if (!acc) continue;

      try {
        const res = await apiFetch('/api/fetch', {
          method: 'POST',
          body: JSON.stringify({ accountId: ids[i] }),
        });
        const data = await res.json();
        setResults(prev => [...prev, {
          accountId: ids[i],
          email: acc.email,
          ...data,
        }]);
      } catch (err: any) {
        setResults(prev => [...prev, {
          accountId: ids[i],
          email: acc.email,
          success: false,
          error: err.message,
        }]);
      }
    }

    setFetching(false);
    loadAccounts();
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-800 mb-1">셀레니움 정보 조회</h2>
        <p className="text-xs text-gray-400 mb-3">
          선택한 계정의 포인트, 쿠폰 정보를 아디다스 웹에서 조회합니다.
          계정당 약 30~60초 소요됩니다.
        </p>

        {/* 진행 상태 */}
        {fetching && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>진행 중... ({currentIdx}/{totalCount})</span>
              <span>{successCount} 성공 / {failCount} 실패</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-primary-500 h-2 rounded-full transition-all"
                style={{ width: `${(currentIdx / totalCount) * 100}%` }} />
            </div>
          </div>
        )}

        {/* 전체선택 + 시작 */}
        <div className="flex gap-2 mb-3">
          <button onClick={selectAll} disabled={fetching}
            className="px-3 py-2 text-xs rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50">
            {selectedIds.size === accounts.length ? '전체 해제' : '전체 선택'}
          </button>
          <button onClick={startFetch}
            disabled={fetching || selectedIds.size === 0}
            className="flex-1 py-2 text-xs rounded-lg bg-primary-600 text-white font-semibold disabled:opacity-50">
            {fetching ? `조회 중 (${currentIdx}/${totalCount})...` : `선택 조회 (${selectedIds.size}건)`}
          </button>
        </div>

        {/* 계정 목록 */}
        {loading ? (
          <div className="text-center py-6 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {accounts.map(acc => {
              const result = results.find(r => r.accountId === acc.id);
              return (
                <label key={acc.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition
                    ${selectedIds.has(acc.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}
                    ${result?.success ? 'border border-green-200' : result ? 'border border-red-200' : ''}`}>
                  <input type="checkbox" checked={selectedIds.has(acc.id)} onChange={() => toggleSelect(acc.id)}
                    disabled={fetching}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-700 truncate">{acc.email}</div>
                    <div className="text-[10px] text-gray-400">
                      {acc.name || '-'} | {(acc.current_points || 0).toLocaleString()}P
                      {acc.web_fetch_status && ` | ${acc.web_fetch_status}`}
                    </div>
                  </div>
                  {result && (
                    <span className={`text-[10px] flex-shrink-0 ${result.success ? 'text-green-500' : 'text-red-500'}`}>
                      {result.success ? `${result.points?.toLocaleString()}P / ${result.couponCount}쿠폰` : '실패'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 결과 로그 */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-2">조회 결과</h3>
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className={`text-xs p-2 rounded-lg ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="font-medium text-gray-700">{r.email}</div>
                {r.success ? (
                  <div className="text-green-600">
                    {r.name} | {r.points?.toLocaleString()}P | {r.couponCount}쿠폰 | {r.totalTime?.toFixed(1)}초
                  </div>
                ) : (
                  <div className="text-red-500">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
