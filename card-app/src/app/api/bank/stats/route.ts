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
  let paramIdx = 1;

  // 권한 기반 필터
  paramIdx = applyOwnerFilter(allowedOwners, conditions, params, paramIdx);

  if (startDate) {
    conditions.push(`tr_date >= $${paramIdx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`tr_date <= $${paramIdx++}`);
    params.push(endDate);
  }
  if (organizations) {
    const orgList = organizations.split(',').filter(Boolean);
    const placeholders = orgList.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`organization IN (${placeholders})`);
    params.push(...orgList);
  } else if (organization) {
    conditions.push(`organization = $${paramIdx++}`);
    params.push(organization);
  }
  if (owners) {
    const ownerList = owners.split(',').filter(Boolean);
    const placeholders = ownerList.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`owner_name IN (${placeholders})`);
    params.push(...ownerList);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await queryOne(
    `SELECT
      COALESCE(SUM(tr_amount_in), 0) as total_in,
      COALESCE(SUM(tr_amount_out), 0) as total_out,
      COUNT(*) as total_count
    FROM bank_transactions ${where}`,
    params
  );

  return Response.json({
    total_in: parseFloat(result.total_in),
    total_out: parseFloat(result.total_out),
    total_count: parseInt(result.total_count),
  });
}
