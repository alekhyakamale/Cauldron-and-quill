import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatDuration, scaledAmount } from '../parse';
import { patchRecipe, useData } from '../store';
import type { Ingredient } from '../types';
import { Icon, toast } from '../ui';

interface Timer {
  total: number;
  endAt: number | null; // running when set
  remaining: number; // when paused
  rang: boolean;
}

const STOP = new Set(['small', 'large', 'medium', 'fresh', 'cooked', 'chopped', 'sliced', 'diced', 'whole', 'thick', 'cold', 'warm', 'soft', 'plain', 'strong', 'white', 'green', 'red', 'black', 'brown', 'into', 'with', 'plus', 'extra', 'each', 'handful', 'taste', 'rolled', 'water', 'salt', 'pepper', 'loosen', 'serve', 'serving']);

function wordsOf(ing: Ingredient): string[] {
  return ing.item
    .split(/[,(]/)[0]
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .map((w) => w.replace(/(es|s)$/, ''));
}

function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  const notes = [880, 660, 880, 660, 1040];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    const t = ctx.currentTime + i * 0.18;
    o.start(t);
    o.stop(t + 0.14);
  });
}

export default function CookMode({ id }: { id: string }) {
  const { recipes, settings } = useData();
  const r = recipes.find((x) => x.id === id);
  const [step, setStep] = useState(0);
  const [timers, setTimers] = useState<Record<number, Timer>>({});
  const [finished, setFinished] = useState(false);
  const [awake, setAwake] = useState(false);
  const [, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null);

  // Keep the screen on while cooking
  useEffect(() => {
    if (!settings.keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        setAwake(true);
        lock.addEventListener('release', () => setAwake(false));
      } catch {
        setAwake(false);
      }
    };
    void request();
    const onVis = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [settings.keepAwake]);

  // Tick while any timer runs; ring when one reaches zero
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const anyRunning = Object.values(timers).some((t) => t.endAt !== null);
  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(() => {
      const now = Date.now();
      const current = timersRef.current;
      const done = Object.keys(current).map(Number).filter((k) => current[k].endAt !== null && current[k].endAt! <= now);
      if (done.length) {
        const next = { ...current };
        for (const k of done) next[k] = { ...next[k], endAt: null, remaining: 0, rang: true };
        setTimers(next);
        if (settings.timerSound) chime(audio.current);
        navigator.vibrate?.([200, 100, 200, 100, 400]);
        toast(done.length === 1 ? `Step ${done[0] + 1} timer is done` : 'Timers are done');
      }
      setTick((x) => x + 1);
    }, 250);
    return () => clearInterval(iv);
  }, [anyRunning, settings.timerSound]);

  const needs = useMemo(() => {
    if (!r) return [];
    return r.steps.map((s) => {
      const text = s.text.toLowerCase().replace(/[^a-z]+/g, ' ');
      const words = new Set(text.split(' ').map((w) => w.replace(/(es|s)$/, '')));
      return r.ingredients.filter((ing) => wordsOf(ing).some((w) => words.has(w)));
    });
  }, [r]);

  if (!r) {
    return (
      <main className="page">
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <p className="muted">This recipe isn't on your shelf any more.</p>
      </main>
    );
  }
  if (!r.steps.length) {
    return (
      <main className="page">
        <a className="icon-btn" href={`#/r/${r.id}`} aria-label="Back"><Icon name="back" size={22} /></a>
        <p className="muted">This recipe has no method steps yet. Add some in the editor to use cook mode.</p>
      </main>
    );
  }

  const s = r.steps[step];
  const last = step === r.steps.length - 1;
  const t: Timer | undefined = timers[step] || (s.timerSec ? { total: s.timerSec, endAt: null, remaining: s.timerSec, rang: false } : undefined);
  const leftOf = (x: Timer) => (x.endAt !== null ? Math.max(0, (x.endAt - Date.now()) / 1000) : x.remaining);
  const others = Object.entries(timers)
    .map(([k, v]) => ({ k: Number(k), v }))
    .filter(({ k, v }) => k !== step && (v.endAt !== null || v.rang));

  const ensureAudio = () => {
    if (!audio.current && settings.timerSound) {
      try {
        audio.current = new AudioContext();
      } catch {
        audio.current = null;
      }
    }
    void audio.current?.resume();
  };

  const startPause = () => {
    if (!t) return;
    ensureAudio();
    if (t.endAt !== null) setTimers((ts) => ({ ...ts, [step]: { ...t, endAt: null, remaining: leftOf(t) } }));
    else if (t.remaining > 0) setTimers((ts) => ({ ...ts, [step]: { ...t, endAt: Date.now() + t.remaining * 1000, rang: false } }));
  };
  const reset = () => s.timerSec && setTimers((ts) => ({ ...ts, [step]: { total: s.timerSec!, endAt: null, remaining: s.timerSec!, rang: false } }));

  const finish = () => {
    try {
      patchRecipe(r.id, { lastCooked: Date.now() });
    } catch (e) {
      toast((e as Error).message);
    }
    setFinished(true);
  };

  if (finished) {
    return (
      <main className="page" style={{ minHeight: '100dvh', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
          <img src="/icons/cauldron.png" alt="" width={144} height={144} className="pixelated" />
          <h1 className="display" style={{ margin: 0, fontSize: 34, lineHeight: 1.1 }}>{r.title}, done!</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 300, fontSize: 17, lineHeight: 1.45 }}>Stamped “Cooked today” on your shelf.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 12 }}>
          <button className="btn btn-dark btn-lg" onClick={() => { setFinished(false); setStep(0); setTimers({}); }}>Cook again</button>
          <a className="btn btn-primary btn-lg" href="#/">Back to the shelf</a>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ minHeight: '100dvh', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))', gap: 22 }}>
      <nav style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 12 }}>
        <a className="icon-btn" href={`#/r/${r.id}`} aria-label="Exit cook mode"><Icon name="close" size={18} stroke={2.6} /></a>
        <span className="display" style={{ fontSize: 19, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
        {awake ? (
          <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '2px solid var(--edge)', fontSize: 12, fontWeight: 800 }}>
            <span style={{ color: 'var(--accent2)', display: 'flex' }}><Icon name="sun" size={14} /></span>
            Screen stays on
          </span>
        ) : <span />}
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="label muted">Step {step + 1} of {r.steps.length}</span>
        <div className="progress" aria-hidden="true">
          {r.steps.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}
        </div>
      </div>

      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {others.map(({ k, v }) => (
            <button key={k} className="chip dark" onClick={() => setStep(k)} aria-label={`Go to step ${k + 1} timer`}
              style={v.rang ? { background: 'var(--accent2)', color: 'var(--on-accent)', borderColor: 'var(--accent2)' } : undefined}>
              <Icon name="timer" size={16} /> Step {k + 1} · {v.rang ? 'done!' : formatDuration(leftOf(v))}
            </button>
          ))}
        </div>
      )}

      <p aria-live="polite" className="display" style={{ margin: 0, fontSize: 30, lineHeight: 1.25, textWrap: 'pretty' } as CSSProperties}>{s.text}</p>

      {needs[step]?.length > 0 && (
        <div className="field">
          <span className="label muted">You'll need</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {needs[step].map((ing, i) => {
              const amt = scaledAmount(ing, 1);
              return <span key={i} className="need">{amt ? `${amt} ${ing.item}` : ing.text}</span>;
            })}
          </div>
        </div>
      )}

      {t && (
        <div className="paper" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: t.rang ? 'var(--accent2)' : 'var(--card)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label" style={{ color: t.rang ? 'var(--on-accent)' : undefined }}>{t.rang ? 'Time’s up' : `${s.timerLabel} timer`}</span>
            <span role="timer" className={'pixel' + (t.rang ? ' blink' : '')} style={{ fontSize: 48, fontWeight: 600, lineHeight: 1 }}>{formatDuration(leftOf(t))}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-primary" style={{ width: 108 }} onClick={startPause} disabled={!t.rang && leftOf(t) <= 0}>
              {t.endAt !== null ? 'Pause' : t.remaining < t.total && t.remaining > 0 ? 'Resume' : 'Start'}
            </button>
            <button className="btn btn-ink" style={{ width: 108 }} onClick={reset}>Reset</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 12 }}>
        <button className="btn btn-dark btn-lg" style={{ minHeight: 60 }} disabled={step === 0} onClick={() => setStep((x) => Math.max(0, x - 1))}>
          <Icon name="back" size={18} stroke={2.6} /> Back
        </button>
        <button className="btn btn-primary btn-lg" style={{ minHeight: 60 }} onClick={() => (last ? finish() : setStep((x) => x + 1))}>
          {last ? 'Finish' : 'Next step'} <Icon name="next" size={18} stroke={2.6} />
        </button>
      </div>
    </main>
  );
}
