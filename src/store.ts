import { useSyncExternalStore } from 'react';
import { idbGet, idbGetPrefix, idbWrite } from './idb';
import { DEFAULT_SETTINGS, type DayLog, type Recipe, type Settings } from './types';

const KEY = 'cauldron-and-quill/v1';

export interface SyncState {
  /** Recipes and day logs changed on this phone since the last successful sync */
  dirty: string[];
  /** Recipes deleted on this phone since the last successful sync */
  deleted: { id: string; at: number }[];
  /** Server time of the last successful sync (0 = never) */
  lastSyncAt: number;
}

export interface Data {
  recipes: Recipe[];
  /** Food log, one entry per day that has anything logged */
  days: DayLog[];
  settings: Settings;
  sync: SyncState;
}

const NO_SYNC: SyncState = { dirty: [], deleted: [], lastSyncAt: 0 };

const empty = (): Data => ({ recipes: [], days: [], settings: { ...DEFAULT_SETTINGS }, sync: { ...NO_SYNC } });

function normalize(parsed: Partial<Data> | null | undefined): Data {
  if (!parsed || typeof parsed !== 'object') return empty();
  return {
    recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
    days: Array.isArray(parsed.days) ? parsed.days : [],
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    sync: { ...NO_SYNC, ...(parsed.sync || {}) },
  };
}

function readLocalStorage(): Partial<Data> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Data>) : null;
  } catch {
    return null;
  }
}

let data: Data = empty();
const listeners = new Set<() => void>();
/** IndexedDB when it works; localStorage (about 5 MB) only on browsers that refuse it */
let backend: 'idb' | 'local' = 'idb';

// In IndexedDB each recipe is its own entry ("r:<id>"), so saving one recipe writes only that
// recipe. Everything else (settings, food log, sync state, recipe order) is one small "meta" entry.
const META = 'meta';
const rkey = (id: string) => `r:${id}`;
type Meta = Omit<Data, 'recipes'> & { order: string[] };
const metaOf = (d: Data): Meta => ({ days: d.days, settings: d.settings, sync: d.sync, order: d.recipes.map((r) => r.id) });

async function readIdb(): Promise<Data | null> {
  const meta = await idbGet<Meta>(META);
  if (!meta) return null;
  const all = await idbGetPrefix<Recipe>('r:');
  const byId = new Map(all.map((r) => [r.id, r]));
  const ordered = meta.order.map((id) => byId.get(id)).filter((r): r is Recipe => !!r);
  const seen = new Set(meta.order);
  return normalize({ ...meta, recipes: [...ordered, ...all.filter((r) => !seen.has(r.id))] });
}

/** What's known to be on disk, to work out what the next save needs to write */
let saved: Data | null = null;

/**
 * Loads saved data before the first render. The first time it runs after the move to IndexedDB,
 * it copies everything over from localStorage and then frees that space.
 */
export async function initStore(): Promise<void> {
  try {
    const fromIdb = await readIdb();
    if (fromIdb) {
      data = saved = fromIdb;
      return;
    }
    const old = readLocalStorage();
    data = normalize(old);
    if (old) {
      await idbWrite([[META, metaOf(data)], ...data.recipes.map((r): [string, unknown] => [rkey(r.id), r])]);
      saved = data;
      try {
        localStorage.removeItem(KEY);
      } catch {
        // already moved; nothing else to free
      }
    }
  } catch {
    backend = 'local';
    data = normalize(readLocalStorage());
  }
}

/** Only the recipes that changed, plus the small meta entry */
async function writeChanges(next: Data): Promise<void> {
  const before = new Map((saved?.recipes ?? []).map((r) => [r.id, r]));
  const puts: [string, unknown][] = [[META, metaOf(next)]];
  for (const r of next.recipes) {
    if (before.get(r.id) !== r) puts.push([rkey(r.id), r]);
    before.delete(r.id);
  }
  await idbWrite(puts, [...before.keys()].map(rkey));
  saved = next;
}

export class StorageFullError extends Error {
  constructor() {
    super("Couldn't save on this phone: its storage is full. Free some space on the phone, or export a backup.");
  }
}

function emit() {
  listeners.forEach((l) => l());
}

