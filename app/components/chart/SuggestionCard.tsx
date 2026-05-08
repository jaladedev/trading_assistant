'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { AccentCard, ActionBtn } from '../ui';

export default function SuggestionCard() {
  const { suggestion, entryQuality, applySuggestionToCalc } = useStore();
  const sug = suggestion;
  const q   = entryQuality;

  const dirColor  = sug?.dir === 'long' ? 'var(--green)' : 'var(--red)';
  const dirBg     = sug?.dir === 'long' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)';
  const dirBorder = sug?.dir === 'long' ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)';

  const qColor = q ? (q.score >= 75 ? dirColor : q.score >= 50 ? 'var(--blue)' : q.score >= 30 ? 'var(--amber)' : 'var(--text3)') : 'var(--text3)';

  const badgeCls: Record<string, { color: string; bg: string; border: string }> = {
    'strong-long':  { color: 'var(--green)', bg: 'rgba(0,229,160,.15)',  border: 'rgba(0,229,160,.3)' },
    'strong-short': { color: 'var(--red)',   bg: 'rgba(255,61,90,.15)',  border: 'rgba(255,61,90,.3)' },
    'weak':         { color: 'var(--amber)', bg: 'rgba(255,184,46,.1)', border: 'rgba(255,184,46,.25)' },
    'none':         { color: 'var(--text3)', bg: 'rgba(255,255,255,.04)', border: 'var(--border)' },
  };
  const bc = badgeCls[q?.cls ?? 'none'];

  const gridItem = (label: string, val: string) => (
    <div key={label} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '9px 10px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 600 }}>{val}</div>
    </div>
  );

  return (
    <AccentCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          ⚡ 3-EMA Setup
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {q && (
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: bc.color, background: bc.bg, border: `1px solid ${bc.border}` }}>
              {q.label}
            </span>
          )}
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 9px', borderRadius: 10, fontWeight: 700, letterSpacing: '.04em', color: dirColor, background: dirBg, border: `1px solid ${dirBorder}` }}>
            {sug ? (sug.dir === 'long' ? 'LONG SETUP' : 'SHORT SETUP') : 'LOADING…'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 10 }}>
        {gridItem('Entry',     fmtPrice(sug?.entry))}
        {gridItem('Stop Loss', fmtPrice(sug?.stop))}
        {gridItem('Target',    fmtPrice(sug?.target))}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.55, padding: '9px 11px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
        {sug?.reason ?? 'Waiting for chart data…'}
      </div>

      {/* Quality bar */}
      {q && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Setup Quality</span>
          <div style={{ flex: 1, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ height: '100%', borderRadius: 3, width: q.score + '%', background: qColor, transition: 'width .4s, background .4s' }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, minWidth: 28, textAlign: 'right', color: qColor }}>{q.score}%</span>
        </div>
      )}

      <ActionBtn variant="green" onClick={applySuggestionToCalc} style={{ width: '100%', justifyContent: 'center' }}>
        ↓ Apply to Calculator
      </ActionBtn>
    </AccentCard>
  );
}