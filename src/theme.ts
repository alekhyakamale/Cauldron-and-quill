import type { Season, Settings } from './types';

export interface Palette {
  bg: string; raised: string; edge: string; text: string; textSoft: string; textMuted: string;
  card: string; cardHi: string; ink: string; inkMuted: string; label: string; onLabel: string;
  accent: string; accentDark: string; accentLight: string; accent2: string; accent2Dark: string;
  onAccent: string; rule: string; line: string; glow: string; shadow: string; flag: string; flagInk: string;
}

export const PALETTES: Record<Season, Palette> = {
  Autumn: {
    bg: '#2B1712', raised: '#3A2019', edge: '#6B3A28', text: '#F6E7CF', textSoft: '#F0DCC0', textMuted: '#D2A98A',
    card: '#F3E3C7', cardHi: '#FBF0DC', ink: '#3B1E14', inkMuted: '#7A4A32', label: '#9C3A1A', onLabel: '#FFF3E0',
    accent: '#DE7A2E', accentDark: '#A9541C', accentLight: '#F0A562', accent2: '#E0AE45', accent2Dark: '#B8862C',
    onAccent: '#2B1712', rule: '#C9A27A', line: '#B07F58', glow: 'rgba(222,122,46,0.22)', shadow: '#1A0D09',
    flag: '#F8E1A8', flagInk: '#7A2A10',
  },
  Winter: {
    bg: '#151C27', raised: '#1F2A38', edge: '#3A4C63', text: '#EEF3F6', textSoft: '#DCE5EC', textMuted: '#A9B8C6',
    card: '#E8EEF2', cardHi: '#F7FAFC', ink: '#1C2633', inkMuted: '#4A5868', label: '#3D6A99', onLabel: '#FFFFFF',
    accent: '#7FB0D9', accentDark: '#4F86B5', accentLight: '#A9CBE8', accent2: '#C9D6DF', accent2Dark: '#9AAFBF',
    onAccent: '#151C27', rule: '#A9B8C6', line: '#8396A9', glow: 'rgba(127,176,217,0.2)', shadow: '#0A0E14',
    flag: '#FCEFC7', flagInk: '#6B3D0E',
  },
  Spring: {
    bg: '#1C2719', raised: '#26341F', edge: '#43573A', text: '#F2F2E2', textSoft: '#E4E8D2', textMuted: '#B9C4A4',
    card: '#F3F1DE', cardHi: '#FBFAEF', ink: '#22301F', inkMuted: '#4F5E3E', label: '#8A3B55', onLabel: '#FFF5F8',
    accent: '#E58BA0', accentDark: '#B85E74', accentLight: '#F2B4C3', accent2: '#B5CF6B', accent2Dark: '#8BA647',
    onAccent: '#22301F', rule: '#B9C4A4', line: '#93A07C', glow: 'rgba(229,139,160,0.2)', shadow: '#0E140C',
    flag: '#FBEFBF', flagInk: '#6E3A0C',
  },
  Summer: {
    bg: '#0F2523', raised: '#16322F', edge: '#2F5753', text: '#FFF5E6', textSoft: '#F1E8D6', textMuted: '#A8C4BE',
    card: '#FFF2D8', cardHi: '#FFF9EC', ink: '#1E2B2A', inkMuted: '#4E5F5B', label: '#B04A26', onLabel: '#FFF8EE',
    accent: '#F2B33D', accentDark: '#C48A1E', accentLight: '#F7CD78', accent2: '#F07A5A', accent2Dark: '#C2563A',
    onAccent: '#1E2B2A', rule: '#D8C3A0', line: '#B29F7E', glow: 'rgba(242,179,61,0.2)', shadow: '#071311',
    flag: '#FFE3A3', flagInk: '#7A2E10',
  },
};

/** Northern-hemisphere months, which also matches India's festive-season autumn. */
export function seasonForDate(d = new Date()): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'Spring';
  if (m >= 5 && m <= 7) return 'Summer';
  if (m >= 8 && m <= 10) return 'Autumn';
  return 'Winter';
}

export function activeSeason(s: Settings): Season {
  return s.autoSeason ? seasonForDate() : s.season;
}

export function applyPalette(p: Palette): void {
  const root = document.documentElement;
  const map: Record<string, string> = {
    '--bg': p.bg, '--raised': p.raised, '--edge': p.edge, '--text': p.text, '--text-soft': p.textSoft,
    '--text-muted': p.textMuted, '--card': p.card, '--card-hi': p.cardHi, '--ink': p.ink, '--ink-muted': p.inkMuted,
    '--label': p.label, '--on-label': p.onLabel, '--accent': p.accent, '--accent-dark': p.accentDark,
    '--accent-light': p.accentLight, '--accent2': p.accent2, '--accent2-dark': p.accent2Dark, '--on-accent': p.onAccent,
    '--rule': p.rule, '--line': p.line, '--glow': p.glow, '--shadow': p.shadow, '--flag': p.flag, '--flag-ink': p.flagInk,
  };
  for (const k in map) root.style.setProperty(k, map[k]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.bg);
}
