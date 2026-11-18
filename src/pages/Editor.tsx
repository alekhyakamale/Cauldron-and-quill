import { useEffect, useMemo, useState } from 'react';
import { parseIngredients, parseSteps } from '../parse';
import { draftFromRecipe, emptyDraft, estimateInBackground, isPixelThumb, recipeFromDraft, type Draft } from '../recipes';
import { upsertRecipe, useData } from '../store';
import { MEALS, type Meal } from '../types';
import { Icon, Sparkle, go, toast } from '../ui';
import ThumbSheet from './ThumbSheet';

const NEW_KEY = 'cq-draft-new';

export default function Editor({ id }: { id?: string }) {
  const { recipes, settings } = useData();
  const prev = id ? recipes.find((r) => r.id === id) : undefined;
  const [draft, setDraft] = useState<Draft>(() => {
    if (prev) return draftFromRecipe(prev);
    try {
      const saved = sessionStorage.getItem(NEW_KEY);
      if (saved) return { ...emptyDraft(), ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return emptyDraft();
  });
  const [thumbOpen, setThumbOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      try {
        sessionStorage.setItem(NEW_KEY, JSON.stringify(draft));
      } catch {
        // a big photo may not fit in session storage; the draft still lives in memory
      }
    }
  }, [draft, id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ingredients = useMemo(() => parseIngredients(draft.ingredientsText), [draft.ingredientsText]);
  const steps = useMemo(() => parseSteps(draft.methodText), [draft.methodText]);
  const timers = steps.filter((s) => s.timerSec).map((s) => s.timerLabel);
  const scalable = ingredients.filter((i) => i.qty !== null).length;

  if (id && !prev) {
    return (
      <main className="page">
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <p className="muted">This recipe isn't on your shelf any more.</p>
      </main>
    );
  }

  const save = () => {
    if (!draft.title.trim()) {
      setError('Give your recipe a name first.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const recipe = recipeFromDraft(draft, prev);
    try {
      upsertRecipe(recipe);
    } catch (e) {
      toast((e as Error).message);
      return;
    }
    if (!id) sessionStorage.removeItem(NEW_KEY);
    if (settings.apiKey && !recipe.nutrition) void estimateInBackground(recipe.id);
    go(`/r/${recipe.id}`);
  };

  return (
    <main className="page">
      <nav style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
        <a href={id ? `#/r/${id}` : '#/'} className="pixel" style={{ justifySelf: 'start', minHeight: 44, display: 'flex', alignItems: 'center', color: 'var(--text-soft)', textDecoration: 'none', fontSize: 16 }}>
          Cancel
        </a>
        <span className="display" style={{ fontSize: 22 }}>{id ? 'Edit recipe' : 'New recipe'}</span>
        <button className="btn btn-primary" style={{ justifySelf: 'end', fontSize: 16 }} onClick={save}>Save</button>
      </nav>

      {!id && (
        <a href="#/snap" style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 76, padding: '12px 14px', background: 'var(--raised)', border: '2px solid var(--edge)', color: 'var(--text)', textDecoration: 'none' }}>
          <span style={{ flex: 'none', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent2)', color: 'var(--on-accent)' }}>
            <Icon name="camera" size={24} stroke={2.2} />
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>Have it on paper?</span>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.35 }}>Snap the card and Gemini will type it up for you</span>
          </span>
          <span className="muted" style={{ display: 'flex' }}><Icon name="next" size={18} /></span>
        </a>
      )}

      {draft.thumb ? (
        <button onClick={() => setThumbOpen(true)} aria-label="Change thumbnail" style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img className={'thumb' + (isPixelThumb(draft.thumb) ? ' pixelated' : '')} src={draft.thumb} alt="" style={{ border: '3px solid var(--shadow)' }} />
          <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Tap to change the thumbnail</span>
        </button>
      ) : (
        <button className="checker" onClick={() => setThumbOpen(true)} style={{ aspectRatio: '4 / 3', border: '3px dashed var(--edge)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textAlign: 'center' }}>
          <img src="/icons/cauldron.png" alt="" width={72} height={72} className="pixelated" />
          <span className="display" style={{ fontSize: 24 }}>Add a thumbnail</span>
          <span className="muted" style={{ maxWidth: 250, fontSize: 15, lineHeight: 1.4 }}>Upload a picture, or let Gemini conjure one in pixel art</span>
        </button>
      )}

      <form className="paper" onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '20px 18px' }}>
        {error && <div className="error-box" role="alert">{error}</div>}
        <label className="field">
          <span className="label">Recipe name</span>
          <input className="input title" value={draft.title} onChange={(e) => { set('title', e.target.value); setError(''); }} placeholder="What are you cooking?" />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">Time</span>
            <input className="input" value={draft.timeText} onChange={(e) => set('timeText', e.target.value)} placeholder="e.g. 45 min" />
          </label>
          <label className="field">
            <span className="label">Serves</span>
            <input className="input" inputMode="numeric" value={draft.serves} onChange={(e) => set('serves', e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 4" />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">Meal</span>
            <select className="input" value={draft.meal} onChange={(e) => set('meal', e.target.value as Meal)}>
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Cuisine {settings.apiKey && <Sparkle size={10} color="var(--label)" />}</span>
            <input className="input" value={draft.cuisine} onChange={(e) => set('cuisine', e.target.value)} placeholder={settings.apiKey ? 'Gemini can fill this' : 'e.g. Indian'} />
          </label>
        </div>

        <label className="field">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label">Ingredients</span>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>One per line</span>
          </span>
          <textarea className="input" rows={8} value={draft.ingredientsText} onChange={(e) => set('ingredientsText', e.target.value)} placeholder={'12 rice paper wrappers\n100 g rice vermicelli\nFor the dip:\n3 tbsp peanut butter'} />
          <span className="hint" style={{ marginTop: 4 }}>
            <span className="box" style={{ background: 'var(--label)', color: 'var(--on-label)' }}><Icon name="check" size={12} stroke={3.4} /></span>
            {ingredients.length === 0
              ? 'A line ending in “:” starts a section, like “For the dip:”'
              : `${ingredients.length} ${ingredients.length === 1 ? 'ingredient' : 'ingredients'} understood · ${scalable} with amounts that scale`}
          </span>
        </label>

        <label className="field">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label">Method</span>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>One step per line</span>
          </span>
          <textarea className="input" rows={7} value={draft.methodText} onChange={(e) => set('methodText', e.target.value)} placeholder="Boil the noodles for 4 min, then drain." />
          <span className="hint" style={{ marginTop: 4 }}>
            <span className="box" style={{ background: 'var(--accent2)', color: 'var(--on-accent)' }}><Icon name="timer" size={12} stroke={3} /></span>
            {timers.length === 0
              ? 'No timers yet. Mention a time like “5 min” and cook mode adds one'
              : `${timers.length === 1 ? '1 timer' : timers.length + ' timers'} found: ${timers.join(', ')}`}
          </span>
        </label>

        <span className="hint divider" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
          <span style={{ marginTop: 4 }}><Sparkle size={12} color="var(--label)" /></span>
          {settings.apiKey
            ? 'When you save, Gemini estimates calories and protein per serving, so this recipe shows up in your filters.'
            : 'Add your Gemini key in Settings to get calorie and protein estimates for your filters.'}
        </span>
      </form>

      <button className="btn btn-primary btn-lg btn-block" onClick={save}>
        <Icon name="check" size={20} stroke={3} /> Save recipe
      </button>

      {thumbOpen && (
        <ThumbSheet
          recipe={{ id: draft.id, title: draft.title, ingredientsText: draft.ingredientsText, cuisine: draft.cuisine }}
          onClose={() => setThumbOpen(false)}
          onPick={(thumb, from) => {
            setDraft((d) => ({ ...d, thumb, thumbFrom: from }));
            setThumbOpen(false);
          }}
        />
      )}
    </main>
  );
}
