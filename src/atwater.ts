// Atwater check: do the stored calories agree with the macros?
// Carbs are total carbs (fiber included). Fiber yields 2–4 kcal/g depending on how it's counted,
// so the expected calories are a range rather than one number.
import type { Nutrition } from './types';

export interface AtwaterResult {
  lo: number;
  hi: number;
  /** Allowed slack either side: 15 kcal or 5%, whichever is larger */
  tolerance: number;
  ok: boolean;
  /** What "Recalculate" sets kcal to: fiber at 2 kcal/g, the standard label convention */
  recalculated: number;
}

export function atwater(n: Nutrition): AtwaterResult {
  const fiber = Math.min(n.fiber ?? 0, n.carbs);
  const hi = n.protein * 4 + n.carbs * 4 + n.fat * 9;
  const lo = n.protein * 4 + Math.max(0, n.carbs - fiber) * 4 + fiber * 2 + n.fat * 9;
  const tolerance = Math.max(15, hi * 0.05);
  const ok = n.kcal >= lo - tolerance && n.kcal <= hi + tolerance;
  return { lo, hi, tolerance, ok, recalculated: Math.round(lo) };
}
