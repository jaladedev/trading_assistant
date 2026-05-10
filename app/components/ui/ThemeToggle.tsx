'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

// ── Light theme CSS variable overrides ────────────────────────────────────────
const LIGHT_VARS: Record<string, string> = {
  '--bg':        '#f0f2f7',
  '--bg2':       '#e8eaf0',
  '--bg3':       '#dde0ea',
  '--bg4':       '#d0d4e0',
  '--border':    'rgba(0,0,0,0.08)',
  '--border2':   'rgba(0,0,0,0.14)',
  '--border3':   'rgba(0,0,0,0.22)',
  '--text':      '#0f1117',
  '--text2':     '#4a5068',
  '--text3':     '#8890a8',
  '--green':     '#00b87a',
  '--green-bg':  'rgba(0,184,122,0.1)',
  '--green-dim': 'rgba(0,184,122,0.2)',
  '--red':       '#e8293f',
  '--red-bg':    'rgba(232,41,63,0.1)',
  '--red-dim':   'rgba(232,41,63,0.2)',
  '--amber':     '#d4820a',
  '--blue':      '#2577d4',
  '--purple':    '#6b52d4',
  '--accent':    '#00b87a',
};

const DARK_VARS: Record<string, string> = {
  '--bg':        '#080a0f',
  '--bg2':       '#0d1017',
  '--bg3':       '#131820',
  '--bg4':       '#1a2030',
  '--border':    'rgba(255,255,255,0.06)',
  '--border2':   'rgba(255,255,255,0.11)',
  '--border3':   'rgba(255,255,255,0.18)',
  '--text':      '#dde2ef',
  '--text2':     '#6b7591',
  '--text3':     '#3d4460',
  '--green':     '#00e5a0',
  '--green-bg':  'rgba(0,229,160,0.08)',
  '--green-dim': 'rgba(0,229,160,0.16)',
  '--red':       '#ff3d5a',
  '--red-bg':    'rgba(255,61,90,0.08)',
  '--red-dim':   'rgba(255,61,90,0.16)',
  '--amber':     '#ffb82e',
  '--blue':      '#4da6ff',
  '--purple':    '#a78bff',
  '--accent':    '#00e5a0',
};

// ── Apply vars to :root ───────────────────────────────────────────────────────
function applyTheme(theme: 'dark' | 'light') {
  const vars = theme === 'light' ? LIGHT_VARS : DARK_VARS;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', theme);
}

// ── Hook — call once at app root ──────────────────────────────────────────────
export function useTheme() {
  const { theme, setSettings } = useStore();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setSettings({ theme: next });
    applyTheme(next);
  };

  return { theme, toggle };
}

// ── Theme toggle button ───────────────────────────────────────────────────────
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        position:     'fixed',
        bottom:       20,
        left:         20,
        zIndex:       9998,
        width:        36,
        height:       36,
        borderRadius: '50%',
        border:       '1px solid var(--border2)',
        background:   'var(--bg3)',
        color:        'var(--text2)',
        cursor:       'pointer',
        fontSize:     16,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        boxShadow:    '0 2px 12px rgba(0,0,0,0.3)',
        transition:   'all .2s',
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}