import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, query } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

// 내 프로필 조회
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const profile = await queryOne(`
    SELECT u.id, u.username, u.display_name, u.phone, u.role, u.group_id, g.name as group_name, u.created_at
    FROM card_app_users u
    LEFT JOIN card_app_groups g ON g.id = u.group_id
    WHERE u.id = $1
  `, [user.userId]);

  return Response.json(profile);
}

// 내 프로필 수정
export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const { display_name, phone, current_password, new_password } = await req.json();

  // 비밀번호 변경
  if (new_password) {
    if (!current_password) {
      return Response.json({ error: '현재 비밀번호를 입력하세요' }, { status: 400 });
    }
    const dbUser = await queryOne('SELECT password_hash FROM card_app_users WHERE id = $1', [user.userId]);
    const valid = await bcrypt.compare(current_password, dbUser.password_hash);
    if (!valid) {
      return Response.json({ error: '현재 비밀번호가 올바르지 않습니다' }, { status: 400 });
    }
    if (new_password.length < 4) {
      return Response.json({ error: '새 비밀번호는 4자 이상이어야 합니다' }, { status: 400 });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE card_app_users SET password_hash = $1 WHERE id = $2', [hash, user.userId]);
  }

  // 이름, 전화번호 변경
  if (display_name !== undefined || phone !== undefined) {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${idx++}`);
      params.push(display_name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      params.push(phone);
    }
    params.push(user.userId);
    await query(`UPDATE card_app_users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  return Response.json({ message: '프로필이 수정되었습니다' });
}
