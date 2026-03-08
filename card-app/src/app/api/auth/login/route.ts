import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, ensureAuthTable } from '@/lib/db';
import { createToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await ensureAuthTable();

    const { username, password } = await req.json();
    if (!username || !password) {
      return Response.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 });
    }

    const user = await queryOne('SELECT * FROM card_app_users WHERE username = $1', [username]);
    if (!user) {
      return Response.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }

    const token = await createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      groupId: user.group_id || null,
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        groupId: user.group_id || null,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
