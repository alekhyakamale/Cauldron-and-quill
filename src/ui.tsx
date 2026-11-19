import { useEffect, useState, type ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  search: (<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>),
  sliders: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><rect x="14" y="5" width="4" height="4" /><rect x="8" y="15" width="4" height="4" /></>),
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  timer: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4M10 2h4" /></>),
  people: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 0 1 0 6M18 14c2 .7 3 2.8 3 6" /></>),
  globe: (<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" /></>),
  bowl: (<><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M9 7c0-1 1-1.5 1-3M14 7c0-1 1-1.5 1-3" /></>),
  edit: (<><path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M14 7l3 3" /></>),
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  upload: (<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v5h16v-5" /></>),
  photos: (<><rect x="3" y="4" width="18" height="16" /><circle cx="9" cy="10" r="2" /><path d="M3 18l6-5 4 3 3-2 5 4" /></>),
  refresh: (<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>),
  flame: (<><path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5 1 2.5 2 2.5-1-2.5 0-5 0-7z" /><path d="M5 21h14" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>),
  warn: (<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>),
  trash: (<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  download: (<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></>),
  external: <path d="M7 17L17 7M9 7h8v8" />,
  copy: (<><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></>),
  log: (<><rect x="4" y="5" width="16" height="16" /><path d="M4 10h16M8 3v4M16 3v4M8 14h3M8 17h6" /></>),
  eye: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
};

export function Icon({ name, size = 20, stroke = 2.4, className }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="square">
      {PATHS[name]}
    </svg>
  );
}

export function Sparkle({ size = 12, color = 'var(--accent2)' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 9 9" fill={color} shapeRendering="crispEdges" style={{ flex: 'none' }}>
      <rect x="4" y="0" width="1" height="9" />
      <rect x="0" y="4" width="9" height="1" />
      <rect x="3" y="3" width="3" height="3" />
    </svg>
  );
}

export function Cauldron({ size = 44, className }: { size?: number; className?: string }) {
  return <img src="/icons/cauldron.png" alt="" width={size} height={size} className={'pixelated ' + (className || '')} />;
}

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

export function SheetHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="sheet-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h2 className="display">{title}</h2>
        {sub && <span className="muted" style={{ fontStyle: 'italic', fontSize: 16 }}>{sub}</span>}
      </div>
      <button className="icon-btn on-paper" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={18} stroke={2.6} />
      </button>
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

let toastSetter: ((m: string | null) => void) | null = null;
export function toast(message: string) {
  toastSetter?.(message);
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

/** Tiny hash router: #/, #/r/:id, #/edit/:id, #/new, #/cook/:id, #/snap, #/settings, #/today[/:date] */
export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = path.startsWith('#') ? path : '#' + path;
}

