'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { Card, DirBtns, NumInput, InputRow, PillGroup, PillBtn } from '../ui';
import type { PartialTP } from '@/lib/store';

const RR_PRESETS = [2, 1.5, 3, 5];

// Default TP configs  [RR multiple, % of position]
const DEFAULT_TPS: [number, number][] = [
  [1.5, 33],
  [2.5, 34],
  [4,   33],
];

export default function RRCard() {
  const {
    currentDir, setCurrentDir, rrRatio, setRrRatio,
    entryPrice, setEntryPrice, stopPrice, setStopPrice,
    sizeUsd, setSizeUsd, tokens, setTokens,
    livePrice, sym,
    // Partial TPs (from store_additions)
    partialTPs, setPartialTPs, toggleTPHit,
    // ATR trailing stop
    atrTrailMult, setAtrTrailMult, atrTrailActive, setAtrTrailActive,
    trailingStopPrice, atrVals,
  } = useStore();

  const entry  = parseFloat(entryPrice) || 0;
  const stop   = parseFloat(stopPrice)  || 0;
  const size   = parseFloat(sizeUsd)    || 1;
  const tok    = parseFloat(tokens)     || (entry > 0 ? size / entry : 0);
  const isLong = currentDir === 'long';

  const r       = Math.abs(entry - stop);
  const target  = isLong ? entry + r * rrRatio : entry - r * rrRatio;
  const be      = isLong ? entry + r            : entry - r;
  const riskUSD = (r * tok).toFixed(2);
  const rwdUSD  = (r * rrRatio * tok).toFixed(2);
  const ticker  = sym.replace('USDT', '');
  const rrLabel = `1:${rrRatio % 1 === 0 ? rrRatio : rrRatio.toFixed(1)}`;

  const tot = parseFloat(riskUSD) + parseFloat(rwdUSD);
  const rp  = tot > 0 ? Math.round(parseFloat(riskUSD) / tot * 100) : Math.round(1 / (1 + rrRatio) * 100);

  const syncTokens = (e: string, s: string) => {
    const ep = parseFloat(e), sp = parseFloat(s);
    if (ep > 0 && sp > 0) setTokens((sp / ep).toFixed(6));
  };

  const handleEntryChange = (v: string) => { setEntryPrice(v); syncTokens(v, sizeUsd); };
  const handleSizeChange  = (v: string) => {
    setSizeUsd(v);
    const ep = parseFloat(entryPrice), sp = parseFloat(v);
    if (ep > 0 && sp > 0) setTokens((sp / ep).toFixed(6));
  };
  const handleTokensChange = (v: string) => {
    setTokens(v);
    const ep = parseFloat(entryPrice), t = parseFloat(v);
    if (ep > 0 && t > 0) setSizeUsd((t * ep).toFixed(2));
  };
  const useLivePrice = () => {
    if (!livePrice) return;
    handleEntryChange(livePrice.toFixed(livePrice > 100 ? 2 : 4));
  };

  // ── Rebuild partial TPs whenever entry/stop/size/dir change ──────────────
  useEffect(() => {
    if (!entry || !stop || r === 0 || tok === 0) return;
    const tps: PartialTP[] = DEFAULT_TPS.map(([ratio, pct], i) => {
      const price   = isLong ? entry + r * ratio : entry - r * ratio;
      const portion = tok * (pct / 100);
      const pnlUsd  = Math.abs(price - entry) * portion;
      return { ratio, pct, price, pnlUsd, hit: partialTPs[i]?.hit ?? false };
    });
    setPartialTPs(tps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPrice, stopPrice, sizeUsd, tokens, currentDir, rrRatio]);

  // ── ATR trailing stop ────────────────────────────────────────────────────
  const lastAtr = atrVals.length ? atrVals[atrVals.length - 1] : null;
  const atrTrailDisplay = lastAtr
    ? (isLong ? entry - lastAtr * atrTrailMult : entry + lastAtr * atrTrailMult)
    : null;

  // ── TP row edit handlers ──────────────────────────────────────────────────
  const updateTPRatio = (idx: number, val: string) => {
    const ratio = parseFloat(val);
    if (isNaN(ratio) || ratio <= 0 || !entry || !stop) return;
    const tps = partialTPs.map((t, i) => {
      if (i !== idx) return t;
      const price  = isLong ? entry + r * ratio : entry - r * ratio;
      const portion = tok * (t.pct / 100);
      return { ...t, ratio, price, pnlUsd: Math.abs(price - entry) * portion };
    });
    setPartialTPs(tps);
  };

  const updateTPPct = (idx: number, val: string) => {
    const pct = parseFloat(val);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    const tps = partialTPs.map((t, i) => {
      if (i !== idx) return t;
      const portion = tok * (pct / 100);
      return { ...t, pct, pnlUsd: Math.abs(t.price - entry) * portion };
    });
    setPartialTPs(tps);
  };

  const totalPnlIfAll = partialTPs.reduce((s, t) => s + t.pnlUsd, 0);
  const realised = partialTPs.filter(t => t.hit).reduce((s, t) => s + t.pnlUsd, 0);

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>⚖ R:R Calculator</span>
        <DirBtns dir={currentDir} onChange={setCurrentDir} />
      </div>

      {/* Inputs */}
      <InputRow label="Entry">
        <NumInput value={entryPrice} onChange={handleEntryChange} step={0.01} />
        <button onClick={useLivePrice} style={liveBtn}>⟳ Live</button>
      </InputRow>
      <InputRow label="Stop Loss">
        <NumInput value={stopPrice} onChange={setStopPrice} step={0.01} />
      </InputRow>
      <InputRow label="Size ($)">
        <NumInput value={sizeUsd} onChange={handleSizeChange} step={1} />
      </InputRow>
      <InputRow label="Tokens" style={{ marginBottom: 4 }}>
        <NumInput value={tokens} onChange={handleTokensChange} step={0.0001} placeholder="auto" />
      </InputRow>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 12, paddingLeft: 96 }}>
        Size ($) ÷ Entry = Tokens · edit either to sync
      </div>

      {/* RR Ratio */}
      <InputRow label="R:R Ratio" style={{ marginBottom: 6 }}>
        <NumInput value={rrRatio} onChange={v => setRrRatio(parseFloat(v) || 2)} step={0.1} min={0.5} max={10} style={{ width: 70, flex: 'none' }} />
        <PillGroup style={{ flex: 1, marginLeft: 4 }}>
          {RR_PRESETS.map(r => <PillBtn key={r} active={rrRatio === r} onClick={() => setRrRatio(r)}>1:{r}</PillBtn>)}
        </PillGroup>
      </InputRow>

      {/* Summary metrics */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Risk / unit', val: fmtPrice(r), sub: tok > 0 ? `${tok.toFixed(4)} ${ticker} = $${riskUSD}` : `$${size}`, col: undefined },
          { label: `${rrLabel} Target`, val: fmtPrice(target), sub: `${isLong?'+':'-'}$${rwdUSD}`, col: isLong ? 'var(--green)' : 'var(--red)' },
          { label: 'Break-even', val: fmtPrice(be), sub: '1:1 level', col: undefined },
        ].map(m => (
          <div key={m.label} style={{ flex: 1, minWidth: 80, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 17, fontFamily: 'var(--mono)', fontWeight: 600, color: m.col }}>{m.val}</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* RR bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginBottom: 3 }}>
          <span>Risk ${riskUSD}</span>
          <span style={{ color: 'var(--text)' }}>{rrLabel}</span>
          <span style={{ color: 'var(--green)' }}>Reward ${rwdUSD}</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--bg3)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: rp + '%', background: 'var(--red)', transition: 'width .3s' }} />
          <div style={{ flex: 1, background: 'var(--green)', transition: 'all .3s' }} />
        </div>
      </div>

      {/* ── Partial TP rows ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
          Partial Take-Profits
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 60px 72px 28px', gap: 4, marginBottom: 4, paddingRight: 2 }}>
          {['', 'Price', 'RR ×', '% Size', 'P&L $', '✓'].map(h => (
            <div key={h} style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
          ))}
        </div>

        {partialTPs.map((tp, i) => {
          const rowBg = tp.hit ? 'var(--green-bg)' : 'var(--bg3)';
          const rowBorder = tp.hit ? 'rgba(0,229,160,0.2)' : 'var(--border)';
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 80px 60px 72px 28px',
              gap: 4, alignItems: 'center', marginBottom: 5,
              padding: '7px 8px', background: rowBg,
              borderRadius: 'var(--radius-sm)', border: `1px solid ${rowBorder}`,
              opacity: tp.hit ? 0.7 : 1,
              transition: 'all .2s',
            }}>
              {/* Label */}
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>TP{i+1}</span>
              {/* Price */}
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: tp.hit ? 'var(--text3)' : 'var(--green)', textDecoration: tp.hit ? 'line-through' : 'none' }}>
                {entry > 0 ? fmtPrice(tp.price) : '—'}
              </span>
              {/* RR multiple input */}
              <input
                type="number"
                value={tp.ratio}
                step={0.1}
                min={0.1}
                onChange={e => updateTPRatio(i, e.target.value)}
                style={miniInput}
              />
              {/* % of position input */}
              <input
                type="number"
                value={tp.pct}
                step={1}
                min={1}
                max={100}
                onChange={e => updateTPPct(i, e.target.value)}
                style={miniInput}
              />
              {/* P&L */}
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: tp.hit ? 'var(--text3)' : 'var(--green)' }}>
                {entry > 0 ? `+$${tp.pnlUsd.toFixed(2)}` : '—'}
              </span>
              {/* Hit toggle */}
              <button
                onClick={() => toggleTPHit(i)}
                title={tp.hit ? 'Mark as not hit' : 'Mark as hit'}
                style={{
                  width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${tp.hit ? 'var(--green)' : 'var(--border2)'}`,
                  background: tp.hit ? 'var(--green-bg)' : 'var(--bg4)',
                  color: tp.hit ? 'var(--green)' : 'var(--text3)',
                  fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s',
                }}
              >
                {tp.hit ? '✓' : '○'}
              </button>
            </div>
          );
        })}

        {/* TP summary row */}
        {entry > 0 && partialTPs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--text3)' }}>All TPs hit</span>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>+${totalPnlIfAll.toFixed(2)}</span>
            {realised > 0 && (
              <>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>Realised</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>+${realised.toFixed(2)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── ATR Trailing Stop ────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '10px 12px', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            ATR Trailing Stop
          </span>
          <button
            onClick={() => setAtrTrailActive(!atrTrailActive)}
            style={{
              padding: '3px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${atrTrailActive ? 'var(--amber)' : 'var(--border2)'}`,
              background: atrTrailActive ? 'rgba(255,184,46,0.12)' : 'transparent',
              color: atrTrailActive ? 'var(--amber)' : 'var(--text3)',
              transition: 'all .15s',
            }}
          >
            {atrTrailActive ? '● ACTIVE' : '○ OFF'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 64 }}>Multiplier</span>
          <input
            type="range" min={0.5} max={5} step={0.1}
            value={atrTrailMult}
            onChange={e => setAtrTrailMult(parseFloat(e.target.value))}
            style={{ flex: 1, WebkitAppearance: 'none', appearance: 'none', height: 4, borderRadius: 2, cursor: 'pointer',
              background: `linear-gradient(90deg, var(--amber) 0%, var(--amber) ${((atrTrailMult - 0.5) / 4.5) * 100}%, var(--bg4) ${((atrTrailMult - 0.5) / 4.5) * 100}%)` }}
          />
          <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', minWidth: 32, textAlign: 'right' }}>{atrTrailMult}×</span>
        </div>

        {lastAtr !== null && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              ATR  <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{fmtPrice(lastAtr)}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              Initial trail  <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{entry > 0 && atrTrailDisplay !== null ? fmtPrice(atrTrailDisplay) : '—'}</span>
            </div>
            {trailingStopPrice !== null && atrTrailActive && (
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                Live trail  <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtPrice(trailingStopPrice)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const miniInput: React.CSSProperties = {
  width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: 'var(--mono)',
  background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border2)',
  borderRadius: 'var(--radius-sm)', outline: 'none',
};

const liveBtn: React.CSSProperties = {
  padding: '5px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .15s',
};