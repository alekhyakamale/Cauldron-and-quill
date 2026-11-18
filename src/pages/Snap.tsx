import { useRef, useState } from 'react';
import { GeminiError, readRecipeCard, type CardReading } from '../gemini';
import { fmtQty } from '../parse';
import { fileToDataUrl, prepareForUpload } from '../pixel';
import { recipeFromDraft } from '../recipes';
import { upsertRecipe, useData } from '../store';
import { MEALS, type Meal } from '../types';
import { Icon, Sparkle, go, toast } from '../ui';

interface Row {
  amount: string;
  item: string;
  section: string;
  uncertain: boolean;
  note: string;
}

type Phase = 'start' | 'reading' | 'review' | 'error';

function rowsFrom(reading: CardReading): Row[] {
  return reading.ingredients.map((i) => ({
    amount: i.qty === null || i.qty === undefined ? '' : `${fmtQty(Number(i.qty))}${i.unit ? ' ' + i.unit : ''}`,
    item: i.item,
    section: i.section,
    uncertain: i.uncertain,
    note: i.note,
  }));
}

export default function Snap() {
  const { settings } = useData();
  const [phase, setPhase] = useState<Phase>('start');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState<CardReading | null>(null);
  const [title, setTitle] = useState('');
  const [timeText, setTimeText] = useState('');
  const [serves, setServes] = useState('');
  const [meal, setMeal] = useState<Meal>('Mains');
  const [cuisine, setCuisine] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    let src: string;
    try {
      src = await prepareForUpload(await fileToDataUrl(file));
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
      return;
    }
    setPhoto(src);
    setPhase('reading');
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const r = await readRecipeCard(settings, src, ctrl.signal);
      setReading(r);
      setTitle(r.title);
      setTimeText(r.timeText);
      setServes(String(r.serves));
      setMeal(r.meal);
      setCuisine(r.cuisine);
      setRows(rowsFrom(r));
      setSteps(r.steps);
      setPhase('review');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof GeminiError ? e.message : (e as Error).message || 'Something went wrong.');
      setPhase('error');
    }
  };

  const unsure = rows.filter((r) => r.uncertain).length;

  const save = () => {
    if (!title.trim()) {
      toast('Give the recipe a name first');
      return;
    }
    let section = '';
    const lines: string[] = [];
    for (const r of rows) {
      if (!r.item.trim() && !r.amount.trim()) continue;
      if (r.section !== section) {
        section = r.section;
        if (section) lines.push(`${section.replace(/:$/, '')}:`);
      }
      lines.push(`${r.amount.trim()} ${r.item.trim()}`.trim());
    }
    const recipe = recipeFromDraft(
      {
        title, timeText, serves: serves || '2', meal, cuisine,
        ingredientsText: lines.join('\n'),
        methodText: steps.map((s) => s.trim()).filter(Boolean).join('\n'),
        thumb: null, thumbFrom: null,
      },
      undefined,
      reading?.nutrition
        ? {
            kcal: Math.round(Number(reading.nutrition.kcal) / 5) * 5,
            protein: Math.round(Number(reading.nutrition.protein)),
            carbs: Math.round(Number(reading.nutrition.carbs)),
            fat: Math.round(Number(reading.nutrition.fat)),
            fiber: Math.round(Number(reading.nutrition.fiber) * 2) / 2,
          }
        : null,
    );
    try {
      upsertRecipe(recipe);
      toast('Saved to your shelf');
      go(`/r/${recipe.id}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const pickers = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libraryRef} type="file" accept="image/*" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );

  if (phase === 'review') {
    return (
      <main className="page">
        <nav style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" aria-label="Retake photo" onClick={() => setPhase('start')}><Icon name="back" size={22} /></button>
          <span className="display" style={{ textAlign: 'center', fontSize: 22 }}>Check the recipe</span>
          <span />
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {photo && <img src={photo} alt="Your photo" style={{ width: 76, height: 76, objectFit: 'cover', transform: 'rotate(-4deg)', boxShadow: '4px 5px 0 rgba(0,0,0,0.4)', flex: 'none' }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="display" style={{ fontSize: 22, lineHeight: 1.15 }}>Gemini read your card</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: 'var(--accent2)' }}>
              <Icon name={unsure ? 'warn' : 'check'} size={16} stroke={2.6} />
              {unsure ? `${unsure} ${unsure === 1 ? 'line needs' : 'lines need'} a quick check` : 'Everything looks clear'}
            </span>
          </div>
        </div>

        <section className="paper" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 18px' }}>
          <label className="field">
            <span className="label">Recipe name</span>
            <input className="input title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field"><span className="label">Time</span><input className="input" value={timeText} onChange={(e) => setTimeText(e.target.value)} /></label>
            <label className="field"><span className="label">Serves</span><input className="input" inputMode="numeric" value={serves} onChange={(e) => setServes(e.target.value.replace(/[^\d]/g, ''))} /></label>
            <label className="field">
              <span className="label">Meal</span>
              <select className="input" value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="field"><span className="label">Cuisine</span><input className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)} /></label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="label">Ingredients</span>
              <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Split so amounts can scale</span>
            </span>
            {rows.map((r, i) => {
              const showSection = r.section && (i === 0 || rows[i - 1].section !== r.section);
              const editRow = (patch: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const inputs = (
                <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 8 }}>
                  <input className="input" aria-label={`Amount for ${r.item}`} value={r.amount} placeholder="—" onChange={(e) => editRow({ amount: e.target.value })} style={{ fontWeight: 800, fontSize: 16, minHeight: 44 }} />
                  <input className="input" aria-label="Ingredient" value={r.item} onChange={(e) => editRow({ item: e.target.value })} style={{ fontSize: 16, minHeight: 44 }} />
                </div>
              );
              return (
                <div key={i}>
                  {showSection && <span className="label section-label" style={{ display: 'block', margin: '8px 0 6px' }}>{r.section}</span>}
                  {r.uncertain ? (
                    <div className="flag">
                      {inputs}
                      <span className="flag-note"><span style={{ flex: 'none', marginTop: 1, display: 'flex' }}><Icon name="warn" size={16} stroke={2.6} /></span>{r.note || "This line was hard to read."}</span>
                      <button className="btn btn-ink" onClick={() => editRow({ uncertain: false })}><Icon name="check" size={16} stroke={3} /> Looks right</button>
                    </div>
                  ) : inputs}
                </div>
              );
            })}
            <button className="btn btn-ink" onClick={() => setRows((rs) => [...rs, { amount: '', item: '', section: rs[rs.length - 1]?.section || '', uncertain: false, note: '' }])}>
              <Icon name="plus" size={16} stroke={3} /> Add an ingredient
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="label">Method</span>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className="num" style={{ marginTop: 8 }}>{i + 1}</span>
                <textarea className="input" rows={2} aria-label={`Step ${i + 1}`} value={s} onChange={(e) => setSteps((ss) => ss.map((x, j) => (j === i ? e.target.value : x)))} style={{ fontSize: 16 }} />
              </div>
            ))}
            <button className="btn btn-ink" onClick={() => setSteps((ss) => [...ss, ''])}><Icon name="plus" size={16} stroke={3} /> Add a step</button>
          </div>

          {reading?.nutrition && (
            <span className="hint divider" style={{ fontSize: 14, fontWeight: 600 }}>
              <span style={{ marginTop: 4 }}><Sparkle size={12} color="var(--label)" /></span>
              About {Math.round(reading.nutrition.kcal / 5) * 5} kcal, {Math.round(reading.nutrition.protein)} g protein and {Math.round(Number(reading.nutrition.fiber) * 2) / 2} g fiber per serving (estimated).
            </span>
          )}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 12 }}>
          <button className="btn btn-dark btn-lg" onClick={() => setPhase('start')}>Retake</button>
          <button className="btn btn-primary btn-lg" onClick={save}><Icon name="check" size={18} stroke={3} /> Save recipe</button>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ minHeight: '100dvh', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
      {pickers}
      <nav style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', gap: 12 }}>
        <a className="icon-btn" href="#/" aria-label="Close"><Icon name="close" size={18} stroke={2.6} /></a>
        <span style={{ textAlign: 'center', fontSize: 16, fontWeight: 800 }}>Snap a recipe card</span>
        <span />
      </nav>

      {phase === 'reading' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
          {photo && <img src={photo} alt="Your photo" style={{ maxWidth: '78%', maxHeight: '38dvh', objectFit: 'contain', transform: 'rotate(-3deg)', boxShadow: '6px 10px 0 rgba(0,0,0,0.35)' }} />}
          <img src="/icons/cauldron.png" alt="" width={88} height={88} className="pixelated bob" />
          <span className="display" style={{ fontSize: 22 }}>Gemini is reading your card…</span>
          <button className="btn btn-dark" onClick={() => { abort.current?.abort(); setPhase('start'); }}>Cancel</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <div className="checker" style={{ position: 'relative', aspectRatio: '3 / 4', maxHeight: '46dvh', margin: '0 auto', width: '100%', maxWidth: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--edge)' }}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span key={c} aria-hidden="true" style={{
                position: 'absolute', width: 30, height: 30,
                top: c[0] === 't' ? 14 : undefined, bottom: c[0] === 'b' ? 14 : undefined,
                left: c[1] === 'l' ? 14 : undefined, right: c[1] === 'r' ? 14 : undefined,
                borderTop: c[0] === 't' ? '5px solid var(--accent2)' : undefined, borderBottom: c[0] === 'b' ? '5px solid var(--accent2)' : undefined,
                borderLeft: c[1] === 'l' ? '5px solid var(--accent2)' : undefined, borderRight: c[1] === 'r' ? '5px solid var(--accent2)' : undefined,
              }} />
            ))}
            <span className="muted" style={{ maxWidth: 220, textAlign: 'center', fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>
              A handwritten card, a cookbook page or a screenshot all work. Fit the whole recipe in the shot.
            </span>
          </div>
          {phase === 'error' && <div className="error-box" role="alert">{error}</div>}
          {!settings.apiKey ? (
            <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: 15 }}>
              Gemini reads the card for you. <a href="#/settings">Add your API key in Settings</a> first.
            </p>
          ) : (
            <>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => cameraRef.current?.click()}>
                <Icon name="camera" size={22} stroke={2.2} /> Take a photo
              </button>
              <button className="btn btn-dark btn-lg btn-block" onClick={() => libraryRef.current?.click()}>
                <Icon name="photos" size={22} stroke={2.2} /> Choose from photos
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
