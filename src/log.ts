// Food log: what was eaten on each day, totals, and a copyable summary.
import { update } from './store';
import type { DayLog, LogEntry, Nutrition, Recipe, Slot } from './types';
import { SLOTS } from './types';

/** Local calendar date as YYYY-MM-DD */
export function dateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDate(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

export function isDateKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function dayLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const today = dateKey();
  if (style === 'short') {
    if (key === today) return 'Today';
    if (key === shiftDate(today, -1)) return 'Yesterday';
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    ...(style === 'long' || y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Breakfast before 11, lunch until 4, snack until 7, then dinner */
export function slotForNow(d = new Date()): Slot {
  const h = d.getHours();
  return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 19 ? 'Snack' : 'Dinner';
}

export const dayId = (key: string) => `day:${key}`;

export function findDay(days: DayLog[], key: string): DayLog | undefined {
  return days.find((d) => d.id === dayId(key));
}

function changeDay(key: string, fn: (entries: LogEntry[]) => LogEntry[]): void {
  update((d) => {
    const id = dayId(key);
    const cur = d.days.find((x) => x.id === id);
    const entries = fn(cur?.entries ?? []);
    const day: DayLog = { id, date: key, entries };
    return { ...d, days: cur ? d.days.map((x) => (x.id === id ? day : x)) : [...d.days, day] };
  });
}

export function addEntry(key: string, e: Omit<LogEntry, 'id' | 'at'>): void {
  const entry: LogEntry = { ...e, id: crypto.randomUUID(), at: Date.now() };
  changeDay(key, (list) => [...list, entry]);
}

export function updateEntry(key: string, id: string, patch: Partial<LogEntry>): void {
  changeDay(key, (list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function removeEntry(key: string, id: string): void {
  changeDay(key, (list) => list.filter((e) => e.id !== id));
}

/** Nutrition for one serving: hand-set numbers, else the recipe's current estimate */
export function perServing(e: LogEntry, recipes: Recipe[]): Nutrition | null {
  if (e.per) return e.per;
  if (!e.recipeId) return null;
  return recipes.find((r) => r.id === e.recipeId)?.nutrition ?? null;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** Items with no estimate, left out of the totals */
  missing: number;
}

export function scale(n: Nutrition, servings: number): Nutrition {
  return {
    kcal: n.kcal * servings,
    protein: n.protein * servings,
    carbs: n.carbs * servings,
    fat: n.fat * servings,
    fiber: n.fiber === undefined ? undefined : n.fiber * servings,
  };
}

export function totals(entries: LogEntry[], recipes: Recipe[]): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, missing: 0 };
  for (const e of entries) {
    const n = perServing(e, recipes);
    if (!n) {
      t.missing++;
      continue;
    }
    const s = scale(n, e.servings);
    t.kcal += s.kcal;
    t.protein += s.protein;
    t.carbs += s.carbs;
    t.fat += s.fat;
    t.fiber += s.fiber ?? 0;
  }
  return t;
}

/** 1 → "1", 0.5 → "½", 1.5 → "1½", 1.25 → "1.25" */
export function fmtServings(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  if (frac === 0) return String(whole);
  if (frac === 0.5) return whole ? `${whole}½` : '½';
  return String(Math.round(n * 100) / 100);
}

export const servingsText = (n: number) => `${fmtServings(n)} ${n === 1 ? 'serving' : 'servings'}`;

const g = (n: number) => `${Math.round(n)} g`;
const kcal = (n: number) => `${Math.round(n).toLocaleString('en-IN')} kcal`;

export function nutritionLine(n: Nutrition): string {
  return [kcal(n.kcal), `protein ${g(n.protein)}`, `carbs ${g(n.carbs)}`, `fat ${g(n.fat)}`, `fiber ${n.fiber === undefined ? '?' : g(n.fiber)}`].join(', ');
}

/** Plain text that reads well pasted into an AI chat, Notion or a notes app */
export function copyText(key: string, entries: LogEntry[], recipes: Recipe[]): string {
  const lines = [`Meals for ${dayLabel(key, 'long')}`];
  for (const slot of SLOTS) {
    const list = entries.filter((e) => e.slot === slot);
    if (!list.length) continue;
    lines.push('', slot);
    for (const e of list) {
      const n = perServing(e, recipes);
      lines.push(`- ${e.title} (${servingsText(e.servings)}): ${n ? nutritionLine(scale(n, e.servings)) : 'no estimate yet'}`);
    }
  }
  const t = totals(entries, recipes);
  lines.push('', `Total: ${kcal(t.kcal)} | Protein: ${g(t.protein)} | Carbs: ${g(t.carbs)} | Fat: ${g(t.fat)} | Fiber: ${g(t.fiber)}`);
  if (t.missing) lines.push(`(${t.missing} ${t.missing === 1 ? 'item has' : 'items have'} no estimate and ${t.missing === 1 ? 'is' : 'are'} left out of the total.)`);
  lines.push('Nutrition values are estimates.');
  return lines.join('\n');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
