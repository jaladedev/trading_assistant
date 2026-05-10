'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { fmtSymDisplay } from '@/lib/indicators';
import { toast } from '@/components/ui/Toast';

// ── Shortcut definitions ──────────────────────────────────────────────────────
const TF_KEYS: Record<string, string> = {
  '1': '1m', '2': '5m', '3': '15m', '4': '1h', '5': '4h', '6': '1d',
};

const TAB_KEYS: Record<string, string> = {
  'c': 'chart', 'k': 'calc', 'j': 'journal', 's': 'strategy',
};

// ── useKeyboardShortcuts ──────────────────────────────────────────────────────
// Mount once at root. Handles all global shortcuts except Cmd+K (done in palette).
export function useKeyboardShortcuts(
  onOpenPalette: () => void,
  symbolInputRef?: React.RefObject<HTMLInputElement>,
) {
  const { setTf } = useStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      // Cmd+K / Ctrl+K → command palette (works everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // Everything below blocked when typing in input
      if (inInput) return;

      // Tab shortcuts
      const tabKey = TAB_KEYS[e.key.toLowerCase()];
      if (tabKey) {
        useStore.setState({ activeTab: tabKey as any });
        toast.info(`Switched to ${tabKey}`);
        return;
      }

      // Timeframe shortcuts
      const tf = TF_KEYS[e.key];
      if (tf) {
        setTf(tf);
        toast.info(`Timeframe → ${tf}`);
        return;
      }

      // S → focus symbol search
      if (e.key === '/' || (e.key === 's' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        symbolInputRef?.current?.focus();
        return;
      }

      // F → fullscreen (placeholder — wired in CandleChart)
      if (e.key === 'f' || e.key === 'F') {
        window.dispatchEvent(new CustomEvent('chart:fullscreen'));
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenPalette, setTf, symbolInputRef]);
}

// ── Command palette types ─────────────────────────────────────────────────────
interface PaletteAction {
  id:       string;
  label:    string;
  hint?:    string;
  icon?:    string;
  group:    string;
  run:      () => void;
}

