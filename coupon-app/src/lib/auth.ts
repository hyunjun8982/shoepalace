import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

export interface TokenPayload {
  userId: number;
  username: string;
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
