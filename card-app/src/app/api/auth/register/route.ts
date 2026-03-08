import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, ensureAuthTable } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    await ensureAuthTable();

    const { username, password, display_name, phone, group_id } = await req.json();

    if (!username || !password || !display_name) {
      return Response.json({ error: '아이디, 비밀번호, 이름은 필수입니다' }, { status: 400 });
    }

    if (username.length < 3) {
      return Response.json({ error: '아이디는 3자 이상이어야 합니다' }, { status: 400 });
    }

    if (password.length < 4) {
      return Response.json({ error: '비밀번호는 4자 이상이어야 합니다' }, { status: 400 });
    }

    const existing = await queryOne('SELECT id FROM card_app_users WHERE username = $1', [username]);
    if (existing) {
      return Response.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
    }

    if (group_id) {
      const group = await queryOne('SELECT id FROM card_app_groups WHERE id = $1', [group_id]);
      if (!group) {
        return Response.json({ error: '존재하지 않는 그룹입니다' }, { status: 400 });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    await queryOne(
      `INSERT INTO card_app_users (username, password_hash, display_name, phone, role, group_id)
       VALUES ($1, $2, $3, $4, 'user', $5) RETURNING id`,
      [username, hash, display_name, phone || null, group_id || null]
    );

    return Response.json({ message: '회원가입이 완료되었습니다' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// 그룹 목록 조회 (회원가입 폼에서 사용)
export async function GET() {
  try {
    await ensureAuthTable();
    const groups = await queryAll('SELECT id, name FROM card_app_groups ORDER BY name');
    return Response.json({ groups });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
