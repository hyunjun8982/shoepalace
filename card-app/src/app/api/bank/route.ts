import { NextRequest } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';
import { getUser, unauthorized, getAllowedOwnerNames, applyOwnerFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const allowedOwners = await getAllowedOwnerNames(user);

  const { searchParams } = new URL(req.url);
  const skip = parseInt(searchParams.get('skip') || '0');
  const limit = parseInt(searchParams.get('limit') || '50');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const organization = searchParams.get('organization');
  const organizations = searchParams.get('organizations');
  const owners = searchParams.get('owners');
  const search = searchParams.get('search');
  const accountNo = searchParams.get('account_no');
  const clientType = searchParams.get('client_type');

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
  if (accountNo) {
    conditions.push(`account_no = $${paramIdx++}`);
    params.push(accountNo);
  }
  if (clientType) {
    conditions.push(`client_type = $${paramIdx++}`);
    params.push(clientType);
  }
  if (search) {
    conditions.push(`(description1 ILIKE $${paramIdx} OR description2 ILIKE $${paramIdx} OR account_no ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne(`SELECT COUNT(*) as total FROM bank_transactions ${where}`, params);
  const total = parseInt(countResult.total);

  const items = await queryAll(
    `SELECT *, COALESCE(client_type, 'P') as client_type FROM bank_transactions ${where} ORDER BY tr_date DESC, tr_time DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, skip]
  );

  return Response.json({ total, items });
}
