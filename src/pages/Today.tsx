import { useMemo, useState } from 'react';
import {
  addEntry, copyText, copyToClipboard, dateKey, dayLabel, findDay, perServing, removeEntry,
  scale, servingsText, shiftDate, slotForNow, totals, updateEntry,
} from '../log';
import { useData } from '../store';
import { SLOTS, type LogEntry, type Recipe } from '../types';
import { Icon, Sheet, SheetHead, go, toast } from '../ui';
import LogSheet from './LogSheet';

const r0 = (n: number) => Math.round(n);

export default function Today({ date }: { date: string }) {
  const { recipes, days } = useData();
  const day = findDay(days, date);
  const entries = day?.entries ?? [];
  const t = totals(entries, recipes);
  const isToday = date === dateKey();

  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<Recipe | 'custom' | null>(null);

  const copy = async () => {
    const ok = await copyToClipboard(copyText(date, entries, recipes));
    toast(ok ? 'Copied. Paste it into any chat or doc' : "Couldn't copy on this browser");
  };

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <main className="page" style={{ gap: 16 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" aria-label="Previous day" onClick={() => go(`/today/${shiftDate(date, -1)}`)}><Icon name="back" size={18} stroke={2.6} /></button>
        <button className="icon-btn" aria-label="Next day" disabled={isToday} style={isToday ? { opacity: 0.4 } : undefined} onClick={() => go(isToday ? '/today' : `/today/${shiftDate(date, 1)}`)}><Icon name="next" size={18} stroke={2.6} /></button>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="display" style={{ margin: 0, fontSize: 38, lineHeight: 1.05 }}>{dayLabel(date)}</h1>
        <span className="label muted">{dayLabel(date, 'long')}</span>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="nutri">
          <div><b>{r0(t.kcal).toLocaleString('en-IN')}</b><span>KCAL</span></div>
          <div><b>{r0(t.protein)} g</b><span>PROTEIN</span></div>
          <div><b>{r0(t.fiber)} g</b><span>FIBER</span></div>
          <div><b>{r0(t.carbs)} g</b><span>CARBS</span></div>
          <div><b>{r0(t.fat)} g</b><span>FAT</span></div>
        </div>
        {t.missing > 0 && (
          <span className="muted" style={{ fontSize: 13 }}>
            {t.missing} {t.missing === 1 ? 'item has' : 'items have'} no estimate yet, so {t.missing === 1 ? "it isn't" : "they aren't"} counted. Tap to add numbers.
          </span>
        )}
      </section>

      {entries.length === 0 ? (
        <section className="paper" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Nothing logged{isToday ? ' yet' : ''}</h2>
          <span className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            Open a recipe and tap <b>Ate this today</b>, or add something below.
          </span>
        </section>
      ) : (
        SLOTS.map((slot) => {
          const list = entries.filter((e) => e.slot === slot);
          if (!list.length) return null;
          const st = totals(list, recipes);
          return (
            <section key={slot} className="paper" style={{ padding: '14px 16px 6px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{slot}</h2>
                <span className="muted" style={{ fontSize: 14, fontWeight: 800 }}>{r0(st.kcal)} kcal</span>
              </div>
              {list.map((e) => <Row key={e.id} e={e} recipes={recipes} date={date} onEdit={() => setEditing(e)} />)}
            </section>
          );
        })
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <button className="btn btn-dark" onClick={() => setPicking(true)} disabled={!recipes.length}><Icon name="plus" size={18} stroke={2.6} /> Add a recipe</button>
        <button className="btn btn-dark" onClick={() => setAdding('custom')}><Icon name="plus" size={18} stroke={2.6} /> Something else</button>
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={!entries.length} onClick={() => void copy()}>
        <Icon name="copy" size={20} stroke={2.4} /> Copy for AI or notes
      </button>
      {entries.length > 0 && <Preview text={copyText(date, entries, recipes)} />}

      {editing && (() => {
        const recipe = editing.recipeId ? recipes.find((r) => r.id === editing.recipeId) : undefined;
        return (
          <LogSheet
            heading={editing.title}
            sub={editing.recipeId && !recipe ? 'This recipe is no longer on your shelf' : undefined}
            saveLabel="Save"
            initial={editing}
            current={perServing(editing, recipes)}
            recipeEstimate={recipe?.nutrition ?? null}
            custom={!editing.recipeId}
            startEditing={editing.edited}
            onClose={() => setEditing(null)}
            onDelete={() => safe(() => { removeEntry(date, editing.id); setEditing(null); toast('Removed'); })}
            onSave={(v) => safe(() => {
              // Untouched recipe items keep following the recipe; a recipe gone from the shelf keeps its last numbers
              const per = v.edited ? v.per : recipe ? (editing.edited ? null : editing.per) : perServing(editing, recipes);
              updateEntry(date, editing.id, { title: v.title, servings: v.servings, slot: v.slot, per, edited: v.edited });
              setEditing(null);
            })}
          />
        );
      })()}

      {picking && (
        <RecipePicker recipes={recipes} onClose={() => setPicking(false)} onPick={(r) => { setPicking(false); setAdding(r); }} />
      )}

      {adding && (
        <LogSheet
          heading={adding === 'custom' ? 'Add something else' : adding.title}
          sub={isToday ? undefined : `For ${dayLabel(date)}`}
          saveLabel={`Add to ${isToday ? 'today' : dayLabel(date)}`}
          initial={{ title: adding === 'custom' ? '' : adding.title, servings: 1, slot: slotForNow() }}
          current={adding === 'custom' ? null : adding.nutrition}
          recipeEstimate={adding === 'custom' ? null : adding.nutrition}
          custom={adding === 'custom'}
          onClose={() => setAdding(null)}
          onSave={(v) => safe(() => {
            const fromRecipe = adding !== 'custom';
            addEntry(date, {
              recipeId: fromRecipe ? adding.id : null,
              title: v.title,
              servings: v.servings,
              slot: v.slot,
              per: v.edited ? v.per : fromRecipe ? adding.nutrition : null,
              edited: v.edited,
            });
            setAdding(null);
            toast(`Added ${v.title}`);
          })}
        />
      )}
    </main>
  );
}

function Row({ e, recipes, date, onEdit }: { e: LogEntry; recipes: Recipe[]; date: string; onEdit: () => void }) {
  const n = perServing(e, recipes);
  const s = n ? scale(n, e.servings) : null;
  const bump = (d: number) => {
    try {
      updateEntry(date, e.id, { servings: Math.max(0.5, Math.round((e.servings + d) * 2) / 2) });
    } catch (err) {
      toast((err as Error).message);
    }
  };
  return (
    <div className="log-row">
      <button className="log-main" onClick={onEdit}>
        <span style={{ fontWeight: 800, fontSize: 17 }}>{e.title}</span>
        <span className="muted log-meta">
          {[
            servingsText(e.servings),
            ...(s ? [`${r0(s.kcal)} kcal`, `${r0(s.protein)} g protein`, `${s.fiber === undefined ? '?' : r0(s.fiber)} g fiber`] : ['no estimate yet']),
            ...(e.edited && e.recipeId ? ['adjusted'] : []),
          ].map((t, i) => <span key={i}>{i > 0 && '· '}{t}</span>)}
        </span>
      </button>
      <div className="stepper small" role="group" aria-label={`Servings of ${e.title}`}>
        <button aria-label="Less" disabled={e.servings <= 0.5} onClick={() => bump(-0.5)}><Icon name="minus" size={14} stroke={3} /></button>
        <button aria-label="More" onClick={() => bump(0.5)}><Icon name="plus" size={14} stroke={3} /></button>
      </div>
    </div>
  );
}

function RecipePicker({ recipes, onPick, onClose }: { recipes: Recipe[]; onPick: (r: Recipe) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sorted = [...recipes].sort((a, b) => (b.lastCooked ?? 0) - (a.lastCooked ?? 0) || a.title.localeCompare(b.title));
    return s ? sorted.filter((r) => r.title.toLowerCase().includes(s)) : sorted;
  }, [recipes, q]);
  return (
    <Sheet label="Pick a recipe" onClose={onClose}>
      <SheetHead title="Pick a recipe" onClose={onClose} />
      <input className="input" type="search" placeholder="Search your shelf" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {list.map((r) => (
          <button key={r.id} className="log-main pick" onClick={() => onPick(r)}>
            <span style={{ fontWeight: 800, fontSize: 17 }}>{r.title}</span>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
              {r.nutrition ? `${r.nutrition.kcal} kcal · P ${r.nutrition.protein} g per serving` : 'no estimate yet'}
            </span>
          </button>
        ))}
        {!list.length && <span className="muted" style={{ padding: '12px 0' }}>No recipe matches “{q}”.</span>}
      </div>
    </Sheet>
  );
}

function Preview({ text }: { text: string }) {
  return (
    <details className="paper" style={{ padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 800 }}>See what gets copied</summary>
      <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0 0', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}>{text}</pre>
    </details>
  );
}
