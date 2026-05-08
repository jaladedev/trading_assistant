'use client';

import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { Card, DirBtns, NumInput, InputRow, PillGroup, PillBtn } from '../ui';

const RR_PRESETS = [2, 1.5, 3, 5];

export default function RRCard() {
  const {
    currentDir, setCurrentDir, rrRatio, setRrRatio,
    entryPrice, setEntryPrice, stopPrice, setStopPrice,
    sizeUsd, setSizeUsd, tokens, setTokens,
    livePrice, sym,
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

  const tot    = parseFloat(riskUSD) + parseFloat(rwdUSD);
  const rp     = tot > 0 ? Math.round(parseFloat(riskUSD) / tot * 100) : Math.round(1 / (1 + rrRatio) * 100);

  const syncTokens = (e: string, s: string) => {
    const ep = parseFloat(e), sp = parseFloat(s);
    if (ep > 0 && sp > 0) setTokens((sp / ep).toFixed(6));
  };

  const handleEntryChange = (v: string) => {
    setEntryPrice(v);
    syncTokens(v, sizeUsd);
  };

  const handleSizeChange = (v: string) => {
    setSizeUsd(v);
    const ep = parseFloat(entryPrice);
    const sp = parseFloat(v);
    if (ep > 0 && sp > 0) setTokens((sp / ep).toFixed(6));
  };

  const handleTokensChange = (v: string) => {
    setTokens(v);
    const ep = parseFloat(entryPrice);
    const t  = parseFloat(v);
    if (ep > 0 && t > 0) setSizeUsd((t * ep).toFixed(2));
  };

  const useLivePrice = () => {
    if (!livePrice) return;
    const d = livePrice > 100 ? 2 : 4;
    handleEntryChange(livePrice.toFixed(d));
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>R:R Calculator</span>
        <DirBtns dir={currentDir} onChange={setCurrentDir} />
      </div>

      <InputRow label="Entry">
        <NumInput value={entryPrice} onChange={handleEntryChange} step={0.01} />
        <button onClick={useLivePrice} style={{ padding: '5px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .15s' }}>⟳ Live</button>
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

      <InputRow label="R:R Ratio" style={{ marginBottom: 6 }}>
        <NumInput value={rrRatio} onChange={v => setRrRatio(parseFloat(v) || 2)} step={0.1} min={0.5} max={10} style={{ width: 70, flex: 'none' }} />
        <PillGroup style={{ flex: 1, marginLeft: 4 }}>
          {RR_PRESETS.map(r => (
            <PillBtn key={r} active={rrRatio === r} onClick={() => setRrRatio(r)}>1:{r}</PillBtn>
          ))}
        </PillGroup>
      </InputRow>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Risk / unit', val: fmtPrice(r), sub: tok > 0 ? `${tok.toFixed(4)} ${ticker} = $${riskUSD}` : `$${size}`, col: undefined },
          { label: `${rrLabel} Target`, val: fmtPrice(target), sub: tok > 0 ? `${isLong?'+':'-'}$${rwdUSD}` : `${isLong?'+':'-'}$${rwdUSD}`, col: isLong ? 'var(--green)' : 'var(--red)' },
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
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginBottom: 3 }}>
          <span>Risk ${riskUSD}</span>
          <span style={{ color: 'var(--text)' }}>{rrLabel} RR</span>
          <span style={{ color: 'var(--green)' }}>Reward ${rwdUSD}</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--bg3)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'var(--red)', width: rp + '%', transition: 'width .3s' }} />
          <div style={{ position: 'absolute', top: 0, height: '100%', background: 'var(--green)', left: rp + '%', width: (100 - rp) + '%', transition: 'all .3s' }} />
        </div>
      </div>
    </Card>
  );
}