import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const { id } = params;
    const url = new URL(req.url);
    const permanent = url.searchParams.get('permanent') === 'true';

    const account = await queryOne('SELECT id, organization, connected_id, is_connected, owner_name, client_type FROM codef_accounts WHERE id = $1', [id]);
    if (!account) {
      return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });
    }

    if (permanent || !account.is_connected) {
      // 연동 해제된 상태이거나 permanent=true → 완전 삭제
      // 관련 내역도 함께 삭제 (organization + owner_name + client_type 기준)
      const org = account.organization;
      const owner = account.owner_name;
      const ct = account.client_type;
      if (owner) {
        await query('DELETE FROM card_transactions WHERE organization = $1 AND owner_name = $2', [org, owner]);
        await query('DELETE FROM bank_transactions WHERE organization = $1 AND owner_name = $2', [org, owner]);
        await query('DELETE FROM card_limits WHERE organization = $1 AND owner_name = $2', [org, owner]);
      }
      await query('DELETE FROM codef_accounts WHERE id = $1', [id]);
      return Response.json({ message: '계정이 삭제되었습니다' });
    } else {
      // 연동 중인 상태 → 연동 해제만
      await query(
        'UPDATE codef_accounts SET connected_id = NULL, is_connected = false, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return Response.json({ message: '계정 연동이 해제되었습니다' });
    }
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
