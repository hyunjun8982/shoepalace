'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { CodefAccountInfo, ORGANIZATION_MAP, ORG_COLORS, BANK_ORGANIZATION_MAP, BANK_COLORS } from '@/types';

export default function AccountsPage() {
  const { apiFetch, user } = useAuth();
  const [cardAccounts, setCardAccounts] = useState<CodefAccountInfo[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'card' | 'bank'>('card');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<any | null>(null);

  const isAdmin = user?.role === 'super_admin';

  const handleDisconnect = async (id: string, orgName: string) => {
    if (!confirm(`${orgName} 계정 연동을 해제하시겠습니까?`)) return;
    setDisconnecting(id);
    try {
      const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDisconnecting(null);
    }
  };

  const fetchAccounts = useCallback(() => {
    apiFetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        setCardAccounts(data.cardAccounts || []);
        setBankAccounts(data.bankAccounts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { fetchAccounts(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const getGroupKey = (item: any) => `${item.organization}_${item.client_type}_${item.owner_name || item.login_id || ''}`;

  const cardGrouped = cardAccounts.reduce((acc, item) => {
    const key = getGroupKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, CodefAccountInfo[]>);

  const bankGrouped = bankAccounts.reduce((acc: Record<string, any[]>, item: any) => {
    const key = getGroupKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="px-4 pt-3">
      {/* Tab + Add Button */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex flex-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab('card')}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition ${
              tab === 'card' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            카드사 ({Object.keys(cardGrouped).length})
          </button>
          <button
            onClick={() => setTab('bank')}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition ${
              tab === 'bank' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            은행 ({Object.keys(bankGrouped).length})
          </button>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 active:bg-primary-800 transition"
        >
          + 추가
        </button>
      </div>

      {/* Card Accounts */}
      {tab === 'card' && (
        <div className="space-y-2">
          {Object.entries(cardGrouped).map(([groupKey, accs]) => {
            const org = accs[0].organization;
            const orgN = ORGANIZATION_MAP[org] || org;
            const color = ORG_COLORS[org] || '#6b7280';
            const connectedAcc = accs.find(a => a.connected_id && a.is_connected);
            const mainAcc = connectedAcc || accs.find(a => a.login_id);
            const needsReconnect = mainAcc && !connectedAcc;

            return (
              <div key={groupKey} className={`bg-white rounded-xl shadow-sm overflow-hidden ${needsReconnect ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {orgN.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {orgN}{mainAcc ? `[${mainAcc.client_type === 'B' ? '법인' : '개인'}]` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        {connectedAcc ? (
                          <>
                            {connectedAcc.owner_name && `${connectedAcc.owner_name} · `}
                            <span className="text-green-500">연결됨</span>
                          </>
                        ) : needsReconnect ? (
                          <>
                            {mainAcc.owner_name && `${mainAcc.owner_name} · `}
                            <span className="text-amber-500 font-medium">재연동 필요</span>
                          </>
                        ) : (
                          <span className="text-gray-400">미연결</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {needsReconnect && mainAcc && (
                      <button
                        onClick={() => setReconnectTarget({ ...mainAcc, type: 'card' })}
                        className="text-[11px] text-amber-600 hover:text-amber-700 px-2 py-1 border border-amber-300 rounded-lg bg-amber-50"
                      >
                        재연동
                      </button>
                    )}
                    {mainAcc && (
                      <button
                        onClick={() => handleDisconnect(mainAcc.id, orgN)}
                        disabled={disconnecting === mainAcc.id}
                        className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg disabled:opacity-50"
                      >
                        {disconnecting === mainAcc.id ? '해제 중...' : '해제'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {Object.keys(cardGrouped).length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              연결된 카드사 계정이 없습니다
            </div>
          )}
        </div>
      )}

      {/* Bank Accounts */}
      {tab === 'bank' && (
        <div className="space-y-2">
          {Object.entries(bankGrouped).map(([groupKey, accs]) => {
            const org = accs[0].organization;
            const orgN = BANK_ORGANIZATION_MAP[org] || org;
            const color = BANK_COLORS[org] || '#6b7280';
            const connectedAcc = accs.find((a: any) => a.connected_id && a.is_connected);
            const mainAcc = connectedAcc || accs.find((a: any) => a.login_id);
            const needsReconnect = mainAcc && !connectedAcc;

            return (
              <div key={groupKey} className={`bg-white rounded-xl shadow-sm overflow-hidden ${needsReconnect ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {orgN.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {orgN}{mainAcc ? `[${mainAcc.client_type === 'B' ? '법인' : '개인'}]` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        {connectedAcc ? (
                          <>
                            {connectedAcc.owner_name && `${connectedAcc.owner_name} · `}
                            {connectedAcc.account_no && `${connectedAcc.account_no} · `}
                            <span className="text-green-500">연결됨</span>
                          </>
                        ) : needsReconnect ? (
                          <>
                            {mainAcc.owner_name && `${mainAcc.owner_name} · `}
                            {mainAcc.account_no && `${mainAcc.account_no} · `}
                            <span className="text-amber-500 font-medium">재연동 필요</span>
                          </>
                        ) : (
                          <span className="text-gray-400">미연결</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {needsReconnect && mainAcc && (
                      <button
                        onClick={() => setReconnectTarget({ ...mainAcc, type: 'bank' })}
                        className="text-[11px] text-amber-600 hover:text-amber-700 px-2 py-1 border border-amber-300 rounded-lg bg-amber-50"
                      >
                        재연동
                      </button>
                    )}
                    {mainAcc && (
                      <button
                        onClick={() => handleDisconnect(mainAcc.id, orgN)}
                        disabled={disconnecting === mainAcc.id}
                        className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg disabled:opacity-50"
                      >
                        {disconnecting === mainAcc.id ? '해제 중...' : '해제'}
                      </button>
                    )}
                  </div>
                </div>

                {accs.length > 1 && (
                  <div className="border-t border-gray-100 px-4 py-2">
                    {accs.map((acc: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-xs">
                        <span className="text-gray-500">{acc.account_no || acc.login_id || '-'}</span>
                        <span className={acc.connected_id ? 'text-green-500' : 'text-gray-300'}>
                          {acc.connected_id ? '연결됨' : '미연결'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {Object.keys(bankGrouped).length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              연결된 은행 계정이 없습니다
            </div>
          )}
        </div>
      )}

      {/* Admin: CODEF API Settings */}
      {isAdmin && (
        <div className="mt-4 mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center justify-between active:bg-gray-50 transition"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-gray-700">CODEF API 설정</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSettings && (
            <CodefSettings apiFetch={apiFetch} />
          )}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          type={tab}
          apiFetch={apiFetch}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchAccounts(); }}
        />
      )}

      {/* Reconnect Modal */}
      {reconnectTarget && (
        <ReconnectModal
          account={reconnectTarget}
          apiFetch={apiFetch}
          onClose={() => setReconnectTarget(null)}
          onSuccess={() => { setReconnectTarget(null); fetchAccounts(); }}
        />
      )}
    </div>
  );
}

function CodefSettings({ apiFetch }: { apiFetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [settings, setSettings] = useState({
    client_id: '',
    client_secret: '',
    public_key: '',
    use_demo: 'true',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setSettings(prev => ({ ...prev, ...data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ message: data.message, type: 'success' });
    } catch (err: any) {
      setResult({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-xl p-4 shadow-sm mt-2 text-center text-sm text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mt-2 space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Client ID</label>
        <input
          type="text"
          value={settings.client_id}
          onChange={e => setSettings(s => ({ ...s, client_id: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono"
          placeholder="CODEF Client ID"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Client Secret</label>
        <input
          type="password"
          value={settings.client_secret}
          onChange={e => setSettings(s => ({ ...s, client_secret: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono"
          placeholder="CODEF Client Secret"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Public Key (RSA)</label>
        <textarea
          value={settings.public_key}
          onChange={e => setSettings(s => ({ ...s, public_key: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono resize-none"
          rows={3}
          placeholder="MIIBIjANBgkq..."
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">모드</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSettings(s => ({ ...s, use_demo: 'true' }))}
            className={`flex-1 py-2 text-sm rounded-lg border transition
              ${settings.use_demo === 'true'
                ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                : 'border-gray-200 text-gray-500'}`}
          >
            데모
          </button>
          <button
            onClick={() => setSettings(s => ({ ...s, use_demo: 'false' }))}
            className={`flex-1 py-2 text-sm rounded-lg border transition
              ${settings.use_demo === 'false'
                ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                : 'border-gray-200 text-gray-500'}`}
          >
            운영
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">모드 변경 시 기존 연결 계정(connectedId)이 초기화됩니다</p>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
          hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition"
      >
        {saving ? '저장 중...' : '설정 저장'}
      </button>
      {result && (
        <div className={`rounded-lg p-3 text-sm ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

function AddAccountModal({
  type,
  apiFetch,
  onClose,
  onSuccess,
}: {
  type: 'card' | 'bank';
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const orgMap = type === 'card' ? ORGANIZATION_MAP : BANK_ORGANIZATION_MAP;
  const [organization, setOrganization] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [clientType, setClientType] = useState('P');
  const [cardNo, setCardNo] = useState('');
  const [cardPassword, setCardPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [homepageLinks, setHomepageLinks] = useState<Record<string, string>>({});
  const [inactiveOrgs, setInactiveOrgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch('/api/homepages')
      .then(r => r.json())
      .then(data => {
        const links: Record<string, string> = {};
        const activeByOrg: Record<string, boolean> = {};
        (data.homepages || []).forEach((hp: any) => {
          links[`${hp.business_type}_${hp.organization}_${hp.client_type}`] = hp.url;
          const key = `${hp.business_type}_${hp.organization}`;
          if (hp.is_active !== false) {
            activeByOrg[key] = true;
          } else if (!(key in activeByOrg)) {
            activeByOrg[key] = false;
          }
        });
        // Orgs where all entries are inactive
        const inactive = new Set<string>();
        for (const [key, hasActive] of Object.entries(activeByOrg)) {
          if (!hasActive) inactive.add(key);
        }
        setHomepageLinks(links);
        setInactiveOrgs(inactive);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult('');
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        organization,
        login_id: loginId,
        password,
        client_type: clientType,
        business_type: type === 'bank' ? 'BK' : 'CD',
      };
      if (type === 'bank' && accountNo) body.account_no = accountNo;
      if (type === 'card' && cardNo) body.card_no = cardNo;
      if (type === 'card' && cardPassword) body.card_password = cardPassword;

      const res = await apiFetch('/api/accounts/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data.message);
      setTimeout(onSuccess, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-gray-800">
            {type === 'card' ? '카드사' : '은행'} 연동 추가
          </h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {type === 'card' ? '카드사' : '은행'}
            </label>
            <select
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">선택하세요</option>
              {Object.entries(orgMap)
                .filter(([code]) => !inactiveOrgs.has(`${type === 'card' ? 'CD' : 'BK'}_${code}`))
                .map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">개인 / 법인</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setClientType('P')}
                className={`flex-1 py-2 text-sm rounded-lg border transition
                  ${clientType === 'P'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                    : 'border-gray-200 text-gray-500'}`}
              >
                개인
              </button>
              <button
                type="button"
                onClick={() => setClientType('B')}
                className={`flex-1 py-2 text-sm rounded-lg border transition
                  ${clientType === 'B'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                    : 'border-gray-200 text-gray-500'}`}
              >
                법인
              </button>
            </div>
            {organization && homepageLinks[`${type === 'card' ? 'CD' : 'BK'}_${organization}_${clientType}`] && (
              <a
                href={homepageLinks[`${type === 'card' ? 'CD' : 'BK'}_${organization}_${clientType}`]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:text-primary-700 mt-1.5"
              >
                {orgMap[organization]} {clientType === 'B' ? '법인' : '개인'} 홈페이지 바로가기
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">아이디</label>
            <input
              type="text"
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              required
              placeholder={type === 'card' ? '카드사 로그인 ID' : '인터넷뱅킹 ID'}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder={type === 'card' ? '카드사 로그인 비밀번호' : '인터넷뱅킹 비밀번호'}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>

          {type === 'bank' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">계좌번호</label>
              <input
                type="text"
                value={accountNo}
                onChange={e => setAccountNo(e.target.value)}
                placeholder="- 없이 입력"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          )}

          {type === 'card' && organization === '0302' && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">카드번호 (현대카드 필수)</label>
                <input
                  type="text"
                  value={cardNo}
                  onChange={e => setCardNo(e.target.value)}
                  placeholder="카드번호 16자리 (- 없이)"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">카드 비밀번호 (현대카드 필수)</label>
                <input
                  type="password"
                  value={cardPassword}
                  onChange={e => setCardPassword(e.target.value)}
                  placeholder="카드 비밀번호 앞 2자리"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>
          )}
          {result && (
            <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !organization || !loginId || !password}
            className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold
              hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition"
          >
            {submitting ? '등록 중...' : '계정 연동'}
          </button>
        </form>

        <p className="text-[11px] text-gray-400 mt-3 text-center">
          CODEF API를 통해 안전하게 연동됩니다.<br/>
          비밀번호는 암호화 전송되며 서버에 저장되지 않습니다.
        </p>
      </div>
    </div>
  );
}

function ReconnectModal({
  account,
  apiFetch,
  onClose,
  onSuccess,
}: {
  account: any;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [cardPassword, setCardPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const isBank = account.type === 'bank';
  const isHyundai = account.organization === '0302';
  const orgName = isBank
    ? (BANK_ORGANIZATION_MAP[account.organization] || account.organization)
    : (ORGANIZATION_MAP[account.organization] || account.organization);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult('');
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        organization: account.organization,
        login_id: account.login_id,
        password,
        client_type: account.client_type || 'P',
        business_type: isBank ? 'BK' : 'CD',
      };
      if (isBank && account.account_no) body.account_no = account.account_no;
      if (!isBank && account.card_no) body.card_no = account.card_no;
      if (isHyundai && cardPassword) body.card_password = cardPassword;

      const res = await apiFetch('/api/accounts/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult('재연동 완료');
      setTimeout(onSuccess, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-gray-800">
            {orgName} 재연동
          </h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">아이디</span>
            <span className="text-gray-700">{account.login_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">구분</span>
            <span className="text-gray-700">{account.client_type === 'B' ? '법인' : '개인'}</span>
          </div>
          {account.card_no && (
            <div className="flex justify-between">
              <span className="text-gray-400">카드번호</span>
              <span className="text-gray-700">{account.card_no.slice(0, 4)}****{account.card_no.slice(-4)}</span>
            </div>
          )}
          {account.account_no && (
            <div className="flex justify-between">
              <span className="text-gray-400">계좌번호</span>
              <span className="text-gray-700">{account.account_no}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {isBank ? '인터넷뱅킹' : '카드사 로그인'} 비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              placeholder={isBank ? '인터넷뱅킹 비밀번호' : '카드사 로그인 비밀번호'}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>

          {isHyundai && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">카드 비밀번호</label>
              <input
                type="password"
                value={cardPassword}
                onChange={e => setCardPassword(e.target.value)}
                required
                placeholder="카드 비밀번호 앞 2자리"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          )}

          <p className="text-[11px] text-gray-400 text-center">
            비밀번호는 암호화 전송되며 서버에 저장되지 않습니다.
          </p>

          {error && (
            <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>
          )}
          {result && (
            <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !password || (isHyundai && !cardPassword)}
            className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold
              hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 transition"
          >
            {submitting ? '연동 중...' : '재연동'}
          </button>
        </form>
      </div>
    </div>
  );
}
