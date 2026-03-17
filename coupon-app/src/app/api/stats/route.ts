import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryAll, queryOne } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const rows = await queryAll('SELECT id, email, is_active, current_points, owned_vouchers FROM adidas_accounts');

  let totalAccounts = rows.length;
  let activeAccounts = 0;
  let totalPoints = 0;
  let totalCoupons = 0;
  let soldCoupons = 0;
  let availableCoupons = 0;
  const typeCounts: Record<string, { total: number; sold: number; available: number }> = {};

  for (const row of rows) {
    if (row.is_active) activeAccounts++;
    totalPoints += row.current_points || 0;

    let vouchers: any[] = [];
    try {
      vouchers = typeof row.owned_vouchers === 'string' ? JSON.parse(row.owned_vouchers) : (row.owned_vouchers || []);
    } catch { continue; }

    for (const v of vouchers) {
      if (!v.code || v.code === 'N/A') continue;
      totalCoupons++;

      const type = getCouponType(v);
      if (!typeCounts[type]) typeCounts[type] = { total: 0, sold: 0, available: 0 };
      typeCounts[type].total++;

      if (v.sold) {
        soldCoupons++;
        typeCounts[type].sold++;
      } else {
        availableCoupons++;
        typeCounts[type].available++;
      }
    }
  }

  return Response.json({
    totalAccounts,
    activeAccounts,
    totalPoints,
    totalCoupons,
    soldCoupons,
    availableCoupons,
    typeCounts,
  });
}

function getCouponType(v: any): string {
  const desc = (v.description || '').toLowerCase();
  const code = (v.code || '').toUpperCase();
  const val = String(v.value || '');

  if (desc.includes('100k') || desc.includes('100000') || code.startsWith('REKR100-')) return '10만원권';
  if (desc.includes('50k') || desc.includes('50000') || code.startsWith('REKR50-')) return '5만원권';
  if (code.startsWith('REKR30-')) return '3만원권';
  if (code.startsWith('REKR10-')) return '1만원권';
  if (desc.includes('birthday') && desc.includes('20%')) return '생일 20%';
  if (desc.includes('birthday') && desc.includes('15%')) return '생일 15%';
  if (val === '20') return '20% 할인';
  if (val === '10') return '10% 할인';
  if (val === '5' || val === '1') return '5% 할인';
  if (val === '3') return '15% 할인';
  if (val === '2') return '10% 할인(T2)';

  return desc || '기타';
}
