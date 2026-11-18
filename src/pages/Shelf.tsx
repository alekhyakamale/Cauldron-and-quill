import { useEffect, useMemo, useState } from 'react';
import { lastCookedLabel } from '../parse';
import { isHot, isPixelThumb } from '../recipes';
import { sampleRecipes } from '../samples';
import { update, useData } from '../store';
import type { Meal, Recipe } from '../types';
import { MEALS } from '../types';
import { Cauldron, Icon, Seg, Sheet, SheetHead, Sparkle, toast } from '../ui';

export const CAL_BANDS = ['Any', 'Under 300', '300–500', '500+'] as const;
export const PROTEIN_BANDS = ['Any', '10 g+', '20 g+'] as const;
export const FIBER_BANDS = ['Any', '3 g+', '5 g+'] as const;
/** 5 g or more of fibre per serving is the usual "high fibre" bar */
const HIGH_FIBER = 5;
export const TIME_BANDS = ['Any', 'Up to 30 min', 'Up to 1 hr'] as const;

export interface Filters {
  meals: Meal[];
  cuisines: string[];
  cal: (typeof CAL_BANDS)[number];
  protein: (typeof PROTEIN_BANDS)[number];
  fiber: (typeof FIBER_BANDS)[number];
  time: (typeof TIME_BANDS)[number];
}

const NO_FILTERS: Filters = { meals: [], cuisines: [], cal: 'Any', protein: 'Any', fiber: 'Any', time: 'Any' };
const SESSION_KEY = 'cq-shelf';

function activeCount(f: Filters): number {
  return f.meals.length + f.cuisines.length + (f.cal !== 'Any' ? 1 : 0) + (f.protein !== 'Any' ? 1 : 0) + (f.fiber !== 'Any' ? 1 : 0) + (f.time !== 'Any' ? 1 : 0);
}

function matchesFilters(r: Recipe, f: Filters): boolean {
  if (f.meals.length && !f.meals.includes(r.meal)) return false;
  if (f.cuisines.length && !f.cuisines.some((c) => c.toLowerCase() === r.cuisine.toLowerCase())) return false;
  const n = r.nutrition;
  if (f.cal !== 'Any') {
    if (!n) return false;
    if (f.cal === 'Under 300' && !(n.kcal < 300)) return false;
    if (f.cal === '300–500' && !(n.kcal >= 300 && n.kcal <= 500)) return false;
    if (f.cal === '500+' && !(n.kcal > 500)) return false;
  }
  if (f.protein !== 'Any') {
    if (!n) return false;
    if (n.protein < (f.protein === '20 g+' ? 20 : 10)) return false;
  }
  if (f.fiber !== 'Any') {
    if (!n || n.fiber === undefined) return false;
    if (n.fiber < (f.fiber === '5 g+' ? HIGH_FIBER : 3)) return false;
  }
  if (f.time !== 'Any') {
    if (r.minutes === null) return false;
    if (r.minutes > (f.time === 'Up to 30 min' ? 30 : 60)) return false;
  }
  return true;
}

/** Search understands plain names and ingredients, plus "250 cal", "under 300 kcal", "high protein" and "high fiber". */
function queryTest(raw: string): ((r: Recipe) => boolean) | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const cal = q.match(/(\d+)\s*(kcal|cals|cal|calories|calorie)\b/);
  if (cal) {
    const limit = Number(cal[1]);
    const strict = /under|below|less than|<\s*\d/.test(q);
    return (r) => !!r.nutrition && (strict ? r.nutrition.kcal < limit : r.nutrition.kcal <= limit);
  }
  const fib = q.match(/(\d+(?:\.\d+)?)\s*g?\s*(?:of\s*)?fib(?:er|re)/);
  if (fib) return (r) => r.nutrition?.fiber !== undefined && r.nutrition.fiber >= Number(fib[1]);
  if (/fib(?:er|re)/.test(q)) return (r) => r.nutrition?.fiber !== undefined && r.nutrition.fiber >= HIGH_FIBER;
  const prot = q.match(/(\d+)\s*g?\s*(?:of\s*)?protein/);
  if (prot) return (r) => !!r.nutrition && r.nutrition.protein >= Number(prot[1]);
  if (/high[\s-]*protein|protein/.test(q)) return (r) => !!r.nutrition && r.nutrition.protein >= 20;
  return (r) => `${r.title} ${r.cuisine} ${r.meal} ${r.ingredientsText}`.toLowerCase().includes(q);
}

