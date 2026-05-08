'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { AccentCard, MetricBox, NumInput, InputRow } from '../ui';

const FEE_RATES: Record<string, number> = { maker: 0.0002, taker: 0.0005 };

export default function FuturesCard() {
  const {
    leverage, setLeverage, feeType, setFeeType,
    entryPrice, stopPrice, margin, setMargin,
    capital, setCapital,
  } = useStore();

  const entry    = parseFloat(entryPrice) || 0;
  const stop     = parseFloat(stopPrice)  || 0;
  const cap      = parseFloat(capital)    || 200;
  const mar      = parseFloat(margin)     || 20;
  const feeRate  = FEE_RATES[feeType];
  const posSize  = mar * leverage;
  const feeTot   = posSize * feeRate * 2;
  const feeOpen  = posSize * feeRate;
  const feeClose = posSize * feeRate;

  const liqDistPct = (1 / leverage) * 100;
  const liqPrice   = entry > 0 ? entry * (1 - 1 / leverage) : 0;

  let profit = 0, loss = 0, roiWin = 0, roiLoss = 0, be = 0;
  if (entry > 0 && stop > 0) {
    const riskPerUnit = Math.abs(entry - stop);
    const tokens      = posSize / entry;
    profit   = tokens * riskPerUnit * 2 - feeTot; // 1:2 RR
    loss     = tokens * riskPerUnit + feeTot;
    roiWin   = cap > 0 ? (profit / cap * 100) : 0;
    roiLoss  = cap > 0 ? (loss   / cap * 100) : 0;
    be       = entry + (feeOpen / tokens);
  }

  const liqPct = Math.min(liqDistPct / 10 * 100, 100);
  const liqCol = liqDistPct > 5 ? 'var(--green)' : liqDistPct > 2 ? 'var(--amber)' : 'var(--red)';
  const danger = liqDistPct <= 2;
  const warn   = !danger && liqDistPct <= 5;

  const levPct = ((leverage - 1) / 124) * 100;

  const showWarn = leverage >= 10;
  const riskPct  = cap > 0 ? loss / cap * 100 : 0;

  return (
    <AccentCard colors="linear-gradient(90deg,#ff3d5a,#ffb82e,#ff6b35)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.04em' }}>⚡ Futures Calculator</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '.06em', background: 'rgba(255,184,46,0.12)', color: 'var(--amber)', border: '1px solid rgba(255,184,46,0.25)' }}>FUTURES</span>
      </div>

      {/* Capital + Margin */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Total Capital ($)</div>
          <NumInput value={capital} onChange={setCapital} step={10} min={1} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Margin Used ($)</div>
          <NumInput value={margin} onChange={setMargin} step={5} min={1} />
        </div>
      </div>

      {/* Leverage slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 88, flexShrink: 0 }}>Leverage</span>
        <div style={{ flex: 1 }}>
          <input type="range" min={1} max={125} value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            style={{ width: '100%', WebkitAppearance: 'none', appearance: 'none', height: 4, borderRadius: 2, outline: 'none', cursor: 'pointer',
              background: `linear-gradient(90deg, var(--amber) 0%, var(--amber) ${levPct}%, var(--bg4) ${levPct}%)` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '0 1px', marginTop: 2 }}>
            {['1×','10×','25×','50×','75×','100×','125×'].map(t => <span key={t}>{t}</span>)}
          </div>
        </div>
        <span style={{ fontSize: 22, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', minWidth: 54, textAlign: 'right' }}>{leverage}×</span>
      </div>

      {/* Fee type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 88, flexShrink: 0 }}>Fee Type</span>
        {(['maker', 'taker'] as const).map(f => (
          <button key={f} onClick={() => setFeeType(f)} style={{
            padding: '4px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: `1px solid ${feeType === f ? 'var(--amber)' : 'var(--border2)'}`,
            background: feeType === f ? 'rgba(255,184,46,0.1)' : 'var(--bg3)',
            color: feeType === f ? 'var(--amber)' : 'var(--text2)',
            transition: 'all .15s',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'maker' ? '0.02%' : '0.05%'}
          </button>
        ))}
      </div>

      {/* Liquidation distance */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Liquidation Distance</span>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: liqCol }}>{liqDistPct.toFixed(2)}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ height: '100%', borderRadius: 4, width: liqPct + '%', background: liqCol, transition: 'width .4s, background .4s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3 }}>
          <span style={{ color: 'var(--red)' }}>Liq</span><span>Entry</span><span style={{ color: 'var(--green)' }}>TP</span>
        </div>
      </div>

      {/* Risk warning */}
      {showWarn && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', lineHeight: 1.5, marginBottom: 8, background: 'rgba(255,184,46,0.08)', border: '1px solid rgba(255,184,46,0.2)', color: '#ffd080' }}>
          ⚠ {leverage}× leverage: liquidation at {liqDistPct.toFixed(2)}% move. Keep stop well inside that distance. Fees eat ${feeTot.toFixed(3)} per trade (${mar} margin used).
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
        <MetricBox label="Position Size" value={'$' + posSize.toFixed(0)} sub={`${leverage}× × $${mar} margin`} />
        <MetricBox label="Liq. Price" value={entry > 0 ? fmtPrice(liqPrice) : '—'} sub="~1/leverage from entry" valueColor="var(--red)" danger={danger} />
        <MetricBox label="Profit (TP hit)" value={entry > 0 && profit > 0 ? '$' + profit.toFixed(2) : '—'} sub="after fees" valueColor="var(--green)" good={!!entry} />
        <MetricBox label="Loss (SL hit)" value={entry > 0 && loss > 0 ? '-$' + loss.toFixed(2) : '—'} sub="after fees" valueColor="var(--red)" />
        <MetricBox label="ROI Win" value={entry > 0 ? roiWin.toFixed(2) + '%' : '—'} sub="% of capital" valueColor="var(--green)" />
        <MetricBox label="ROI Loss" value={entry > 0 ? '-' + roiLoss.toFixed(2) + '%' : '—'} sub="% of capital" valueColor="var(--red)" />
        <MetricBox label="Risk % of Capital" value={entry > 0 ? riskPct.toFixed(2) + '%' : '—'} sub="loss / capital" valueColor="var(--amber)" warn={riskPct > 2} />
        <MetricBox label="Break-even" value={entry > 0 ? fmtPrice(be) : '—'} sub="covers open fee" valueColor="var(--blue)" />
      </div>

      {/* Fee row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 8 }}>
        <span style={{ color: 'var(--text3)' }}>Open fee</span><span style={{ fontWeight: 600 }}>${feeOpen.toFixed(3)}</span>
        <span style={{ color: 'var(--text3)', marginLeft: 12 }}>Close fee</span><span style={{ fontWeight: 600 }}>${feeClose.toFixed(3)}</span>
        <span style={{ color: 'var(--text3)', marginLeft: 12 }}>Total fees</span><span style={{ fontWeight: 600 }}>${feeTot.toFixed(3)}</span>
      </div>
    </AccentCard>
  );
}