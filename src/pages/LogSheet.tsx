import { useState } from 'react';
import { nutritionLine, scale } from '../log';
import { SLOTS, type Nutrition, type Slot } from '../types';
import { Icon, Seg, Sheet, SheetHead } from '../ui';

export interface LogValues {
  title: string;
  servings: number;
  slot: Slot;
  /** Hand-set numbers for one serving, or null to follow the recipe */
  per: Nutrition | null;
  edited: boolean;
}

interface Props {
  heading: string;
  sub?: string;
  saveLabel: string;
  initial: { title: string; servings: number; slot: Slot };
  /** What one serving currently counts as (recipe estimate or hand-set numbers) */
  current: Nutrition | null;
  /** The recipe's own estimate, if this came from a recipe */
  recipeEstimate?: Nutrition | null;
  /** Things typed in by hand: name is editable and numbers are always shown */
  custom?: boolean;
  startEditing?: boolean;
  onSave: (v: LogValues) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const FIELDS = [
  ['kcal', 'Calories', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
] as const;
type Field = (typeof FIELDS)[number][0];

const num = (s: string) => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};
const toText = (n: Nutrition | null): Record<Field, string> => ({
  kcal: n ? String(Math.round(n.kcal)) : '',
  protein: n ? String(Math.round(n.protein * 10) / 10) : '',
  fiber: n?.fiber !== undefined ? String(Math.round(n.fiber * 10) / 10) : '',
  carbs: n ? String(Math.round(n.carbs * 10) / 10) : '',
  fat: n ? String(Math.round(n.fat * 10) / 10) : '',
});

export default function LogSheet(p: Props) {
  const [title, setTitle] = useState(p.initial.title);
  const [servingsText, setServingsText] = useState(String(p.initial.servings));
  const [slot, setSlot] = useState<Slot>(p.initial.slot);
  const [editing, setEditing] = useState(!!p.custom || !!p.startEditing || !p.current);
  const [fields, setFields] = useState(toText(p.current));

  const servings = num(servingsText);
  const step = (d: number) => {
    const next = Math.max(0.5, Math.round(((servings ?? 1) + d) * 2) / 2);
    setServingsText(String(next));
  };

  const typed: Nutrition | null =
    num(fields.kcal) === null
      ? null
      : {
          kcal: num(fields.kcal)!,
          protein: num(fields.protein) ?? 0,
          carbs: num(fields.carbs) ?? 0,
          fat: num(fields.fat) ?? 0,
          ...(num(fields.fiber) !== null ? { fiber: num(fields.fiber)! } : {}),
        };
  const effective = editing ? typed : p.current;
  const canSave = !!servings && servings > 0 && !!title.trim();

  const save = () => {
    if (!canSave) return;
    const handSet = editing && !!typed;
    p.onSave({ title: title.trim(), servings: servings!, slot, per: handSet ? typed : null, edited: handSet });
  };

  return (
    <Sheet label={p.heading} onClose={p.onClose}>
      <SheetHead title={p.heading} sub={p.sub} onClose={p.onClose} />

      {p.custom && (
        <label className="field">
          <span className="label">What was it?</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A banana, chai with milk…" style={{ fontSize: 16 }} autoFocus />
        </label>
      )}

      <div className="field">
        <span className="label">How much</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="stepper" role="group" aria-label="Servings">
            <button type="button" aria-label="Less" onClick={() => step(-0.5)}><Icon name="minus" size={16} stroke={3} /></button>
            <input
              aria-label="Servings eaten"
              inputMode="decimal"
              value={servingsText}
              onChange={(e) => setServingsText(e.target.value)}
              style={{ width: 64, height: 44, border: 0, background: 'transparent', textAlign: 'center', font: 'inherit', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}
            />
            <button type="button" aria-label="More" onClick={() => step(0.5)}><Icon name="plus" size={16} stroke={3} /></button>
          </div>
          <span className="muted" style={{ fontSize: 15, fontWeight: 700 }}>{servings === 1 ? 'serving' : 'servings'}</span>
        </div>
        {!servings && <span style={{ color: 'var(--label)', fontSize: 13, fontWeight: 700 }}>Type a number, like 1 or 1.5</span>}
      </div>

      <div className="field">
        <span className="label">Meal</span>
        <Seg options={SLOTS} value={slot} onChange={setSlot} label="Meal" />
      </div>

      <div className="field">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span className="label">Per serving</span>
          {!p.custom && (
            editing ? (
              p.recipeEstimate && (
                <button type="button" className="link-btn" onClick={() => { setEditing(false); setFields(toText(p.recipeEstimate!)); }}>
                  Use the recipe's estimate
                </button>
              )
            ) : (
              <button type="button" className="link-btn" onClick={() => setEditing(true)}>Adjust numbers</button>
            )
          )}
        </div>
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {FIELDS.map(([k, label, unit]) => (
              <label key={k} className="field" style={{ gap: 4 }}>
                <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>{label} ({unit})</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={fields[k]}
                  onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder="–"
                  style={{ fontSize: 16, padding: '8px 10px' }}
                />
              </label>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 700 }}>{p.current ? nutritionLine(p.current) : 'No estimate yet'}</span>
        )}
      </div>

      <div className="paper-note">
        {effective && servings
          ? <>This adds <b>{nutritionLine(scale(effective, servings))}</b>.</>
          : 'No numbers yet: it will show on the day, but not in the totals until it has an estimate.'}
      </div>

      <button className="btn btn-primary btn-lg btn-block" disabled={!canSave} onClick={save}>
        <Icon name="check" size={20} stroke={3} /> {p.saveLabel}
      </button>
      {p.onDelete && (
        <button className="btn btn-ink btn-block" onClick={p.onDelete}>
          <Icon name="trash" size={18} stroke={2.2} /> Remove from this day
        </button>
      )}
    </Sheet>
  );
}
