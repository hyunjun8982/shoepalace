import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryOne } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const row = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [params.id]);
  if (!row) return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  return Response.json(row);
}
