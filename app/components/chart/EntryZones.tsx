'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { AccentCard, ActionBtn } from '../ui';

export default function EntryZones() {
  const { e9, e20, livePrice, suggestion, setEntryPrice, setStopPrice, setCurrentDir } = useStore();

  if (!e9 || !e20 || !livePrice) {
    return (
      <AccentCard colors="linear-gradient(90deg,var(--ema9),var(--ema20),var(--ema50))">
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Waiting for chart data…</div>
      </AccentCard>
    );
  }

  const dir         = suggestion?.dir ?? 'long';
  const aggressive  = e9;
  const balanced    = (e9 + e20) / 2;
  const conservative = e20;

  const zones = [
    { key: 'aggressive',   price: aggressive,   dot: 'var(--ema9)',  desc: 'EMA9 — tight, less wait' },
    { key: 'balanced',     price: balanced,      dot: 'var(--ema20)', desc: 'EMA9/20 midpoint — moderate' },
    { key: 'conservative', price: conservative,  dot: 'var(--ema50)', desc: 'EMA20 — deeper, more confirm' },
  ];

  const applyZone = (price: number) => {
    if (!price) return;
    setCurrentDir(dir);
    const d = price > 100 ? 2 : 4;
    setEntryPrice(price.toFixed(d));
    if (suggestion?.stop) setStopPrice(suggestion.stop.toFixed(suggestion.stop > 100 ? 2 : 4));
  };

  const dirColor  = dir === 'long' ? 'var(--green)' : 'var(--red)';
  const dirBg     = dir === 'long' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)';

  // Note text
  const missCount = zones.filter(z =>
    dir === 'long' ? z.price > livePrice : z.price < livePrice
  ).length;
  let note = '';
  if (dir === 'long') {
    if (livePrice < aggressive)    note = `Price is below all EMA zones — pullback entry may have occurred. Watch for bounce.`;
    else if (missCount === 0)      note = `All 3 zones are below current price — wait for a pullback. ${fmtPrice(conservative)} (EMA20) offers best R/R on deeper dip.`;
    else                           note = `${missCount} zone${missCount>1?'s':''} below price. Aggressive entry at EMA9 (${fmtPrice(aggressive)}) if momentum holds.`;
  } else {
    if (livePrice > aggressive)    note = `Price is above all EMA zones — pullback entry may have occurred. Watch for rejection.`;
    else if (missCount === 0)      note = `All 3 zones are above current price — wait for a bounce up. ${fmtPrice(conservative)} offers best R/R on retest.`;
    else                           note = `${missCount} zone${missCount>1?'s':''} above price. Aggressive short at EMA9 (${fmtPrice(aggressive)}) on rejection.`;
  }

  return (
    <AccentCard colors="linear-gradient(90deg,var(--ema9),var(--ema20),var(--ema50))">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Entry Zones</span>
        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, padding: '2px 9px', borderRadius: 10, color: dirColor, background: dirBg, border: `1px solid ${dirColor}33` }}>
          {dir === 'long' ? 'LONG PULLBACK' : 'SHORT PULLBACK'}
        </span>
      </div>

      {zones.map(z => {
        const distPct = ((z.price - livePrice) / livePrice * 100);
        const distStr = (distPct >= 0 ? '+' : '') + distPct.toFixed(2) + '%';
        const isAbove = z.price > livePrice;
        const distCol = dir === 'long'
          ? (isAbove ? 'var(--text3)' : 'var(--green)')
          : (isAbove ? 'var(--red)'   : 'var(--text3)');
        return (
          <div key={z.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '9px 11px', marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', width: 80, flexShrink: 0 }}>{z.key}</span>
            <span style={{ fontSize: 15, fontFamily: 'var(--mono)', fontWeight: 700, flex: 1 }}>{fmtPrice(z.price)}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: distCol, minWidth: 64, textAlign: 'right' }}>{distStr} away</span>
            <button onClick={() => applyZone(z.price)} style={{ padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg4)', color: 'var(--text2)', transition: 'all .15s', whiteSpace: 'nowrap' }}>
              Apply
            </button>
          </div>
        );
      })}

      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.5, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        {note}
      </div>
    </AccentCard>
  );
}