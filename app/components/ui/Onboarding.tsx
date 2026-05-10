'use client';

import { useState, useEffect, useRef } from 'react';

// ── Step definitions ──────────────────────────────────────────────────────────
interface TooltipStep {
  id:        string;
  target:    string;          // CSS selector or anchor id
  title:     string;
  body:      string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TooltipStep[] = [
  {
    id:        'symbol-search',
    target:    '[data-onboard="symbol-search"]',
    title:     'Symbol Search',
    body:      'Type any symbol to load its chart. Click preset pills for quick access. Press / or S to focus from anywhere.',
    placement: 'bottom',
  },
  {
    id:        'timeframe',
    target:    '[data-onboard="timeframe"]',
    title:     'Timeframes',
    body:      'Switch chart timeframe. Keyboard shortcuts: 1=1m 2=5m 3=15m 4=1h 5=4h 6=1d.',
    placement: 'bottom',
  },
  {
    id:        'indicators',
    target:    '[data-onboard="indicators-btn"]',
    title:     'Indicator Panel',
    body:      'Toggle and configure any indicator. Each has adjustable parameters saved between sessions.',
    placement: 'bottom',
  },
  {
    id:        'suggestion',
    target:    '[data-onboard="suggestion-card"]',
    title:     'Strategy Signal',
    body:      'Live entry/stop/target from your active strategy. Click "Apply to Calculator" to pre-fill the risk calculator.',
    placement: 'top',
  },
  {
    id:        'tabs',
    target:    '[data-onboard="tabs"]',
    title:     'Navigation',
    body:      'C=Chart  K=Calculator  J=Journal  S=Strategy. Press Cmd+K for the command palette.',
    placement: 'bottom',
  },
];

const STORAGE_KEY = 'tradeassist_onboarded';

// ── Hook ──────────────────────────────────────────────────────────────────────
function useOnboarding() {
  const [step, setStep]       = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so DOM elements are rendered
      setTimeout(() => { setStep(0); setVisible(true); }, 800);
    }
  }, []);

  const next = () => {
    const nextStep = (step ?? 0) + 1;
    if (nextStep >= STEPS.length) {
      finish();
    } else {
      setStep(nextStep);
    }
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    setStep(null);
  };

  const skip = () => finish();

  return { step, visible, next, skip, finish, total: STEPS.length };
}

// ── Position tooltip relative to target ───────────────────────────────────────
function getPosition(
  target: Element | null,
  placement: TooltipStep['placement'],
  tooltipW: number,
  tooltipH: number,
): { top: number; left: number } {
  if (!target) return { top: 80, left: 20 };
  const rect = target.getBoundingClientRect();
  const gap  = 12;

  switch (placement) {
    case 'bottom': return {
      top:  rect.bottom + gap,
      left: Math.min(
        Math.max(rect.left + rect.width / 2 - tooltipW / 2, 12),
        window.innerWidth - tooltipW - 12,
      ),
    };
    case 'top': return {
      top:  rect.top - tooltipH - gap,
      left: Math.min(
        Math.max(rect.left + rect.width / 2 - tooltipW / 2, 12),
        window.innerWidth - tooltipW - 12,
      ),
    };
    case 'right': return {
      top:  rect.top + rect.height / 2 - tooltipH / 2,
      left: rect.right + gap,
    };
    case 'left': return {
      top:  rect.top + rect.height / 2 - tooltipH / 2,
      left: rect.left - tooltipW - gap,
    };
  }
}

// ── Arrow direction ───────────────────────────────────────────────────────────
function Arrow({ placement }: { placement: TooltipStep['placement'] }) {
  const size = 7;
  const color = 'var(--accent)';
  const styles: Record<string, React.CSSProperties> = {
    bottom: { position: 'absolute', top: -size, left: '50%', transform: 'translateX(-50%)',
      width: 0, height: 0,
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderBottom: `${size}px solid ${color}` },
    top: { position: 'absolute', bottom: -size, left: '50%', transform: 'translateX(-50%)',
      width: 0, height: 0,
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderTop: `${size}px solid ${color}` },
    right: { position: 'absolute', left: -size, top: '50%', transform: 'translateY(-50%)',
      width: 0, height: 0,
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderRight: `${size}px solid ${color}` },
    left: { position: 'absolute', right: -size, top: '50%', transform: 'translateY(-50%)',
      width: 0, height: 0,
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderLeft: `${size}px solid ${color}` },
  };
  return <div style={styles[placement]} />;
}

// ── Onboarding component ──────────────────────────────────────────────────────
export default function Onboarding() {
  const { step, visible, next, skip, total } = useOnboarding();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 80, left: 20 });

  const current = step !== null ? STEPS[step] : null;

  useEffect(() => {
    if (!current || !visible) return;
    const target = document.querySelector(current.target);
    const tw = tooltipRef.current?.offsetWidth  ?? 280;
    const th = tooltipRef.current?.offsetHeight ?? 120;
    setPos(getPosition(target, current.placement, tw, th));

    // Highlight target
    if (target) {
      (target as HTMLElement).style.outline = '2px solid var(--accent)';
      (target as HTMLElement).style.outlineOffset = '3px';
      (target as HTMLElement).style.borderRadius = '4px';
    }
    return () => {
      if (target) {
        (target as HTMLElement).style.outline = '';
        (target as HTMLElement).style.outlineOffset = '';
      }
    };
  }, [current, visible]);

  if (!visible || !current || step === null) return null;

  return (
    <>
      {/* Dim backdrop — doesn't block clicks */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position:     'fixed',
          top:          pos.top,
          left:         pos.left,
          zIndex:       8001,
          width:        280,
          background:   'var(--bg2)',
          border:       '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          padding:      '14px 16px',
          boxShadow:    '0 8px 40px rgba(0,0,0,0.5)',
          animation:    'onboardIn .2s ease',
        }}
      >
        <style>{`
          @keyframes onboardIn {
            from { opacity:0; transform:scale(0.95); }
            to   { opacity:1; transform:scale(1);    }
          }
        `}</style>

        <Arrow placement={current.placement} />

        {/* Step counter */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 8,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Step {step + 1} of {total}
          </span>
          <button
            onClick={skip}
            style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Skip tour
          </button>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--bg4)',
              transition: 'background .3s',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          {current.title}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', lineHeight: 1.55, marginBottom: 14 }}>
          {current.body}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={next}
            style={{
              padding: '6px 16px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: '1px solid var(--accent)',
              background: 'rgba(0,229,160,0.1)', color: 'var(--accent)',
            }}
          >
            {step === total - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Helper to reset onboarding (for settings page) ────────────────────────────
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}