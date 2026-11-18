// POST /api/sync: the only endpoint. Needs two environment variables on Vercel:
//   DATABASE_URL   your Neon connection string (added automatically by the Vercel ↔ Neon integration)
//   APP_PASSPHRASE the secret you type into Settings › Sync on your phone
import { neon } from '@neondatabase/serverless';
import { passphraseOk, sync, validate, type Query } from './_lib.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

let query: Query | null = null;
function db(): Query {
  if (!query) {
    const sql = neon(process.env.DATABASE_URL!);
    query = (text, params) => sql.query(text, params ?? []) as Promise<Record<string, unknown>[]>;
  }
  return query;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DATABASE_URL || !process.env.APP_PASSPHRASE) {
    return json(503, { error: 'Sync isn’t set up on the server yet: add DATABASE_URL and APP_PASSPHRASE in Vercel, then redeploy.' });
  }
  if (!passphraseOk(request.headers.get('x-passphrase'), process.env.APP_PASSPHRASE)) {
    return json(401, { error: 'Wrong passphrase.' });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const req = validate(body);
  if (typeof req === 'string') return json(400, { error: req });
  try {
    return json(200, await sync(db(), req));
  } catch (e) {
    console.error('sync failed', e);
    return json(500, { error: 'The database didn’t respond. Try again in a moment.' });
  }
}

export function GET(): Response {
  return json(405, { error: 'Use POST.' });
}
