import { NextRequest } from 'next/server';
import { queryAll, query, ensureHomepageTable } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

// GET: 모든 홈페이지 링크 조회 (로그인 사용자)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  await ensureHomepageTable();
  const rows = await queryAll(
    'SELECT id, organization, business_type, client_type, url, is_active FROM institution_homepages ORDER BY business_type, organization, client_type'
  );
  return Response.json({ homepages: rows });
}

// POST: 홈페이지 링크 추가/수정 (super_admin)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') {
    return Response.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  await ensureHomepageTable();
  const { organization, business_type, client_type, url } = await req.json();

  if (!organization || !business_type || !client_type || !url) {
    return Response.json({ error: '필수 항목을 모두 입력해주세요' }, { status: 400 });
  }

  await query(
    `INSERT INTO institution_homepages (organization, business_type, client_type, url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization, business_type, client_type)
     DO UPDATE SET url = $4`,
    [organization, business_type, client_type, url]
  );

  return Response.json({ message: '저장되었습니다' });
}

// PATCH: 활성/비활성 토글 (super_admin)
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') {
    return Response.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const { id, is_active } = await req.json();
  if (!id) {
    return Response.json({ error: 'ID가 필요합니다' }, { status: 400 });
  }

  await query('UPDATE institution_homepages SET is_active = $1 WHERE id = $2', [is_active, id]);
  return Response.json({ message: is_active ? '활성화되었습니다' : '비활성화되었습니다' });
}

// DELETE: 홈페이지 링크 삭제 (super_admin)
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') {
    return Response.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return Response.json({ error: 'ID가 필요합니다' }, { status: 400 });
  }

  await query('DELETE FROM institution_homepages WHERE id = $1', [id]);
  return Response.json({ message: '삭제되었습니다' });
}
