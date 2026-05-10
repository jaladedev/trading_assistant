'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtK } from '@/lib/indicators';
import IndicatorPanel from '@/components/chart/IndicatorPanel';

// ── Constants ─────────────────────────────────────────────────────────────────
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
const GC  = 'rgba(255,255,255,0.04)';
const TC  = 'rgba(255,255,255,0.22)';

const CHART = {
  visibleCandles:   80,
  padRight:         68,
  padLeft:           2,
  padTop:           12,
  padBottom:         6,
  candleWidthRatio:  0.6,
  pricePadPct:       0.06,
  gridDivisions:      4,
} as const;

// Colours
const COL = {
  ema9:       '#ff6b35',
  ema20:      '#4da6ff',
  ema50:      '#a78bff',
  vwap:       '#00d4ff',
  vwapBand1:  'rgba(0,212,255,0.15)',
  vwapBand2:  'rgba(0,212,255,0.07)',
  bb:         'rgba(255,184,46,0.7)',
  bbFill:     'rgba(255,184,46,0.05)',
  superTrendBull: '#00e5a0',
  superTrendBear: '#ff3d5a',
  psar:       '#ffb82e',
  bull:       '#00e5a0',
  bear:       '#ff3d5a',
  macdLine:   '#4da6ff',
  macdSig:    '#ff6b35',
  macdBull:   'rgba(0,229,160,0.7)',
  macdBear:   'rgba(255,61,90,0.7)',
  rsi:        '#ffb82e',
  stochK:     '#4da6ff',
  stochD:     '#ff6b35',
  adx:        '#a78bff',
  plusDI:     '#00e5a0',
  minusDI:    '#ff3d5a',
  obv:        '#00d4ff',
  willR:      '#ff6b35',
  cci:        '#a78bff',
  cvdLine:    '#e0c0ff',
  grid:       GC,
  text:       TC,
};

// ── Canvas helper ─────────────────────────────────────────────────────────────
function setupCanvas(el: HTMLCanvasElement, heightPx?: number) {
  const parent = el.parentElement!;
  const w = (parent.clientWidth - 20) || 600;
  const h = heightPx ?? (el.getBoundingClientRect().height || parseInt(el.style.height) || 220);
  if (el.width !== w * DPR || el.height !== h * DPR) {
    el.width        = w * DPR;
    el.height       = h * DPR;
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
  }
  const ctx = el.getContext('2d')!;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { ctx, w, h };
}

// ── Pane coordinate helper ────────────────────────────────────────────────────
function makePaneCoords(w: number, h: number, padR = 68, padL = 2, padT = 4, padB = 4, n = 80) {
  const cW = w - padR - padL;
  const cH = h - padT - padB;
  const cw = cW / n;
  const tx = (i: number) => padL + i * cw + cw / 2;
  return { cW, cH, cw, padL, padR, padT, padB, tx };
}

