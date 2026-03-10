import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { registerAccount } from '@/lib/codef';
import { queryOne } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { organization, login_id, password, card_no, card_password, client_type, business_type, account_no, owner_name, cert_id, cert_password, der_file, key_file, cert_name } = body;

    const isCertLogin = !!(cert_id || (der_file && key_file));

    if (!organization) {
      return Response.json({ error: '기관코드는 필수입니다' }, { status: 400 });
    }
    if (isCertLogin && !cert_password) {
      return Response.json({ error: '인증서 비밀번호는 필수입니다' }, { status: 400 });
    }
    if (!isCertLogin && (!login_id || !password)) {
      return Response.json({ error: '아이디와 비밀번호는 필수입니다' }, { status: 400 });
    }

    // owner_name이 없으면 사용자의 display_name 사용
    let resolvedOwnerName = owner_name || '';
    if (!resolvedOwnerName) {
      const userInfo = await queryOne('SELECT display_name FROM card_app_users WHERE id = $1', [user.userId]);
      resolvedOwnerName = userInfo?.display_name || user.username;
    }

    const result = await registerAccount(organization, login_id || '', password || '', {
      cardNo: card_no,
      cardPassword: card_password,
      clientType: client_type || 'P',
      businessType: business_type || 'CD',
      accountNo: account_no,
      ownerName: resolvedOwnerName,
      cardAppUserId: user.userId,
      loginType: isCertLogin ? '0' : '1',
      certId: cert_id,
      certPassword: cert_password,
      derFile: der_file,
      keyFile: key_file,
      certName: cert_name,
    });

    return Response.json({
      connected_id: result.connectedId,
      message: '계정 연동 완료',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
