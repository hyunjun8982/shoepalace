import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const { id } = params;

    const account = await queryOne('SELECT id, organization, connected_id FROM codef_accounts WHERE id = $1', [id]);
    if (!account) {
      return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });
    }

    await query(
      'UPDATE codef_accounts SET connected_id = NULL, is_connected = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    return Response.json({ message: '계정 연동이 해제되었습니다' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// 활성/비활성 토글
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const { id } = params;
    const { is_active } = await req.json();

    const account = await queryOne('SELECT id FROM codef_accounts WHERE id = $1', [id]);
    if (!account) {
      return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });
    }

    await query(
      'UPDATE codef_accounts SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [is_active, id]
    );

    return Response.json({ message: is_active ? '활성화되었습니다' : '비활성화되었습니다' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
