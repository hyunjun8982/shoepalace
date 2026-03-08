import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { getUser, unauthorized, getAllowedOwnerNames, applyOwnerFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const allowedOwners = await getAllowedOwnerNames(user);

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const organization = searchParams.get('organization');
  const organizations = searchParams.get('organizations');
  const owners = searchParams.get('owners');

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  // 권한 기반 필터
  idx = applyOwnerFilter(allowedOwners, conditions, params, idx);

  if (startDate) { conditions.push(`used_date >= $${idx++}`); params.push(startDate); }
  if (endDate) { conditions.push(`used_date <= $${idx++}`); params.push(endDate); }
  if (organizations) {
    const orgList = organizations.split(',').filter(Boolean);
    const placeholders = orgList.map(() => `$${idx++}`).join(',');
    conditions.push(`organization IN (${placeholders})`);
    params.push(...orgList);
  } else if (organization) { conditions.push(`organization = $${idx++}`); params.push(organization); }
  if (owners) {
    const ownerList = owners.split(',').filter(Boolean);
    const placeholders = ownerList.map(() => `$${idx++}`).join(',');
    conditions.push(`owner_name IN (${placeholders})`);
    params.push(...ownerList);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stats = await queryOne(`
    SELECT
      COALESCE(SUM(CASE WHEN cancel_status = 'normal' THEN used_amount ELSE 0 END), 0) as total_amount,
      COUNT(CASE WHEN cancel_status = 'normal' THEN 1 END) as total_count,
      COUNT(CASE WHEN cancel_status != 'normal' THEN 1 END) as cancel_count,
      COALESCE(SUM(CASE WHEN cancel_status != 'normal' THEN cancel_amount ELSE 0 END), 0) as cancel_amount
    FROM card_transactions ${where}
  `, params);

  return Response.json({
    total_amount: parseFloat(stats.total_amount),
    total_count: parseInt(stats.total_count),
    cancel_count: parseInt(stats.cancel_count),
    cancel_amount: parseFloat(stats.cancel_amount),
  });
}
