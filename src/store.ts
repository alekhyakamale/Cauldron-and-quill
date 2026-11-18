import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Recipe, type Settings } from './types';

const KEY = 'cauldron-and-quill/v1';

export interface Data {
  recipes: Recipe[];
  settings: Settings;
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Data>;
      return {
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    }
  } catch {
    // fall through to a fresh start
  }
  return { recipes: [], settings: { ...DEFAULT_SETTINGS } };
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

/** Applies a change and saves it to local storage. Throws StorageFullError if the browser refuses. */
export function update(fn: (d: Data) => Data): void {
  const next = fn(data);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    if (e instanceof DOMException) throw new StorageFullError();
    throw e;
  }
  data = next;
  emit();
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
  update(() => ({ recipes: next.recipes, settings: { ...DEFAULT_SETTINGS, ...next.settings } }));
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
