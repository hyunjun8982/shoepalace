import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const cert = await queryOne(
    'SELECT id FROM user_certificates WHERE id = $1 AND card_app_user_id = $2',
    [params.id, user.userId]
  );

  if (!cert) {
    return Response.json({ error: '인증서를 찾을 수 없습니다' }, { status: 404 });
  }

  await query('DELETE FROM user_certificates WHERE id = $1', [params.id]);

  return Response.json({ message: '인증서가 삭제되었습니다' });
}