function cuisinesOf(recipes: Recipe[]): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const r of recipes) {
    if (!r.cuisine) continue;
    const k = r.cuisine.toLowerCase();
    const cur = counts.get(k) || { name: r.cuisine, count: 0 };
    cur.count++;
    counts.set(k, cur);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default function Shelf() {
  const { recipes, settings } = useData();
  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as { f: Filters; q: string } | null;
    } catch {
      return null;
    }
  }, []);
  const [filters, setFilters] = useState<Filters>(saved?.f ? { ...NO_FILTERS, ...saved.f } : NO_FILTERS);
  const [q, setQ] = useState(saved?.q || '');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ f: filters, q }));
  }, [filters, q]);

  const sorted = useMemo(() => [...recipes].sort((a, b) => b.updatedAt - a.updatedAt), [recipes]);
  const qt = useMemo(() => queryTest(q), [q]);
  const shown = sorted.filter((r) => matchesFilters(r, filters) && (!qt || qt(r)));
  const cuisines = useMemo(() => cuisinesOf(recipes), [recipes]);
  const nActive = activeCount(filters);
  const filtering = nActive > 0 || !!q.trim();
  const missingEstimates = recipes.filter((r) => !r.nutrition).length;
  const needsNutrition = filters.cal !== 'Any' || filters.protein !== 'Any' || filters.fiber !== 'Any' || /cal|protein|fib/i.test(q);

  const toggleCuisine = (name: string) =>
    setFilters((f) => ({
      ...f,
      cuisines: f.cuisines.some((c) => c.toLowerCase() === name.toLowerCase())
        ? f.cuisines.filter((c) => c.toLowerCase() !== name.toLowerCase())
        : [...f.cuisines, name],
    }));

  const loadSamples = () => {
    try {
      update((d) => {
        const have = new Set(d.recipes.map((r) => r.id));
        return { ...d, recipes: [...d.recipes, ...sampleRecipes().filter((s) => !have.has(s.id))] };
      });
      toast('Sample recipes added to your shelf');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <main className="page" style={{ gap: 14 }}>
      <header className="brand">
        <Cauldron size={44} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 className="display">Cauldron &amp; Quill</h1>
          <span className="label muted">
            {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} on the shelf
          </span>
        </div>
        <a className="icon-btn" href="#/settings" aria-label="Settings">
          <Icon name="sliders" size={22} stroke={2} />
        </a>
      </header>

      {recipes.length > 0 && (
        <>
          <label className="search" style={{ marginTop: 4 }}>
            <Icon name="search" size={20} stroke={2} className="muted" />
            <span className="sr">Search recipes</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or try “under 300 cal”" enterKeyHint="search" />
          </label>

          <div className="chips">
            <button className="chip dark" onClick={() => setShowFilters(true)}>
              <Icon name="sliders" size={18} stroke={2.2} />
              Filters{nActive ? <small>· {nActive}</small> : null}
            </button>
            <button className="chip" aria-pressed={filters.protein === '20 g+'} onClick={() => setFilters((f) => ({ ...f, protein: f.protein === '20 g+' ? 'Any' : '20 g+' }))}>
              High protein
            </button>
            <button className="chip" aria-pressed={filters.fiber === '5 g+'} onClick={() => setFilters((f) => ({ ...f, fiber: f.fiber === '5 g+' ? 'Any' : '5 g+' }))}>
              High fiber
            </button>
            <button className="chip" aria-pressed={filters.cal === 'Under 300'} onClick={() => setFilters((f) => ({ ...f, cal: f.cal === 'Under 300' ? 'Any' : 'Under 300' }))}>
              Under 300 kcal
            </button>
            {cuisines.slice(0, 3).map((c) => (
              <button key={c.name} className="chip" aria-pressed={filters.cuisines.some((x) => x.toLowerCase() === c.name.toLowerCase())} onClick={() => toggleCuisine(c.name)}>
                {c.name}
              </button>
            ))}
          </div>

          {filtering && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 }}>
              <span className="muted" style={{ fontSize: 14 }}>
                {shown.length ? `Showing ${shown.length} of ${recipes.length}` : 'Nothing on the shelf matches'}
              </span>
              <button
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setQ('');
                }}
                style={{ minHeight: 44, background: 'none', border: 0, color: 'var(--accent)', fontWeight: 800, fontSize: 14, cursor: 'pointer', padding: 0 }}
              >
                Clear
              </button>
            </div>
          )}
          {filtering && needsNutrition && missingEstimates > 0 && (
            <p className="muted" style={{ margin: '-8px 0 0', fontSize: 13 }}>
              {missingEstimates} {missingEstimates === 1 ? 'recipe has' : 'recipes have'} no calorie estimate yet, so {missingEstimates === 1 ? "it isn't" : "they aren't"} included.
            </p>
          )}

          <div className="grid">
            {shown.map((r) => (
              <RecipeCard key={r.id} r={r} showKcal={settings.showKcal} />
            ))}
          </div>
        </>
      )}

      {recipes.length === 0 && (
        <section className="paper" style={{ padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', marginTop: 12 }}>
          <Cauldron size={96} />
          <h2 className="display" style={{ margin: 0, fontSize: 26 }}>Your shelf is empty</h2>
          <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.45 }}>
            Write your first recipe, snap one from a card, or fill the shelf with a few samples to try things out.
          </p>
          <a className="btn btn-primary btn-lg btn-block" href="#/new">
            <Icon name="plus" size={20} stroke={3} /> Write a recipe
          </a>
          <a className="btn btn-ink btn-block" href="#/snap">
            <Icon name="camera" size={20} stroke={2.2} /> Snap a recipe card
          </a>
          <button className="btn btn-ink btn-block" onClick={loadSamples}>
            Load sample recipes
          </button>
        </section>
      )}

      <div className="fab-fade" aria-hidden="true" />
      <div className="fab-row">
        <a className="square-btn" href="#/snap" aria-label="Snap a recipe card">
          <Icon name="camera" size={24} stroke={2.2} />
        </a>
        <a className="btn btn-primary btn-lg" href="#/new">
          <Icon name="plus" size={20} stroke={3} /> New recipe
        </a>
      </div>

      {showFilters && (
        <FilterSheet
          filters={filters}
          setFilters={setFilters}
          recipes={recipes}
          cuisines={cuisines}
          countFor={(f) => sorted.filter((r) => matchesFilters(r, f) && (!qt || qt(r))).length}
          onClose={() => setShowFilters(false)}
        />
      )}
    </main>
  );
}

