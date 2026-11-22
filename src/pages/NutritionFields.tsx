import type { Nutrition } from '../types';
import AtwaterBadge from './AtwaterBadge';

export const FIELDS = [
  ['kcal', 'Calories', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
] as const;
export type Field = (typeof FIELDS)[number][0];
export type NutritionText = Record<Field, string>;

export const num = (s: string) => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

const r1 = (n: number) => String(Math.round(n * 10) / 10);

export function toText(n: Nutrition | null | undefined): NutritionText {
  return {
    kcal: n ? String(Math.round(n.kcal)) : '',
    protein: n ? r1(n.protein) : '',
    fiber: n?.fiber !== undefined ? r1(n.fiber) : '',
    carbs: n ? r1(n.carbs) : '',
    fat: n ? r1(n.fat) : '',
  };
}

/** Typed numbers as nutrition; null until calories are filled in. Blank macros count as 0. */
export function fromText(f: NutritionText): Nutrition | null {
  const kcal = num(f.kcal);
  if (kcal === null) return null;
  const fiber = num(f.fiber);
  return {
    kcal,
    protein: num(f.protein) ?? 0,
    carbs: num(f.carbs) ?? 0,
    fat: num(f.fat) ?? 0,
    ...(fiber !== null ? { fiber } : {}),
  };
}

export const isBlank = (f: NutritionText) => Object.values(f).every((v) => !v.trim());

/** Five number boxes plus the calories-vs-macros check */
export default function NutritionFields({ value, onChange }: { value: NutritionText; onChange: (v: NutritionText) => void }) {
  const typed = fromText(value);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {FIELDS.map(([k, label, unit]) => (
          <label key={k} className="field" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>{label} ({unit})</span>
            <input
              className="input"
              inputMode="decimal"
              value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              placeholder="–"
              style={{ fontSize: 16, padding: '8px 10px' }}
            />
          </label>
        ))}
      </div>
      {typed && <AtwaterBadge n={typed} onRecalc={(kcal) => onChange({ ...value, kcal: String(kcal) })} />}
    </>
  );
}