// ── Generic oscillator pane (RSI / Stoch / Williams / CCI style) ──────────────
function drawOscillatorPane(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  series: (number | null)[], color: string,
  lo: number, hi: number,
  levels: Array<{ v: number; col?: string; dash?: boolean }>,
  n: number,
  series2?: { vals: (number | null)[]; color: string },
) {
  const { cW, cH, cw, padL, padT, padB } = makePaneCoords(w, h, 68, 2, 4, 4, n);
  const range = hi - lo || 1;
  const ty = (v: number) => padT + (1 - (v - lo) / range) * cH;
  const startI = n - series.length;

  // Level lines
  levels.forEach(lv => {
    ctx.strokeStyle = lv.col ?? GC;
    ctx.lineWidth = 0.5;
    if (lv.dash) ctx.setLineDash([3, 3]); else ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(padL, ty(lv.v)); ctx.lineTo(padL + cW, ty(lv.v)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(String(lv.v), padL + cW + 4, ty(lv.v) + 3.5);
  });

  // Main series
  const pts = series
    .map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v) } : null)
    .filter(Boolean) as { x: number; y: number }[];

  if (pts.length > 1) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }

  // Optional second series (e.g. Stoch D)
  if (series2) {
    const pts2 = series2.vals
      .map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v) } : null)
      .filter(Boolean) as { x: number; y: number }[];
    if (pts2.length > 1) {
      ctx.strokeStyle = series2.color; ctx.lineWidth = 1; ctx.lineJoin = 'round';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      pts2.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CandleChart() {
  const [showPanel, setShowPanel] = useState(false);

  // Canvas refs
  const priceRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const macdRef    = useRef<HTMLCanvasElement>(null);
  const rsiRef     = useRef<HTMLCanvasElement>(null);
  const stochRef   = useRef<HTMLCanvasElement>(null);
  const adxRef     = useRef<HTMLCanvasElement>(null);
  const willRRef   = useRef<HTMLCanvasElement>(null);
  const cciRef     = useRef<HTMLCanvasElement>(null);
  const volRef     = useRef<HTMLCanvasElement>(null);
  const obvRef     = useRef<HTMLCanvasElement>(null);
  const cvdRef     = useRef<HTMLCanvasElement>(null);
  const ttRef      = useRef<HTMLDivElement>(null);
  const hoverIdx   = useRef(-1);

  const {
    candles, currentCandle, crossovers, suggestion, tf,
    e9s, e20s, e50s, e9, e20, e50,
    rsiVals, stochRsiK, stochRsiD,
    macdLine, macdSignal, macdHist,
    bbUpper, bbMiddle, bbLower,
    atrVals, stVals, stBull,
    adxVals, plusDI, minusDI,
    obvVals, willRVals, cciVals,
    psarVals, psarBull,
    vwapVals, vwapUpper1, vwapLower1, vwapUpper2, vwapLower2,
    cvdBarDeltas, cvdCumDeltas,
    patterns,
    activeIndicators,
  } = useStore();

  // ── All candles (committed + live) ────────────────────────────────────────
  const allCandles = useMemo(() => {
    if (!currentCandle) return candles;
    const last = candles[candles.length - 1];
    if (last && last.t === currentCandle.t) return candles;
    return [...candles, currentCandle];
  }, [candles, currentCandle]);

  const visCandles = useMemo(
    () => allCandles.slice(-CHART.visibleCandles),
    [allCandles],
  );

  const visOffset = useMemo(
    () => Math.max(0, allCandles.length - CHART.visibleCandles),
    [allCandles],
  );

  // ── Price pane coordinate factory ─────────────────────────────────────────
  function makePriceCoords(w: number, h: number) {
    const { padRight: padR, padLeft: padL, padTop: padT, padBottom: padB } = CHART;
    const cW  = w - padR - padL;
    const cH  = h - padT - padB;
    const n   = visCandles.length;
    const cw  = cW / n;
    const pMin = Math.min(...visCandles.map(c => c.l));
    const pMax = Math.max(...visCandles.map(c => c.h));

    // Expand range to include BB / ST / PSAR if active
    let extMin = pMin, extMax = pMax;
    if (activeIndicators.bb) {
      bbUpper.slice(visOffset).forEach(v => { if (v) extMax = Math.max(extMax, v); });
      bbLower.slice(visOffset).forEach(v => { if (v) extMin = Math.min(extMin, v); });
    }
    if (activeIndicators.superTrend) {
      stVals.slice(visOffset).forEach(v => { if (v) { extMin = Math.min(extMin, v); extMax = Math.max(extMax, v); } });
    }

    const pad  = (extMax - extMin) * CHART.pricePadPct || extMax * 0.001;
    const plo  = extMin - pad;
    const phi  = extMax + pad;
    const pR   = phi - plo || 1;
    const tx   = (i: number) => padL + i * cw + cw / 2;
    const ty   = (p: number) => padT + cH - (p - plo) / pR * cH;
    return { cW, cH, cw, plo, phi, pR, padL, padT, tx, ty, n };
  }

  // ── Draw Price Pane ───────────────────────────────────────────────────────
  const drawPrice = useCallback(() => {
    const el = priceRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    const n = visCandles.length;
    if (n < 2) return;
    const { cW, cH, plo, phi, pR, padL, padT, tx, ty } = makePriceCoords(w, h);

    ctx.clearRect(0, 0, w, h);

    // Grid
    for (let i = 0; i <= CHART.gridDivisions; i++) {
      const y = padT + cH * i / CHART.gridDivisions;
      ctx.strokeStyle = GC; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(phi - pR * i / CHART.gridDivisions), padL + cW + 4, y + 3.5);
    }

    // Suggestion levels
    if (suggestion?.entry && suggestion?.stop) {
      const levels = [
        { price: suggestion.entry,  color: 'rgba(77,166,255,0.7)',  label: 'ENT '  + fmtPrice(suggestion.entry)  },
        { price: suggestion.stop,   color: 'rgba(255,61,90,0.6)',   label: 'SL '   + fmtPrice(suggestion.stop)   },
        { price: suggestion.target, color: 'rgba(0,229,160,0.6)',   label: 'TP '   + fmtPrice(suggestion.target) },
      ];
      ctx.setLineDash([4, 4]);
      levels.forEach(lv => {
        if (!lv.price || lv.price < plo || lv.price > phi) return;
        const ly = ty(lv.price);
        ctx.strokeStyle = lv.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + cW, ly); ctx.stroke();
        ctx.fillStyle = lv.color; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(lv.label, padL + cW + 4, ly + 3.5);
      });
      ctx.setLineDash([]);
    }

    // ── Bollinger Bands ───────────────────────────────────────────────────
    if (activeIndicators.bb) {
      const ubSlice = bbUpper.slice(visOffset);
      const mbSlice = bbMiddle.slice(visOffset);
      const lbSlice = bbLower.slice(visOffset);
      const startI  = n - ubSlice.length;

      // Fill
      ctx.beginPath();
      ubSlice.forEach((v, i) => { if (v == null) return; ctx[i === 0 ? 'moveTo' : 'lineTo'](tx(startI + i), ty(v)); });
      lbSlice.slice().reverse().forEach((v, i) => { if (v == null) return; ctx.lineTo(tx(startI + lbSlice.length - 1 - i), ty(v)); });
      ctx.closePath();
      ctx.fillStyle = COL.bbFill; ctx.fill();

      // Lines
      ['upper' as const, 'middle' as const, 'lower' as const].forEach((band, bi) => {
        const slice = bi === 0 ? ubSlice : bi === 1 ? mbSlice : lbSlice;
        ctx.strokeStyle = COL.bb; ctx.lineWidth = bi === 1 ? 0.8 : 1; ctx.lineJoin = 'round';
        if (bi === 1) ctx.setLineDash([3, 3]);
        ctx.beginPath(); let started = false;
        slice.forEach((v, i) => {
          if (v == null) { started = false; return; }
          if (!started) { ctx.moveTo(tx(startI + i), ty(v)); started = true; } else ctx.lineTo(tx(startI + i), ty(v));
        });
        ctx.stroke(); ctx.setLineDash([]);
      });
    }

    // ── VWAP ──────────────────────────────────────────────────────────────
    if (activeIndicators.vwap) {
      const vSlice = vwapVals.slice(visOffset);
      const startI = n - vSlice.length;

      if (activeIndicators.vwapBands) {
        // ±2σ fill
        const u2 = vwapUpper2.slice(visOffset);
        const l2 = vwapLower2.slice(visOffset);
        ctx.beginPath();
        u2.forEach((v, i) => { if (v == null) return; ctx[i === 0 ? 'moveTo' : 'lineTo'](tx(startI + i), ty(v)); });
        l2.slice().reverse().forEach((v, i) => { if (v == null) return; ctx.lineTo(tx(startI + l2.length - 1 - i), ty(v)); });
        ctx.closePath(); ctx.fillStyle = COL.vwapBand2; ctx.fill();

        // ±1σ fill
        const u1 = vwapUpper1.slice(visOffset);
        const l1 = vwapLower1.slice(visOffset);
        ctx.beginPath();
        u1.forEach((v, i) => { if (v == null) return; ctx[i === 0 ? 'moveTo' : 'lineTo'](tx(startI + i), ty(v)); });
        l1.slice().reverse().forEach((v, i) => { if (v == null) return; ctx.lineTo(tx(startI + l1.length - 1 - i), ty(v)); });
        ctx.closePath(); ctx.fillStyle = COL.vwapBand1; ctx.fill();

        // Band lines (dashed, subtle)
        [u1, l1, u2, l2].forEach((sl, idx) => {
          ctx.strokeStyle = idx < 2 ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.2)';
          ctx.lineWidth = 0.6; ctx.setLineDash([2, 4]);
          ctx.beginPath(); let started = false;
          sl.forEach((v, i) => {
            if (v == null) { started = false; return; }
            if (!started) { ctx.moveTo(tx(startI + i), ty(v)); started = true; } else ctx.lineTo(tx(startI + i), ty(v));
          });
          ctx.stroke(); ctx.setLineDash([]);
        });
      }

      // Main VWAP line
      ctx.strokeStyle = COL.vwap; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); let vs = false;
      vSlice.forEach((v, i) => {
        if (v == null) { vs = false; return; }
        if (!vs) { ctx.moveTo(tx(startI + i), ty(v)); vs = true; } else ctx.lineTo(tx(startI + i), ty(v));
      });
      ctx.stroke(); ctx.setLineDash([]);

      // Label
      const lastV = [...vSlice].reverse().find(v => v != null) as number | undefined;
      if (lastV != null) {
        ctx.fillStyle = COL.vwap; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText('VWAP ' + fmtPrice(lastV), padL + cW + 4, ty(lastV) + 3.5);
      }
    }

    // ── SuperTrend ────────────────────────────────────────────────────────
    if (activeIndicators.superTrend) {
      const stSlice   = stVals.slice(visOffset);
      const bullSlice = stBull.slice(visOffset);
      const startI    = n - stSlice.length;
      ctx.lineWidth = 2; ctx.lineJoin = 'round';
      let prevBull = bullSlice[0];
      ctx.beginPath(); let started = false;
      stSlice.forEach((v, i) => {
        if (v == null) { started = false; return; }
        const bull = bullSlice[i];
        if (bull !== prevBull || !started) {
          if (started) ctx.stroke();
          ctx.strokeStyle = bull ? COL.superTrendBull : COL.superTrendBear;
          ctx.beginPath(); ctx.moveTo(tx(startI + i), ty(v));
          started = true; prevBull = bull;
        } else { ctx.lineTo(tx(startI + i), ty(v)); }
      });
      if (started) ctx.stroke();
    }

    // ── Parabolic SAR ─────────────────────────────────────────────────────
    if (activeIndicators.psar) {
      const psSlice = psarVals.slice(visOffset);
      const pbSlice = psarBull.slice(visOffset);
      const startI  = n - psSlice.length;
      psSlice.forEach((v, i) => {
        if (v == null) return;
        const bull = pbSlice[i];
        ctx.fillStyle = COL.psar;
        ctx.beginPath();
        ctx.arc(tx(startI + i), ty(v), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ── EMA lines ─────────────────────────────────────────────────────────
    const emaLines: [(number | null)[], string, boolean][] = [
      [e50s.slice(visOffset), COL.ema50, activeIndicators.ema50],
      [e20s.slice(visOffset), COL.ema20, activeIndicators.ema20],
      [e9s.slice(visOffset),  COL.ema9,  activeIndicators.ema9],
    ];
    emaLines.forEach(([vals, col, show]) => {
      if (!show || !vals || vals.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => {
        if (v == null) { started = false; return; }
        const xi = tx(i), yi = ty(v);
        if (!started) { ctx.moveTo(xi, yi); started = true; } else ctx.lineTo(xi, yi);
      });
      ctx.stroke();
    });

    // ── Candles ───────────────────────────────────────────────────────────
    const cw2 = (w - CHART.padRight - CHART.padLeft) / n;
    visCandles.forEach((c, i) => {
      const x      = tx(i);
      const bw     = Math.max(2, cw2 * CHART.candleWidthRatio);
      const isLast = i === n - 1;
      const col    = isLast ? '#888' : (c.c >= c.o ? COL.bull : COL.bear);
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, ty(c.h)); ctx.lineTo(x, ty(c.l)); ctx.stroke();
      const bT = ty(Math.max(c.o, c.c)), bB = ty(Math.min(c.o, c.c));
      ctx.fillStyle = isLast ? 'rgba(140,140,140,0.5)' : col;
      ctx.fillRect(x - bw / 2, bT, bw, Math.max(1, bB - bT));
    });

    // ── Crossover markers ─────────────────────────────────────────────────
    crossovers.forEach((x: { idx: number; price: number; type: string }) => {
      const vi = x.idx - visOffset;
      if (vi < 0 || vi >= n) return;
      const candle = allCandles[x.idx];
      if (!candle) return;
      ctx.fillStyle = x.type === 'bull' ? 'rgba(0,229,160,0.9)' : 'rgba(255,61,90,0.9)';
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(x.type === 'bull' ? '▲' : '▼', tx(vi), ty(candle.l) + 14);
    });

    // ── Candlestick pattern markers ───────────────────────────────────────
    if (activeIndicators.patterns) {
      const patSlice = patterns.slice(visOffset);
      patSlice.forEach((pats, i) => {
        if (!pats || pats.length === 0) return;
        const candle = visCandles[i];
        if (!candle) return;
        const bull = pats.some(p => p.bull);
        ctx.fillStyle = bull ? 'rgba(0,229,160,0.8)' : 'rgba(255,61,90,0.8)';
        ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
        const label = pats[0].label;
        ctx.fillText(label, tx(i), bull ? ty(candle.l) + 22 : ty(candle.h) - 6);
      });
    }

    // ── X-axis time labels ────────────────────────────────────────────────
    const step = Math.max(1, Math.floor(n / 6));
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    for (let i = step; i < n - 1; i += step) {
      const c = visCandles[i];
      if (!c?.t) continue;
      const d     = new Date(c.t);
      const hh    = d.getHours().toString().padStart(2, '0');
      const mm    = d.getMinutes().toString().padStart(2, '0');
      const label = tf === '1d' ? `${d.getMonth() + 1}/${d.getDate()}` : `${hh}:${mm}`;
      ctx.fillText(label, tx(i), h - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visCandles, allCandles, visOffset, e9s, e20s, e50s, bbUpper, bbMiddle, bbLower,
      vwapVals, vwapUpper1, vwapLower1, vwapUpper2, vwapLower2,
      stVals, stBull, psarVals, psarBull, crossovers, patterns, suggestion, tf, activeIndicators]);

  // ── Crosshair overlay ─────────────────────────────────────────────────────
  const drawCrosshair = useCallback((idx: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    if (idx < 0 || idx >= visCandles.length) return;
    const { cH, padL, padT, tx } = makePriceCoords(w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(tx(idx), padT); ctx.lineTo(tx(idx), padT + cH); ctx.stroke();
    ctx.setLineDash([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visCandles]);

  // ── Draw MACD ─────────────────────────────────────────────────────────────
  const drawMACD = useCallback(() => {
    const el = macdRef.current;
    if (!el || !activeIndicators.macd) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);

    const hSlice = macdHist.slice(visOffset);
    const lSlice = macdLine.slice(visOffset);
    const sSlice = macdSignal.slice(visOffset);
    const startI = n - hSlice.length;

    const allVals = [...hSlice, ...lSlice, ...sSlice].filter(v => v != null) as number[];
    if (!allVals.length) return;
    const loV = Math.min(...allVals), hiV = Math.max(...allVals);
    const range = hiV - loV || 1;
    const midY  = padT + cH / 2;
    const ty    = (v: number) => padT + (1 - (v - loV) / range) * cH;

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + cW, midY); ctx.stroke();

    // Histogram bars
    hSlice.forEach((v, i) => {
      if (v == null) return;
      const barH = Math.abs(ty(v) - ty(0));
      ctx.fillStyle = v >= 0 ? COL.macdBull : COL.macdBear;
      ctx.fillRect(padL + (startI + i) * cw + 1, v >= 0 ? ty(v) : ty(0), Math.max(1, cw - 2), Math.max(1, barH));
    });

    // MACD + Signal lines
    [[lSlice, COL.macdLine, 1.5], [sSlice, COL.macdSig, 1]].forEach(([sl, col, lw]) => {
      const series = sl as (number | null)[];
      ctx.strokeStyle = col as string; ctx.lineWidth = lw as number; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      series.forEach((v, i) => {
        if (v == null) { started = false; return; }
        if (!started) { ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)); started = true; }
        else ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v));
      });
      ctx.stroke();
    });

    // Label
    const lastM = [...lSlice].reverse().find(v => v != null);
    const lastS = [...sSlice].reverse().find(v => v != null);
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    if (lastM != null) ctx.fillText('M ' + (lastM as number).toFixed(4), padL + cW + 4, padT + 10);
    if (lastS != null) ctx.fillText('S ' + (lastS as number).toFixed(4), padL + cW + 4, padT + 20);
  }, [macdHist, macdLine, macdSignal, visOffset, activeIndicators.macd]);

  // ── Draw RSI ──────────────────────────────────────────────────────────────
  const drawRSI = useCallback(() => {
    const el = rsiRef.current;
    if (!el || !activeIndicators.rsi) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    const rv = rsiVals.slice(visOffset);

    // Overbought/sold fills
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
    const ty = (v: number) => padT + (100 - v) / 100 * cH;
    ctx.fillStyle = 'rgba(255,61,90,0.05)';
    ctx.fillRect(padL, padT, cW, ty(70) - padT);
    ctx.fillStyle = 'rgba(0,229,160,0.05)';
    ctx.fillRect(padL, ty(30), cW, padT + cH - ty(30));

    drawOscillatorPane(ctx, w, h, rv, COL.rsi, 0, 100,
      [{ v: 70, col: 'rgba(255,61,90,0.3)', dash: true },
       { v: 50, col: 'rgba(255,255,255,0.08)' },
       { v: 30, col: 'rgba(0,229,160,0.3)', dash: true }],
      n);

    // Gradient fill under RSI
    const startI = n - rv.length;
    const validPts = rv
      .map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v as number) } : null)
      .filter(Boolean) as { x: number; y: number }[];
    if (validPts.length > 1) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
      grad.addColorStop(0, 'rgba(255,184,46,0.15)');
      grad.addColorStop(1, 'rgba(255,184,46,0)');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, padT + cH);
      validPts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(validPts[validPts.length - 1].x, padT + cH);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }
  }, [rsiVals, visOffset, activeIndicators.rsi]);

  // ── Draw Stoch RSI ────────────────────────────────────────────────────────
  const drawStochRSI = useCallback(() => {
    const el = stochRef.current;
    if (!el || !activeIndicators.stochRsi) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n  = CHART.visibleCandles;
    const kv = stochRsiK.slice(visOffset);
    const dv = stochRsiD.slice(visOffset);
    drawOscillatorPane(ctx, w, h, kv, COL.stochK, 0, 100,
      [{ v: 80, col: 'rgba(255,61,90,0.3)', dash: true },
       { v: 50, col: 'rgba(255,255,255,0.08)' },
       { v: 20, col: 'rgba(0,229,160,0.3)', dash: true }],
      n, { vals: dv, color: COL.stochD });
  }, [stochRsiK, stochRsiD, visOffset, activeIndicators.stochRsi]);

  // ── Draw ADX ──────────────────────────────────────────────────────────────
  const drawADX = useCallback(() => {
    const el = adxRef.current;
    if (!el || !activeIndicators.adx) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n   = CHART.visibleCandles;
    const av  = adxVals.slice(visOffset);
    const pv  = plusDI.slice(visOffset);
    const mv  = minusDI.slice(visOffset);
    drawOscillatorPane(ctx, w, h, av, COL.adx, 0, 100,
      [{ v: 25, col: 'rgba(167,139,255,0.3)', dash: true },
       { v: 50, col: 'rgba(255,255,255,0.06)' }],
      n);
    // +DI and -DI
    [{ vals: pv, col: COL.plusDI }, { vals: mv, col: COL.minusDI }].forEach(({ vals, col }) => {
      const { cW, cw, padL, padT, cH } = makePaneCoords(w, h, 68, 2, 4, 4, n);
      const startI = n - vals.length;
      const ty = (v: number) => padT + (1 - v / 100) * cH;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.lineJoin = 'round';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => {
        if (v == null) { started = false; return; }
        if (!started) { ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)); started = true; }
        else ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v));
      });
      ctx.stroke(); ctx.setLineDash([]);
    });
  }, [adxVals, plusDI, minusDI, visOffset, activeIndicators.adx]);

  // ── Draw Williams %R ──────────────────────────────────────────────────────
  const drawWillR = useCallback(() => {
    const el = willRRef.current;
    if (!el || !activeIndicators.williamsR) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n  = CHART.visibleCandles;
    const wv = willRVals.slice(visOffset);
    drawOscillatorPane(ctx, w, h, wv, COL.willR, -100, 0,
      [{ v: -20, col: 'rgba(255,61,90,0.3)', dash: true },
       { v: -50, col: 'rgba(255,255,255,0.08)' },
       { v: -80, col: 'rgba(0,229,160,0.3)', dash: true }],
      n);
  }, [willRVals, visOffset, activeIndicators.williamsR]);

  // ── Draw CCI ──────────────────────────────────────────────────────────────
  const drawCCI = useCallback(() => {
    const el = cciRef.current;
    if (!el || !activeIndicators.cci) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n  = CHART.visibleCandles;
    const cv = cciVals.slice(visOffset);
    const allV = cv.filter(v => v != null) as number[];
    const lo = Math.min(-200, ...allV);
    const hi = Math.max(200,  ...allV);
    drawOscillatorPane(ctx, w, h, cv, COL.cci, lo, hi,
      [{ v: 100,  col: 'rgba(255,61,90,0.3)', dash: true },
       { v: 0,    col: 'rgba(255,255,255,0.08)' },
       { v: -100, col: 'rgba(0,229,160,0.3)', dash: true }],
      n);
  }, [cciVals, visOffset, activeIndicators.cci]);

  // ── Draw Volume ───────────────────────────────────────────────────────────
  const drawVol = useCallback(() => {
    const el = volRef.current;
    if (!el || !activeIndicators.volume) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    if (!visCandles.length) return;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 2, visCandles.length);
    const maxV = Math.max(...visCandles.map(c => c.v));
    const avgV = visCandles.reduce((a, c) => a + c.v, 0) / visCandles.length;
    const avgY = padT + cH - (avgV / maxV) * cH;

    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, avgY); ctx.lineTo(padL + cW, avgY); ctx.stroke();
    ctx.setLineDash([]);

    visCandles.forEach((c, i) => {
      const isLast   = i === visCandles.length - 1;
      const aboveAvg = c.v > avgV;
      ctx.fillStyle = isLast
        ? 'rgba(150,148,138,0.3)'
        : c.c >= c.o
          ? (aboveAvg ? 'rgba(0,229,160,0.55)' : 'rgba(0,229,160,0.25)')
          : (aboveAvg ? 'rgba(255,61,90,0.55)'  : 'rgba(255,61,90,0.25)');
      const bH = Math.max(1, (c.v / maxV) * cH);
      ctx.fillRect(padL + i * cw + 1, padT + cH - bH, Math.max(1, cw - 2), bH);
    });

    // Avg vol label
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText('avg ' + fmtK(avgV), padL + cW + 4, avgY + 3.5);
  }, [visCandles, activeIndicators.volume]);

  // ── Draw OBV ──────────────────────────────────────────────────────────────
  const drawOBV = useCallback(() => {
    const el = obvRef.current;
    if (!el || !activeIndicators.obv) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n  = CHART.visibleCandles;
    const ov = obvVals.slice(visOffset);
    if (ov.length < 2) return;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
    const lo = Math.min(...ov), hi = Math.max(...ov);
    const range = hi - lo || 1;
    const ty = (v: number) => padT + (1 - (v - lo) / range) * cH;
    const startI = n - ov.length;

    ctx.strokeStyle = COL.obv; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ov.forEach((v, i) => i === 0 ? ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)) : ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v)));
    ctx.stroke();

    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(fmtK(ov[ov.length - 1]), padL + cW + 4, ty(ov[ov.length - 1]) + 3.5);
  }, [obvVals, visOffset, activeIndicators.obv]);

  // ── Draw CVD ──────────────────────────────────────────────────────────────
  const drawCVD = useCallback(() => {
    const el = cvdRef.current;
    if (!el || !activeIndicators.cvd) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const barSlice = cvdBarDeltas.slice(visOffset);
    const cumSlice = cvdCumDeltas.slice(visOffset);
    const n = visCandles.length;
    if (!barSlice.length || n < 2) return;

    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 6, 4, n);
    const maxBarAbs = Math.max(...barSlice.map(Math.abs), 1);
    const midY      = padT + cH / 2;
    const barScale  = (cH / 2) / maxBarAbs;
    const cumMin    = Math.min(...cumSlice), cumMax = Math.max(...cumSlice);
    const cumRng    = (cumMax - cumMin) || 1;
    const tyCum     = (v: number) => padT + (1 - (v - cumMin) / cumRng) * cH;

    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + cW, midY); ctx.stroke();
    ctx.setLineDash([]);

    barSlice.forEach((delta, i) => {
      const barH = Math.max(1, Math.abs(delta) * barScale);
      ctx.fillStyle = delta >= 0 ? 'rgba(0,229,160,0.45)' : 'rgba(255,61,90,0.45)';
      ctx.fillRect(padL + i * cw + 1, delta >= 0 ? midY - barH : midY, Math.max(1, cw - 2), barH);
    });

    const cumPts = cumSlice.map((v, i) => ({ x: padL + i * cw + cw / 2, y: tyCum(v) }));
    if (cumPts.length > 1) {
      ctx.strokeStyle = COL.cvdLine; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      cumPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    const lastCum = cumSlice[cumSlice.length - 1];
    if (lastCum != null) {
      ctx.fillStyle = COL.cvdLine; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtK(lastCum), padL + cW + 4, tyCum(lastCum) + 3.5);
    }
  }, [cvdBarDeltas, cvdCumDeltas, visCandles, visOffset, activeIndicators.cvd]);

  // ── Hover tooltip ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const el = overlayRef.current;
    const tt = ttRef.current;
    if (!el || !tt) return;
    const rect = el.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const n    = visCandles.length;
    const cW   = rect.width - CHART.padRight - CHART.padLeft;
    const i    = Math.floor((mx - CHART.padLeft) / (cW / n));
    if (i < 0 || i >= n) { tt.style.opacity = '0'; hoverIdx.current = -1; drawCrosshair(-1); return; }
    hoverIdx.current = i;
    drawCrosshair(i);

    const c      = visCandles[i];
    const absIdx = visOffset + i;
    const chPct  = c.o ? ((c.c - c.o) / c.o * 100).toFixed(2) : '0.00';
    const col    = c.c >= c.o ? COL.bull : COL.bear;

    const rows: [string, string, string?][] = [
      ['O',   fmtPrice(c.o)],
      ['H',   fmtPrice(c.h)],
      ['L',   fmtPrice(c.l)],
      ['C',   fmtPrice(c.c), col],
      ['Chg', (c.c >= c.o ? '+' : '') + chPct + '%', col],
      ['Vol', fmtK(c.v)],
    ];

    // Indicator values at hover
    const maybeAdd = (label: string, arr: (number | null | undefined)[], color?: string, fmt?: (v: number) => string) => {
      const v = arr[absIdx];
      if (v != null) rows.push([label, fmt ? fmt(v as number) : fmtPrice(v as number), color]);
    };

    if (activeIndicators.vwap)  maybeAdd('VWAP', vwapVals,   COL.vwap);
    if (activeIndicators.ema9)  maybeAdd('E9',   e9s,        COL.ema9);
    if (activeIndicators.ema20) maybeAdd('E20',  e20s,       COL.ema20);
    if (activeIndicators.ema50) maybeAdd('E50',  e50s,       COL.ema50);
    if (activeIndicators.bb) {
      maybeAdd('BB↑', bbUpper,  COL.bb);
      maybeAdd('BB↓', bbLower,  COL.bb);
    }
    if (activeIndicators.superTrend) maybeAdd('ST', stVals, stBull[absIdx] ? COL.superTrendBull : COL.superTrendBear);
    if (activeIndicators.rsi)       maybeAdd('RSI',  rsiVals,  COL.rsi,   v => String(Math.round(v)));
    if (activeIndicators.macd) {
      maybeAdd('MACD',  macdLine,   COL.macdLine,  v => v.toFixed(4));
      maybeAdd('Sig',   macdSignal, COL.macdSig,   v => v.toFixed(4));
      maybeAdd('Hist',  macdHist,   undefined,     v => v.toFixed(4));
    }
    if (activeIndicators.stochRsi) {
      maybeAdd('SK', stochRsiK, COL.stochK, v => v.toFixed(1));
      maybeAdd('SD', stochRsiD, COL.stochD, v => v.toFixed(1));
    }
    if (activeIndicators.adx) {
      maybeAdd('ADX',  adxVals, COL.adx,     v => v.toFixed(1));
      maybeAdd('+DI',  plusDI,  COL.plusDI,  v => v.toFixed(1));
      maybeAdd('-DI',  minusDI, COL.minusDI, v => v.toFixed(1));
    }
    if (activeIndicators.williamsR) maybeAdd('%R',  willRVals, COL.willR, v => v.toFixed(1));
    if (activeIndicators.cci)       maybeAdd('CCI', cciVals,   COL.cci,   v => v.toFixed(1));
    if (activeIndicators.cvd) {
      const bd = cvdBarDeltas[absIdx];
      const cd = cvdCumDeltas[absIdx];
      if (bd != null) rows.push(['ΔVol', (bd >= 0 ? '+' : '') + fmtK(bd), bd >= 0 ? COL.bull : COL.bear]);
      if (cd != null) rows.push(['CVD',  (cd >= 0 ? '+' : '') + fmtK(cd), COL.cvdLine]);
    }

    // Pattern labels
    const pats = patterns[absIdx];
    if (pats?.length) rows.push(['Pat', pats.map(p => p.name).join(', ')]);

    tt.innerHTML = rows.map(([label, value, color]) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7">
        <span style="color:var(--text3)">${label}</span>
        <span style="font-weight:600${color ? `;color:${color}` : ''}">${value}</span>
      </div>`
    ).join('');

    tt.style.opacity = '1';
    tt.style.left    = Math.min(mx + 8, rect.width - 160) + 'px';
    tt.style.top     = Math.max(e.clientY - rect.top - 80, 4) + 'px';
  }, [visCandles, visOffset, e9s, e20s, e50s, rsiVals, stochRsiK, stochRsiD,
      macdLine, macdSignal, macdHist, bbUpper, bbLower, stVals, stBull,
      adxVals, plusDI, minusDI, willRVals, cciVals, vwapVals,
      cvdBarDeltas, cvdCumDeltas, patterns, activeIndicators, drawCrosshair]);

  const handleMouseLeave = useCallback(() => {
    if (ttRef.current) ttRef.current.style.opacity = '0';
    hoverIdx.current = -1; drawCrosshair(-1);
  }, [drawCrosshair]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    drawPrice(); drawMACD(); drawRSI(); drawStochRSI();
    drawADX(); drawWillR(); drawCCI(); drawVol(); drawOBV(); drawCVD();
  }, [drawPrice, drawMACD, drawRSI, drawStochRSI, drawADX, drawWillR, drawCCI, drawVol, drawOBV, drawCVD]);

  useEffect(() => {
    const handler = () => {
      drawPrice(); drawMACD(); drawRSI(); drawStochRSI();
      drawADX(); drawWillR(); drawCCI(); drawVol(); drawOBV(); drawCVD();
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [drawPrice, drawMACD, drawRSI, drawStochRSI, drawADX, drawWillR, drawCCI, drawVol, drawOBV, drawCVD]);

  // ── Derived display values ─────────────────────────────────────────────────
  const latestRSI = useMemo(
    () => rsiVals.filter(v => v !== null).slice(-1)[0] as number | undefined,
    [rsiVals],
  );
  const rsiColor = latestRSI !== undefined
    ? (latestRSI > 70 ? COL.bear : latestRSI < 30 ? COL.bull : COL.rsi)
    : COL.rsi;

  const latestVWAP = useMemo(
    () => vwapVals.filter(v => v != null).slice(-1)[0] as number | undefined,
    [vwapVals],
  );

  const latestCVD = useMemo(
    () => cvdCumDeltas[cvdCumDeltas.length - 1],
    [cvdCumDeltas],
  );

  const latestMACD = useMemo(
    () => macdLine.filter(v => v != null).slice(-1)[0] as number | undefined,
    [macdLine],
  );

  const latestADX = useMemo(
    () => adxVals.filter(v => v != null).slice(-1)[0] as number | undefined,
    [adxVals],
  );

  const stackLabel = useMemo(() => {
    if (e9 === null || e20 === null || e50 === null) return null;
    if (e9 > e20 && e20 > e50) return { text: '▲ BULLISH', color: COL.bull, bg: 'rgba(0,229,160,0.1)' };
    if (e9 < e20 && e20 < e50) return { text: '▼ BEARISH', color: COL.bear, bg: 'rgba(255,61,90,0.1)' };
    return { text: '⚠ TANGLED', color: '#ffb82e', bg: 'rgba(255,184,46,0.1)' };
  }, [e9, e20, e50]);

  const lastVol = visCandles[visCandles.length - 1]?.v || 0;
  const avgVol  = useMemo(
    () => visCandles.length ? visCandles.reduce((a, c) => a + c.v, 0) / visCandles.length : 0,
    [visCandles],
  );

  // Active pane count (for layout)
  const activePanes = [
    activeIndicators.macd,
    activeIndicators.rsi,
    activeIndicators.stochRsi,
    activeIndicators.adx,
    activeIndicators.williamsR,
    activeIndicators.cci,
    activeIndicators.volume,
    activeIndicators.obv,
    activeIndicators.cvd,
  ].filter(Boolean).length;

  // ── Pane label helper ──────────────────────────────────────────────────────
  const paneLabel = (
    title: string,
    right?: { val: string | number | undefined; col?: string },
    right2?: { val: string | number | undefined; col?: string },
  ) => (
    <div style={{
      fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)',
      letterSpacing: '.08em', textTransform: 'uppercase',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      margin: '6px 0 3px', padding: '0 2px',
    }}>
      <span>{title}</span>
      <span style={{ display: 'flex', gap: 10 }}>
        {right2 && <span style={{ color: right2.col ?? 'var(--text3)' }}>{right2.val ?? '—'}</span>}
        {right  && <span style={{ color: right.col  ?? 'var(--text3)' }}>{right.val  ?? '—'}</span>}
      </span>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 10, marginBottom: 10, position: 'relative',
    }}>

      {/* ── Legend + Indicator toggle ──────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {activeIndicators.ema9 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COL.ema9 }} />
            EMA{useStore.getState().indicatorParams.ema9Period} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e9 !== null ? fmtPrice(e9) : '—'}</span>
          </div>
        )}
        {activeIndicators.ema20 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COL.ema20 }} />
            EMA{useStore.getState().indicatorParams.ema20Period} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e20 !== null ? fmtPrice(e20) : '—'}</span>
          </div>
        )}
        {activeIndicators.ema50 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COL.ema50 }} />
            EMA{useStore.getState().indicatorParams.ema50Period} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e50 !== null ? fmtPrice(e50) : '—'}</span>
          </div>
        )}
        {activeIndicators.vwap && latestVWAP != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 14, height: 2, background: COL.vwap, borderRadius: 1 }} />
            VWAP <span style={{ color: COL.vwap, fontWeight: 600 }}>{fmtPrice(latestVWAP)}</span>
          </div>
        )}
        {activeIndicators.macd && latestMACD != null && (
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            MACD <span style={{ color: latestMACD >= 0 ? COL.bull : COL.bear, fontWeight: 600 }}>{latestMACD.toFixed(4)}</span>
          </div>
        )}
        {activeIndicators.adx && latestADX != null && (
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            ADX <span style={{ color: latestADX > 25 ? COL.adx : 'var(--text3)', fontWeight: 600 }}>{latestADX.toFixed(1)}</span>
          </div>
        )}
        {stackLabel && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            padding: '3px 10px', borderRadius: 20, letterSpacing: '.04em',
            color: stackLabel.color, background: stackLabel.bg,
          }}>
            {stackLabel.text}
          </span>
        )}

        {/* Indicator panel toggle */}
        <button
          onClick={() => setShowPanel(true)}
          style={{
            marginLeft: stackLabel ? 6 : 'auto',
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
            padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s',
          }}
        >
          ⚙ Indicators
        </button>
      </div>

      {/* ── Price canvas ──────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <canvas ref={priceRef}   style={{ height: 240, width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, height: 240, width: '100%', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      </div>

      {/* Tooltip */}
      <div ref={ttRef} style={{
        position: 'absolute', pointerEvents: 'none', zIndex: 10,
        background: 'var(--bg4)', border: '1px solid var(--border3)',
        borderRadius: 'var(--radius-sm)', padding: '7px 10px',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
        whiteSpace: 'nowrap', opacity: 0, transition: 'opacity .1s',
        minWidth: 140, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
      }} />

      {/* ── MACD pane ──────────────────────────────────────── */}
      {activeIndicators.macd && (
        <>
          {paneLabel('MACD',
            { val: latestMACD != null ? latestMACD.toFixed(4) : undefined, col: latestMACD != null ? (latestMACD >= 0 ? COL.bull : COL.bear) : undefined }
          )}
          <canvas ref={macdRef} style={{ height: 70, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── RSI pane ───────────────────────────────────────── */}
      {activeIndicators.rsi && (
        <>
          {paneLabel('RSI (14) · Wilder', { val: latestRSI, col: rsiColor })}
          <canvas ref={rsiRef} style={{ height: 70, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── Stoch RSI pane ─────────────────────────────────── */}
      {activeIndicators.stochRsi && (
        <>
          {paneLabel('Stoch RSI',
            { val: stochRsiK.filter(v => v != null).slice(-1)[0]?.toFixed(1), col: COL.stochK },
            { val: stochRsiD.filter(v => v != null).slice(-1)[0]?.toFixed(1), col: COL.stochD }
          )}
          <canvas ref={stochRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── ADX pane ───────────────────────────────────────── */}
      {activeIndicators.adx && (
        <>
          {paneLabel('ADX · Trend Strength',
            { val: latestADX?.toFixed(1), col: COL.adx }
          )}
          <canvas ref={adxRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── Williams %R pane ───────────────────────────────── */}
      {activeIndicators.williamsR && (
        <>
          {paneLabel('Williams %R',
            { val: willRVals.filter(v => v != null).slice(-1)[0]?.toFixed(1), col: COL.willR }
          )}
          <canvas ref={willRRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── CCI pane ───────────────────────────────────────── */}
      {activeIndicators.cci && (
        <>
          {paneLabel('CCI',
            { val: cciVals.filter(v => v != null).slice(-1)[0]?.toFixed(1), col: COL.cci }
          )}
          <canvas ref={cciRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── Volume pane ────────────────────────────────────── */}
      {activeIndicators.volume && (
        <>
          {paneLabel('Volume',
            { val: 'cur ' + fmtK(lastVol) + ' · avg ' + fmtK(avgVol) }
          )}
          <canvas ref={volRef} style={{ height: 52, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── OBV pane ───────────────────────────────────────── */}
      {activeIndicators.obv && (
        <>
          {paneLabel('OBV · On-Balance Volume',
            { val: obvVals.length ? fmtK(obvVals[obvVals.length - 1]) : undefined, col: COL.obv }
          )}
          <canvas ref={obvRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── CVD pane ───────────────────────────────────────── */}
      {activeIndicators.cvd && (
        <>
          {paneLabel('CVD · Cumul. Vol Delta',
            { val: latestCVD != null ? (latestCVD >= 0 ? '+' : '') + fmtK(latestCVD) : undefined,
              col: latestCVD != null ? (latestCVD >= 0 ? COL.bull : COL.bear) : undefined }
          )}
          <canvas ref={cvdRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />
        </>
      )}

      {/* ── Indicator Panel (slide-in) ─────────────────────── */}
      {showPanel && <IndicatorPanel onClose={() => setShowPanel(false)} />}
    </div>
  );
}