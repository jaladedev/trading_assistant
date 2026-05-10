'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { AccentCard, ActionBtn } from '../ui';

export default function SuggestionCard() {
  const {
    suggestion, entryQuality, applySuggestionToCalc,
    strategySignal, activeStrategyId, strategies,
  } = useStore();

  // Prefer strategy signal if one is active and fired
  const hasStrategySignal = !!strategySignal;
  const usingStrategy     = hasStrategySignal;

  // Resolve active strategy name
  const { PRESET_STRATEGIES } = require('@/lib/strategy');
  const allStrats = [...PRESET_STRATEGIES, ...strategies];
  const activeName = allStrats.find((s: { id: string }) => s.id === activeStrategyId)?.name ?? null;

  // Fallback to legacy 3-EMA suggestion
  const sug = suggestion;
  const q   = entryQuality;

  // Display values — prefer strategy signal
  const dir      = usingStrategy ? strategySignal!.dir : sug?.dir;
  const entry    = usingStrategy ? strategySignal!.entry : sug?.entry;
  const stop     = usingStrategy ? strategySignal!.stop  : sug?.stop;
  const target   = usingStrategy ? strategySignal!.targets[0] : sug?.target;
  const reasons  = usingStrategy
    ? strategySignal!.reasons.join(' · ')
    : sug?.reason ?? 'Waiting for chart data…';
  const score    = usingStrategy ? strategySignal!.score : q?.score ?? 0;

  const dirColor  = dir === 'long' ? 'var(--green)' : 'var(--red)';
  const dirBg     = dir === 'long' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)';
  const dirBorder = dir === 'long' ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)';

  const scoreColor = score >= 75 ? dirColor : score >= 50 ? 'var(--blue)' : score >= 30 ? 'var(--amber)' : 'var(--text3)';
  const scoreLabel = usingStrategy
    ? (score >= 75 ? '★ PRIME ENTRY' : score >= 50 ? '◆ GOOD SETUP' : score >= 30 ? '◇ WEAK SETUP' : '○ WAIT')
    : (q?.label ?? '○ WAIT');

  const gridItem = (label: string, val: string, col?: string) => (
    <div key={label} style={{
      background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
      padding: '9px 10px', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 600, color: col }}>{val}</div>
    </div>
  );

  return (
    <AccentCard>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {usingStrategy ? '⚡ Strategy Signal' : '⚡ 3-EMA Setup'}
          </span>
          {activeName && (
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
              {activeName}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Quality badge */}
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            padding: '3px 9px', borderRadius: 20,
            color: scoreColor,
            background: score >= 50 ? (dir === 'long' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)') : 'rgba(255,255,255,0.04)',
            border: `1px solid ${score >= 50 ? (dir === 'long' ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)') : 'var(--border)'}`,
          }}>
            {scoreLabel}
          </span>
          {/* Direction badge */}
          {dir && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 9px',
              borderRadius: 10, fontWeight: 700, letterSpacing: '.04em',
              color: dirColor, background: dirBg, border: `1px solid ${dirBorder}`,
            }}>
              {dir === 'long' ? 'LONG' : 'SHORT'} SETUP
            </span>
          )}
        </div>
      </div>

      {/* Strategy signal: no active signal */}
      {usingStrategy === false && !sug && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>
          Waiting for chart data…
        </div>
      )}

      {/* Price levels grid */}
      {(entry != null || stop != null || target != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 10 }}>
          {gridItem('Entry',     fmtPrice(entry),  'var(--blue)')}
          {gridItem('Stop Loss', fmtPrice(stop),   'var(--red)')}
          {gridItem('Target',    fmtPrice(target), 'var(--green)')}
        </div>
      )}

      {/* Multiple TP targets for strategy signals */}
      {usingStrategy && strategySignal!.targets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {strategySignal!.targets.map((t, i) => (
            <div key={i} style={{
              flex: 1, minWidth: 60, background: 'var(--bg3)',
              borderRadius: 'var(--radius-sm)', padding: '6px 8px',
              border: '1px solid var(--border)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>TP{i + 1}</div>
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{fmtPrice(t)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reason / signal detail */}
      <div style={{
        fontSize: 10, color: 'var(--text2)', lineHeight: 1.55,
        padding: '9px 11px', background: 'var(--bg3)',
        borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--accent)',
        fontFamily: 'var(--mono)', marginBottom: 8,
      }}>
        {reasons}
      </div>

      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
          Signal Quality
        </span>
        <div style={{ flex: 1, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ height: '100%', borderRadius: 3, width: score + '%', background: scoreColor, transition: 'width .4s, background .4s' }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, minWidth: 28, textAlign: 'right', color: scoreColor }}>
          {score}%
        </span>
      </div>

      {/* No active signal message when strategy is set but no signal */}
      {usingStrategy === false && activeName && !strategySignal && (
        <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 8, textAlign: 'center' }}>
          No signal from "{activeName}" on current bar
        </div>
      )}

      <ActionBtn variant="green" onClick={applySuggestionToCalc} style={{ width: '100%', justifyContent: 'center' }}>
        ↓ Apply to Calculator
      </ActionBtn>
    </AccentCard>
  );
}