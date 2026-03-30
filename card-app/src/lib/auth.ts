import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

export interface TokenPayload {
  userId: number;
  username: string;
  displayName?: string;
  role: string;
  groupId: number | null;
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function getUser(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

export function unauthorized() {
  return Response.json({ error: '인증이 필요합니다' }, { status: 401 });
}

/**
 * 사용자 권한에 따라 접근 가능한 owner_name 목록 반환
 * - super_admin: null (전체 접근)
 * - group_admin: 같은 그룹 사용자들의 owner_name
 * - user: 본인의 owner_name만
 */
export async function getAllowedOwnerNames(user: TokenPayload): Promise<string[] | null> {
  const { queryAll } = await import('@/lib/db');

  if (user.role === 'super_admin') return null; // 전체 접근

  if (user.role === 'group_admin' && user.groupId) {
    // 같은 그룹의 모든 사용자 ID
    const groupUsers = await queryAll(
      'SELECT id FROM card_app_users WHERE group_id = $1', [user.groupId]
    );
    const userIds = groupUsers.map((u: any) => u.id);
    if (userIds.length === 0) return [];

    const placeholders = userIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const accounts = await queryAll(
      `SELECT DISTINCT owner_name FROM codef_accounts WHERE card_app_user_id IN (${placeholders}) AND owner_name IS NOT NULL AND owner_name != ''`,
      userIds
    );
    return accounts.map((a: any) => a.owner_name);
  }

  // 일반 user: 본인 계정만
  const accounts = await queryAll(
    "SELECT DISTINCT owner_name FROM codef_accounts WHERE card_app_user_id = $1 AND owner_name IS NOT NULL AND owner_name != ''",
    [user.userId]
  );
  return accounts.map((a: any) => a.owner_name);
}

/**
 * SQL 쿼리에 owner_name 필터 조건 추가
 */
export function applyOwnerFilter(
  allowedOwners: string[] | null,
  conditions: string[],
  params: any[],
  paramIdx: number,
  ownerColumn = 'owner_name'
): number {
  if (allowedOwners === null) return paramIdx; // super_admin
  if (allowedOwners.length === 0) {
    conditions.push('1 = 0'); // 데이터 없음
    return paramIdx;
  }
  const placeholders = allowedOwners.map(() => `$${paramIdx++}`).join(',');
  conditions.push(`${ownerColumn} IN (${placeholders})`);
  params.push(...allowedOwners);
  return paramIdx;
}