/** Notes which recipes and days were added, edited or deleted so the next sync knows what to send. */
function track(prev: Data, next: Data): Data {
  if (prev.recipes === next.recipes && prev.days === next.days) return next;
  const now = Date.now();
  const dirty = new Set(next.sync.dirty);
  let deleted = next.sync.deleted;
  const mark = <T extends { id: string; changedAt?: number }>(before: T[], after: T[]): T[] => {
    if (before === after) return after;
    const old = new Map(before.map((x) => [x.id, x]));
    const out = after.map((x) => {
      if (old.get(x.id) === x) return x;
      dirty.add(x.id);
      return { ...x, changedAt: now };
    });
    const stillHere = new Set(out.map((x) => x.id));
    deleted = deleted.filter((d) => !stillHere.has(d.id));
    for (const id of old.keys()) {
      if (!stillHere.has(id)) {
        dirty.delete(id);
        deleted = [...deleted, { id, at: now }];
      }
    }
    return out;
  };
  const recipes = mark(prev.recipes, next.recipes);
  const days = mark(prev.days, next.days);
  return { ...next, recipes, days, sync: { ...next.sync, dirty: [...dirty], deleted } };
}

let writing = false;
let queued = false;

/** Writes the latest data in the background, one write at a time, skipping ones already outdated */
async function persist(): Promise<void> {
  if (writing) {
    queued = true;
    return;
  }
  writing = true;
  try {
    do {
      queued = false;
      const snapshot = data;
      if (backend === 'idb') await writeChanges(snapshot);
      else localStorage.setItem(KEY, JSON.stringify(snapshot));
    } while (queued);
    channel?.postMessage('saved');
  } catch (e) {
    console.error('Saving failed', e);
    window.dispatchEvent(new CustomEvent('cq-save-failed', { detail: new StorageFullError().message }));
  } finally {
    writing = false;
  }
}

function save(next: Data): void {
  data = next;
  emit();
  void persist();
}

/** Applies a change and saves it on this phone in the background. If saving fails, a 'cq-save-failed' event fires. */
export function update(fn: (d: Data) => Data): void {
  save(track(data, fn(data)));
}

/** For the sync engine: applies server changes without marking them as local edits. */
export function applyRemote(fn: (d: Data) => Data): void {
  save(fn(data));
}


export function getData(): Data {
  return data;
}

export function useData(): Data {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => data,
  );
}

export function getRecipe(id: string): Recipe | undefined {
  return data.recipes.find((r) => r.id === id);
}

export function upsertRecipe(recipe: Recipe): void {
  update((d) => {
    const exists = d.recipes.some((r) => r.id === recipe.id);
    return {
      ...d,
      recipes: exists ? d.recipes.map((r) => (r.id === recipe.id ? recipe : r)) : [recipe, ...d.recipes],
    };
  });
}

export function patchRecipe(id: string, patch: Partial<Recipe>): void {
  update((d) => ({ ...d, recipes: d.recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

export function deleteRecipe(id: string): void {
  update((d) => ({ ...d, recipes: d.recipes.filter((r) => r.id !== id) }));
}

export function setSettings(patch: Partial<Settings>): void {
  update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function replaceAll(next: Data): void {
  update((d) => ({ ...d, recipes: next.recipes, settings: { ...DEFAULT_SETTINGS, ...next.settings } }));
}

/** Bytes this app is using on the phone, and how much the browser allows */
export async function storageUse(): Promise<{ used: number; quota: number | null }> {
  if (backend === 'local') {
    try {
      return { used: (localStorage.getItem(KEY) || '').length * 2, quota: 5 * 1024 * 1024 };
    } catch {
      return { used: 0, quota: null };
    }
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) return { used: est.usage, quota: est.quota ?? null };
  } catch {
    // fall through to a rough count
  }
  return { used: JSON.stringify(data).length * 2, quota: null };
}

// Keep tabs in sync if the app is open twice
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cauldron-and-quill');
if (channel) {
  channel.onmessage = async () => {
    try {
      const fresh = backend === 'idb' ? await readIdb() : normalize(readLocalStorage());
      if (fresh) {
        data = saved = fresh;
        emit();
      }
    } catch {
      // the other tab's change shows up on next launch
    }
  };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
