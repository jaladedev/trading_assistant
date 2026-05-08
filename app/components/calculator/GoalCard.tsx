'use client';

import { useStore } from '@/lib/store';
import { Card } from '../ui';

const FEE_RATES: Record<string, number> = { maker: 0.0002, taker: 0.0005 };

export default function GoalCard() {
  const { capital, setCapital, goalPct, setGoalPct, margin, leverage, feeType, rrRatio, entryPrice, stopPrice } = useStore();

  const cap      = parseFloat(capital)  || 200;
  const gPct     = parseFloat(goalPct)  || 10;
  const mar      = parseFloat(margin)   || 20;
  const entry    = parseFloat(entryPrice) || 0;
  const stop     = parseFloat(stopPrice)  || 0;
  const feeRate  = FEE_RATES[feeType];
  const posSize  = mar * leverage;
  const feeTot   = posSize * feeRate * 2;
  const goalUSD  = cap * gPct / 100;
  const rrLabel  = `1:${rrRatio % 1 === 0 ? rrRatio : rrRatio.toFixed(1)}`;

  let perTrade = 0, tradesNeeded: number | string = '—', summaryText = '';

  if (entry > 0 && stop > 0) {
    const stopDistPct = Math.abs(entry - stop) / entry * 100;
    const grossProfit = posSize * stopDistPct / 100 * rrRatio;
    perTrade = grossProfit - feeTot;
    if (perTrade > 0) {
      tradesNeeded = Math.ceil(goalUSD / perTrade);
      const n = tradesNeeded as number;
      summaryText = `At ${leverage}× with $${mar} margin ($${cap} capital), each winning trade nets ~$${perTrade.toFixed(2)} (${rrLabel} RR). `
        + `You need ${n} winning trade${n > 1 ? 's' : ''} to hit the $${goalUSD.toFixed(2)} daily goal. `
        + `Fees total $${feeTot.toFixed(3)} per round-trip. `
        + (n <= 2
          ? `✓ Realistic with 1–2 clean 3-EMA setups.`
          : n <= 5
          ? `⚠ Requires ${n} wins — avoid overtrading.`
          : `✗ Too many trades needed — consider increasing margin or leverage cautiously.`);
    } else {
      summaryText = `⚠ Fees ($${feeTot.toFixed(3)}) exceed gross profit at this stop distance. Widen TP or reduce fees.`;
      tradesNeeded = '∞';
    }
  } else {
    summaryText = 'Set your Entry and Stop Loss in the R:R Calculator to see how many winning trades you need.';
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>🎯 Daily Goal Tracker</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>Goal %</span>
          <input type="number" value={goalPct} step={1} min={1} max={100} onChange={e => setGoalPct(e.target.value)}
            style={{ width: 64, padding: '4px 7px', fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 10 }}>
        {[
          { label: 'Goal ($)', val: '$' + goalUSD.toFixed(2), sub: gPct + '% of $' + cap, col: 'var(--green)' },
          { label: 'Per Win Trade', val: perTrade > 0 ? '$' + perTrade.toFixed(2) : '—', sub: 'after fees', col: undefined },
          { label: 'Trades Needed', val: String(tradesNeeded), sub: `at ${rrLabel} RR`, col: undefined },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '9px 10px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--mono)', fontWeight: 700, color: item.col }}>{item.val}</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: 2 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', padding: '7px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', lineHeight: 1.55 }}>
        {summaryText}
      </div>
    </Card>
  );
}