import { useEffect, useState, type ReactNode } from 'react';
import { scaledAmount } from '../parse';
import { estimateInBackground, isPixelThumb } from '../recipes';
import { addEntry, dateKey, findDay, scale, slotForNow } from '../log';
import { deleteRecipe, patchRecipe, useData } from '../store';
import type { Ingredient } from '../types';
import { Icon, Sparkle, go, toast } from '../ui';
import AskAnyAI from './AskAnyAI';
import LogSheet from './LogSheet';
import ThumbSheet from './ThumbSheet';

export default function RecipeView({ id }: { id: string }) {
  const { recipes, settings, days } = useData();
  const r = recipes.find((x) => x.id === id);
  const [serves, setServes] = useState(r?.serves ?? 4);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [thumbOpen, setThumbOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (r) setServes(r.serves);
    setDone({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.serves]);

  if (!r) {
    return (
      <main className="page">
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <p className="muted">This recipe isn't on your shelf any more.</p>
      </main>
    );
  }

  const factor = serves / r.serves;
  const groups: { section: string; items: { ing: Ingredient; i: number }[] }[] = [];
  r.ingredients.forEach((ing, i) => {
    const last = groups[groups.length - 1];
    if (!last || last.section !== ing.section) groups.push({ section: ing.section, items: [{ ing, i }] });
    else last.items.push({ ing, i });
  });
  const ticked = Object.values(done).filter(Boolean).length;

  const remove = () => {
    if (!confirm(`Delete “${r.title}” from your shelf? This can't be undone.`)) return;
    deleteRecipe(r.id);
    go('/');
    toast('Recipe deleted');
  };

  return (
    <main className="page">
      <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" aria-label="Delete recipe" onClick={remove}><Icon name="trash" size={20} stroke={2} /></button>
        <a className="btn btn-dark" href={`#/edit/${r.id}`} style={{ fontSize: 15 }}>
          <Icon name="edit" size={18} stroke={2} /> Edit
        </a>
      </nav>

      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {r.thumb ? (
          <button onClick={() => setThumbOpen(true)} aria-label="Change thumbnail" style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer' }}>
            <img
              className={'thumb' + (isPixelThumb(r.thumb) ? ' pixelated' : '')}
              src={r.thumb}
              alt=""
              style={{ border: '3px solid var(--shadow)', boxShadow: '0 0 0 3px var(--edge), 6px 6px 0 3px var(--shadow)' }}
            />
          </button>
        ) : (
          <button className="checker" onClick={() => setThumbOpen(true)} style={{ aspectRatio: '4 / 3', border: '3px dashed var(--edge)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <img src="/icons/cauldron.png" alt="" width={64} height={64} className="pixelated" />
            <span className="display" style={{ fontSize: 22 }}>Add a thumbnail</span>
          </button>
        )}
        {r.thumb && (
          <figcaption style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, fontSize: 13, fontWeight: 700 }} className="muted">
            <Sparkle size={12} />
            {r.thumbFrom === 'gemini' ? 'Thumbnail conjured with Gemini' : 'Your photo'} · tap to change
          </figcaption>
        )}
      </figure>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="display" style={{ margin: 0, fontSize: 38, lineHeight: 1.05 }}>{r.title}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontSize: 14, fontWeight: 700, color: 'var(--text-soft)' }}>
          {r.timeText && <Meta icon="clock">{r.timeText}</Meta>}
          {r.cuisine && <Meta icon="globe">{r.cuisine}</Meta>}
          <Meta icon="bowl">{r.meal}</Meta>
        </div>
      </div>

      <Nutrition />

      {r.steps.length > 0 && (
        <a className="btn btn-primary btn-lg btn-block" href={`#/cook/${r.id}`}>
          <Icon name="flame" size={20} /> Start cooking
        </a>
      )}

      <AteToday />

      {r.ingredients.length > 0 && (
        <section className="paper" style={{ padding: '18px 18px 8px', display: 'flex', flexDirection: 'column' }}>
          <h2 className="display" style={{ margin: 0, fontSize: 26 }}>Ingredients</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
            <div className="stepper" role="group" aria-label="Servings">
              <button aria-label="Fewer servings" onClick={() => setServes((s) => Math.max(1, s - 1))}><Icon name="minus" size={16} stroke={3} /></button>
              <span aria-live="polite">Serves {serves}</span>
              <button aria-label="More servings" onClick={() => setServes((s) => Math.min(48, s + 1))}><Icon name="plus" size={16} stroke={3} /></button>
            </div>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{ticked} of {r.ingredients.length} gathered</span>
          </div>
          {serves !== r.serves && (
            <span className="muted" style={{ marginTop: 8, fontSize: 13, fontStyle: 'italic' }}>Amounts scaled from {r.serves} servings</span>
          )}
          {groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column' }}>
              {g.section && <span className="label section-label">{g.section}</span>}
              {!g.section && gi === 0 && <span style={{ height: 8 }} />}
              {g.items.map(({ ing, i }) => {
                const amount = scaledAmount(ing, factor);
                return (
                  <label key={i} className={'ing' + (done[i] ? ' done' : '')}>
                    <input type="checkbox" checked={!!done[i]} onChange={() => setDone((d) => ({ ...d, [i]: !d[i] }))} />
                    <span>
                      {amount ? (<><strong style={{ fontWeight: 800 }}>{amount}</strong> {ing.item}</>) : ing.text}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </section>
      )}

      {r.steps.length > 0 && (
        <section className="paper" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 26 }}>Method</h2>
          <ol className="steps">
            {r.steps.map((s, i) => (
              <li key={i}>
                <span className="num">{i + 1}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{s.text}</span>
                  {s.timerSec && (
                    <span className="timer-chip"><Icon name="timer" size={13} stroke={2.6} />{s.timerLabel} timer</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {logOpen && (
        <LogSheet
          heading="Ate this today"
          sub={r.title}
          saveLabel="Add to today"
          initial={{ title: r.title, servings: 1, slot: slotForNow() }}
          current={r.nutrition}
          recipeEstimate={r.nutrition}
          onClose={() => setLogOpen(false)}
          onSave={(v) => {
            try {
              addEntry(dateKey(), { recipeId: r.id, title: r.title, servings: v.servings, slot: v.slot, per: v.edited ? v.per : r.nutrition, edited: v.edited });
              setLogOpen(false);
              const n = v.edited ? v.per : r.nutrition;
              toast(n ? `Added to today · ${Math.round(scale(n, v.servings).kcal)} kcal` : 'Added to today');
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        />
      )}

      {thumbOpen && (
        <ThumbSheet
          recipe={{ id: r.id, title: r.title, ingredientsText: r.ingredientsText, cuisine: r.cuisine }}
          onClose={() => setThumbOpen(false)}
          onPick={(thumb, from) => {
            try {
              patchRecipe(r.id, { thumb, thumbFrom: from, updatedAt: Date.now() });
              setThumbOpen(false);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        />
      )}
    </main>
  );

  function AteToday() {
    if (!r) return null;
    const today = findDay(days, dateKey())?.entries.filter((e) => e.recipeId === r.id) ?? [];
    const had = today.reduce((sum, e) => sum + e.servings, 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-dark btn-block" onClick={() => setLogOpen(true)}>
          <Icon name="log" size={19} stroke={2.2} /> {had ? 'Log another serving' : 'Ate this today'}
        </button>
        {had > 0 && (
          <a href="#/today" className="muted" style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
            Logged today · see the day's totals
          </a>
        )}
      </div>
    );
  }

  function Nutrition() {
    if (!r) return null;
    if (r.nutrition) {
      const n = r.nutrition;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="nutri">
            <div><b>{n.kcal}</b><span>KCAL</span></div>
            <div><b>{n.protein} g</b><span>PROTEIN</span></div>
            <div><b>{n.fiber ?? '–'}{n.fiber !== undefined && ' g'}</b><span>FIBER</span></div>
            <div><b>{n.carbs} g</b><span>CARBS</span></div>
            <div><b>{n.fat} g</b><span>FAT</span></div>
          </div>
          <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Sparkle size={11} /> Per person · estimated by Gemini from your ingredients
          </span>
          {n.fiber === undefined && settings.apiKey && (
            <button className="btn btn-dark" disabled={r.nutritionStatus === 'pending'} onClick={() => void estimateInBackground(r.id)}>
              <Sparkle size={14} /> {r.nutritionStatus === 'pending' ? 'Estimating…' : 'Add fiber estimate'}
            </button>
          )}
        </div>
      );
    }
    if (r.nutritionStatus === 'pending') {
      return (
        <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
          <span className="blink"><Sparkle size={14} /></span> Gemini is estimating calories, protein and fiber…
        </div>
      );
    }
    if (!settings.apiKey) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            <a href="#/settings">Add your Gemini key</a> to estimate calories, protein and fiber automatically.
          </p>
          <AskAnyAI recipe={r} />
        </div>
      );
    }
    const failed = r.nutritionStatus === 'error';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {failed && r.nutritionError && <div className="error-box">{r.nutritionError}</div>}
        <button className="btn btn-dark" onClick={() => void estimateInBackground(r.id)}>
          <Sparkle size={14} /> {failed ? 'Try Gemini again' : 'Estimate calories, protein & fiber'}
        </button>
        {failed && <AskAnyAI recipe={r} />}
      </div>
    );
  }
}

function Meta({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--accent2)', display: 'flex' }}><Icon name={icon} size={16} stroke={2.2} /></span>
      {children}
    </span>
  );
}
