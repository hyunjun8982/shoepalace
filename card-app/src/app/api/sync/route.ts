import { NextRequest } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { syncApprovalList } from '@/lib/codef';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { organization, start_date, end_date, client_type = 'P', card_no, member_store_info_type = '3', inquiry_type = '1' } = body;

    if (!organization || !start_date || !end_date) {
      return Response.json({ error: '카드사, 시작일, 종료일은 필수입니다' }, { status: 400 });
    }

    // 해당 카드사의 connected_id 조회 (사용자 필터: admin은 전체)
    const isAdmin = user.role === 'super_admin';
    const account = isAdmin
      ? await queryOne(
          "SELECT connected_id, owner_name, client_type FROM codef_accounts WHERE organization = $1 AND client_type = $2 AND connected_id IS NOT NULL AND connected_id != '' AND is_connected = true ORDER BY connected_at DESC LIMIT 1",
          [organization, client_type])
      : await queryOne(
          "SELECT connected_id, owner_name, client_type FROM codef_accounts WHERE card_app_user_id = $1 AND organization = $2 AND client_type = $3 AND connected_id IS NOT NULL AND connected_id != '' AND is_connected = true ORDER BY connected_at DESC LIMIT 1",
          [user.userId, organization, client_type]);

    console.log(`[Sync] organization=${organization}, client_type=${client_type}, found:`, account);

    if (!account?.connected_id) {
      // 디버그: 해당 organization의 모든 계정 확인
      const allAccounts = await queryAll(
        'SELECT id, organization, client_type, connected_id, is_connected FROM codef_accounts WHERE organization = $1',
        [organization]
      );
      console.log(`[Sync] All accounts for ${organization}:`, allAccounts);
      return Response.json({ error: '해당 카드사에 연결된 계정이 없습니다. 먼저 계정을 연동하세요.' }, { status: 400 });
    }

    const result = await syncApprovalList(
      organization, account.connected_id,
      start_date, end_date,
      client_type, account.owner_name,
      card_no, member_store_info_type, inquiry_type
    );

    return Response.json({
      ...result,
      message: `총 ${result.total_count}건 중 신규 ${result.new_count}건, 업데이트 ${result.updated_count}건`,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
