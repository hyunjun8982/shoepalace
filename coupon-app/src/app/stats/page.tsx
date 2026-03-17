'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface Stats {
  totalAccounts: number;
  activeAccounts: number;
  totalPoints: number;
  totalCoupons: number;
  soldCoupons: number;
  availableCoupons: number;
  typeCounts: Record<string, { total: number; sold: number; available: number }>;
}

export default function StatsPage() {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await apiFetch('/api/stats');
      setStats(await res.json());
      setLoading(false);
    };
    load();
  }, [apiFetch]);

  if (loading || !stats) {
    return <div className="text-center py-20 text-gray-400 text-sm">불러오는 중...</div>;
  }

  const sortedTypes = Object.entries(stats.typeCounts).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 전체 요약 */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="전체 계정" value={stats.totalAccounts} />
        <StatCard label="활성 계정" value={stats.activeAccounts} color="text-primary-600" />
        <StatCard label="총 포인트" value={stats.totalPoints.toLocaleString()} />
        <StatCard label="총 쿠폰" value={stats.totalCoupons} />
        <StatCard label="미판매" value={stats.availableCoupons} color="text-green-600" />
        <StatCard label="판매완료" value={stats.soldCoupons} color="text-gray-500" />
      </div>

      {/* 종류별 상세 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">종류별 현황</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {sortedTypes.map(([type, counts]) => {
            const pct = counts.total > 0 ? (counts.sold / counts.total * 100) : 0;
            return (
              <div key={type} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{type}</span>
                  <span className="text-sm font-bold text-gray-800">{counts.available}<span className="text-xs text-gray-400 font-normal"> / {counts.total}</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-primary-400 h-1.5 rounded-full" style={{ width: `${100 - pct}%` }} />
                </div>
                <div className="mt-0.5 text-[10px] text-gray-400 text-right">
                  판매 {counts.sold} ({pct.toFixed(0)}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <div className={`text-lg font-bold ${color || 'text-gray-800'}`}>{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}
