'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

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
  password: string;
  name: string;
  birthday: string;
  phone: string;
  adikr_barcode: string;
  barcode_image_url: string;
  is_active: boolean;
  current_points: number;
  owned_vouchers: any;
  web_fetch_status: string;
  mobile_fetch_status: string;
  memo: string;
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

  if (desc.includes('100k') || desc.includes('100000') || code.startsWith('REKR100-')) return '10만원권';
  if (desc.includes('50k') || desc.includes('50000') || code.startsWith('REKR50-')) return '5만원권';
  if (code.startsWith('REKR30-')) return '3만원권';
  if (code.startsWith('REKR10-')) return '1만원권';
  if (code.startsWith('RAFFLE_3K-')) return '래플 3천원';
  if (code.startsWith('RAFFLE_20K-')) return '래플 2만원';
  if (desc.includes('birthday') && desc.includes('20%')) return '생일 20%';
  if (desc.includes('birthday') && desc.includes('15%')) return '생일 15%';
  if (desc.includes('starbucks')) return '스타벅스';
  if (desc.includes('spotify')) return 'Spotify';
  if (val === '20') return '20% 할인';
  if (val === '10') return '10% 할인';
  if (val === '5' || val === '1') return '5% 할인';
  if (val === '3') return '15% 할인';
  if (val === '2') return '10% 할인(T2)';
  return desc || '기타';
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const { apiFetch } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [saleModal, setSaleModal] = useState<Voucher | null>(null);
  const [soldTo, setSoldTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [voucherFilter, setVoucherFilter] = useState<'all' | 'available' | 'sold'>('all');

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/accounts/${id}`);
    if (res.ok) setAccount(await res.json());
    setLoading(false);
  }, [apiFetch, id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-gray-400 text-sm">불러오는 중...</div>;
  if (!account) return <div className="text-center py-20 text-gray-400 text-sm">계정을 찾을 수 없습니다</div>;

  const vouchers = parseVouchers(account.owned_vouchers).filter(v => v.code && v.code !== 'N/A');
  const available = vouchers.filter(v => !v.sold);
  const sold = vouchers.filter(v => v.sold);

  const filteredVouchers = voucherFilter === 'available' ? available
    : voucherFilter === 'sold' ? sold : vouchers;

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 1500);
  };

  const handleSale = async (sold: boolean) => {
    if (!saleModal) return;
    setSaving(true);
    await apiFetch('/api/coupons', {
      method: 'PUT',
      body: JSON.stringify({
        accountId: account.id,
        code: saleModal.code,
        sold,
        soldTo: sold ? soldTo : '',
      }),
    });
    setSaving(false);
    setSaleModal(null);
    setSoldTo('');
    load();
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 계정 정보 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-gray-800">{account.email}</div>
            {account.name && <div className="text-xs text-gray-500 mt-0.5">{account.name}</div>}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${account.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {account.is_active ? '활성' : '비활성'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-gray-100">
          <Info label="생일" value={account.birthday} />
          <Info label="전화번호" value={account.phone} />
          <Info label="포인트" value={account.current_points ? `${account.current_points.toLocaleString()}P` : '-'} bold />
          <Info label="조회상태" value={account.web_fetch_status} />
        </div>

        {/* 바코드 */}
        {account.adikr_barcode && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">ADIKR 바코드</span>
              <button onClick={() => handleCopy(account.adikr_barcode)}
                className="text-[10px] text-primary-500 active:text-primary-700">
                {copied === account.adikr_barcode ? '복사됨' : '복사'}
              </button>
            </div>
            <div className="font-mono text-sm text-gray-700 text-center py-1 bg-gray-50 rounded-lg">
              {account.adikr_barcode}
            </div>
            {account.barcode_image_url && (
              <img src={account.barcode_image_url} alt="barcode"
                className="w-full mt-2 rounded" />
            )}
          </div>
        )}

        {account.memo && (
          <div className="pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">메모</span>
            <div className="text-xs text-gray-600 mt-0.5">{account.memo}</div>
          </div>
        )}
      </div>

      {/* 쿠폰 섹션 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            보유 쿠폰 <span className="text-primary-600">{available.length}</span>
            {sold.length > 0 && <span className="text-gray-400 font-normal text-xs ml-1">(사용 {sold.length})</span>}
          </h2>
          <div className="flex gap-1">
            {(['all', 'available', 'sold'] as const).map(f => (
              <button key={f} onClick={() => setVoucherFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition
                  ${voucherFilter === f ? 'bg-primary-100 text-primary-700' : 'text-gray-400'}`}>
                {{ all: '전체', available: '미사용', sold: '사용' }[f]}
              </button>
            ))}
          </div>
        </div>

        {filteredVouchers.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            {vouchers.length === 0 ? '보유 쿠폰이 없습니다' : '해당 조건의 쿠폰이 없습니다'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredVouchers.map((v, i) => {
              const type = getCouponType(v);
              return (
                <div key={`${v.code}-${i}`} className={`px-4 py-3 ${v.sold ? 'bg-gray-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                          ${v.sold ? 'bg-gray-200 text-gray-500' : 'bg-primary-100 text-primary-700'}`}>
                          {type}
                        </span>
                        {v.sold && <span className="text-[10px] text-red-400">사용완료</span>}
                        {v.expiry && v.expiry !== '-' && (
                          <span className="text-[10px] text-gray-400">~{v.expiry}</span>
                        )}
                      </div>
                      <button onClick={() => handleCopy(v.code)}
                        className={`mt-1 font-mono text-xs block ${v.sold ? 'text-gray-400' : 'text-gray-700'} active:text-primary-600`}>
                        {v.code}
                        {copied === v.code && <span className="ml-1.5 text-[10px] text-green-500 font-sans">복사됨</span>}
                      </button>
                      {v.sold && v.soldTo && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{v.soldTo}</div>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      {v.sold ? (
                        <button onClick={() => { setSaleModal(v); setSoldTo(v.soldTo || ''); }}
                          className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1 active:bg-gray-100">
                          취소
                        </button>
                      ) : (
                        <button onClick={() => { setSaleModal(v); setSoldTo(''); }}
                          className="text-[10px] text-white bg-primary-500 rounded px-2 py-1 active:bg-primary-700">
                          사용
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 사용/판매 모달 */}
      {saleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setSaleModal(null)}>
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">{saleModal.sold ? '사용 취소' : '사용 처리'}</h3>
            <p className="text-xs text-gray-500 mb-1">{getCouponType(saleModal)}</p>
            <p className="text-xs text-gray-500 font-mono mb-4">{saleModal.code}</p>

            {saleModal.sold ? (
              <p className="text-sm text-gray-600 mb-4">이 쿠폰의 사용 처리를 취소하시겠습니까?</p>
            ) : (
              <input type="text" placeholder="사용처 / 구매자 (선택)" value={soldTo} onChange={e => setSoldTo(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm outline-none focus:border-primary-500 mb-4" />
            )}

            <div className="flex gap-2">
              <button onClick={() => setSaleModal(null)}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm text-gray-600">
                닫기
              </button>
              <button onClick={() => handleSale(!saleModal.sold)} disabled={saving}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50
                  ${saleModal.sold ? 'bg-gray-500' : 'bg-primary-600'}`}>
                {saving ? '처리 중...' : saleModal.sold ? '사용 취소' : '사용 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, bold }: { label: string; value?: string | null; bold?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{label}</span>
      <span className={`text-xs ${bold ? 'font-bold text-primary-600' : 'text-gray-700'} truncate`}>{value || '-'}</span>
    </div>
  );
}
