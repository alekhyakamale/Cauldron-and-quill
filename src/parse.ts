import type { Ingredient, Step } from './types';

const FRACTIONS: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Longest first so "tbsp" wins over "tb", "cups" over "cup" etc.
const UNITS = [
  'tablespoons', 'tablespoon', 'teaspoons', 'teaspoon', 'kilograms', 'kilogram', 'milliliters', 'millilitres',
  'milliliter', 'millilitre', 'litres', 'liters', 'litre', 'liter', 'grams', 'gram', 'ounces', 'ounce', 'pounds',
  'pound', 'handfuls', 'handful', 'pinches', 'pinch', 'cloves', 'clove', 'inches', 'inch', 'slices', 'slice',
  'cans', 'can', 'tins', 'tin', 'bunches', 'bunch', 'sprigs', 'sprig', 'pieces', 'piece', 'sticks', 'stick',
  'dashes', 'dash', 'cups', 'cup', 'tbsp', 'tsp', 'kg', 'mg', 'ml', 'cl', 'dl', 'lbs', 'lb', 'oz', 'g', 'l',
];
const UNIT_RE = UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const QTY_RE = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞])`;
const LINE_RE = new RegExp(String.raw`^\s*` + QTY_RE + String.raw`(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:(` + UNIT_RE + String.raw`)\.?(?=\s|$))?\s*(.*)$`, 'i');

export function parseQty(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*([½¼¾⅓⅔⅛⅜⅝⅞])?$/);
  if (m) return Number(m[1]) + (m[2] ? FRACTIONS[m[2]] : 0);
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  return null;
}

export function parseIngredientLine(line: string, section = ''): Ingredient {
  const text = line.trim().replace(/^[-•*]\s*/, '');
  const m = text.match(LINE_RE);
  if (m) {
    const qty = parseQty(m[1]);
    if (qty !== null && qty > 0) {
      return { text, qty, unit: (m[2] || '').toLowerCase(), item: m[3].trim(), section };
    }
  }
  return { text, qty: null, unit: '', item: text, section };
}

/** One ingredient per line. A line ending in ":" (e.g. "For the dip:") starts a section. */
export function parseIngredients(text: string): Ingredient[] {
  let section = '';
  const out: Ingredient[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(':')) {
      section = line.slice(0, -1).trim();
      continue;
    }
    out.push(parseIngredientLine(line, section));
  }
  return out;
}

export function fmtQty(n: number): string {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const rest = n - whole;
  const options: [number, string][] = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  let best = options[0];
  for (const o of options) if (Math.abs(rest - o[0]) < Math.abs(rest - best[0])) best = o;
  const w = best[0] === 1 ? whole + 1 : whole;
  if (w === 0 && !best[1]) return '¼';
  return `${w ? w : ''}${best[1]}`;
}

export function scaledAmount(ing: Ingredient, factor: number): string {
  if (ing.qty === null) return '';
  const q = fmtQty(ing.qty * factor);
  return ing.unit ? `${q} ${ing.unit}` : q;
}

const H = String.raw`(?:hours|hour|hrs|hr|h)`;
const M = String.raw`(?:minutes|minute|mins|min)`;
const S = String.raw`(?:seconds|second|secs|sec)`;

/** Finds the first cooking time mentioned in a step, e.g. "simmer for 20 min" or "1 h 20 min". */
export function findTimer(text: string): { sec: number; label: string } | null {
  let m = text.match(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*` + H + String.raw`\s*(?:and\s*)?(\d+)\s*` + M + String.raw`\b`, 'i'));
  if (m) {
    const sec = Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60);
    return { sec, label: `${m[1]} h ${m[2]} min` };
  }
  m = text.match(new RegExp(String.raw`(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(` + H + '|' + M + '|' + S + String.raw`)\b`, 'i'));
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  const unit = m[3].toLowerCase();
  if (unit.startsWith('h')) return { sec: Math.round(n * 3600), label: `${m[2] ?? m[1]} ${n === 1 ? 'hour' : 'hours'}` };
  if (unit.startsWith('s')) return { sec: Math.round(n), label: `${m[2] ?? m[1]} sec` };
  return { sec: Math.round(n * 60), label: `${m[2] ?? m[1]} min` };
}

export function parseSteps(text: string): Step[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^(?:step\s*)?\d+\s*[.):-]\s*/i, '').trim())
    .filter(Boolean)
    .map((t) => {
      const timer = findTimer(t);
      return { text: t, timerSec: timer ? timer.sec : null, timerLabel: timer ? timer.label : '' };
    });
}

/** "1 h 20 min" → 80, "45 min" → 45, "2 hours" → 120 */
export function parseMinutes(text: string): number | null {
  const t = text.toLowerCase();
  let total = 0;
  let found = false;
  const h = t.match(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*` + H + String.raw`\b`));
  if (h) { total += Number(h[1]) * 60; found = true; }
  const mm = t.match(new RegExp(String.raw`(\d+)\s*` + M + String.raw`\b`));
  if (mm) { total += Number(mm[1]); found = true; }
  if (!found) {
    const bare = t.match(/^\s*(\d+)\s*$/);
    if (bare) return Number(bare[1]);
    return null;
  }
  return Math.round(total);
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x: number) => (x < 10 ? '0' : '') + x;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function lastCookedLabel(ts: number | null, now = Date.now()): string {
  if (!ts) return 'Not cooked yet';
  const d = new Date(ts);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days <= 0) return 'Cooked today';
  if (days === 1) return 'Cooked yesterday';
  if (days < 7) return 'Cooked ' + d.toLocaleDateString(undefined, { weekday: 'long' });
  if (days < 14) return 'Cooked last week';
  if (days < 31) return `Cooked ${Math.floor(days / 7)} weeks ago`;
  if (days < 62) return 'Cooked last month';
  return 'Cooked ' + d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
