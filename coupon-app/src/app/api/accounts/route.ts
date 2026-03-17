import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryAll, queryOne, query, ensureAdidasTable } from '@/lib/db';

const KNOWN_DOMAINS = ['gmail.com', 'naver.com', 'nate.com', 'kakao.com', 'daum.net', 'hanmail.net', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'me.com', 'live.com', 'msn.com'];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  await ensureAdidasTable();

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') || '';
  const page = parseInt(sp.get('page') || '1');
  const limit = parseInt(sp.get('limit') || '30');
  const offset = (page - 1) * limit;

  // 정렬
  const sortBy = sp.get('sortBy') || 'id';
  const sortOrder = sp.get('sortOrder') === 'asc' ? 'ASC' : 'DESC';
  const allowedSorts: Record<string, string> = {
    id: 'id', email: 'email', name: 'name', birthday: 'birthday',
    points: 'current_points', updated_at: 'updated_at',
  };
  const orderCol = allowedSorts[sortBy] || 'id';

  // 필터 조건
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  // 검색
  if (search) {
    conditions.push(`(email ILIKE $${idx} OR name ILIKE $${idx} OR memo ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  // 1. 활성 상태
  const activeFilter = sp.get('active'); // 'true' | 'false' | null(전체)
  if (activeFilter === 'true') conditions.push('is_active = true');
  else if (activeFilter === 'false') conditions.push('is_active = false');

  // 2. 이메일 종류
  const emailType = sp.get('emailType'); // 'official' | 'catchall'
  if (emailType === 'official') {
    const domainList = KNOWN_DOMAINS.map((d, i) => `$${idx + i}`);
    conditions.push(`LOWER(SPLIT_PART(email, '@', 2)) IN (${domainList.join(',')})`);
    KNOWN_DOMAINS.forEach(d => { params.push(d); idx++; });
  } else if (emailType === 'catchall') {
    const domainList = KNOWN_DOMAINS.map((d, i) => `$${idx + i}`);
    conditions.push(`LOWER(SPLIT_PART(email, '@', 2)) NOT IN (${domainList.join(',')})`);
    KNOWN_DOMAINS.forEach(d => { params.push(d); idx++; });
  }

  // 3. 조회현황
  const status = sp.get('status'); // 'success' | 'error'
  if (status === 'success') {
    conditions.push(`web_fetch_status LIKE '%완료%'`);
  } else if (status === 'error') {
    conditions.push(`web_fetch_status IS NOT NULL AND web_fetch_status != '' AND web_fetch_status NOT LIKE '%완료%'`);
  }

  // 4. 조회일 범위
  const dateFrom = sp.get('dateFrom');
  const dateTo = sp.get('dateTo');
  if (dateFrom) {
    conditions.push(`updated_at >= $${idx}::timestamp`);
    params.push(dateFrom + ' 00:00:00');
    idx++;
  }
  if (dateTo) {
    conditions.push(`updated_at <= $${idx}::timestamp`);
    params.push(dateTo + ' 23:59:59');
    idx++;
  }

  // 5. 포인트 범위
  const minPoints = sp.get('minPoints');
  const maxPoints = sp.get('maxPoints');
  if (minPoints) {
    conditions.push(`current_points >= $${idx}`);
    params.push(parseInt(minPoints));
    idx++;
  }
  if (maxPoints) {
    conditions.push(`current_points <= $${idx}`);
    params.push(parseInt(maxPoints));
    idx++;
  }

  // 6. 생일월
  const birthMonths = sp.get('birthMonths'); // "1,3,12" 형태
  if (birthMonths) {
    const months = birthMonths.split(',').map(m => parseInt(m)).filter(m => m >= 1 && m <= 12);
    if (months.length > 0) {
      // birthday 형식: "YYYY-MM-DD" 또는 "MM-DD" 등 다양할 수 있음
      const monthConds = months.map(m => {
        const mm = String(m).padStart(2, '0');
        return `(birthday LIKE $${idx} OR birthday LIKE $${idx + 1})`;
      });
      // 각 월에 대해 2개 패턴
      months.forEach(m => {
        const mm = String(m).padStart(2, '0');
        params.push(`%-${mm}-%`); // YYYY-MM-DD
        params.push(`${mm}-%`);   // MM-DD
        idx += 2;
      });
      conditions.push(`(${monthConds.join(' OR ')})`);
    }
  }

  // 7. 쿠폰 종류 (서버에서 text LIKE 필터)
  const couponTypes = sp.get('couponTypes');
  if (couponTypes) {
    const types = couponTypes.split(',');
    const couponConds: string[] = [];
    for (const t of types) {
      // 금액권 (코드 프리픽스)
      if (t === '10만원') couponConds.push(`owned_vouchers::text LIKE '%REKR100-%'`);
      else if (t === '5만원') couponConds.push(`owned_vouchers::text LIKE '%REKR50-%'`);
      else if (t === '3만원') couponConds.push(`owned_vouchers::text LIKE '%REKR30-%'`);
      else if (t === '1만원') couponConds.push(`owned_vouchers::text LIKE '%REKR10-%'`);
      else if (t === '3천원') couponConds.push(`owned_vouchers::text LIKE '%RAFFLE_3K-%'`);
      // % 할인권 (value 필드 기반: 1=5%, 2=10%, 3=15%, 20=20%)
      else if (t === '20%') couponConds.push(`owned_vouchers::text LIKE '%"value": "20"%' OR owned_vouchers::text LIKE '%"value":"20"%' OR owned_vouchers::text LIKE '%"value": 20%'`);
      else if (t === '15%') couponConds.push(`owned_vouchers::text LIKE '%"value": "3"%' OR owned_vouchers::text LIKE '%"value":"3"%' OR owned_vouchers::text LIKE '%"value": 3%'`);
      else if (t === '10%') couponConds.push(`owned_vouchers::text LIKE '%"value": "10"%' OR owned_vouchers::text LIKE '%"value":"10"%' OR owned_vouchers::text LIKE '%"value": 10%' OR owned_vouchers::text LIKE '%"value": "2"%' OR owned_vouchers::text LIKE '%"value":"2"%'`);
      else if (t === '5%') couponConds.push(`owned_vouchers::text LIKE '%"value": "1"%' OR owned_vouchers::text LIKE '%"value":"1"%' OR owned_vouchers::text LIKE '%"value": "5"%' OR owned_vouchers::text LIKE '%"value":"5"%'`);
      else if (t === '스타벅스') couponConds.push(`owned_vouchers::text ILIKE '%starbucks%'`);
    }
    if (couponConds.length > 0) {
      conditions.push(`(${couponConds.join(' OR ')})`);
    }
  }

  const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  // 총 건수 (요약 통계용)
  const countResult = await queryOne(
    `SELECT COUNT(*) as total,
            COALESCE(SUM(current_points), 0) as total_points,
            COALESCE(SUM(CASE WHEN owned_vouchers IS NOT NULL AND owned_vouchers != '' AND owned_vouchers != '[]' THEN
              (SELECT COUNT(*) FROM jsonb_array_elements(owned_vouchers::jsonb) v WHERE v->>'code' IS NOT NULL AND v->>'code' != 'N/A' AND (v->>'sold')::text != 'true')
            ELSE 0 END), 0) as total_coupons
     FROM adidas_accounts${where}`,
    params
  );

  // 페이징된 목록 (owned_vouchers 포함하여 프론트에서 종류별 파싱)
  const rows = await queryAll(
    `SELECT id, email, name, birthday, is_active, current_points, web_fetch_status, updated_at, owned_vouchers
     FROM adidas_accounts${where}
     ORDER BY ${orderCol} ${sortOrder} NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return Response.json({
    accounts: rows,
    total: parseInt(countResult.total),
    totalPoints: parseInt(countResult.total_points),
    totalCoupons: parseInt(countResult.total_coupons),
    page,
    limit,
    hasMore: offset + rows.length < parseInt(countResult.total),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  await ensureAdidasTable();

  const body = await req.json();

  const accounts = Array.isArray(body) ? body : [body];
  const results = [];

  for (const acc of accounts) {
    if (!acc.email) continue;
    try {
      const existing = await queryOne('SELECT id FROM adidas_accounts WHERE email = $1', [acc.email]);
      if (existing) {
        await query(
          `UPDATE adidas_accounts SET password = COALESCE($2, password), name = COALESCE($3, name),
           birthday = COALESCE($4, birthday), memo = COALESCE($5, memo), updated_at = NOW() WHERE email = $1`,
          [acc.email, acc.password, acc.name, acc.birthday, acc.memo]
        );
        results.push({ email: acc.email, action: 'updated' });
      } else {
        await query(
          `INSERT INTO adidas_accounts (email, password, name, birthday, memo) VALUES ($1, $2, $3, $4, $5)`,
          [acc.email, acc.password, acc.name, acc.birthday, acc.memo]
        );
        results.push({ email: acc.email, action: 'created' });
      }
    } catch (e: any) {
      results.push({ email: acc.email, action: 'error', error: e.message });
    }
  }

  return Response.json({ results });
}
