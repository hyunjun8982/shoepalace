import { NextRequest } from 'next/server';
import { queryAll, queryOne, query } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

// 그룹 목록 조회
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const groups = await queryAll(`
    SELECT g.id, g.name, g.created_at, COUNT(u.id)::int as member_count
    FROM card_app_groups g
    LEFT JOIN card_app_users u ON u.group_id = g.id
    GROUP BY g.id, g.name, g.created_at
    ORDER BY g.name
  `);

  // 각 그룹의 소속 회원 목록
  const members = await queryAll(`
    SELECT id, username, display_name, group_id
    FROM card_app_users
    WHERE group_id IS NOT NULL
    ORDER BY display_name, username
  `);

  const groupMembers: Record<number, any[]> = {};
  for (const m of members) {
    if (!groupMembers[m.group_id]) groupMembers[m.group_id] = [];
    groupMembers[m.group_id].push({ id: m.id, username: m.username, display_name: m.display_name });
  }

  const groupsWithMembers = groups.map((g: any) => ({
    ...g,
    members: groupMembers[g.id] || [],
  }));

  return Response.json({ groups: groupsWithMembers });
}

// 그룹 생성 (super_admin only)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  const { name } = await req.json();
  if (!name?.trim()) {
    return Response.json({ error: '그룹 이름을 입력하세요' }, { status: 400 });
  }

  const existing = await queryOne('SELECT id FROM card_app_groups WHERE name = $1', [name.trim()]);
  if (existing) {
    return Response.json({ error: '이미 존재하는 그룹 이름입니다' }, { status: 409 });
  }

  const result = await queryOne(
    'INSERT INTO card_app_groups (name) VALUES ($1) RETURNING id, name, created_at',
    [name.trim()]
  );

  return Response.json({ group: { ...result, member_count: 0 } });
}

// 그룹 삭제 (super_admin only)
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  const { id } = await req.json();
  if (!id) return Response.json({ error: '그룹 ID가 필요합니다' }, { status: 400 });

  // 소속 회원이 있으면 group_id를 null로 해제
  await query('UPDATE card_app_users SET group_id = NULL WHERE group_id = $1', [id]);
  await query('DELETE FROM card_app_groups WHERE id = $1', [id]);

  return Response.json({ message: '그룹이 삭제되었습니다' });
}