function RecipeCard({ r, showKcal }: { r: Recipe; showKcal: boolean }) {
  const hot = isHot(r) && !!r.thumb;
  const tags = [
    r.nutrition && r.nutrition.protein >= 20 ? 'HIGH PROTEIN' : '',
    r.nutrition?.fiber !== undefined && r.nutrition.fiber >= HIGH_FIBER ? 'HIGH FIBER' : '',
  ].filter(Boolean);
  const meta = [r.timeText, showKcal && r.nutrition ? `${r.nutrition.kcal} kcal` : ''].filter(Boolean).join(' · ');
  return (
    <a className="card" href={`#/r/${r.id}`}>
      <div style={{ position: 'relative' }}>
        {r.thumb ? (
          <img className={'thumb' + (isPixelThumb(r.thumb) ? ' pixelated' : '')} src={r.thumb} alt="" loading="lazy" />
        ) : (
          <div className="thumb-empty">
            <Icon name="plus" size={22} stroke={2} />
            No thumbnail
          </div>
        )}
        {hot && (
          <div aria-hidden="true" style={{ position: 'absolute', left: '30%', top: 0, width: '40%', height: '26%', pointerEvents: 'none' }}>
            <span className="puff" style={{ left: '10%' }} />
            <span className="puff" style={{ left: '45%', animationDelay: '0.8s' }} />
            <span className="puff" style={{ left: '80%', animationDelay: '1.6s' }} />
          </div>
        )}
        {tags.length > 0 && (
          <div className="tags">
            {tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
      </div>
      <h3 className="display">{r.title}</h3>
      {meta && (
        <span className="meta">
          <Icon name="clock" size={13} stroke={2.4} />
          {meta}
        </span>
      )}
      <span className="cooked">{lastCookedLabel(r.lastCooked)}</span>
    </a>
  );
}

function FilterSheet({
  filters, setFilters, recipes, cuisines, countFor, onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  recipes: Recipe[];
  cuisines: { name: string; count: number }[];
  countFor: (f: Filters) => number;
  onClose: () => void;
}) {
  const meals = MEALS.map((m) => ({ name: m, count: recipes.filter((r) => r.meal === m).length })).filter((m) => m.count > 0);
  const n = countFor(filters);
  const toggle = <K extends 'meals' | 'cuisines'>(key: K, v: string) => {
    const list = filters[key] as string[];
    const on = list.some((x) => x.toLowerCase() === v.toLowerCase());
    setFilters({ ...filters, [key]: on ? list.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...list, v] });
  };
  return (
    <Sheet label="Filters" onClose={onClose}>
      <SheetHead title="Filters" onClose={onClose} />

      {meals.length > 0 && (
        <div className="field" role="group" aria-label="Meal">
          <span className="label">Meal</span>
          <div className="chip-wrap">
            {meals.map((m) => (
              <button key={m.name} className="chip" aria-pressed={filters.meals.includes(m.name)} onClick={() => toggle('meals', m.name)}>
                {m.name} <small>{m.count}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {cuisines.length > 0 && (
        <div className="field" role="group" aria-label="Cuisine">
          <span className="label">Cuisine</span>
          <div className="chip-wrap">
            {cuisines.map((c) => (
              <button key={c.name} className="chip" aria-pressed={filters.cuisines.some((x) => x.toLowerCase() === c.name.toLowerCase())} onClick={() => toggle('cuisines', c.name)}>
                {c.name} <small>{c.count}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="label">Calories per serving</span>
        <Seg label="Calories per serving" options={CAL_BANDS} value={filters.cal} onChange={(cal) => setFilters({ ...filters, cal })} />
      </div>
      <div className="field">
        <span className="label">Protein per serving</span>
        <Seg label="Protein per serving" options={PROTEIN_BANDS} value={filters.protein} onChange={(protein) => setFilters({ ...filters, protein })} />
      </div>
      <div className="field">
        <span className="label">Fiber per serving</span>
        <Seg label="Fiber per serving" options={FIBER_BANDS} value={filters.fiber} onChange={(fiber) => setFilters({ ...filters, fiber })} />
      </div>
      <div className="field">
        <span className="label">Time</span>
        <Seg label="Time" options={TIME_BANDS} value={filters.time} onChange={(time) => setFilters({ ...filters, time })} />
      </div>

      <span className="hint" style={{ fontSize: 13, fontWeight: 600 }}>
        <span style={{ marginTop: 3 }}><Sparkle size={11} color="var(--label)" /></span>
        Calories, protein and fiber are per serving, estimated by Gemini from your ingredients.
      </span>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 12 }}>
        <button className="btn btn-ink btn-lg" onClick={() => setFilters(NO_FILTERS)}>Clear all</button>
        <button className="btn btn-primary btn-lg" onClick={onClose}>
          {n === 0 ? 'No matches' : n === 1 ? 'Show 1 recipe' : `Show ${n} recipes`}
        </button>
      </div>
    </Sheet>
  );
}
