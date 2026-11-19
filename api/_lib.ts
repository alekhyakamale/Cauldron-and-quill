// Sync logic, kept apart from the HTTP handler so it can be tested against a local Postgres.
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
import { createHash, timingSafeEqual } from 'node:crypto';

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RecipeIn {
  id: string;
  changedAt: number;
  data: unknown;
}
export interface DeleteIn {
  id: string;
  at: number;
}
export interface SyncRequest {
  since: number;
  /** Newer apps also sync food logs (ids starting "day:"); older ones don't know about them */
  withDays?: boolean;
  upserts?: RecipeIn[];
  deletes?: DeleteIn[];
}
export interface Change {
  id: string;
  changedAt: number;
  deleted: boolean;
  data: unknown;
}
export interface SyncResponse {
  serverTime: number;
  changes: Change[];
}

const OVERLAP_MS = 5000;
let ready: Promise<void> | null = null;

/** Creates the table on first use, so there's no separate migration step. */
export function ensureSchema(query: Query): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`create table if not exists recipes (
        id text primary key,
        data jsonb,
        changed_at bigint not null,
        deleted boolean not null default false,
        synced_at bigint not null
      )`);
      await query('create index if not exists recipes_synced_at on recipes (synced_at)');
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Constant-time comparison so the passphrase can't be guessed character by character. */
export function passphraseOk(given: string | null, expected: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function validate(body: unknown): SyncRequest | string {
  if (!body || typeof body !== 'object') return 'Body must be JSON.';
  const b = body as Record<string, unknown>;
  const since = Number(b.since ?? 0);
  if (!Number.isFinite(since) || since < 0) return 'Invalid "since".';
  const upserts = Array.isArray(b.upserts) ? b.upserts : [];
  const deletes = Array.isArray(b.deletes) ? b.deletes : [];
  for (const u of upserts) {
    if (!u || typeof u.id !== 'string' || !u.id || !Number.isFinite(Number(u.changedAt)) || typeof u.data !== 'object') return 'Invalid recipe in upserts.';
  }
  for (const d of deletes) {
    if (!d || typeof d.id !== 'string' || !d.id || !Number.isFinite(Number(d.at))) return 'Invalid entry in deletes.';
  }
  return {
    since,
    withDays: b.withDays === true,
    upserts: upserts.map((u) => ({ id: u.id, changedAt: Math.round(Number(u.changedAt)), data: u.data })),
    deletes: deletes.map((d) => ({ id: d.id, at: Math.round(Number(d.at)) })),
  };
}

/**
 * One round trip: store this phone's changes (newest edit wins per recipe),
 * then return everything other devices changed since this phone last synced.
 */
export async function sync(query: Query, req: SyncRequest, now = Date.now()): Promise<SyncResponse> {
  await ensureSchema(query);
  const accepted = new Set<string>();

  if (req.upserts?.length) {
    const rows = await query(
      `insert into recipes (id, data, changed_at, deleted, synced_at)
       select x.id, x.data, x.changed_at, false, $2
       from jsonb_to_recordset($1::jsonb) as x(id text, data jsonb, changed_at bigint)
       on conflict (id) do update
         set data = excluded.data, changed_at = excluded.changed_at, deleted = false, synced_at = excluded.synced_at
         where recipes.changed_at <= excluded.changed_at
       returning id`,
      [JSON.stringify(req.upserts.map((u) => ({ id: u.id, data: u.data, changed_at: u.changedAt }))), now],
    );
    rows.forEach((r) => accepted.add(String(r.id)));
  }

  if (req.deletes?.length) {
    const rows = await query(
      `insert into recipes (id, data, changed_at, deleted, synced_at)
       select x.id, null, x.at, true, $2
       from jsonb_to_recordset($1::jsonb) as x(id text, at bigint)
       on conflict (id) do update
         set data = null, changed_at = excluded.changed_at, deleted = true, synced_at = excluded.synced_at
         where recipes.changed_at <= excluded.changed_at
       returning id`,
      [JSON.stringify(req.deletes), now],
    );
    rows.forEach((r) => accepted.add(String(r.id)));
  }

  // Everything changed since last time, minus what this phone just sent (it already has those).
  // The 5 s overlap covers writes landing in the same millisecond or from a server whose clock is
  // slightly behind; repeats are harmless because the phone only applies changes newer than its own.
  const rows = await query(
    `select id, data, changed_at, deleted from recipes
     where synced_at > $1 and ($2::boolean or id not like 'day:%')
     order by synced_at`,
    [Math.max(0, req.since - OVERLAP_MS), req.withDays === true],
  );
  const changes = rows
    .filter((r) => !accepted.has(String(r.id)))
    .map((r) => ({
      id: String(r.id),
      changedAt: Number(r.changed_at),
      deleted: Boolean(r.deleted),
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    }));
  return { serverTime: now, changes };
}
