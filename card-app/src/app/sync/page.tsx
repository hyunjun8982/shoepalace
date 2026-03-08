'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ORGANIZATION_MAP, BANK_ORGANIZATION_MAP } from '@/types';
import dayjs from 'dayjs';

function getOrgName(code: string) {
  return ORGANIZATION_MAP[code] || BANK_ORGANIZATION_MAP[code] || code;
}

interface AccountItem {
  organization: string;
  client_type: string;
  connected_id?: string;
  owner_name?: string;
  account_no?: string;
  type: 'card' | 'bank';
}

type TabType = 'card' | 'bank';

export default function SyncPage() {
  const { apiFetch } = useAuth();
  const [allAccounts, setAllAccounts] = useState<AccountItem[]>([]);
  const [tab, setTab] = useState<TabType>('card');
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState(() => dayjs().subtract(1, 'month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const filteredAccounts = allAccounts.filter(a => a.type === tab);

  useEffect(() => {
    apiFetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        const cards = (data.cardAccounts || [])
          .filter((a: any) => a.connected_id)
          .map((a: any) => ({ ...a, type: 'card' as const }));
        const banks = (data.bankAccounts || [])
          .filter((a: any) => a.connected_id)
          .map((a: any) => ({ ...a, type: 'bank' as const }));
        const all = [...cards, ...banks];
        setAllAccounts(all);
        // 기본: 모든 카드사 선택
        setSelectedOrgs(new Set(cards.map((a: AccountItem) => a.organization)));
      })
      .catch(() => {});
  }, []);

  // 탭 전환 시 해당 탭의 모든 계정 선택
  useEffect(() => {
    const accounts = allAccounts.filter(a => a.type === tab);
    setSelectedOrgs(new Set(accounts.map(a => a.organization)));
    setResult(null);
  }, [tab, allAccounts]);

  const toggleOrg = (org: string) => {
    setSelectedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrgs.size === filteredAccounts.length) {
      setSelectedOrgs(new Set());
    } else {
      setSelectedOrgs(new Set(filteredAccounts.map(a => a.organization)));
    }
  };

  const handleSync = async () => {
    const targets = filteredAccounts.filter(a => selectedOrgs.has(a.organization));
    if (targets.length === 0) return;

    setSyncing(true);
    setResult(null);
    const label = tab === 'card' ? '카드 내역' : '계좌 내역';
    let successCount = 0;
    let errorCount = 0;

    for (const acc of targets) {
      const name = getOrgName(acc.organization);
      setLogs(prev => [...prev, `[${dayjs().format('HH:mm:ss')}] ${name} ${label} 가져오기 시작...`]);

      try {
        const endpoint = tab === 'bank' ? '/api/sync/bank' : '/api/sync';
        const body: any = {
          organization: acc.organization,
          start_date: startDate,
          end_date: endDate,
          client_type: acc.client_type || (tab === 'bank' ? 'B' : 'P'),
        };
        if (tab === 'bank' && acc.account_no) {
          body.account_no = acc.account_no;
        }

        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setLogs(prev => [...prev, `[${dayjs().format('HH:mm:ss')}] ${name}: ${data.message}`]);
        successCount++;
      } catch (err: any) {
        setLogs(prev => [...prev, `[${dayjs().format('HH:mm:ss')}] ${name} 오류: ${err.message}`]);
        errorCount++;
      }
    }

    setSyncing(false);
    const msg = errorCount > 0
      ? `${targets.length}건 중 ${successCount}건 성공, ${errorCount}건 실패`
      : `${targets.length}건 ${label} 가져오기 완료`;
    setResult({ message: msg, type: errorCount > 0 ? 'error' : 'success' });
  };

  return (
    <div className="px-4 pt-3">
      <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
        {/* 탭 */}
        <div className="flex mb-4 bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'card' as TabType, label: '카드 내역' },
            { key: 'bank' as TabType, label: '계좌 내역' },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition
                ${tab === t.key ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {/* 계정 체크박스 리스트 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">
                {tab === 'card' ? '카드사' : '은행'} 선택
              </label>
              <button
                onClick={toggleAll}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                {selectedOrgs.size === filteredAccounts.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            {filteredAccounts.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                연결된 {tab === 'card' ? '카드사' : '은행'} 계정이 없습니다
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredAccounts.map(acc => (
                  <label
                    key={`${acc.organization}-${acc.client_type}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition
                      ${selectedOrgs.has(acc.organization)
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-200 bg-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOrgs.has(acc.organization)}
                      onChange={() => toggleOrg(acc.organization)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {getOrgName(acc.organization)}[{acc.client_type === 'B' ? '법인' : '개인'}]
                      {acc.owner_name && (
                        <span className="text-gray-400 ml-1">({acc.owner_name})</span>
                      )}
                      {tab === 'bank' && acc.account_no && (
                        <span className="text-gray-400 ml-1">- {acc.account_no}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 날짜 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { label: '1주', fn: () => setStartDate(dayjs().subtract(7, 'day').format('YYYY-MM-DD')) },
              { label: '1개월', fn: () => setStartDate(dayjs().subtract(1, 'month').format('YYYY-MM-DD')) },
              { label: '3개월', fn: () => setStartDate(dayjs().subtract(3, 'month').format('YYYY-MM-DD')) },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={() => { btn.fn(); setEndDate(dayjs().format('YYYY-MM-DD')); }}
                className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition"
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* 가져오기 버튼 */}
          <button
            onClick={handleSync}
            disabled={syncing || selectedOrgs.size === 0}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
              hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition"
          >
            {syncing
              ? '가져오는 중...'
              : `선택한 ${selectedOrgs.size}개 ${tab === 'card' ? '카드사' : '은행'} 내역 가져오기`}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-3 mb-3 text-sm ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-3 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">로그</span>
            <button onClick={() => setLogs([])} className="text-xs text-gray-500 hover:text-gray-300">
              지우기
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="text-xs text-gray-300 font-mono">{log}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
