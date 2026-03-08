import { NextRequest } from 'next/server';
import { queryAll, query } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

// 회원 목록 (super_admin only)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  const users = await queryAll(`
    SELECT u.id, u.username, u.display_name, u.phone, u.role, u.group_id, g.name as group_name, u.created_at
    FROM card_app_users u
    LEFT JOIN card_app_groups g ON g.id = u.group_id
    ORDER BY u.created_at DESC
  `);

  return Response.json({ users });
}

// 회원 정보 수정 (super_admin: 역할/그룹 변경)
export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  const { user_id, role, group_id } = await req.json();
  if (!user_id) return Response.json({ error: '회원 ID가 필요합니다' }, { status: 400 });

  const validRoles = ['super_admin', 'group_admin', 'user'];
  if (role && !validRoles.includes(role)) {
    return Response.json({ error: '유효하지 않은 역할입니다' }, { status: 400 });
  }

  if (role !== undefined) {
    await query('UPDATE card_app_users SET role = $1 WHERE id = $2', [role, user_id]);
  }
  if (group_id !== undefined) {
    await query('UPDATE card_app_users SET group_id = $1 WHERE id = $2', [group_id || null, user_id]);
  }

  return Response.json({ message: '회원 정보가 수정되었습니다' });
}
