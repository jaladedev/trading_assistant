'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';

export default function CrossoverLog() {
  const { crossovers } = useStore();
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        EMA Crossovers
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!crossovers.length ? (
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', fontStyle: 'italic' }}>No crossovers detected in recent data.</span>
        ) : [...crossovers].reverse().map((x, idx) => {
          const ago    = Math.round((Date.now() - x.time) / 60000);
          const agoStr = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago/60)}h ago`;
          const label  = x.type === 'bull' ? 'EMA9 crossed above EMA20' : 'EMA9 crossed below EMA20';
          const col    = x.type === 'bull' ? '#00e5a0' : '#ff3d5a';
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'var(--mono)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
              <span style={{ color: col, fontWeight: 600 }}>{x.type === 'bull' ? '▲' : '▼'}</span>
              <span>{label}</span>
              <span style={{ color: 'var(--text2)' }}>{fmtPrice(x.price)}</span>
              <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{agoStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}