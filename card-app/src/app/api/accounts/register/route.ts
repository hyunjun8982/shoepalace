import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { registerAccount } from '@/lib/codef';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { organization, login_id, password, card_no, card_password, client_type, business_type, account_no, owner_name } = body;

    if (!organization || !login_id || !password) {
      return Response.json({ error: '기관코드, 아이디, 비밀번호는 필수입니다' }, { status: 400 });
    }

    const result = await registerAccount(organization, login_id, password, {
      cardNo: card_no,
      cardPassword: card_password,
      clientType: client_type || 'P',
      businessType: business_type || 'CD',
      accountNo: account_no,
      ownerName: owner_name || '',
      cardAppUserId: user.userId,
    });

    return Response.json({
      connected_id: result.connectedId,
      message: '계정 연동 완료',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