// ── CommandPalette ────────────────────────────────────────────────────────────
export default function CommandPalette({
  open,
  onClose,
}: {
  open:    boolean;
  onClose: () => void;
}) {
  const [query, setQuery]   = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef            = useRef<HTMLInputElement>(null);
  const store               = useStore();

  // Build action list dynamically
  const actions: PaletteAction[] = [
    // Tabs
    { id: 'tab-chart',    label: 'Go to Chart',       hint: 'C',         icon: '📈', group: 'Navigation', run: () => { useStore.setState({ activeTab: 'chart' });    onClose(); } },
    { id: 'tab-calc',     label: 'Go to Calculator',  hint: 'K',         icon: '🧮', group: 'Navigation', run: () => { useStore.setState({ activeTab: 'calc' });     onClose(); } },
    { id: 'tab-journal',  label: 'Go to Journal',     hint: 'J',         icon: '📓', group: 'Navigation', run: () => { useStore.setState({ activeTab: 'journal' });  onClose(); } },
    { id: 'tab-strategy', label: 'Go to Strategy',    hint: 'S',         icon: '⚡', group: 'Navigation', run: () => { useStore.setState({ activeTab: 'strategy' }); onClose(); } },
    // Timeframes
    ...(['1m','5m','15m','1h','4h','1d'] as const).map((tf, i) => ({
      id: `tf-${tf}`, label: `Set timeframe ${tf}`, hint: String(i + 1),
      icon: '⏱', group: 'Timeframe',
      run: () => { store.setTf(tf); toast.info(`Timeframe → ${tf}`); onClose(); },
    })),
    // Symbols
    ...['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','TONUSDT'].map(sym => ({
      id: `sym-${sym}`, label: `Load ${fmtSymDisplay(sym)}`, icon: '💰', group: 'Symbols',
      run: () => { store.setSym(sym); toast.info(`Symbol → ${fmtSymDisplay(sym)}`); onClose(); },
    })),
    // Theme
    { id: 'theme-toggle', label: `Switch to ${store.theme === 'dark' ? 'light' : 'dark'} theme`,
      icon: store.theme === 'dark' ? '☀' : '☾', group: 'Settings',
      run: () => {
        const next = store.theme === 'dark' ? 'light' : 'dark';
        store.setSettings({ theme: next });
        toast.info(`Theme → ${next}`);
        onClose();
      },
    },
    // Indicators
    { id: 'ind-panel', label: 'Open Indicator Panel', icon: '📊', group: 'Chart',
      run: () => { window.dispatchEvent(new CustomEvent('chart:openIndicators')); onClose(); },
    },
    { id: 'chart-fullscreen', label: 'Toggle Fullscreen Chart', hint: 'F', icon: '⛶', group: 'Chart',
      run: () => { window.dispatchEvent(new CustomEvent('chart:fullscreen')); onClose(); },
    },
  ];

  // Filter
  const q = query.trim().toLowerCase();
  const filtered = q
    ? actions.filter(a =>
        a.label.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q) ||
        (a.hint ?? '').toLowerCase().includes(q)
      )
    : actions;

  // Group
  const groups = [...new Set(filtered.map(a => a.group))];

  // Reset cursor when filter changes
  useEffect(() => setCursor(0), [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const runCurrent = useCallback(() => {
    filtered[cursor]?.run();
  }, [filtered, cursor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')    { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); runCurrent(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, runCurrent, onClose]);

  if (!open) return null;

  let globalIdx = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Palette */}
      <div style={{
        position:     'fixed',
        top:          '18%',
        left:         '50%',
        transform:    'translateX(-50%)',
        zIndex:       9001,
        width:        'min(520px, 92vw)',
        background:   'var(--bg2)',
        border:       '1px solid var(--border2)',
        borderRadius: 'var(--radius)',
        boxShadow:    '0 24px 80px rgba(0,0,0,0.6)',
        overflow:     'hidden',
        animation:    'paletteIn .15s cubic-bezier(.16,1,.3,1)',
      }}>
        <style>{`
          @keyframes paletteIn {
            from { opacity:0; transform:translateX(-50%) scale(0.97) translateY(-8px); }
            to   { opacity:1; transform:translateX(-50%) scale(1)    translateY(0);    }
          }
        `}</style>

        {/* Search */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          padding:      '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, color: 'var(--text3)' }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent',
              fontSize: 13, fontFamily: 'var(--mono)',
              color: 'var(--text)',
            }}
          />
          <span style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
            padding: '2px 6px', border: '1px solid var(--border2)',
            borderRadius: 4, background: 'var(--bg3)',
          }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              No commands match "{query}"
            </div>
          ) : (
            groups.map(group => {
              const items = filtered.filter(a => a.group === group);
              return (
                <div key={group}>
                  <div style={{
                    padding: '6px 16px 3px',
                    fontSize: 9, fontFamily: 'var(--mono)',
                    color: 'var(--text3)', textTransform: 'uppercase',
                    letterSpacing: '.1em',
                  }}>
                    {group}
                  </div>
                  {items.map(action => {
                    globalIdx++;
                    const idx     = globalIdx;
                    const active  = idx === cursor;
                    return (
                      <div
                        key={action.id}
                        onClick={action.run}
                        onMouseEnter={() => setCursor(idx)}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          gap:            10,
                          padding:        '8px 16px',
                          cursor:         'pointer',
                          background:     active ? 'var(--bg3)' : 'transparent',
                          borderLeft:     `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                          transition:     'background .08s',
                        }}
                      >
                        {action.icon && (
                          <span style={{ fontSize: 13, flexShrink: 0, width: 20, textAlign: 'center' }}>
                            {action.icon}
                          </span>
                        )}
                        <span style={{
                          flex: 1, fontSize: 12, fontFamily: 'var(--mono)',
                          color: active ? 'var(--text)' : 'var(--text2)',
                          fontWeight: active ? 600 : 400,
                        }}>
                          {action.label}
                        </span>
                        {action.hint && (
                          <span style={{
                            fontSize: 9, fontFamily: 'var(--mono)',
                            padding: '1px 6px', borderRadius: 4,
                            border: '1px solid var(--border2)',
                            background: 'var(--bg4)',
                            color: 'var(--text3)',
                          }}>
                            {action.hint}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 14,
          fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        }}>
          {[['↑↓', 'navigate'], ['↵', 'run'], ['esc', 'close']].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ padding: '1px 5px', border: '1px solid var(--border2)', borderRadius: 3, background: 'var(--bg3)' }}>{key}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}