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
  const paymentType = searchParams.get('payment_type');
  const cancelStatus = searchParams.get('cancel_status');
  const ownerName = searchParams.get('owner_name');
  const clientType = searchParams.get('client_type');
  const assignedUser = searchParams.get('assigned_user');

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  // 권한 기반 필터: owner_name OR assigned_user 매칭
  if (allowedOwners !== null) {
    if (allowedOwners.length === 0 && !user.displayName) {
      conditions.push('1 = 0');
    } else {
      const orParts: string[] = [];
      if (allowedOwners.length > 0) {
        const placeholders = allowedOwners.map(() => `$${paramIdx++}`).join(',');
        orParts.push(`t.owner_name IN (${placeholders})`);
        params.push(...allowedOwners);
      }
      // 자기 이름으로 배정된 카드 내역도 볼 수 있음
      if (user.displayName) {
        orParts.push(`cua.user_name = $${paramIdx++}`);
        params.push(user.displayName);
      }
      if (orParts.length > 0) {
        conditions.push(`(${orParts.join(' OR ')})`);
      } else {
        conditions.push('1 = 0');
      }
    }
  }

  if (startDate) {
    conditions.push(`t.used_date >= $${paramIdx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`t.used_date <= $${paramIdx++}`);
    params.push(endDate);
  }
  if (organizations) {
    const orgList = organizations.split(',').filter(Boolean);
    const placeholders = orgList.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`t.organization IN (${placeholders})`);
    params.push(...orgList);
  } else if (organization) {
    conditions.push(`t.organization = $${paramIdx++}`);
    params.push(organization);
  }
  if (owners) {
    const ownerList = owners.split(',').filter(Boolean);
    const placeholders = ownerList.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`t.owner_name IN (${placeholders})`);
    params.push(...ownerList);
  } else if (ownerName) {
    conditions.push(`t.owner_name = $${paramIdx++}`);
    params.push(ownerName);
  }
  if (paymentType) {
    conditions.push(`t.payment_type = $${paramIdx++}`);
    params.push(paymentType);
  }
  if (cancelStatus) {
    conditions.push(`t.cancel_status = $${paramIdx++}`);
    params.push(cancelStatus);
  }
  if (clientType) {
    conditions.push(`t.client_type = $${paramIdx++}`);
    params.push(clientType);
  }
  if (search) {
    conditions.push(`(t.merchant_name ILIKE $${paramIdx} OR t.card_no ILIKE $${paramIdx} OR t.approval_no ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (assignedUser) {
    conditions.push(`cua.user_name = $${paramIdx++}`);
    params.push(assignedUser);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne(
    `SELECT COUNT(*) as total FROM card_transactions t
     LEFT JOIN card_user_assignments cua
       ON t.card_no = cua.card_no
       AND t.used_date >= cua.start_date
       AND (cua.end_date IS NULL OR t.used_date <= cua.end_date)
     ${where}`,
    params
  );
  const total = parseInt(countResult.total);

  const items = await queryAll(
    `SELECT t.*, cua.user_name AS assigned_user
     FROM card_transactions t
     LEFT JOIN card_user_assignments cua
       ON t.card_no = cua.card_no
       AND t.used_date >= cua.start_date
       AND (cua.end_date IS NULL OR t.used_date <= cua.end_date)
     ${where}
     ORDER BY t.used_date DESC, t.used_time DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, skip]
  );

  return Response.json({ total, items });
}
