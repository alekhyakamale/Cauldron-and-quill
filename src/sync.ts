import { useSyncExternalStore } from 'react';
import { applyRemote, getData, setSettings, subscribe, type Data } from './store';
import type { Recipe } from './types';

interface Change {
  id: string;
  changedAt: number;
  deleted: boolean;
  data: unknown;
}
interface SyncResponse {
  serverTime: number;
  changes: Change[];
}

export type SyncPhase = 'off' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  phase: SyncPhase;
  message: string;
  at: number | null;
}

let status: SyncStatus = { phase: 'off', message: '', at: null };
const statusListeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
}

class SyncError extends Error {}

/** Stays under Vercel's 4.5 MB request limit even with photo thumbnails */
const MAX_BATCH_CHARS = 3_000_000;

const changedAt = (r: Recipe) => r.changedAt ?? r.updatedAt;

async function post(passphrase: string, body: object): Promise<SyncResponse> {
  let res: Response;
  try {
    res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncError("Couldn't reach the server. It will sync when you're back online.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 404) throw new SyncError("The sync server isn't deployed yet. Push the latest code to Vercel.");
    throw new SyncError(json?.error || `Sync failed (${res.status}).`);
  }
  if (!json || !Array.isArray(json.changes)) throw new SyncError('The server sent an unexpected answer.');
  return json as SyncResponse;
}

function batches(recipes: Recipe[]): Recipe[][] {
  const out: Recipe[][] = [];
  let cur: Recipe[] = [];
  let size = 0;
  for (const r of recipes) {
    const n = JSON.stringify(r).length;
    if (cur.length && size + n > MAX_BATCH_CHARS) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Folds the server's changes into this phone's data; the newest edit of each recipe wins. */
function merge(d: Data, changes: Change[], sent: Map<string, number>, sentDeletes: { id: string; at: number }[], serverTime: number): Data {
  const byId = new Map(d.recipes.map((r) => [r.id, r]));
  const dirty = new Set(d.sync.dirty);
  for (const [id, at] of sent) {
    const cur = byId.get(id);
    if (cur && changedAt(cur) === at) dirty.delete(id); // unchanged since we sent it
  }
  const latest = new Map<string, Change>();
  for (const c of changes) latest.set(c.id, c);
  for (const c of latest.values()) {
    if (!c.deleted && sent.get(c.id) === c.changedAt) continue; // our own edit coming back
    const local = byId.get(c.id);
    const localAt = local ? changedAt(local) : -1;
    if (local && localAt > c.changedAt) continue; // our newer edit wins; it stays queued
    if (c.deleted) {
      byId.delete(c.id);
      dirty.delete(c.id);
    } else if (c.data && typeof c.data === 'object') {
      byId.set(c.id, { ...(c.data as Recipe), changedAt: c.changedAt });
      dirty.delete(c.id);
    }
  }
  const deleted = d.sync.deleted.filter((x) => !sentDeletes.some((s) => s.id === x.id && s.at === x.at));
  return { ...d, recipes: [...byId.values()], sync: { dirty: [...dirty], deleted, lastSyncAt: serverTime } };
}

async function run(): Promise<void> {
  const start = getData();
  const pass = start.settings.syncPassphrase;
  if (!pass) {
    setStatus({ phase: 'off', message: '' });
    return;
  }
  setStatus({ phase: 'syncing', message: '' });
  try {
    const since = start.sync.lastSyncAt;
    // First sync from this phone sends everything so both sides end up with the full shelf
    const ids = new Set(since === 0 ? start.recipes.map((r) => r.id) : start.sync.dirty);
    const toSend = start.recipes.filter((r) => ids.has(r.id));
    const deletes = start.sync.deleted;
    const groups = batches(toSend);
    if (!groups.length) groups.push([]);
    let serverTime = since;
    const changes: Change[] = [];
    for (let i = 0; i < groups.length; i++) {
      const res = await post(pass, {
        since,
        upserts: groups[i].map((r) => ({ id: r.id, changedAt: changedAt(r), data: r })),
        deletes: i === 0 ? deletes : [],
      });
      serverTime = Math.max(serverTime, res.serverTime);
      changes.push(...res.changes);
    }
    const sent = new Map(toSend.map((r) => [r.id, changedAt(r)]));
    applyRemote((d) => merge(d, changes, sent, deletes, serverTime));
    setStatus({ phase: 'ok', message: '', at: Date.now() });
  } catch (e) {
    setStatus({ phase: 'error', message: e instanceof SyncError ? e.message : 'Sync failed. It will try again soon.' });
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Runs a sync now (or right after the current one finishes). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

/** Checks the passphrase with the server, then turns sync on and merges both shelves. */
export async function connect(passphrase: string): Promise<void> {
  const pass = passphrase.trim();
  if (!pass) throw new Error('Type your passphrase first.');
  await post(pass, { since: Number.MAX_SAFE_INTEGER }); // asks for nothing, just checks access
  setSettings({ syncPassphrase: pass });
  applyRemote((d) => ({ ...d, sync: { ...d.sync, lastSyncAt: 0 } }));
  await syncNow();
}

export function disconnect(): void {
  setSettings({ syncPassphrase: '' });
  applyRemote((d) => ({ ...d, sync: { dirty: [], deleted: [], lastSyncAt: 0 } }));
  setStatus({ phase: 'off', message: '', at: null });
}

let started = false;
/** Syncs on open, a moment after each edit, when the app comes back to the front, and when the phone gets back online. */
export function startAutoSync(): void {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };
  subscribe(() => {
    const d = getData();
    if (d.settings.syncPassphrase && (d.sync.dirty.length || d.sync.deleted.length)) schedule(2500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getData().settings.syncPassphrase) schedule(300);
  });
  window.addEventListener('online', () => getData().settings.syncPassphrase && schedule(300));
  if (getData().settings.syncPassphrase) schedule(400);
}
