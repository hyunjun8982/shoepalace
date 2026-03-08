import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { syncBankTransactions } from '@/lib/codef';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { organization, start_date, end_date, account_no, client_type = 'B' } = body;

    if (!organization || !start_date || !end_date) {
      return Response.json({ error: '은행, 시작일, 종료일은 필수입니다' }, { status: 400 });
    }

    const isAdmin = user.role === 'super_admin';
    const account = isAdmin
      ? await queryOne(
          "SELECT connected_id, owner_name, account_no FROM codef_accounts WHERE organization = $1 AND client_type = $2 AND connected_id IS NOT NULL AND connected_id != '' AND is_connected = true ORDER BY connected_at DESC LIMIT 1",
          [organization, client_type])
      : await queryOne(
          "SELECT connected_id, owner_name, account_no FROM codef_accounts WHERE card_app_user_id = $1 AND organization = $2 AND client_type = $3 AND connected_id IS NOT NULL AND connected_id != '' AND is_connected = true ORDER BY connected_at DESC LIMIT 1",
          [user.userId, organization, client_type]);

    if (!account?.connected_id) {
      return Response.json({ error: '해당 은행에 연결된 계정이 없습니다.' }, { status: 400 });
    }

    const acctNo = account_no || account.account_no || '';
    if (!acctNo) {
      return Response.json({ error: '계좌번호가 필요합니다.' }, { status: 400 });
    }

    const result = await syncBankTransactions(
      organization, account.connected_id, acctNo,
      start_date, end_date, client_type, account.owner_name
    );

    return Response.json({
      ...result,
      message: `총 ${result.total_count}건 중 신규 ${result.new_count}건, 업데이트 ${result.updated_count}건`,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
