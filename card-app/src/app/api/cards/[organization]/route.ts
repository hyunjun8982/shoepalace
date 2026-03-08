import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { getCardList, getCardLimit } from '@/lib/codef';

export async function GET(req: NextRequest, { params }: { params: { organization: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const clientType = searchParams.get('client_type') || 'P';
  const withLimit = searchParams.get('with_limit') === 'true';

  try {
    const isAdmin = user.role === 'super_admin';
    const account = isAdmin
      ? await queryOne('SELECT connected_id FROM codef_accounts WHERE organization = $1 AND client_type = $2 AND connected_id IS NOT NULL LIMIT 1', [params.organization, clientType])
      : await queryOne('SELECT connected_id FROM codef_accounts WHERE card_app_user_id = $1 AND organization = $2 AND client_type = $3 AND connected_id IS NOT NULL LIMIT 1', [user.userId, params.organization, clientType]);

    if (!account?.connected_id) {
      return Response.json({ error: '연결된 계정이 없습니다' }, { status: 400 });
    }

    const cards = await getCardList(params.organization, account.connected_id, clientType);

    // 한도 조회 옵션
    if (withLimit) {
      for (const card of cards) {
        try {
          const limit = await getCardLimit(params.organization, account.connected_id, card.resCardNo || card.card_no, clientType);
          card.limitInfo = limit;
        } catch {
          card.limitInfo = null;
        }
      }
    }

    return Response.json({ cards, organization: params.organization });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
