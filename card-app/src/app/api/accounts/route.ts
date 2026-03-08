import { NextRequest } from 'next/server';
import { queryAll } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { ORGANIZATION_MAP, BANK_ORGANIZATION_MAP } from '@/types';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const isAdmin = user.role === 'super_admin';
  const accounts = isAdmin
    ? await queryAll('SELECT id, organization, client_type, login_id, card_no, account_no, connected_id, owner_name, is_connected, is_active, connected_at FROM codef_accounts ORDER BY organization')
    : await queryAll('SELECT id, organization, client_type, login_id, card_no, account_no, connected_id, owner_name, is_connected, is_active, connected_at FROM codef_accounts WHERE card_app_user_id = $1 ORDER BY organization', [user.userId]);

  const cardAccounts = [];
  const bankAccounts = [];

  for (const a of accounts) {
    if (BANK_ORGANIZATION_MAP[a.organization]) {
      bankAccounts.push({
        ...a,
        organization_name: BANK_ORGANIZATION_MAP[a.organization],
      });
    } else {
      cardAccounts.push({
        ...a,
        organization_name: ORGANIZATION_MAP[a.organization] || a.organization,
      });
    }
  }

  return Response.json({ cardAccounts, bankAccounts });
}
