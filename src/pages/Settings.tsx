import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GeminiError, testKey } from '../gemini';
import { sampleRecipes } from '../samples';
import { setSettings, storageUse, update, useData } from '../store';
import { connect, disconnect, syncNow, useSyncStatus } from '../sync';
import { activeSeason, PALETTES } from '../theme';
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, type DayLog, type PixelSize, type Recipe, type Season } from '../types';
import { Icon, Seg, toast } from '../ui';

const SEASONS: Season[] = ['Autumn', 'Winter', 'Spring', 'Summer'];
const SIZES: readonly PixelSize[] = ['Chunky', 'Classic', 'Fine'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="paper" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
      <h2 className="display" style={{ margin: 0, fontSize: 23 }}>{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, title, sub, divider = true }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string; divider?: boolean }) {
  return (
    <label className={'check-row' + (divider ? ' divider' : '')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{title}</strong><span>{sub}</span></span>
    </label>
  );
}

function safeSet(patch: Parameters<typeof setSettings>[0]) {
  try {
    setSettings(patch);
  } catch (e) {
    toast((e as Error).message);
  }
}

export default function Settings() {
  const { settings, recipes, days } = useData();
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });
  const importRef = useRef<HTMLInputElement>(null);
  const current = activeSeason(settings);
  const [use, setUse] = useState<{ used: number; quota: number | null } | null>(null);
  useEffect(() => {
    void storageUse().then(setUse);
  }, [recipes]);
  const mb = (b: number) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  const usedText = use ? `${mb(use.used)} used${use.quota ? ` of about ${mb(use.quota)}` : ''}` : 'checking space';
  const samplesHere = recipes.filter((r) => r.sample).length;

  const test = async () => {
    setKeyStatus({ kind: 'testing' });
    try {
      await testKey(settings);
      setKeyStatus({ kind: 'ok', msg: 'Gemini is ready.' });
    } catch (e) {
      setKeyStatus({ kind: 'error', msg: e instanceof GeminiError ? e.message : 'Something went wrong.' });
    }
  };

  const exportBackup = () => {
    const payload = {
      app: 'cauldron-and-quill',
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes,
      days,
      settings: { ...settings, apiKey: '', syncPassphrase: '' },
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cauldron-and-quill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const incoming: Recipe[] = Array.isArray(json?.recipes) ? json.recipes : [];
      if (!incoming.length || !incoming.every((r) => r && typeof r.id === 'string' && typeof r.title === 'string')) {
        toast("That file doesn't look like a Cauldron & Quill backup");
        return;
      }
      if (!confirm(`Add ${incoming.length} recipes from this backup? Any recipe that's in both will be replaced by the backup's version.`)) return;
      const incomingDays: DayLog[] = Array.isArray(json?.days) ? json.days.filter((x: DayLog) => x && typeof x.id === 'string' && Array.isArray(x.entries)) : [];
      update((d) => {
        const ids = new Set(incoming.map((r) => r.id));
        const dayIds = new Set(incomingDays.map((x) => x.id));
        return {
          ...d,
          recipes: [...incoming, ...d.recipes.filter((r) => !ids.has(r.id))],
          days: [...incomingDays, ...d.days.filter((x) => !dayIds.has(x.id))],
        };
      });
      toast(`Restored ${incoming.length} recipes`);
    } catch (e) {
      toast(e instanceof SyntaxError ? "That file isn't a valid backup" : (e as Error).message);
    }
  };

  return (
    <main className="page">
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a className="icon-btn" href="#/" aria-label="Back to recipes"><Icon name="back" size={22} /></a>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Settings</h1>
      </nav>

      <Section title="Season">
        <span className="muted" style={{ marginTop: -8, fontSize: 15 }}>The colours of your whole shelf</span>
        <div role="group" aria-label="Season" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          {SEASONS.map((s) => {
            const on = current === s;
            const p = PALETTES[s];
            return (
              <button key={s} aria-pressed={on} onClick={() => safeSet({ season: s, autoSeason: false })}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, minHeight: 84, padding: 12, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)',
                  background: on ? 'var(--card-hi)' : 'transparent', border: on ? '3px solid var(--label)' : '2px solid var(--rule)', boxShadow: on ? '4px 4px 0 var(--ink)' : 'none',
                }}>
                <span aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
                  {[p.bg, p.accent, p.accent2].map((c) => <span key={c} style={{ width: 18, height: 18, background: c, border: '2px solid var(--shadow)' }} />)}
                </span>
                <span className="display" style={{ fontSize: 18 }}>{s}</span>
              </button>
            );
          })}
        </div>
        <Toggle checked={settings.autoSeason} onChange={(v) => safeSet({ autoSeason: v })} title="Change with the seasons" sub={settings.autoSeason ? `Switches on its own as the year turns. Right now: ${current}` : 'Switches on its own as the year turns'} />
      </Section>

      <Section title="Gemini">
        <label className="field">
          <span className="label">API key</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={settings.apiKey}
              onChange={(e) => { safeSet({ apiKey: e.target.value.trim() }); setKeyStatus({ kind: 'idle' }); }} placeholder="Paste your Gemini API key" style={{ fontSize: 16 }} />
            <button className="icon-btn on-paper" aria-label={showKey ? 'Hide key' : 'Show key'} aria-pressed={showKey} onClick={() => setShowKey((v) => !v)} style={{ width: 48, height: 48 }}>
              <Icon name="eye" size={20} stroke={2} />
            </button>
          </div>
        </label>
        <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
          Used to conjure thumbnails, read recipe cards and estimate calories, protein and fiber. The key stays on this phone and is only sent to Google when you use those features.
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ink" disabled={!settings.apiKey || keyStatus.kind === 'testing'} onClick={test}>
            {keyStatus.kind === 'testing' ? 'Testing…' : 'Test key'}
          </button>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800, color: 'var(--label)' }}>
            Get a key <Icon name="external" size={14} stroke={2.6} />
          </a>
        </div>
        {keyStatus.kind === 'ok' && <span style={{ fontWeight: 800, color: 'var(--label)' }}>✓ {keyStatus.msg}</span>}
        {keyStatus.kind === 'error' && <div className="error-box" role="alert">{keyStatus.msg}</div>}
        <details className="divider">
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 800 }}>Advanced: models</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>Google renames models from time to time. If Gemini says a model doesn't exist, change it here.</span>
            <label className="field">
              <span className="label">Text and reading model</span>
              <input className="input" value={settings.textModel} onChange={(e) => safeSet({ textModel: e.target.value })} style={{ fontSize: 16 }} spellCheck={false} />
            </label>
            <label className="field">
              <span className="label">Image model</span>
              <input className="input" value={settings.imageModel} onChange={(e) => safeSet({ imageModel: e.target.value })} style={{ fontSize: 16 }} spellCheck={false} />
            </label>
            <button className="btn btn-ink" onClick={() => safeSet({ textModel: DEFAULT_TEXT_MODEL, imageModel: DEFAULT_IMAGE_MODEL })}>Reset to defaults</button>
          </div>
        </details>
      </Section>

      <Section title="Thumbnails">
        <div className="field">
          <span className="label">Default pixel size</span>
          <Seg label="Default pixel size" options={SIZES} value={settings.pixelSize} onChange={(v) => safeSet({ pixelSize: v })} />
        </div>
        <Toggle checked={settings.matchStyle} onChange={(v) => safeSet({ matchStyle: v })} title="Match my shelf's style" sub="New thumbnails copy the look of the ones you have" />
        <Toggle checked={settings.pixelateUploads} onChange={(v) => safeSet({ pixelateUploads: v })} title="Pixelate uploaded photos" sub="Your own pictures get the same pixel look" />
      </Section>

      <Section title="Cooking & nutrition">
        <Toggle divider={false} checked={settings.keepAwake} onChange={(v) => safeSet({ keepAwake: v })} title="Keep the screen on in cook mode" sub="So it doesn't lock while your hands are messy" />
        <Toggle checked={settings.timerSound} onChange={(v) => safeSet({ timerSound: v })} title="Chime when a timer ends" sub="Plus a buzz, on phones that support it" />
        <Toggle checked={settings.showKcal} onChange={(v) => safeSet({ showKcal: v })} title="Show calories on recipe cards" sub="Filters by calories and protein work either way" />
      </Section>

      <Section title="Sync">
        <SyncSettings />
      </Section>

      <Section title="Your recipes">
        <span className="muted" style={{ marginTop: -6, fontSize: 15, lineHeight: 1.45 }}>
          {settings.syncPassphrase
            ? <>A copy lives on this phone ({usedText}) and in your Neon database, so clearing the browser won't lose anything once it has synced.</>
            : <>Everything lives in this browser on this phone ({usedText}). Clearing the browser's site data deletes it, so export a backup now and then, or turn on Sync above.</>}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          <button className="btn btn-ink" onClick={exportBackup} disabled={!recipes.length}><Icon name="download" size={18} stroke={2.4} /> Export</button>
          <button className="btn btn-ink" onClick={() => importRef.current?.click()}><Icon name="upload" size={18} stroke={2.4} /> Import</button>
        </div>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        {samplesHere === 0 ? (
          <button className="btn btn-ink" onClick={() => {
            try {
              update((d) => ({ ...d, recipes: [...d.recipes, ...sampleRecipes()] }));
              toast('Sample recipes added');
            } catch (e) { toast((e as Error).message); }
          }}>Load sample recipes</button>
        ) : (
          <button className="btn btn-ink" onClick={() => {
            if (!confirm(`Remove the ${samplesHere} sample recipes? Your own recipes stay.`)) return;
            update((d) => ({ ...d, recipes: d.recipes.filter((r) => !r.sample) }));
            toast('Sample recipes removed');
          }}>Remove sample recipes</button>
        )}
        <button className="btn btn-ink" disabled={!recipes.length} style={{ color: 'var(--label)', borderColor: 'var(--label)' }} onClick={() => {
          if (!confirm(settings.syncPassphrase
            ? `Delete all ${recipes.length} recipes? Sync is on, so they'll be deleted on every connected phone too. This can't be undone unless you have a backup.`
            : `Delete all ${recipes.length} recipes from this phone? This can't be undone unless you have a backup.`)) return;
          update((d) => ({ ...d, recipes: [] }));
          toast('All recipes deleted');
        }}><Icon name="trash" size={18} stroke={2} /> Delete all recipes</button>
      </Section>

      <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>Cauldron &amp; Quill · v1.0</p>
    </main>
  );
}

