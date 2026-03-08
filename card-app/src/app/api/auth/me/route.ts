import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return Response.json(user);
}
