'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtK } from '@/lib/indicators';

// ── Constants ─────────────────────────────────────────────────────────────────
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
const GC  = 'rgba(255,255,255,0.04)';
const TC  = 'rgba(255,255,255,0.22)';

const CHART = {
  visibleCandles:   70,
  padRight:         66,
  padLeft:           2,
  padTop:           10,
  padBottom:         6,
  candleWidthRatio:  0.62,
  pricePadPct:       0.06,
  gridDivisions:      4,
} as const;

const RSI_PAD  = { r: 66, l: 2, t: 4,  b: 4  } as const;
const VOL_PAD  = { r: 66, l: 2, t: 4,  b: 2  } as const;
const CVD_PAD  = { r: 66, l: 2, t: 6,  b: 4  } as const;

// Colours
const COL_VWAP = '#00d4ff';          // cyan
const COL_BULL = '#00e5a0';
const COL_BEAR = '#ff3d5a';
const COL_CVD_LINE = '#e0c0ff';      // soft violet for the cumulative line

// ── Canvas helper ─────────────────────────────────────────────────────────────
/**
 * Resizes canvas only when dimensions change (avoids unnecessary reflow).
 * Uses setTransform — not scale — so repeated calls never compound the DPR factor.
 */
function setupCanvas(el: HTMLCanvasElement) {
  const parent = el.parentElement!;
  const w = (parent.clientWidth - 20) || 600;
  const h = el.getBoundingClientRect().height || (parseInt(el.style.height) || 220);
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function CandleChart() {
  const priceRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);  // crosshair only
  const rsiRef     = useRef<HTMLCanvasElement>(null);
  const volRef     = useRef<HTMLCanvasElement>(null);
  const cvdRef     = useRef<HTMLCanvasElement>(null);
  const ttRef      = useRef<HTMLDivElement>(null);
  const hoverIdx   = useRef(-1);

  const {
    candles, e9s, e20s, e50s, rsiVals,
    vwapVals,       // (number | null)[]  — one per candle in `candles`
    cvdBarDeltas,   // number[]           — per-bar delta
    cvdCumDeltas,   // number[]           — running cumulative CVD
    e9, e20, e50,
    currentCandle, crossovers, suggestion, tf,
  } = useStore();

  // ── Deduplicated, memoised all-candles list ───────────────────────────────
  const allCandles = useMemo(() => {
    if (!currentCandle) return candles;
    const last = candles[candles.length - 1];
    if (last && last.t === currentCandle.t) return candles;
    return [...candles, currentCandle];
  }, [candles, currentCandle]);

  // ── Single visible slice shared by all panes ──────────────────────────────
  const visCandles = useMemo(
    () => allCandles.slice(-CHART.visibleCandles),
    [allCandles],
  );

  // Offset into the full arrays where the visible window starts
  const visOffset = useMemo(
    () => Math.max(0, allCandles.length - CHART.visibleCandles),
    [allCandles],
  );

  // ── Price-pane coordinate factory ─────────────────────────────────────────
  // Called per draw — inline so it closes over visCandles without extra deps
  function makePriceCoords(w: number, h: number) {
    const { padRight: padR, padLeft: padL, padTop: padT, padBottom: padB } = CHART;
    const cW   = w - padR - padL;
    const cH   = h - padT - padB;
    const n    = visCandles.length;
    const cw   = cW / n;
    const pMin = Math.min(...visCandles.map(c => c.l));
    const pMax = Math.max(...visCandles.map(c => c.h));
    const pad  = (pMax - pMin) * CHART.pricePadPct || pMax * 0.001;
    const plo  = pMin - pad;
    const phi  = pMax + pad;
    const pR   = phi - plo || 1;
    const tx   = (i: number) => padL + i * cw + cw / 2;
    const ty   = (p: number) => padT + cH - (p - plo) / pR * cH;
    return { cW, cH, cw, plo, phi, pR, padL, padT, padB: padB, tx, ty, n };
  }

  // ── Draw Price ────────────────────────────────────────────────────────────
  const drawPrice = useCallback(() => {
    const el = priceRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    const n = visCandles.length;
    if (n < 2) return;
    const { cW, cH, cw, phi, pR, padL, padT, tx, ty } = makePriceCoords(w, h);

    ctx.clearRect(0, 0, w, h);

    // Grid lines
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
        { price: suggestion.entry,  color: 'rgba(77,166,255,0.7)', label: 'ENT ' + fmtPrice(suggestion.entry)  },
        { price: suggestion.stop,   color: 'rgba(255,61,90,0.6)',  label: 'SL '  + fmtPrice(suggestion.stop)   },
        { price: suggestion.target, color: 'rgba(0,229,160,0.6)',  label: 'TP '  + fmtPrice(suggestion.target) },
      ];
      ctx.setLineDash([4, 4]);
      levels.forEach(lv => {
        if (!lv.price || lv.price < (phi - pR) || lv.price > phi) return;
        const ly = ty(lv.price);
        ctx.strokeStyle = lv.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + cW, ly); ctx.stroke();
        ctx.fillStyle = lv.color; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(lv.label, padL + cW + 4, ly + 3.5);
      });
      ctx.setLineDash([]);
    }

    // Candles
    visCandles.forEach((c, i) => {
      const x      = tx(i);
      const bw     = Math.max(2, cw * CHART.candleWidthRatio);
      const isLast = i === n - 1;
      const col    = isLast ? '#888' : (c.c >= c.o ? COL_BULL : COL_BEAR);
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, ty(c.h)); ctx.lineTo(x, ty(c.l)); ctx.stroke();
      const bT = ty(Math.max(c.o, c.c)), bB = ty(Math.min(c.o, c.c));
      ctx.fillStyle = isLast ? 'rgba(140,140,140,0.5)' : col;
      ctx.fillRect(x - bw / 2, bT, bw, Math.max(1, bB - bT));
    });

    // EMA lines
    const emaLines: [(number | null)[], string][] = [
      [e9s.slice(visOffset),  '#ff6b35'],
      [e20s.slice(visOffset), '#4da6ff'],
      [e50s.slice(visOffset), '#a78bff'],
    ];
    emaLines.forEach(([vals, col]) => {
      if (!vals || vals.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => {
        if (v == null) { started = false; return; }
        const xi = tx(i), yi = ty(v);
        if (!started) { ctx.moveTo(xi, yi); started = true; } else ctx.lineTo(xi, yi);
      });
      ctx.stroke();
    });

    // ── VWAP line ────────────────────────────────────────────────────────────
    const vwapSlice = vwapVals?.slice(visOffset) ?? [];
    if (vwapSlice.length >= 2) {
      ctx.strokeStyle = COL_VWAP; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); let vwapStarted = false;
      vwapSlice.forEach((v, i) => {
        if (v == null) { vwapStarted = false; return; }
        const xi = tx(i), yi = ty(v as number);
        if (!vwapStarted) { ctx.moveTo(xi, yi); vwapStarted = true; } else ctx.lineTo(xi, yi);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // Label at the last valid point
      const lastVwap = [...vwapSlice].reverse().find(v => v != null) as number | undefined;
      if (lastVwap != null) {
        ctx.fillStyle = COL_VWAP; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText('VWAP ' + fmtPrice(lastVwap), padL + cW + 4, ty(lastVwap) + 3.5);
      }
    }

    // Crossover markers
    crossovers.forEach((x: { idx: number; price: number; type: string }) => {
      const vi = x.idx - visOffset;
      if (vi < 0 || vi >= n) return;
      const candle = allCandles[x.idx];
      if (!candle) return;
      ctx.fillStyle = x.type === 'bull' ? 'rgba(0,229,160,0.9)' : 'rgba(255,61,90,0.9)';
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(x.type === 'bull' ? '▲' : '▼', tx(vi), ty(candle.l) + 14);
    });

    // X-axis time labels
    const step = Math.max(1, Math.floor(n / 5));
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
  }, [visCandles, allCandles, visOffset, e9s, e20s, e50s, vwapVals, crossovers, suggestion, tf]);

  // ── Draw Crosshair overlay (lightweight — no full price redraw on hover) ──
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

  // ── Draw RSI ──────────────────────────────────────────────────────────────
  const drawRSI = useCallback(() => {
    const el = rsiRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const { r: padR, l: padL, t: padT, b: padB } = RSI_PAD;
    const cW = w - padR - padL, cH = h - padT - padB;
    const n  = CHART.visibleCandles;
    const cw = cW / n;
    const txr = (i: number) => padL + i * cw + cw / 2;
    const ty  = (v: number) => padT + (100 - v) / 100 * cH;

    ctx.fillStyle = 'rgba(255,61,90,0.05)';
    ctx.fillRect(padL, padT, cW, ty(70) - padT);
    ctx.fillStyle = 'rgba(0,229,160,0.05)';
    ctx.fillRect(padL, ty(30), cW, padT + cH - ty(30));

    [70, 50, 30].forEach(lv => {
      ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5; ctx.setLineDash(lv === 50 ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, ty(lv)); ctx.lineTo(padL + cW, ty(lv)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(String(lv), padL + cW + 4, ty(lv) + 3.5);
    });

    // Align to visCandles using the same visOffset
    const rv      = rsiVals.slice(visOffset);
    const startI  = n - rv.length;
    const validPts = rv
      .map((v: number | null, i: number) => v != null ? { x: txr(startI + i), y: ty(v as number) } : null)
      .filter(Boolean) as { x: number; y: number }[];

    if (validPts.length > 1) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
      grad.addColorStop(0, 'rgba(255,184,46,0.12)');
      grad.addColorStop(1, 'rgba(255,184,46,0)');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, padT + cH);
      validPts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(validPts[validPts.length - 1].x, padT + cH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#ffb82e'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      validPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  }, [rsiVals, visOffset]);

  // ── Draw Volume ───────────────────────────────────────────────────────────
  const drawVol = useCallback(() => {
    const el = volRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    if (!visCandles.length) return;
    const { r: padR, l: padL, t: padT, b: padB } = VOL_PAD;
    const cW   = w - padR - padL, cH = h - padT - padB;
    const cw   = cW / visCandles.length;
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
        : (c.c >= c.o
          ? (aboveAvg ? 'rgba(0,229,160,0.55)' : 'rgba(0,229,160,0.25)')
          : (aboveAvg ? 'rgba(255,61,90,0.55)'  : 'rgba(255,61,90,0.25)'));
      const bH = Math.max(1, (c.v / maxV) * cH);
      ctx.fillRect(padL + i * cw + 1, padT + cH - bH, Math.max(1, cw - 2), bH);
    });
  }, [visCandles]);

  // ── Draw CVD ──────────────────────────────────────────────────────────────
  const drawCVD = useCallback(() => {
    const el = cvdRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);

    const barSlice = cvdBarDeltas?.slice(visOffset) ?? [];
    const cumSlice = cvdCumDeltas?.slice(visOffset) ?? [];
    const n        = visCandles.length;
    if (!barSlice.length || n < 2) return;

    const { r: padR, l: padL, t: padT, b: padB } = CVD_PAD;
    const cW = w - padR - padL, cH = h - padT - padB;
    const cw = cW / n;

    // Scale: bars use absolute delta; cumulative line uses its own range
    const maxBarAbs = Math.max(...barSlice.map(Math.abs), 1);
    const midY      = padT + cH / 2;                    // zero line for bars
    const barScale  = (cH / 2) / maxBarAbs;

    const cumMin = Math.min(...cumSlice);
    const cumMax = Math.max(...cumSlice);
    const cumRng = (cumMax - cumMin) || 1;
    const tyCum  = (v: number) => padT + (1 - (v - cumMin) / cumRng) * cH;

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + cW, midY); ctx.stroke();
    ctx.setLineDash([]);

    // Bar delta histogram
    barSlice.forEach((delta, i) => {
      const barH   = Math.max(1, Math.abs(delta) * barScale);
      const isBull = delta >= 0;
      ctx.fillStyle = isBull ? 'rgba(0,229,160,0.45)' : 'rgba(255,61,90,0.45)';
      ctx.fillRect(
        padL + i * cw + 1,
        isBull ? midY - barH : midY,
        Math.max(1, cw - 2),
        barH,
      );
    });

    // Cumulative delta line
    const cumPts = cumSlice.map((v, i) => ({ x: padL + i * cw + cw / 2, y: tyCum(v) }));
    if (cumPts.length > 1) {
      ctx.strokeStyle = COL_CVD_LINE; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      cumPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    // Axis labels: last cumulative value
    const lastCum = cumSlice[cumSlice.length - 1];
    if (lastCum != null) {
      ctx.fillStyle = COL_CVD_LINE; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtK(lastCum), padL + cW + 4, tyCum(lastCum) + 3.5);
    }
    // Min / max labels
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(fmtK(cumMax), padL + cW + 4, padT + 8);
    ctx.fillText(fmtK(cumMin), padL + cW + 4, padT + cH - 2);
  }, [cvdBarDeltas, cvdCumDeltas, visCandles, visOffset]);

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

    if (i < 0 || i >= n) {
      tt.style.opacity = '0'; hoverIdx.current = -1; drawCrosshair(-1); return;
    }
    hoverIdx.current = i;
    drawCrosshair(i);

    const c      = visCandles[i];
    const absIdx = visOffset + i;
    const e9v    = e9s[absIdx];
    const e20v   = e20s[absIdx];
    const e50v   = e50s[absIdx];
    const rsiV   = rsiVals[Math.max(0, rsiVals.length - n + i)];
    const vwapV  = vwapVals?.[absIdx];
    const barD   = cvdBarDeltas?.[absIdx];
    const cumD   = cvdCumDeltas?.[absIdx];
    const chPct  = c.o ? ((c.c - c.o) / c.o * 100).toFixed(2) : '0.00';
    const col    = c.c >= c.o ? COL_BULL : COL_BEAR;

    const rows: [string, string, string?][] = [
      ['O',   fmtPrice(c.o)],
      ['H',   fmtPrice(c.h)],
      ['L',   fmtPrice(c.l)],
      ['C',   fmtPrice(c.c), col],
      ['Chg', (c.c >= c.o ? '+' : '') + chPct + '%', col],
      ['Vol', fmtK(c.v)],
    ];
    if (vwapV != null)  rows.push(['VWAP', fmtPrice(vwapV as number), COL_VWAP]);
    if (e9v  != null)   rows.push(['E9',   fmtPrice(e9v),  '#ff6b35']);
    if (e20v != null)   rows.push(['E20',  fmtPrice(e20v), '#4da6ff']);
    if (e50v != null)   rows.push(['E50',  fmtPrice(e50v), '#a78bff']);
    if (rsiV != null)   rows.push(['RSI',  String(rsiV)]);
    if (barD != null)   rows.push(['Δ Vol', (barD >= 0 ? '+' : '') + fmtK(barD), barD >= 0 ? COL_BULL : COL_BEAR]);
    if (cumD != null)   rows.push(['CVD',  (cumD >= 0 ? '+' : '') + fmtK(cumD), COL_CVD_LINE]);

    tt.innerHTML = rows.map(([label, value, color]) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7">
        <span style="color:var(--text3)">${label}</span>
        <span style="font-weight:600${color ? `;color:${color}` : ''}">${value}</span>
      </div>`
    ).join('');

    tt.style.opacity = '1';
    tt.style.left    = Math.min(mx + 8, rect.width - 160) + 'px';
    tt.style.top     = Math.max(e.clientY - rect.top - 80, 4) + 'px';
  }, [visCandles, visOffset, e9s, e20s, e50s, rsiVals, vwapVals, cvdBarDeltas, cvdCumDeltas, drawCrosshair]);

  const handleMouseLeave = useCallback(() => {
    if (ttRef.current) ttRef.current.style.opacity = '0';
    hoverIdx.current = -1;
    drawCrosshair(-1);
  }, [drawCrosshair]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { drawPrice(); drawRSI(); drawVol(); drawCVD(); },
    [drawPrice, drawRSI, drawVol, drawCVD]);

  useEffect(() => {
    const handler = () => { drawPrice(); drawRSI(); drawVol(); drawCVD(); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [drawPrice, drawRSI, drawVol, drawCVD]);

  // ── Derived display values ────────────────────────────────────────────────
  const latestRSI = useMemo(
    () => rsiVals.filter((v: number | null) => v !== null).slice(-1)[0] as number | undefined,
    [rsiVals],
  );
  const rsiColor = latestRSI !== undefined
    ? (latestRSI > 70 ? COL_BEAR : latestRSI < 30 ? COL_BULL : '#ffb82e')
    : 'var(--amber)';

  const latestVWAP = useMemo(
    () => vwapVals?.filter((v: number | null) => v !== null).slice(-1)[0] as number | undefined,
    [vwapVals],
  );

  const latestCVD = useMemo(
    () => cvdCumDeltas?.[cvdCumDeltas.length - 1],
    [cvdCumDeltas],
  );

  const stackLabel = useMemo(() => {
    if (e9 === null || e20 === null || e50 === null) return null;
    if (e9 > e20 && e20 > e50) return { text: '▲ BULLISH', color: COL_BULL, bg: 'rgba(0,229,160,0.1)' };
    if (e9 < e20 && e20 < e50) return { text: '▼ BEARISH', color: COL_BEAR, bg: 'rgba(255,61,90,0.1)' };
    return { text: '⚠ TANGLED', color: '#ffb82e', bg: 'rgba(255,184,46,0.1)' };
  }, [e9, e20, e50]);

  const lastVol = visCandles[visCandles.length - 1]?.v || 0;
  const avgVol  = useMemo(
    () => visCandles.length ? visCandles.reduce((a, c) => a + c.v, 0) / visCandles.length : 0,
    [visCandles],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 10, position: 'relative' }}>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {([['e9', '#ff6b35', e9], ['e20', '#4da6ff', e20], ['e50', '#a78bff', e50]] as const).map(([lbl, col, val]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
            EMA{lbl.slice(1)} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{val !== null ? fmtPrice(val as number) : '—'}</span>
          </div>
        ))}
        {/* VWAP legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
          <div style={{ width: 14, height: 2, background: COL_VWAP, flexShrink: 0, borderRadius: 1 }} />
          VWAP <span style={{ color: COL_VWAP, fontWeight: 600 }}>{latestVWAP != null ? fmtPrice(latestVWAP) : '—'}</span>
        </div>
        {stackLabel && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '.04em', color: stackLabel.color, background: stackLabel.bg }}>
            {stackLabel.text}
          </span>
        )}
      </div>

      {/* Price canvas + crosshair overlay */}
      <div style={{ position: 'relative' }}>
        <canvas ref={priceRef} style={{ height: 220, width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, height: 220, width: '100%', borderRadius: 'var(--radius-sm)', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
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

      {/* RSI pane */}
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 3px', padding: '0 2px' }}>
        RSI (14) · Wilder
        <span style={{ color: rsiColor }}>{latestRSI ?? '—'}</span>
      </div>
      <canvas ref={rsiRef} style={{ height: 72, width: '100%', borderRadius: 'var(--radius-sm)' }} />

      {/* Volume pane */}
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 3px', padding: '0 2px' }}>
        Volume
        <span style={{ color: 'var(--text3)', fontSize: 9 }}>cur {fmtK(lastVol)} · avg {fmtK(avgVol)}</span>
      </div>
      <canvas ref={volRef} style={{ height: 52, width: '100%', borderRadius: 'var(--radius-sm)' }} />

      {/* CVD pane */}
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 3px', padding: '0 2px' }}>
        CVD · Cumul. Vol Delta
        <span style={{ color: latestCVD != null ? (latestCVD >= 0 ? COL_BULL : COL_BEAR) : 'var(--text3)', fontSize: 9 }}>
          {latestCVD != null ? (latestCVD >= 0 ? '+' : '') + fmtK(latestCVD) : '—'}
        </span>
      </div>
      <canvas ref={cvdRef} style={{ height: 60, width: '100%', borderRadius: 'var(--radius-sm)' }} />

    </div>
  );
}