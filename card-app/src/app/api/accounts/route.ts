import { NextRequest } from 'next/server';
import { queryAll } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { ORGANIZATION_MAP, BANK_ORGANIZATION_MAP } from '@/types';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const isAdmin = user.role === 'super_admin';
  const accounts = isAdmin
    ? await queryAll('SELECT id, organization, client_type, login_id, card_no, account_no, connected_id, owner_name, is_connected, is_active, connected_at, login_type, encrypted_password FROM codef_accounts ORDER BY organization')
    : await queryAll('SELECT id, organization, client_type, login_id, card_no, account_no, connected_id, owner_name, is_connected, is_active, connected_at, login_type, encrypted_password FROM codef_accounts WHERE card_app_user_id = $1 ORDER BY organization', [user.userId]);

  const cardAccounts = [];
  const bankAccounts = [];

  for (const a of accounts) {
    // 비밀번호 자체는 절대 클라이언트로 보내지 않고 플래그만 전달
    const { encrypted_password, ...safe } = a;
    const enriched = { ...safe, has_saved_password: !!encrypted_password };

    if (BANK_ORGANIZATION_MAP[a.organization]) {
      bankAccounts.push({
        ...enriched,
        organization_name: BANK_ORGANIZATION_MAP[a.organization],
      });
    } else {
      cardAccounts.push({
        ...enriched,
        organization_name: ORGANIZATION_MAP[a.organization] || a.organization,
      });
    }
  }

  return Response.json({ cardAccounts, bankAccounts });
}