function ago(ts: number | null): string {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function SyncSettings() {
  const { settings, sync } = useData();
  const status = useSyncStatus();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = !!settings.syncPassphrase;

  if (!on) {
    return (
      <>
        <span className="muted" style={{ marginTop: -6, fontSize: 15, lineHeight: 1.45 }}>
          Keep your recipes in your own Neon database, so they survive a cleared browser and show up on every phone you connect.
        </span>
        <label className="field">
          <span className="label">Passphrase</span>
          <input className="input" type="password" autoComplete="current-password" value={pass}
            onChange={(e) => { setPass(e.target.value); setError(''); }} placeholder="The APP_PASSPHRASE you set on Vercel" style={{ fontSize: 16 }} />
        </label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={!pass.trim() || busy} onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await connect(pass);
            setPass('');
            toast('Sync is on');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>{busy ? 'Connecting…' : 'Connect'}</button>
      </>
    );
  }

  const pending = sync.dirty.length + sync.deleted.length;
  return (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
        {status.phase === 'syncing' ? 'Syncing…'
          : status.phase === 'error' ? 'Sync paused'
          : status.at ? `Synced ${ago(status.at)}` : 'Sync is on'}
        {pending > 0 && status.phase !== 'syncing' && <span className="muted" style={{ fontWeight: 700 }}>· {pending} waiting</span>}
      </span>
      {status.phase === 'error' && <div className="error-box" role="alert">{status.message}</div>}
      <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
        Changes sync on their own when you open the app and a few seconds after each edit. Deleting a recipe deletes it on every connected phone.
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <button className="btn btn-ink" disabled={status.phase === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
        <button className="btn btn-ink" onClick={() => {
          if (confirm('Turn sync off on this phone? Your recipes stay here and in the database.')) disconnect();
        }}>Disconnect</button>
      </div>
    </>
  );
}
