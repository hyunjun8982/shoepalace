import { NextRequest } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const tx = await queryOne('SELECT * FROM card_transactions WHERE id = $1', [params.id]);
  if (!tx) return Response.json({ error: '내역을 찾을 수 없습니다' }, { status: 404 });
  return Response.json(tx);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return Response.json({ error: '권한이 없습니다' }, { status: 403 });

  await query('DELETE FROM card_transactions WHERE id = $1', [params.id]);
  return Response.json({ message: '삭제되었습니다' });
}
