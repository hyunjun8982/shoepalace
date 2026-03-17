import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryAll, query } from '@/lib/db';

interface Voucher {
  code: string;
  description?: string;
  expiry?: string;
  value?: string | number;
  sold?: boolean;
  soldTo?: string;
}

// 쿠폰 종류 판별
function getCouponType(v: Voucher): string {
  const desc = (v.description || '').toLowerCase();
  const code = (v.code || '').toUpperCase();
  const val = String(v.value || '');

  if (desc.includes('100k') || desc.includes('100000') || code.startsWith('REKR100-')) return '10만원권';
  if (desc.includes('50k') || desc.includes('50000') || code.startsWith('REKR50-')) return '5만원권';
  if (code.startsWith('REKR30-')) return '3만원권';
  if (code.startsWith('REKR10-')) return '1만원권';
  if (desc.includes('birthday') && desc.includes('20%')) return '생일 20%';
  if (desc.includes('birthday') && desc.includes('15%')) return '생일 15%';
  if (desc.includes('starbucks')) return '스타벅스';
  if (desc.includes('spotify')) return 'Spotify';
  if (code.startsWith('RAFFLE_')) return '래플';

  // value 기반
  if (val === '20') return '20% 할인';
  if (val === '10') return '10% 할인';
  if (val === '5') return '5% 할인';
  if (val === '3') return '15% 할인';
  if (val === '2') return '10% 할인(T2)';
  if (val === '1') return '5% 할인(T1)';

  return desc || '기타';
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const typeFilter = req.nextUrl.searchParams.get('type') || '';
  const soldFilter = req.nextUrl.searchParams.get('sold'); // 'true', 'false', null
  const search = req.nextUrl.searchParams.get('search') || '';

  const rows = await queryAll('SELECT id, email, name, owned_vouchers FROM adidas_accounts WHERE owned_vouchers IS NOT NULL');

  const coupons: any[] = [];
  for (const row of rows) {
    let vouchers: Voucher[] = [];
    try {
      vouchers = typeof row.owned_vouchers === 'string' ? JSON.parse(row.owned_vouchers) : row.owned_vouchers;
    } catch { continue; }

    for (const v of vouchers) {
      if (!v.code || v.code === 'N/A') continue;

      const type = getCouponType(v);

      if (typeFilter && type !== typeFilter) continue;
      if (soldFilter === 'true' && !v.sold) continue;
      if (soldFilter === 'false' && v.sold) continue;
      if (search && !v.code.toLowerCase().includes(search.toLowerCase()) && !row.email.toLowerCase().includes(search.toLowerCase())) continue;

      coupons.push({
        accountId: row.id,
        email: row.email,
        accountName: row.name,
        code: v.code,
        type,
        expiry: v.expiry || '-',
        sold: !!v.sold,
        soldTo: v.soldTo || '',
        description: v.description || '',
      });
    }
  }

  // 종류별 집계
  const typeCounts: Record<string, { total: number; sold: number; available: number }> = {};
  for (const c of coupons) {
    if (!typeCounts[c.type]) typeCounts[c.type] = { total: 0, sold: 0, available: 0 };
    typeCounts[c.type].total++;
    if (c.sold) typeCounts[c.type].sold++;
    else typeCounts[c.type].available++;
  }

  return Response.json({ coupons, typeCounts, total: coupons.length });
}

// 판매 처리
export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const { accountId, code, sold, soldTo } = await req.json();

  const row = await queryAll('SELECT owned_vouchers FROM adidas_accounts WHERE id = $1', [accountId]);
  if (!row[0]) return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  let vouchers: Voucher[] = [];
  try {
    vouchers = typeof row[0].owned_vouchers === 'string' ? JSON.parse(row[0].owned_vouchers) : row[0].owned_vouchers;
  } catch {
    return Response.json({ error: '쿠폰 데이터 파싱 실패' }, { status: 500 });
  }

  let found = false;
  for (const v of vouchers) {
    if (v.code === code) {
      v.sold = sold;
      v.soldTo = soldTo || '';
      found = true;
      break;
    }
  }

  if (!found) return Response.json({ error: '쿠폰을 찾을 수 없습니다' }, { status: 404 });

  await query(
    'UPDATE adidas_accounts SET owned_vouchers = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(vouchers), accountId]
  );

  return Response.json({ success: true });
}
