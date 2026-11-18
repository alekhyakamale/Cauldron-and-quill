import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { conjureThumbnail, describeThumbPrompt, GeminiError } from '../gemini';
import { parseIngredients } from '../parse';
import { cropBox, fileToDataUrl, loadImage, NO_CROP, pixelate, prepareForUpload, referenceImage, shrinkPhoto, type Crop } from '../pixel';
import { isPixelThumb } from '../recipes';
import { useData } from '../store';
import type { PixelSize, Recipe } from '../types';
import { Icon, Seg, Sheet, SheetHead, Sparkle } from '../ui';

const SIZES: readonly PixelSize[] = ['Chunky', 'Classic', 'Fine'];

interface Props {
  recipe: { id?: string; title: string; ingredientsText: string; cuisine: string };
  onClose: () => void;
  onPick: (thumb: string, from: NonNullable<Recipe['thumbFrom']>) => void;
}

type Phase = 'setup' | 'brewing' | 'result' | 'error';

export default function ThumbSheet({ recipe, onClose, onPick }: Props) {
  const { settings, recipes } = useData();
  const [mode, setMode] = useState<'conjure' | 'upload'>('conjure');
  const [size, setSize] = useState<PixelSize>(settings.pixelSize);
  const [whisper, setWhisper] = useState('');
  const [match, setMatch] = useState(settings.matchStyle);
  const [phase, setPhase] = useState<Phase>('setup');
  const [error, setError] = useState('');
  const [brews, setBrews] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  const [pixelateUpload, setPixelateUpload] = useState(settings.pixelateUploads);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(NO_CROP);
  const [preview, setPreview] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reference = useMemo(() => {
    const others = recipes
      .filter((r) => r.id !== recipe.id && r.thumb && isPixelThumb(r.thumb))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return others[0] || null;
  }, [recipes, recipe.id]);

  const keyIngredients = useMemo(
    () =>
      parseIngredients(recipe.ingredientsText)
        .map((i) => i.item.split(/[,(]/)[0].trim())
        .filter((x) => x && x.length < 32 && !/^(salt|pepper|water|oil|sugar)\b/i.test(x))
        .slice(0, 5),
    [recipe.ingredientsText],
  );

  const promptInput = { title: recipe.title, keyIngredients, whisper, size, matchStyle: match && !!reference };
  const title = recipe.title.trim() || 'your dish';

  const conjure = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase('brewing');
    setError('');
    try {
      const ref = promptInput.matchStyle && reference?.thumb ? await referenceImage(reference.thumb) : null;
      const raw = await conjureThumbnail(settings, promptInput, ref, ctrl.signal);
      const pix = await pixelate(raw, size);
      if (ctrl.signal.aborted) return;
      setBrews((b) => {
        const next = [...b, pix].slice(-6);
        setPick(next.length - 1);
        return next;
      });
      setPhase('result');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof GeminiError ? e.message : (e as Error).message || 'Something went wrong.');
      setPhase('error');
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setPhase(brews.length ? 'result' : 'setup');
  };

  // Re-render the preview whenever the crop, pixel size or pixelate setting changes
  useEffect(() => {
    if (!source || mode !== 'upload') return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      (pixelateUpload ? pixelate(source, size, crop) : shrinkPhoto(source, crop))
        .then((out) => !cancelled && setPreview(out))
        .catch((e) => !cancelled && setError((e as Error).message));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [source, crop, size, pixelateUpload, mode]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      // Work from a 1400px copy so live cropping stays smooth on a phone
      const img = await loadImage(await prepareForUpload(await fileToDataUrl(file), 1400));
      setCrop(NO_CROP);
      setSource(img);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!source) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = source.naturalWidth;
    const h = source.naturalHeight;
    const b = cropBox(w, h, 4 / 3, crop);
    drag.current = { x: e.clientX, y: e.clientY, cx: (b.sx + b.sw / 2) / w, cy: (b.sy + b.sh / 2) / h };
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !source) return;
    const w = source.naturalWidth;
    const h = source.naturalHeight;
    const rect = e.currentTarget.getBoundingClientRect();
    const b = cropBox(w, h, 4 / 3, crop);
    const hw = b.sw / 2 / w;
    const hh = b.sh / 2 / h;
    const cx = d.cx - ((e.clientX - d.x) / rect.width) * (b.sw / w);
    const cy = d.cy - ((e.clientY - d.y) / rect.height) * (b.sh / h);
    setCrop((c) => ({ ...c, cx: Math.min(Math.max(cx, hw), 1 - hw), cy: Math.min(Math.max(cy, hh), 1 - hh) }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <Sheet label="Add a thumbnail" onClose={() => { abort.current?.abort(); onClose(); }}>
      {phase === 'brewing' && (
        <>
          <SheetHead title="Stirring the cauldron…" sub={`Gemini is painting ${title}`} onClose={cancel} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '20px 0' }}>
            <img src="/icons/cauldron.png" alt="" width={150} height={150} className="pixelated bob" />
            <div className="brew-bar" role="progressbar" aria-label="Conjuring" style={{ width: '100%' }}><span /></div>
            <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>Usually takes 10–20 seconds</span>
          </div>
          <button className="btn btn-ink btn-lg" onClick={cancel}>Cancel</button>
        </>
      )}

      {phase === 'result' && brews.length > 0 && (
        <>
          <SheetHead title="Fresh from the cauldron" onClose={onClose} />
          <img className="thumb pixelated" src={brews[pick]} alt={`Pixel-art thumbnail of ${title}`} style={{ border: '3px solid var(--shadow)', boxShadow: '5px 5px 0 var(--ink)' }} />
          {brews.length > 1 && (
            <div className="field">
              <span className="label">Your brews · {brews.length} so far</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {brews.map((b, i) => (
                  <button key={i} aria-label={`Brew ${i + 1}`} aria-pressed={pick === i} onClick={() => setPick(i)}
                    style={{ width: 76, height: 57, padding: 0, cursor: 'pointer', background: 'var(--shadow)', border: pick === i ? '3px solid var(--accent)' : '2px solid var(--ink)' }}>
                    <img src={b} alt="" className="pixelated" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <button className="btn btn-ink btn-lg" onClick={conjure}><Icon name="refresh" size={18} stroke={2.6} /> Brew again</button>
            <button className="btn btn-primary btn-lg" onClick={() => onPick(brews[pick], 'gemini')}><Icon name="check" size={18} stroke={3} /> Use this</button>
          </div>
          <button onClick={() => setPhase('setup')} style={{ alignSelf: 'center', minHeight: 44, background: 'none', border: 0, color: 'var(--label)', fontWeight: 800, fontSize: 15, cursor: 'pointer', textDecoration: 'underline' }}>
            Change pixel size or whisper
          </button>
        </>
      )}

      {(phase === 'setup' || phase === 'error') && (
        <>
          <SheetHead title="Add a thumbnail" sub={recipe.title.trim() ? `For ${recipe.title.trim()}` : undefined} onClose={onClose} />

          <div role="group" aria-label="Thumbnail source" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SourceTile on={mode === 'conjure'} onClick={() => setMode('conjure')} title="Conjure with Gemini" sub="Pixel art painted from your recipe"
              icon={<img src="/icons/cauldron.png" alt="" width={40} height={40} className="pixelated" />} />
            <SourceTile on={mode === 'upload'} onClick={() => setMode('upload')} title="Upload a picture" sub="From your camera or photos"
              icon={<Icon name="upload" size={24} />} />
          </div>

          {mode === 'upload' && (
            <label className="check-row">
              <input type="checkbox" checked={pixelateUpload} onChange={(e) => setPixelateUpload(e.target.checked)} />
              <span><strong>Pixelate my photo</strong><span>So it matches the rest of your shelf</span></span>
            </label>
          )}

          {(mode === 'conjure' || pixelateUpload) && (
            <div className="field">
              <span className="label">Pixel size</span>
              <Seg label="Pixel size" options={SIZES} value={size} onChange={setSize} />
            </div>
          )}

          {mode === 'conjure' && (
            <>
              {reference && (
                <label className="check-row" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} />
                  <span style={{ flex: 1 }}><strong>Match my shelf's style</strong><span>Gemini copies the look of {reference.title}</span></span>
                  <img src={reference.thumb!} alt="" className="pixelated" style={{ width: 60, height: 45, objectFit: 'cover', border: '2px solid var(--ink)', opacity: match ? 1 : 0.4 }} />
                </label>
              )}
              <label className="field">
                <span className="label">Add a whisper <span style={{ textTransform: 'none', fontWeight: 700, letterSpacing: 0 }}>(optional)</span></span>
                <input className="input" value={whisper} onChange={(e) => setWhisper(e.target.value)} placeholder="e.g. on a wooden board, dip on the side" style={{ fontSize: 16 }} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', border: '2px dashed var(--line)' }}>
                <span className="label" style={{ color: 'var(--label)' }}>Gemini will paint</span>
                <span style={{ fontStyle: 'italic', fontSize: 16, lineHeight: 1.4 }}>{describeThumbPrompt(promptInput)}</span>
              </div>
              {phase === 'error' && <div className="error-box" role="alert">{error}</div>}
              {!settings.apiKey ? (
                <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                  To conjure thumbnails, <a href="#/settings" style={{ color: 'var(--label)', fontWeight: 800 }}>add your Gemini API key in Settings</a>.
                </p>
              ) : (
                <button className="btn btn-primary btn-lg btn-block" onClick={conjure}>
                  <Sparkle size={16} color="currentColor" /> {phase === 'error' ? 'Try again' : 'Conjure thumbnail'}
                </button>
              )}
            </>
          )}

          {mode === 'upload' && (
            <>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
              {preview && (
                <div className="field">
                  <div
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
                  >
                    <img className={'thumb' + (pixelateUpload ? ' pixelated' : '')} src={preview} alt="Preview of your thumbnail" draggable={false}
                      style={{ border: '3px solid var(--shadow)', boxShadow: '5px 5px 0 var(--ink)', pointerEvents: 'none' }} />
                  </div>
                  <label className="field" style={{ marginTop: 10 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="label">Zoom in on the dish</span>
                      <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Drag the picture to move it</span>
                    </span>
                    <input type="range" min={1} max={4} step={0.05} value={crop.zoom}
                      onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
                      style={{ width: '100%', minHeight: 44, accentColor: 'var(--label)' }} />
                  </label>
                </div>
              )}
              {error && <div className="error-box" role="alert">{error}</div>}
              {preview ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                  <button className="btn btn-ink btn-lg" onClick={() => fileRef.current?.click()}>Choose another</button>
                  <button className="btn btn-primary btn-lg" onClick={() => onPick(preview, 'upload')}><Icon name="check" size={18} stroke={3} /> Use this</button>
                </div>
              ) : (
                <button className="btn btn-primary btn-lg btn-block" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={20} stroke={2.6} /> Choose a photo
                </button>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function SourceTile({ on, onClick, title, sub, icon }: { on: boolean; onClick: () => void; title: string; sub: string; icon: ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, minHeight: 76, padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
        color: 'var(--ink)', background: on ? 'var(--card-hi)' : 'transparent',
        border: on ? '3px solid var(--ink)' : '2px solid var(--line)', boxShadow: on ? '4px 4px 0 var(--ink)' : 'none',
      }}
    >
      <span style={{ flex: 'none', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', color: 'var(--card)' }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="pixel" style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        <span className="muted" style={{ fontSize: 15 }}>{sub}</span>
      </span>
      <span style={{ flex: 'none', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--label)' : 'transparent', color: 'var(--on-label)', border: on ? 0 : '2px solid var(--line)' }}>
        {on && <Icon name="check" size={16} stroke={3} />}
      </span>
    </button>
  );
}
