import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryOne, ensureCodefCertColumns } from '@/lib/db';
import { registerAccount } from '@/lib/codef';
import { decryptPassword } from '@/lib/crypto';

// 저장된 비밀번호로 1클릭 재연동 (ID/PW 로그인만 지원)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const { id } = params;
    await ensureCodefCertColumns();

    const acc = await queryOne(
      `SELECT organization, client_type, login_id, account_no, card_no, owner_name, login_type, encrypted_password
       FROM codef_accounts WHERE id = $1 AND card_app_user_id = $2`,
      [id, user.userId]
    );

    if (!acc) {
      return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });
    }
    if (acc.login_type !== '1') {
      return Response.json({ error: '공인인증서 로그인은 빠른 재연동이 지원되지 않습니다' }, { status: 400 });
    }
    if (!acc.encrypted_password) {
      return Response.json({ error: '저장된 비밀번호가 없습니다. 재연동 화면에서 비밀번호를 입력해주세요' }, { status: 400 });
    }

    let plainPassword: string;
    try {
      plainPassword = decryptPassword(acc.encrypted_password);
    } catch (err: any) {
      return Response.json({ error: '저장된 비밀번호 복호화 실패: ' + err.message }, { status: 500 });
    }

    const isBank = !acc.organization?.startsWith('03');
    const result = await registerAccount(acc.organization, acc.login_id || '', plainPassword, {
      clientType: acc.client_type || 'P',
      businessType: isBank ? 'BK' : 'CD',
      accountNo: acc.account_no || undefined,
      cardNo: acc.card_no || undefined,
      ownerName: acc.owner_name || undefined,
      cardAppUserId: user.userId,
      loginType: '1',
      // savePassword를 undefined로 두면 기존 저장값 유지
    });

    return Response.json({
      connected_id: result.connectedId,
      message: '재연동 완료',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
