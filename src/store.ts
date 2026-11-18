import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Recipe, type Settings } from './types';

const KEY = 'cauldron-and-quill/v1';

export interface SyncState {
  /** Recipes changed on this phone since the last successful sync */
  dirty: string[];
  /** Recipes deleted on this phone since the last successful sync */
  deleted: { id: string; at: number }[];
  /** Server time of the last successful sync (0 = never) */
  lastSyncAt: number;
}

export interface Data {
  recipes: Recipe[];
  settings: Settings;
  sync: SyncState;
}

const NO_SYNC: SyncState = { dirty: [], deleted: [], lastSyncAt: 0 };

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Data>;
      return {
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        sync: { ...NO_SYNC, ...(parsed.sync || {}) },
      };
    }
  } catch {
    // fall through to a fresh start
  }
  return { recipes: [], settings: { ...DEFAULT_SETTINGS }, sync: { ...NO_SYNC } };
}

let data: Data = load();
const listeners = new Set<() => void>();

export class StorageFullError extends Error {
  constructor() {
    super("Your phone's storage for this app is full. Try removing a few photo thumbnails or export a backup and clear old recipes.");
  }
}

function emit() {
  listeners.forEach((l) => l());
}

/** Notes which recipes were added, edited or deleted so the next sync knows what to send. */
function track(prev: Data, next: Data): Data {
  if (prev.recipes === next.recipes) return next;
  const before = new Map(prev.recipes.map((r) => [r.id, r]));
  const now = Date.now();
  const dirty = new Set(next.sync.dirty);
  const recipes = next.recipes.map((r) => {
    if (before.get(r.id) === r) return r;
    dirty.add(r.id);
    return { ...r, changedAt: now };
  });
  const stillHere = new Set(recipes.map((r) => r.id));
  const deleted = next.sync.deleted.filter((d) => !stillHere.has(d.id));
  for (const id of before.keys()) {
    if (!stillHere.has(id)) {
      dirty.delete(id);
      deleted.push({ id, at: now });
    }
  }
  return { ...next, recipes, sync: { ...next.sync, dirty: [...dirty], deleted } };
}

function save(next: Data): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    if (e instanceof DOMException) throw new StorageFullError();
    throw e;
  }
  data = next;
  emit();
}

/** Applies a change and saves it to local storage. Throws StorageFullError if the browser refuses. */
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

export function storageBytes(): number {
  try {
    return (localStorage.getItem(KEY) || '').length * 2;
  } catch {
    return 0;
  }
}

// Keep tabs in sync if the app is open twice
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    data = load();
    emit();
  }
});

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
