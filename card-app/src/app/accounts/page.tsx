'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { CodefAccountInfo, ORGANIZATION_MAP, ORG_COLORS, BANK_ORGANIZATION_MAP, BANK_COLORS } from '@/types';

interface CertInfo {
  id: string;
  cert_name: string;
  cert_type: string;
  subject_dn: string;
  issuer_cn: string;
  not_after: string | null;
  created_at: string;
}

interface LocalCertInfo {
  cert_name: string;
  cert_type: string;
  issuer_cn: string;
  not_after: string | null;
  der_base64: string;
  key_base64: string;
  local_path: string;
}

// 통합 표시용 타입 (등록된 cert 또는 로컬 cert)
type DisplayCert =
  | { source: 'registered'; id: string; cert_name: string; cert_type: string; issuer_cn: string; not_after: string | null }
  | { source: 'local'; localKey: string; cert_name: string; cert_type: string; issuer_cn: string; not_after: string | null; der_base64: string; key_base64: string };

// ──────────────────────────────────────────────────────────────────
// 전자서명 작성 스타일 인증서 선택 모달
// ──────────────────────────────────────────────────────────────────
function CertSelectorModal({
  orgName,
  apiFetch,
  onClose,
  onConfirm,
}: {
  orgName?: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onConfirm: (certId: string, certPassword: string) => void;
}) {
  const [displayCerts, setDisplayCerts] = useState<DisplayCert[]>([]);
  const [selectedKey, setSelectedKey] = useState(''); // 'registered:{id}' or 'local:{localKey}'
  const [certPassword, setCertPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [scanning, setScanning] = useState(true);  // 초기 스캔 중
  const [searching, setSearching] = useState(false); // 수동 찾기 중
  const [viewingCert, setViewingCert] = useState<DisplayCert | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // 등록된 인증서 + 로컬 NPKI 인증서를 합쳐서 표시
  const loadAllCerts = useCallback(async () => {
    setScanning(true);
    try {
      const [regRes, scanRes] = await Promise.allSettled([
        apiFetch('/api/certificates').then(r => r.json()),
        apiFetch('/api/certificates/scan').then(r => r.json()),
      ]);

      const registered: CertInfo[] = regRes.status === 'fulfilled' ? (regRes.value.certificates || []) : [];
      const localCerts: LocalCertInfo[] = scanRes.status === 'fulfilled' ? (scanRes.value.certs || []) : [];

      // 날짜 정규화 (DB는 ISO timestamp, 스캔은 YYYY-MM-DD로 올 수 있음)
      const normDate = (d: string | null) => d ? d.split('T')[0] : null;

      // 등록된 인증서 key set (cert_name + not_after 기준 중복 제거)
      const registeredKeys = new Set(registered.map(c => `${c.cert_name}_${normDate(c.not_after)}`));

      const merged: DisplayCert[] = [
        ...registered.map(c => ({
          source: 'registered' as const,
          id: c.id,
          cert_name: c.cert_name,
          cert_type: c.cert_type,
          issuer_cn: c.issuer_cn,
          not_after: normDate(c.not_after),
        })),
        // 로컬에서 발견됐지만 아직 등록 안 된 것만 추가
        ...localCerts
          .filter(lc => !registeredKeys.has(`${lc.cert_name}_${normDate(lc.not_after)}`))
          .map((lc, idx) => ({
            source: 'local' as const,
            localKey: `local_${idx}_${lc.cert_name}`,
            cert_name: lc.cert_name,
            cert_type: lc.cert_type,
            issuer_cn: lc.issuer_cn,
            not_after: lc.not_after,
            der_base64: lc.der_base64,
            key_base64: lc.key_base64,
          })),
      ];

      setDisplayCerts(merged);

      // 유효한 첫 번째 cert 자동 선택
      if (merged.length > 0 && !selectedKey) {
        const valid = merged.find(c => !c.not_after || new Date(c.not_after) >= new Date());
        const first = valid || merged[0];
        setSelectedKey(first.source === 'registered' ? `registered:${first.id}` : `local:${first.localKey}`);
      }
    } finally {
      setScanning(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadAllCerts(); }, []);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const derFileObj = files.find(f => f.name.toLowerCase().endsWith('.der'));
    const keyFileObj = files.find(f => f.name.toLowerCase().endsWith('.key'));

    if (!derFileObj || !keyFileObj) {
      alert('선택한 폴더에서 인증서 파일(.der)과 개인키 파일(.key)을 찾을 수 없습니다.\n인증서 폴더(NPKI)를 선택해주세요.');
      if (folderRef.current) folderRef.current.value = '';
      return;
    }

    setSearching(true);
    try {
      const [derBase64, keyBase64] = await Promise.all([
        readFileAsBase64(derFileObj),
        readFileAsBase64(keyFileObj),
      ]);

      const res = await apiFetch('/api/certificates', {
        method: 'POST',
        body: JSON.stringify({ derFile: derBase64, keyFile: keyBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await loadAllCerts();
      // 새로 등록된 cert는 목록 맨 위에 오므로 자동 선택
      const listRes = await apiFetch('/api/certificates');
      const listData = await listRes.json();
      const newList: CertInfo[] = listData.certificates || [];
      if (newList.length > 0) setSelectedKey(`registered:${newList[0].id}`);
    } catch (err: any) {
      alert('인증서 등록 실패: ' + err.message);
    } finally {
      setSearching(false);
      if (folderRef.current) folderRef.current.value = '';
    }
  };

  const handleDeleteCert = async () => {
    const sel = displayCerts.find(c =>
      c.source === 'registered' && `registered:${c.id}` === selectedKey
    );
    if (!sel || sel.source !== 'registered') {
      alert('등록된 인증서만 삭제할 수 있습니다');
      return;
    }
    if (!confirm(`"${sel.cert_name}" 인증서를 삭제하시겠습니까?`)) return;

    const res = await apiFetch(`/api/certificates/${sel.id}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedKey('');
      setCertPassword('');
      loadAllCerts();
    }
  };

  const handleConfirm = async () => {
    if (!selectedKey || !certPassword) return;

    const sel = displayCerts.find(c =>
      (c.source === 'registered' && `registered:${c.id}` === selectedKey) ||
      (c.source === 'local' && `local:${c.localKey}` === selectedKey)
    );
    if (!sel) return;

    if (sel.source === 'registered') {
      onConfirm(sel.id, certPassword);
    } else {
      // 로컬 cert → 먼저 DB에 등록 후 사용
      try {
        const res = await apiFetch('/api/certificates', {
          method: 'POST',
          body: JSON.stringify({ derFile: sel.der_base64, keyFile: sel.key_base64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // 등록된 cert ID 조회
        const listRes = await apiFetch('/api/certificates');
        const listData = await listRes.json();
        const newList: CertInfo[] = listData.certificates || [];
        if (newList.length > 0) {
          onConfirm(newList[0].id, certPassword);
        }
      } catch (err: any) {
        alert('인증서 등록 실패: ' + err.message);
      }
    }
  };

  const selectedCert = displayCerts.find(c =>
    (c.source === 'registered' && `registered:${c.id}` === selectedKey) ||
    (c.source === 'local' && `local:${c.localKey}` === selectedKey)
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
      <div className="bg-white rounded shadow-2xl w-full max-w-[460px] border border-gray-400 select-none">

        {/* 타이틀바 */}
        <div className="bg-[#3a5fa0] px-4 py-2.5 flex items-center justify-between rounded-t">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-white text-sm font-semibold">전자 서명 작성</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* 기관명 */}
        {orgName && (
          <div className="py-3 flex justify-center border-b border-gray-200 bg-gray-50">
            <div className="px-6 py-1 border border-gray-400 rounded text-sm font-semibold text-gray-700 bg-white">
              {orgName}
            </div>
          </div>
        )}

        {/* 저장 위치 선택 */}
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs text-gray-600 mb-2 font-medium">인증서 저장 위치를 선택해 주세요</p>
          <div className="flex gap-2">
            {/* 하드디스크 - active */}
            <button className="flex flex-col items-center gap-1 px-3 py-2 rounded border-2 border-[#3a5fa0] bg-blue-50 text-[#3a5fa0]">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 14h20M6 17h.01M9 17h.01" />
              </svg>
              <span className="text-[10px] font-medium">하드디스크</span>
            </button>
            {/* 이동식 - disabled */}
            {['이동식', '보안토큰', '휴대폰'].map(label => (
              <button key={label} disabled
                className="flex flex-col items-center gap-1 px-3 py-2 rounded border border-gray-200 text-gray-300 cursor-not-allowed">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <path d="M10 18h4" />
                </svg>
                <span className="text-[10px]">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 인증서 목록 */}
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs text-gray-600 mb-1.5 font-medium">사용할 인증서를 선택해 주세요</p>
          <div className="border border-gray-400 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#dde8f5] border-b border-gray-300">
                  <th className="px-2 py-1.5 text-left text-gray-700 font-semibold border-r border-gray-300 w-20">구분</th>
                  <th className="px-2 py-1.5 text-left text-gray-700 font-semibold border-r border-gray-300">사용자</th>
                  <th className="px-2 py-1.5 text-left text-gray-700 font-semibold border-r border-gray-300 w-24">만료일</th>
                  <th className="px-2 py-1.5 text-left text-gray-700 font-semibold w-20">발급자</th>
                </tr>
              </thead>
              <tbody>
                {scanning ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-5 text-center text-gray-400 text-xs">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
                        인증서 검색 중...
                      </div>
                    </td>
                  </tr>
                ) : displayCerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-5 text-center text-gray-400 text-xs">
                      인증서를 찾을 수 없습니다
                    </td>
                  </tr>
                ) : (
                  displayCerts.map((cert, idx) => {
                    const isExpired = cert.not_after ? new Date(cert.not_after) < new Date() : false;
                    const certKey = cert.source === 'registered' ? `registered:${cert.id}` : `local:${cert.localKey}`;
                    const isSelected = selectedKey === certKey;
                    const isLocal = cert.source === 'local';
                    return (
                      <tr
                        key={certKey}
                        onClick={() => !isExpired && setSelectedKey(certKey)}
                        className={`cursor-pointer border-b border-gray-100 last:border-0 transition
                          ${isSelected ? 'bg-[#c5d9f1]' : idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}
                          ${isExpired ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <td className="px-2 py-1.5 border-r border-gray-200 whitespace-nowrap text-gray-700">
                          {cert.cert_type || '공동인증서'}
                        </td>
                        <td className="px-2 py-1.5 border-r border-gray-200 max-w-[130px] truncate text-gray-800">
                          {cert.cert_name}
                          {isLocal && <span className="ml-1 text-[9px] text-blue-500 font-medium">로컬</span>}
                        </td>
                        <td className={`px-2 py-1.5 border-r border-gray-200 whitespace-nowrap ${isExpired ? 'text-red-500' : 'text-gray-700'}`}>
                          {cert.not_after || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-[80px]">
                          {cert.issuer_cn || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 인증서 버튼들 */}
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => selectedCert && setViewingCert(selectedCert)}
              disabled={!selectedKey}
              className="flex-1 py-1.5 text-xs border border-gray-400 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
            >
              인증서 보기
            </button>
            {/* 폴더 선택 input */}
            <input
              ref={folderRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={handleFolderSelect}
            />
            <button
              onClick={() => folderRef.current?.click()}
              disabled={searching}
              className="flex-1 py-1.5 text-xs border border-gray-400 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-60 text-gray-700"
            >
              {searching ? '검색 중...' : '인증서 찾기'}
            </button>
            <button
              onClick={handleDeleteCert}
              disabled={!selectedKey || selectedCert?.source !== 'registered'}
              className="flex-1 py-1.5 text-xs border border-gray-400 rounded bg-gray-50 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed text-red-600"
            >
              인증서 삭제
            </button>
          </div>
        </div>

        {/* 인증서 암호 입력 */}
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs text-gray-600 mb-1.5 font-medium">인증서 암호를 입력해 주세요</p>
          <div className="flex items-center border border-gray-400 rounded overflow-hidden bg-white">
            <input
              type={showPassword ? 'text' : 'password'}
              value={certPassword}
              onChange={e => setCertPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
              placeholder="인증서 암호"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="px-2.5 border-l border-gray-300 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            안전한 금융거래를 위해 6개월마다 인증서 암호를 변경하시기 바랍니다.
          </p>
        </div>

        {/* 확인/취소 버튼 */}
        <div className="px-4 py-3 flex gap-3 bg-gray-50 rounded-b">
          <button
            onClick={handleConfirm}
            disabled={!selectedKey || !certPassword}
            className="flex-1 py-2 bg-[#3a5fa0] text-white text-sm font-semibold rounded hover:bg-[#2d4f8a] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            확인
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-400 text-gray-600 text-sm rounded bg-white hover:bg-gray-50 transition"
          >
            취소
          </button>
        </div>
      </div>

      {/* 인증서 보기 상세 팝업 */}
      {viewingCert && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-sm border border-gray-300">
            <div className="bg-[#3a5fa0] px-4 py-2.5 rounded-t flex justify-between items-center">
              <span className="text-white text-sm font-semibold">인증서 정보</span>
              <button onClick={() => setViewingCert(null)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">구분</span>
                <span className="text-gray-800">{viewingCert.cert_type || '공동인증서'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">사용자</span>
                <span className="text-gray-800 break-all">{viewingCert.cert_name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">발급자</span>
                <span className="text-gray-800">{viewingCert.issuer_cn || '-'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">만료일</span>
                <span className={`${viewingCert.not_after && new Date(viewingCert.not_after) < new Date() ? 'text-red-500' : 'text-gray-800'}`}>
                  {viewingCert.not_after || '-'}
                </span>
              </div>
              {viewingCert.source === 'local' && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-16 shrink-0">상태</span>
                  <span className="text-blue-600">로컬 인증서 (미등록)</span>
                </div>
              )}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setViewingCert(null)}
                className="w-full py-2 border border-gray-400 text-gray-600 text-sm rounded bg-gray-50 hover:bg-gray-100"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 메인 페이지
// ──────────────────────────────────────────────────────────────────
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
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}>
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
            <div className="text-center py-12 text-gray-400 text-sm">연결된 카드사 계정이 없습니다</div>
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
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}>
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
            <div className="text-center py-12 text-gray-400 text-sm">연결된 은행 계정이 없습니다</div>
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
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSettings && <CodefSettings apiFetch={apiFetch} />}
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

// ──────────────────────────────────────────────────────────────────
// CODEF 설정
// ──────────────────────────────────────────────────────────────────
function CodefSettings({ apiFetch }: { apiFetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [settings, setSettings] = useState({ client_id: '', client_secret: '', public_key: '', use_demo: 'true' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      if (!data.error) setSettings(prev => ({ ...prev, ...data }));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setResult(null);
    try {
      const res = await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ message: data.message, type: 'success' });
    } catch (err: any) {
      setResult({ message: err.message, type: 'error' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="bg-white rounded-xl p-4 shadow-sm mt-2 text-center text-sm text-gray-400">로딩 중...</div>;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mt-2 space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Client ID</label>
        <input type="text" value={settings.client_id} onChange={e => setSettings(s => ({ ...s, client_id: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono" placeholder="CODEF Client ID" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Client Secret</label>
        <input type="password" value={settings.client_secret} onChange={e => setSettings(s => ({ ...s, client_secret: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono" placeholder="CODEF Client Secret" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Public Key (RSA)</label>
        <textarea value={settings.public_key} onChange={e => setSettings(s => ({ ...s, public_key: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono resize-none" rows={3} placeholder="MIIBIjANBgkq..." />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">모드</label>
        <div className="flex gap-2">
          {(['true', 'false'] as const).map(v => (
            <button key={v} onClick={() => setSettings(s => ({ ...s, use_demo: v }))}
              className={`flex-1 py-2 text-sm rounded-lg border transition ${settings.use_demo === v ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 text-gray-500'}`}>
              {v === 'true' ? '데모' : '운영'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">모드 변경 시 기존 연결 계정(connectedId)이 초기화됩니다</p>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition">
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

// ──────────────────────────────────────────────────────────────────
// 계정 추가 모달
// ──────────────────────────────────────────────────────────────────
function AddAccountModal({
  type, apiFetch, onClose, onSuccess,
}: {
  type: 'card' | 'bank';
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const orgMap = type === 'card' ? ORGANIZATION_MAP : BANK_ORGANIZATION_MAP;
  const [loginMethod, setLoginMethod] = useState<'id' | 'cert'>('id');
  const [organization, setOrganization] = useState('');
  const [clientType, setClientType] = useState('P');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [cardPassword, setCardPassword] = useState('');
  const [showCertSelector, setShowCertSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [homepageLinks, setHomepageLinks] = useState<Record<string, string>>({});
  const [inactiveOrgs, setInactiveOrgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch('/api/homepages').then(r => r.json()).then(data => {
      const links: Record<string, string> = {};
      const activeByOrg: Record<string, boolean> = {};
      (data.homepages || []).forEach((hp: any) => {
        links[`${hp.business_type}_${hp.organization}_${hp.client_type}`] = hp.url;
        const key = `${hp.business_type}_${hp.organization}`;
        if (hp.is_active !== false) activeByOrg[key] = true;
        else if (!(key in activeByOrg)) activeByOrg[key] = false;
      });
      const inactive = new Set<string>();
      for (const [key, hasActive] of Object.entries(activeByOrg)) {
        if (!hasActive) inactive.add(key);
      }
      setHomepageLinks(links); setInactiveOrgs(inactive);
    }).catch(() => {});
  }, []);

  const submitWithIdPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setResult(''); setSubmitting(true);
    try {
      const body: Record<string, string> = {
        organization, login_id: loginId, password,
        client_type: clientType, business_type: type === 'bank' ? 'BK' : 'CD',
      };
      if (type === 'bank' && accountNo) body.account_no = accountNo;
      if (type === 'card' && cardNo) body.card_no = cardNo;
      if (type === 'card' && cardPassword) body.card_password = cardPassword;

      const res = await apiFetch('/api/accounts/register', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.message);
      setTimeout(onSuccess, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally { setSubmitting(false); }
  };

  const submitWithCert = async (certId: string, certPassword: string) => {
    setShowCertSelector(false);
    setError(''); setResult(''); setSubmitting(true);
    try {
      const res = await apiFetch('/api/accounts/register', {
        method: 'POST',
        body: JSON.stringify({
          organization, cert_id: certId, cert_password: certPassword,
          client_type: clientType, business_type: type === 'bank' ? 'BK' : 'CD',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.message);
      setTimeout(onSuccess, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally { setSubmitting(false); }
  };

  const orgName = organization ? (orgMap[organization] || organization) : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-gray-800">{type === 'card' ? '카드사' : '은행'} 연동 추가</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 기관 선택 */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">{type === 'card' ? '카드사' : '은행'}</label>
          <select value={organization} onChange={e => setOrganization(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg">
            <option value="">선택하세요</option>
            {Object.entries(orgMap)
              .filter(([code]) => !inactiveOrgs.has(`${type === 'card' ? 'CD' : 'BK'}_${code}`))
              .map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>

        {/* 개인/법인 */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">개인 / 법인</label>
          <div className="flex gap-2">
            {(['P', 'B'] as const).map(v => (
              <button key={v} type="button" onClick={() => setClientType(v)}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${clientType === v ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 text-gray-500'}`}>
                {v === 'P' ? '개인' : '법인'}
              </button>
            ))}
          </div>
          {organization && homepageLinks[`${type === 'card' ? 'CD' : 'BK'}_${organization}_${clientType}`] && (
            <a href={homepageLinks[`${type === 'card' ? 'CD' : 'BK'}_${organization}_${clientType}`]}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:text-primary-700 mt-1.5">
              {orgName} {clientType === 'B' ? '법인' : '개인'} 홈페이지 바로가기
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* 로그인 방식 선택 */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">로그인 방식</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLoginMethod('id')}
              className={`flex-1 py-2 text-sm rounded-lg border transition ${loginMethod === 'id' ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 text-gray-500'}`}>
              아이디/비밀번호
            </button>
            <button type="button" onClick={() => setLoginMethod('cert')}
              className={`flex-1 py-2 text-sm rounded-lg border transition ${loginMethod === 'cert' ? 'border-[#3a5fa0] bg-blue-50 text-[#3a5fa0] font-semibold' : 'border-gray-200 text-gray-500'}`}>
              공인인증서
            </button>
          </div>
        </div>

        {/* 아이디/비밀번호 방식 */}
        {loginMethod === 'id' && (
          <form onSubmit={submitWithIdPw} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">아이디</label>
              <input type="text" value={loginId} onChange={e => setLoginId(e.target.value)} required
                placeholder={type === 'card' ? '카드사 로그인 ID' : '인터넷뱅킹 ID'}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder={type === 'card' ? '카드사 로그인 비밀번호' : '인터넷뱅킹 비밀번호'}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
            </div>
            {type === 'bank' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">계좌번호</label>
                <input type="text" value={accountNo} onChange={e => setAccountNo(e.target.value)}
                  placeholder="- 없이 입력" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
              </div>
            )}
            {type === 'card' && organization === '0302' && (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">카드번호 (현대카드 필수)</label>
                  <input type="text" value={cardNo} onChange={e => setCardNo(e.target.value)}
                    placeholder="카드번호 16자리 (- 없이)" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">카드 비밀번호 (현대카드 필수)</label>
                  <input type="password" value={cardPassword} onChange={e => setCardPassword(e.target.value)}
                    placeholder="카드 비밀번호 앞 2자리" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
                </div>
              </>
            )}
            {error && <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>}
            {result && <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>}
            <button type="submit" disabled={submitting || !organization || !loginId || !password}
              className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition">
              {submitting ? '등록 중...' : '계정 연동'}
            </button>
          </form>
        )}

        {/* 공인인증서 방식 */}
        {loginMethod === 'cert' && (
          <div className="space-y-3">
            {error && <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>}
            {result && <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>}
            <button
              onClick={() => { if (!organization) { setError('먼저 기관을 선택해주세요'); return; } setError(''); setShowCertSelector(true); }}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-[#3a5fa0] text-white text-sm font-semibold hover:bg-[#2d4f8a] disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {submitting ? '연동 중...' : '인증서로 계정 연동'}
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-3 text-center">
          CODEF API를 통해 안전하게 연동됩니다.<br />
          비밀번호는 암호화 전송되며 서버에 저장되지 않습니다.
        </p>
      </div>

      {/* 전자서명 작성 팝업 */}
      {showCertSelector && (
        <CertSelectorModal
          orgName={orgName}
          apiFetch={apiFetch}
          onClose={() => setShowCertSelector(false)}
          onConfirm={submitWithCert}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 재연동 모달
// ──────────────────────────────────────────────────────────────────
function ReconnectModal({
  account, apiFetch, onClose, onSuccess,
}: {
  account: any;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [cardPassword, setCardPassword] = useState('');
  const [showCertSelector, setShowCertSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const isBank = account.type === 'bank';
  const isHyundai = account.organization === '0302';
  const isCertLogin = account.login_type === '0';
  const orgName = isBank
    ? (BANK_ORGANIZATION_MAP[account.organization] || account.organization)
    : (ORGANIZATION_MAP[account.organization] || account.organization);

  const submitIdPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setResult(''); setSubmitting(true);
    try {
      const body: Record<string, string> = {
        organization: account.organization, login_id: account.login_id, password,
        client_type: account.client_type || 'P', business_type: isBank ? 'BK' : 'CD',
      };
      if (isBank && account.account_no) body.account_no = account.account_no;
      if (!isBank && account.card_no) body.card_no = account.card_no;
      if (isHyundai && cardPassword) body.card_password = cardPassword;

      const res = await apiFetch('/api/accounts/register', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult('재연동 완료');
      setTimeout(onSuccess, 1000);
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const submitWithCert = async (certId: string, certPassword: string) => {
    setShowCertSelector(false);
    setError(''); setResult(''); setSubmitting(true);
    try {
      const res = await apiFetch('/api/accounts/register', {
        method: 'POST',
        body: JSON.stringify({
          organization: account.organization, cert_id: certId, cert_password: certPassword,
          client_type: account.client_type || 'P', business_type: isBank ? 'BK' : 'CD',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult('재연동 완료');
      setTimeout(onSuccess, 1000);
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-gray-800">{orgName} 재연동</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">구분</span>
            <span className="text-gray-700">{account.client_type === 'B' ? '법인' : '개인'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">로그인 방식</span>
            <span className={`font-medium ${isCertLogin ? 'text-[#3a5fa0]' : 'text-gray-700'}`}>
              {isCertLogin ? '공인인증서' : '아이디/비밀번호'}
            </span>
          </div>
          {!isCertLogin && account.login_id && (
            <div className="flex justify-between">
              <span className="text-gray-400">아이디</span>
              <span className="text-gray-700">{account.login_id}</span>
            </div>
          )}
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

        {isCertLogin ? (
          <div className="space-y-3">
            {error && <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>}
            {result && <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>}
            <button
              onClick={() => { setError(''); setShowCertSelector(true); }}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {submitting ? '연동 중...' : '인증서로 재연동'}
            </button>
          </div>
        ) : (
          <form onSubmit={submitIdPw} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {isBank ? '인터넷뱅킹' : '카드사 로그인'} 비밀번호
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus
                placeholder={isBank ? '인터넷뱅킹 비밀번호' : '카드사 로그인 비밀번호'}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
            </div>
            {isHyundai && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">카드 비밀번호</label>
                <input type="password" value={cardPassword} onChange={e => setCardPassword(e.target.value)} required
                  placeholder="카드 비밀번호 앞 2자리" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg" />
              </div>
            )}
            <p className="text-[11px] text-gray-400 text-center">비밀번호는 암호화 전송되며 서버에 저장되지 않습니다.</p>
            {error && <div className="rounded-lg p-3 bg-red-50 text-red-600 text-xs">{error}</div>}
            {result && <div className="rounded-lg p-3 bg-green-50 text-green-600 text-xs">{result}</div>}
            <button type="submit" disabled={submitting || !password || (isHyundai && !cardPassword)}
              className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition">
              {submitting ? '연동 중...' : '재연동'}
            </button>
          </form>
        )}
      </div>

      {/* 전자서명 작성 팝업 */}
      {showCertSelector && (
        <CertSelectorModal
          orgName={orgName}
          apiFetch={apiFetch}
          onClose={() => setShowCertSelector(false)}
          onConfirm={submitWithCert}
        />
      )}
    </div>
  );
}
