'use client';

import { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'warn' | 'error' | 'info';

export interface Toast {
  id:       string;
  type:     ToastType;
  message:  string;
  duration: number;   // ms
}

// ── Toast store (standalone, not merged into main store) ──────────────────────
interface ToastState {
  toasts: Toast[];
  push:   (type: ToastType, message: string, duration?: number) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (type, message, duration = 3500) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    set(s => ({ toasts: [...s.toasts.slice(-4), { id, type, message, duration }] }));
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// ── Convenience helpers (call anywhere) ───────────────────────────────────────
export const toast = {
  success: (msg: string, ms?: number) => useToastStore.getState().push('success', msg, ms),
  warn:    (msg: string, ms?: number) => useToastStore.getState().push('warn',    msg, ms),
  error:   (msg: string, ms?: number) => useToastStore.getState().push('error',   msg, ms),
  info:    (msg: string, ms?: number) => useToastStore.getState().push('info',    msg, ms),
};

// ── Colours ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ToastType, { icon: string; color: string; bar: string; bg: string }> = {
  success: { icon: '✓', color: 'var(--green)', bar: 'var(--green)',  bg: 'rgba(0,229,160,0.08)' },
  warn:    { icon: '⚠', color: 'var(--amber)', bar: 'var(--amber)',  bg: 'rgba(255,184,46,0.08)' },
  error:   { icon: '✕', color: 'var(--red)',   bar: 'var(--red)',    bg: 'rgba(255,61,90,0.08)'  },
  info:    { icon: 'ℹ', color: 'var(--blue)',  bar: 'var(--blue)',   bg: 'rgba(77,166,255,0.08)' },
};

// ── Single Toast item ─────────────────────────────────────────────────────────
function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  const cfg      = TYPE_CONFIG[t.type];
  const barRef   = useRef<HTMLDivElement>(null);
  const startRef = useRef(Date.now());

  // Animate the progress bar
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width      = '100%';
    // Force reflow so the transition picks up
    void bar.offsetWidth;
    bar.style.transition = `width ${t.duration}ms linear`;
    bar.style.width      = '0%';
  }, [t.duration]);

  // Auto-remove
  useEffect(() => {
    const timer = setTimeout(onRemove, t.duration);
    return () => clearTimeout(timer);
  }, [t.duration, onRemove]);

  return (
    <div
      style={{
        position:     'relative',
        display:      'flex',
        alignItems:   'flex-start',
        gap:          10,
        padding:      '10px 14px',
        paddingRight: 36,
        background:   cfg.bg,
        border:       `1px solid ${cfg.color}33`,
        borderLeft:   `3px solid ${cfg.color}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow:    '0 4px 24px rgba(0,0,0,0.4)',
        minWidth:     260,
        maxWidth:     360,
        overflow:     'hidden',
        animation:    'toastIn .2s cubic-bezier(.16,1,.3,1)',
      }}
    >
      {/* Icon */}
      <span style={{
        fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700,
        color: cfg.color, flexShrink: 0, marginTop: 1,
      }}>
        {cfg.icon}
      </span>

      {/* Message */}
      <span style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)',
        lineHeight: 1.5, flex: 1,
      }}>
        {t.message}
      </span>

      {/* Close button */}
      <button
        onClick={onRemove}
        style={{
          position:   'absolute', top: 6, right: 8,
          fontSize:   12, lineHeight: 1,
          background: 'none', border: 'none',
          cursor:     'pointer', color: 'var(--text3)',
          padding:    '2px 4px',
        }}
      >×</button>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 2, background: 'var(--bg3)', width: '100%',
      }}>
        <div
          ref={barRef}
          style={{
            height: '100%', background: cfg.bar,
            width: '100%',
          }}
        />
      </div>
    </div>
  );
}

// ── Toast container ───────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
      `}</style>
      <div style={{
        position:      'fixed',
        bottom:        20,
        right:         20,
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <ToastItem toast={t} onRemove={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </>
  );
}