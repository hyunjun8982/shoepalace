import { NextRequest } from 'next/server';
import { queryAll } from '@/lib/db';
import { getUser, unauthorized, getAllowedOwnerNames } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const allowedOwners = await getAllowedOwnerNames(user);

  let orgs, owners;
  if (allowedOwners === null) {
    // super_admin: 전체
    orgs = await queryAll("SELECT DISTINCT organization FROM card_transactions ORDER BY organization");
    owners = await queryAll("SELECT DISTINCT owner_name FROM card_transactions WHERE owner_name IS NOT NULL AND owner_name != '' ORDER BY owner_name");
  } else if (allowedOwners.length === 0) {
    return Response.json({ organizations: [], owners: [] });
  } else {
    const placeholders = allowedOwners.map((_, i) => `$${i + 1}`).join(',');
    orgs = await queryAll(`SELECT DISTINCT organization FROM card_transactions WHERE owner_name IN (${placeholders}) ORDER BY organization`, allowedOwners);
    owners = await queryAll(`SELECT DISTINCT owner_name FROM card_transactions WHERE owner_name IN (${placeholders}) AND owner_name IS NOT NULL AND owner_name != '' ORDER BY owner_name`, allowedOwners);
  }

  return Response.json({
    organizations: orgs.map((r: any) => r.organization),
    owners: owners.map((r: any) => r.owner_name),
  });
}
