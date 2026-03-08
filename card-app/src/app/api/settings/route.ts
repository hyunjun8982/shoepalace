import { NextRequest } from 'next/server';
import { queryAll, query } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  const result = await queryAll('SELECT setting_key, setting_value FROM codef_settings ORDER BY setting_key');
  const settings: Record<string, string> = {};
  for (const row of result) {
    settings[row.setting_key] = row.setting_value || '';
  }

  return Response.json(settings);
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user || user.role !== 'super_admin') return unauthorized();

  try {
    const body = await req.json();
    const allowedKeys = ['client_id', 'client_secret', 'public_key', 'use_demo'];

    for (const key of allowedKeys) {
      if (key in body) {
        await query(
          `UPDATE codef_settings SET setting_value = $2, updated_at = NOW() WHERE setting_key = $1`,
          [key, body[key]]
        );
      }
    }

    // API 키 또는 모드 변경 시 기존 connectedId 무효화
    const keyChanged = ['client_id', 'client_secret', 'public_key', 'use_demo'].some(k => k in body);
    if (keyChanged) {
      await query(
        `UPDATE codef_settings SET setting_value = NULL, updated_at = NOW() WHERE setting_key = 'connected_id'`
      );
      // is_connected = false 처리 (connected_id는 유지하여 "재연동 필요" 표시)
      await query(
        `UPDATE codef_accounts SET is_connected = false WHERE is_connected = true`
      );
    }

    return Response.json({ message: '설정이 저장되었습니다. 기존 계정은 재연동이 필요합니다.' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
