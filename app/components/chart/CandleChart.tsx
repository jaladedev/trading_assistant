'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtK } from '@/lib/indicators';
import { fetchKlines } from '@/lib/api';
import {
  calcVolumeProfile,
  calcAutoFibo,
  detectRSIDivergence,
  fiboEntryScore,
  calcMTFConfluence,
  FIBO_LEVELS, FIBO_COLORS, FIBO_LABELS,
  type TFSignal, type VolumeProfile, type FiboOverlay, type DivergenceResult,
} from '@/lib/indicators2';
import {
  type Drawing, type DrawingToolKind, type ActiveDraw,
  makeHLine, makeTrendLine, makeFibDrawing, makeRect,
  TOOL_DEFAULTS,
} from '@/lib/drawingTools';

// ── Constants ────────────────────────────────────────────────────────────────
const PADDING = { top: 28, right: 68, bottom: 22, left: 6 };
const SUB_H   = 80;
const VP_W    = 56;   // pixels for volume profile column

const TIMEFRAMES_FOR_MTF = ['15m', '1h', '4h', '1d'];

// ─────────────────────────────────────────────────────────────────────────────
function hexAlpha(hex: string, a: number) {
  // Convert any CSS colour string to rgba — fallback pass-through
  try {
    if (hex.startsWith('rgba')) return hex;
    if (hex.startsWith('#')) {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${g},${b},${a})`;
    }
  } catch { /* */ }
  return hex;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CandleChart() {
  const {
    candles, livePrice, tf, sym,
    e9s, e20s, e50s,
    rsiVals, macdLine, macdSignal, macdHist,
    stochRsiK, stochRsiD,
    bbUpper, bbLower, bbMiddle,
    vwapVals, vwapUpper1, vwapLower1, vwapUpper2, vwapLower2,
    cvdCumDeltas, cvdBarDeltas,
    obvVals, adxVals, plusDI, minusDI,
    willRVals, cciVals,
    stVals, stBull, psarVals, psarBull,
    patterns,
    crossovers,
    activeIndicators,
    atrVals,
  } = useStore();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mainRef  = useRef<HTMLCanvasElement>(null);
  const rsiRef   = useRef<HTMLCanvasElement>(null);
  const macdRef  = useRef<HTMLCanvasElement>(null);
  const volRef   = useRef<HTMLCanvasElement>(null);
  const cvdRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  // ── Crosshair ─────────────────────────────────────────────────────────────
  const [crosshair, setCrosshair] = useState<{ x: number; barIdx: number; price: number } | null>(null);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const [fullscreen, setFullscreen] = useState(false);

  // ── Pagination (history) ─────────────────────────────────────────────────
  const [historyCandleOffset, setHistoryCandleOffset] = useState(0);
  const [historyCandles, setHistoryCandles] = useState<typeof candles>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const histPageRef = useRef(0);   // how many pages of 200 we've loaded beyond current

  // ── Volume Profile toggle ─────────────────────────────────────────────────
  const [showVP, setShowVP] = useState(true);

  // ── Auto Fib ─────────────────────────────────────────────────────────────
  const [showAutoFib, setShowAutoFib] = useState(true);
  const [fiboOverlay, setFiboOverlay] = useState<FiboOverlay | null>(null);

  // ── Divergence ────────────────────────────────────────────────────────────
  const [divergence, setDivergence] = useState<DivergenceResult | null>(null);

  // ── Drawing tools ─────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DrawingToolKind | null>(null);
  const [drawings, setDrawings]     = useState<Drawing[]>([]);
  const [activeDraw, setActiveDraw] = useState<ActiveDraw | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── MTF confluence ────────────────────────────────────────────────────────
  const [mtfSignals, setMtfSignals] = useState<TFSignal[]>([]);
  const [mtfLoading, setMtfLoading] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Combine live + history
  // ─────────────────────────────────────────────────────────────────────────
  const allCandles = historyCandles.length
    ? [...historyCandles, ...candles]
    : candles;

  // ─────────────────────────────────────────────────────────────────────────
  // Recompute derived overlays when candles change
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (showAutoFib && candles.length >= 10) {
      setFiboOverlay(calcAutoFibo(candles, 50));
    } else {
      setFiboOverlay(null);
    }
  }, [candles, showAutoFib]);

  useEffect(() => {
    if (candles.length >= 10 && rsiVals.length >= 10) {
      setDivergence(detectRSIDivergence(candles, rsiVals, 50));
    } else {
      setDivergence(null);
    }
  }, [candles, rsiVals]);

  // ─────────────────────────────────────────────────────────────────────────
  // MTF signals loader
  // ─────────────────────────────────────────────────────────────────────────
  const loadMTF = useCallback(async () => {
    setMtfLoading(true);
    const results: TFSignal[] = [];
    for (const t of TIMEFRAMES_FOR_MTF) {
      try {
        const ks = await fetchKlines(sym, t);
        if (!ks || ks.length < 20) { results.push({ tf: t, trend: 'neutral', rsi: null, score: 50 }); continue; }

        // Simple: last EMA9 vs EMA20 vs EMA50
        let e9 = ks[0].c, e20 = ks[0].c, e50 = ks[0].c;
        const k9 = 2/10, k20 = 2/21, k50 = 2/51;
        for (const k of ks) {
          e9  = k.c * k9  + e9  * (1 - k9);
          e20 = k.c * k20 + e20 * (1 - k20);
          e50 = k.c * k50 + e50 * (1 - k50);
        }
        // RSI simple
        let gains = 0, losses = 0;
        const last14 = ks.slice(-15);
        for (let i = 1; i < last14.length; i++) {
          const ch = last14[i].c - last14[i-1].c;
          if (ch > 0) gains += ch; else losses -= ch;
        }
        const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));
        const trend = e9 > e20 && e20 > e50 ? 'bull' : e9 < e20 && e20 < e50 ? 'bear' : 'neutral';
        const score = trend === 'bull' ? Math.min(100, 50 + rsi / 2)
                    : trend === 'bear' ? Math.max(0,   50 - (100 - rsi) / 2)
                    : 50;
        results.push({ tf: t, trend, rsi, score });
      } catch {
        results.push({ tf: t, trend: 'neutral', rsi: null, score: 50 });
      }
    }
    setMtfSignals(results);
    setMtfLoading(false);
  }, [sym]);

  useEffect(() => {
    loadMTF();
    const id = setInterval(loadMTF, 60_000);
    return () => clearInterval(id);
  }, [loadMTF]);

  // ─────────────────────────────────────────────────────────────────────────
  // History pagination
  // ─────────────────────────────────────────────────────────────────────────
  const loadOlderPage = useCallback(async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    const page  = histPageRef.current + 1;
    const limit = 200;
    try {
      // Try to fetch with endTime offset
      const oldest = allCandles[0];
      if (!oldest) { setLoadingHistory(false); return; }
      // Binance: &endTime=<ms>&limit=200
      const endTime = oldest.t - 1;
      const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${limit}&endTime=${endTime}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed');
      const raw = await r.json() as string[][];
      if (!raw.length) { setLoadingHistory(false); return; }
      const older = raw.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
      setHistoryCandles(prev => [...older, ...prev]);
      setHistoryCandleOffset(prev => prev + older.length);
      histPageRef.current = page;
    } catch { /* silent */ }
    setLoadingHistory(false);
  }, [sym, tf, allCandles, loadingHistory]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'f' || e.key === 'F') setFullscreen(f => !f);
      if (e.key === 'Escape') { setFullscreen(false); setActiveTool(null); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) setDrawings(d => d.filter(x => x.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Fibo score injection into entryQuality
  // ─────────────────────────────────────────────────────────────────────────
  const lastAtr = atrVals.length ? atrVals[atrVals.length - 1] : null;
  const fiboScore = fiboOverlay && livePrice
    ? fiboEntryScore(livePrice, fiboOverlay, lastAtr)
    : { bonus: 0, nearestLabel: null };

  // ─────────────────────────────────────────────────────────────────────────
  // DRAWING  ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // Shared coord conversion helpers exposed to canvas mouse handlers
  const coordRef = useRef({
    barW:     8,
    offset:   0,
    minP:     0,
    maxP:     0,
    mainH:    300,
    canvasW:  600,
  });

  function pixToBar(px: number) {
    const { barW, offset, canvasW } = coordRef.current;
    const visibleBars = Math.floor((canvasW - PADDING.left - PADDING.right - VP_W) / barW);
    const startBar    = Math.max(0, offset);
    return startBar + Math.floor((px - PADDING.left) / barW);
  }

  function pixToPrice(py: number, canvasH: number) {
    const { minP, maxP } = coordRef.current;
    const chartH = canvasH - PADDING.top - PADDING.bottom;
    return maxP - ((py - PADDING.top) / chartH) * (maxP - minP);
  }

  function barToPix(barIdx: number) {
    const { barW, offset } = coordRef.current;
    const startBar = Math.max(0, offset);
    return PADDING.left + (barIdx - startBar) * barW + barW / 2;
  }

  function priceToPix(price: number, canvasH: number) {
    const { minP, maxP } = coordRef.current;
    const chartH = canvasH - PADDING.top - PADDING.bottom;
    return PADDING.top + (1 - (price - minP) / (maxP - minP)) * chartH;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render function
  // ─────────────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // CSS variable colours (resolved once)
    const cs = getComputedStyle(canvas);
    const COL = {
      bg:     cs.getPropertyValue('--bg2').trim()    || '#0d1017',
      bg3:    cs.getPropertyValue('--bg3').trim()    || '#131820',
      border: cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)',
      text:   cs.getPropertyValue('--text').trim()   || '#dde2ef',
      text2:  cs.getPropertyValue('--text2').trim()  || '#6b7591',
      text3:  cs.getPropertyValue('--text3').trim()  || '#3d4460',
      green:  cs.getPropertyValue('--green').trim()  || '#00e5a0',
      red:    cs.getPropertyValue('--red').trim()    || '#ff3d5a',
      amber:  cs.getPropertyValue('--amber').trim()  || '#ffb82e',
      blue:   cs.getPropertyValue('--blue').trim()   || '#4da6ff',
      purple: cs.getPropertyValue('--purple').trim() || '#a78bff',
      ema9:   cs.getPropertyValue('--ema9').trim()   || '#ff6b35',
      ema20:  cs.getPropertyValue('--ema20').trim()  || '#4da6ff',
      ema50:  cs.getPropertyValue('--ema50').trim()  || '#a78bff',
    };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    if (!allCandles.length) {
      ctx.fillStyle = COL.text2;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading candles…', W / 2, H / 2);
      return;
    }

    // ── Visible range ───────────────────────────────────────────────────────
    const chartW = W - PADDING.left - PADDING.right - VP_W;
    const barW   = Math.max(3, Math.min(16, Math.floor(chartW / 80)));
    const visN   = Math.floor(chartW / barW);
    const startI = Math.max(0, allCandles.length - visN);
    const visCandles = allCandles.slice(startI);

    // Store for mouse coord conversion
    coordRef.current.barW    = barW;
    coordRef.current.offset  = startI;
    coordRef.current.canvasW = W;

    // Price range with 4% padding
    const highs = visCandles.map(c => c.h);
    const lows  = visCandles.map(c => c.l);
    let maxP = Math.max(...highs);
    let minP = Math.min(...lows);
    const pad  = (maxP - minP) * 0.04 || maxP * 0.01;
    maxP += pad; minP -= pad;

    coordRef.current.minP   = minP;
    coordRef.current.maxP   = maxP;
    coordRef.current.mainH  = H;

    const pY = (p: number) => PADDING.top + (1 - (p - minP) / (maxP - minP)) * (H - PADDING.top - PADDING.bottom);
    const bX = (i: number) => PADDING.left + i * barW + barW / 2;

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = COL.border;
    ctx.lineWidth   = 0.5;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const p  = minP + (maxP - minP) * (i / steps);
      const y  = pY(p);
      ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(W - PADDING.right - VP_W, y);
      ctx.stroke();
      ctx.fillStyle = COL.text3;
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(fmtPrice(p), W - VP_W - 2, y - 2);
    }

    // ── Volume Profile (right-side histogram) ────────────────────────────────
    if (showVP) {
      const vp: VolumeProfile = calcVolumeProfile(visCandles, 24);
      const vpMaxVol = Math.max(...vp.buckets.map(b => b.vol), 1);
      const vpX0 = W - VP_W;
      const priceH = H - PADDING.top - PADDING.bottom;

      for (const bkt of vp.buckets) {
        const y   = pY(bkt.price + (maxP - minP) / (24 * 2));
        const y2  = pY(bkt.price - (maxP - minP) / (24 * 2));
        const bH  = Math.max(1, Math.abs(y2 - y));
        const w   = (bkt.vol / vpMaxVol) * (VP_W - 4);
        const isPOC = Math.abs(bkt.price - vp.poc) < (maxP - minP) / 48;
        ctx.fillStyle = isPOC
          ? 'rgba(255,184,46,0.65)'
          : bkt.buyVol >= bkt.sellVol
            ? 'rgba(0,229,160,0.22)'
            : 'rgba(255,61,90,0.22)';
        ctx.fillRect(vpX0 + 2, Math.min(y, y2), w, bH);

        if (isPOC) {
          ctx.strokeStyle = 'rgba(255,184,46,0.9)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(PADDING.left, pY(vp.poc)); ctx.lineTo(vpX0, pY(vp.poc));
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,184,46,0.9)';
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.textAlign = 'left';
          ctx.fillText('POC', vpX0 + 2, pY(vp.poc) - 2);
        }
      }
      // VAH / VAL
      ctx.strokeStyle = 'rgba(255,184,46,0.3)';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 0.7;
      [vp.vahPrice, vp.valPrice].forEach(p => {
        ctx.beginPath(); ctx.moveTo(PADDING.left, pY(p)); ctx.lineTo(vpX0, pY(p)); ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // ── Auto Fibonacci ───────────────────────────────────────────────────────
    if (showAutoFib && fiboOverlay) {
      const vpX0 = W - VP_W;
      fiboOverlay.levels.forEach((lvl, li) => {
        const y = pY(lvl.price);
        if (y < PADDING.top - 10 || y > H - PADDING.bottom + 10) return;
        ctx.strokeStyle = hexAlpha(lvl.color, 0.45);
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = lvl.ratio === 0.618 || lvl.ratio === 0.5 ? 1.2 : 0.8;
        ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(vpX0, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hexAlpha(lvl.color, 0.85);
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${lvl.label} ${fmtPrice(lvl.price)}`, vpX0 - 2, y - 2);
      });
    }

    // ── EMA lines ────────────────────────────────────────────────────────────
    const drawLine = (series: (number | null)[], color: string, width = 1, dash: number[] = []) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash.length) ctx.setLineDash(dash); else ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visCandles.length; i++) {
        const idx = startI + i;
        const val = series[idx];
        if (val == null) continue;
        const x = bX(i), y = pY(val);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (activeIndicators.ema9)  drawLine(e9s,  COL.ema9,  1.2);
    if (activeIndicators.ema20) drawLine(e20s, COL.ema20, 1.2);
    if (activeIndicators.ema50) drawLine(e50s, COL.ema50, 1.2);

    // BB
    if (activeIndicators.bb) {
      drawLine(bbUpper,  'rgba(77,166,255,0.4)', 0.8, [3,3]);
      drawLine(bbMiddle, 'rgba(77,166,255,0.55)',0.8, [2,2]);
      drawLine(bbLower,  'rgba(77,166,255,0.4)', 0.8, [3,3]);
    }

    // VWAP
    if (activeIndicators.vwap) {
      drawLine(vwapVals, 'rgba(255,184,46,0.8)', 1.2);
      if (activeIndicators.vwapBands) {
        drawLine(vwapUpper1, 'rgba(255,184,46,0.35)', 0.7, [2,4]);
        drawLine(vwapLower1, 'rgba(255,184,46,0.35)', 0.7, [2,4]);
        drawLine(vwapUpper2, 'rgba(255,184,46,0.2)',  0.7, [2,4]);
        drawLine(vwapLower2, 'rgba(255,184,46,0.2)',  0.7, [2,4]);
      }
    }

    // SuperTrend
    if (activeIndicators.superTrend) {
      for (let i = 1; i < visCandles.length; i++) {
        const idx = startI + i;
        const v1 = stVals[idx - 1], v2 = stVals[idx];
        const b1 = stBull[idx - 1], b2 = stBull[idx];
        if (v1 == null || v2 == null) continue;
        ctx.strokeStyle = b2 ? COL.green : COL.red;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(bX(i-1), pY(v1)); ctx.lineTo(bX(i), pY(v2)); ctx.stroke();
      }
    }

    // ── Candles ──────────────────────────────────────────────────────────────
    for (let i = 0; i < visCandles.length; i++) {
      const c   = visCandles[i];
      const x   = bX(i);
      const bull = c.c >= c.o;
      const col  = bull ? COL.green : COL.red;
      const bW   = Math.max(1, barW - 2);

      // Wick
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(x, pY(c.h)); ctx.lineTo(x, pY(c.l)); ctx.stroke();

      // Body
      const yO = pY(c.o), yC = pY(c.c);
      const bH = Math.max(1, Math.abs(yC - yO));
      ctx.fillStyle = bull ? hexAlpha(COL.green, 0.75) : hexAlpha(COL.red, 0.75);
      ctx.fillRect(x - bW / 2, Math.min(yO, yC), bW, bH);
    }

    // PSAR dots
    if (activeIndicators.psar) {
      for (let i = 0; i < visCandles.length; i++) {
        const idx = startI + i;
        const v = psarVals[idx];
        if (v == null) continue;
        ctx.beginPath();
        ctx.arc(bX(i), pY(v), 2, 0, Math.PI * 2);
        ctx.fillStyle = psarBull[idx] ? COL.green : COL.red;
        ctx.fill();
      }
    }

    // Candlestick pattern labels
    if (activeIndicators.patterns) {
      for (let i = 0; i < visCandles.length; i++) {
        const idx = startI + i;
        const pats = patterns[idx];
        if (!pats || !pats.length) continue;
        const y = pY(visCandles[i].l) + 10;
        ctx.fillStyle = COL.amber;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(pats[0].label, bX(i), y);
      }
    }

    // ── Drawn objects (h-line, trendline, fib, rect) ─────────────────────────
    for (const d of drawings) {
      const isSelected = d.id === selectedId;
      ctx.save();
      ctx.globalAlpha = 1;
      if (d.kind === 'hline') {
        const y = pY(d.price);
        ctx.strokeStyle = isSelected ? COL.amber : d.color;
        ctx.lineWidth   = isSelected ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(W - PADDING.right - VP_W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? COL.amber : d.color;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(fmtPrice(d.price), W - PADDING.right - VP_W - 2, y - 3);
      } else if (d.kind === 'trendline') {
        const x1 = barToPix(d.x1), y1 = priceToPix(d.y1, H);
        const x2 = barToPix(d.x2), y2 = priceToPix(d.y2, H);
        ctx.strokeStyle = isSelected ? COL.amber : d.color;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (d.kind === 'rect') {
        const x1 = barToPix(d.x1), y1 = priceToPix(d.y1, H);
        const x2 = barToPix(d.x2), y2 = priceToPix(d.y2, H);
        ctx.strokeStyle = isSelected ? COL.amber : d.color;
        ctx.lineWidth = 1;
        ctx.fillStyle = d.color;
        ctx.globalAlpha = d.fillOpacity;
        ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
        ctx.globalAlpha = 1;
        ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      } else if (d.kind === 'fib') {
        const rng  = Math.abs(d.y2 - d.y1);
        const dir  = d.y2 > d.y1 ? 1 : -1;
        for (let li = 0; li < d.levels.length; li++) {
          const price = d.y1 + dir * d.levels[li] * rng;
          const y     = pY(price);
          ctx.strokeStyle = hexAlpha(FIBO_COLORS[li] || d.color, 0.6);
          ctx.lineWidth   = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(barToPix(d.x1), y);
          ctx.lineTo(barToPix(d.x2), y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }

    // ── Live price line ───────────────────────────────────────────────────────
    if (livePrice > 0) {
      const y  = pY(livePrice);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(W - PADDING.right - VP_W, y); ctx.stroke();
      ctx.setLineDash([]);
      // Badge
      ctx.fillStyle = 'rgba(0,229,160,0.15)';
      const txt = fmtPrice(livePrice);
      ctx.font = '10px JetBrains Mono, monospace';
      const tw = ctx.measureText(txt).width;
      ctx.fillRect(W - PADDING.right - VP_W + 2, y - 8, tw + 8, 15);
      ctx.fillStyle = COL.green;
      ctx.textAlign = 'left';
      ctx.fillText(txt, W - PADDING.right - VP_W + 6, y + 3);
    }

    // ── Crosshair ────────────────────────────────────────────────────────────
    if (crosshair) {
      const cx = crosshair.x;
      const cy = pY(crosshair.price);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, PADDING.top); ctx.lineTo(cx, H - PADDING.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PADDING.left, cy); ctx.lineTo(W - PADDING.right - VP_W, cy); ctx.stroke();
      ctx.setLineDash([]);
      // Price label
      ctx.fillStyle = 'rgba(30,40,60,0.85)';
      ctx.font = '10px JetBrains Mono, monospace';
      const ptxt = fmtPrice(crosshair.price);
      const ptw  = ctx.measureText(ptxt).width;
      ctx.fillRect(W - PADDING.right - VP_W + 2, cy - 8, ptw + 8, 15);
      ctx.fillStyle = COL.text;
      ctx.textAlign = 'left';
      ctx.fillText(ptxt, W - PADDING.right - VP_W + 6, cy + 3);
    }

    // ── Divergence badge on chart ─────────────────────────────────────────────
    if (divergence) {
      const col   = divergence.type.includes('bull') ? COL.green : COL.red;
      const badge = divergence.label;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      const tw  = ctx.measureText(badge).width;
      const bx  = PADDING.left + 6;
      const by  = PADDING.top + 6;
      ctx.fillStyle = hexAlpha(col, 0.15);
      ctx.beginPath();
      ctx.roundRect?.(bx - 4, by - 11, tw + 12, 17, 3);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(col, 0.7);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.fillText(badge, bx, by);
    }

    // ── Fib score badge ───────────────────────────────────────────────────────
    if (fiboScore.nearestLabel && fiboScore.bonus > 0) {
      ctx.font = '9px JetBrains Mono, monospace';
      const label = `Fib ${fiboScore.nearestLabel}`;
      const tw    = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(167,139,255,0.18)';
      ctx.fillRect(PADDING.left + 6, PADDING.top + 26, tw + 10, 14);
      ctx.fillStyle = COL.purple;
      ctx.textAlign = 'left';
      ctx.fillText(label, PADDING.left + 11, PADDING.top + 37);
    }

  }, [
    allCandles, livePrice, e9s, e20s, e50s, bbUpper, bbLower, bbMiddle,
    vwapVals, vwapUpper1, vwapLower1, vwapUpper2, vwapLower2,
    stVals, stBull, psarVals, psarBull,
    patterns, activeIndicators,
    showVP, showAutoFib, fiboOverlay, divergence, fiboScore,
    drawings, selectedId, crosshair,
  ]);

  // ── Sub-pane renderers ────────────────────────────────────────────────────
  const renderSubPane = useCallback((
    canvas: HTMLCanvasElement,
    series1: (number | null)[],
    series2: (number | null)[] | null,
    type: 'rsi' | 'macd' | 'vol' | 'cvd',
    startI: number,
    visCount: number,
    barW: number,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cs = getComputedStyle(canvas);
    const green  = cs.getPropertyValue('--green').trim()  || '#00e5a0';
    const red    = cs.getPropertyValue('--red').trim()    || '#ff3d5a';
    const blue   = cs.getPropertyValue('--blue').trim()   || '#4da6ff';
    const amber  = cs.getPropertyValue('--amber').trim()  || '#ffb82e';
    const bg     = cs.getPropertyValue('--bg2').trim()    || '#0d1017';
    const border = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';
    const text3  = cs.getPropertyValue('--text3').trim()  || '#3d4460';
    const purple = cs.getPropertyValue('--purple').trim() || '#a78bff';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.stroke();

    const bX = (i: number) => PADDING.left + i * barW + barW / 2;

    if (type === 'rsi') {
      // RSI + StochRSI
      const vals = rsiVals.slice(startI, startI + visCount);
      const sk = stochRsiK.slice(startI, startI + visCount);
      const sd = stochRsiD.slice(startI, startI + visCount);
      // Guide lines 30/70
      [30, 50, 70].forEach(lv => {
        const y = H - (lv / 100) * H;
        ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - VP_W, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = text3;
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(lv), W - VP_W - 2, y - 1);
      });
      // RSI line
      ctx.strokeStyle = amber; ctx.lineWidth = 1.2; ctx.beginPath();
      let started = false;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i]; if (v == null) continue;
        const x = bX(i), y = H - (v / 100) * H;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // StochK / StochD
      if (activeIndicators.stochRsi) {
        const draw = (arr: (number|null)[], col: string) => {
          ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.beginPath();
          let s = false;
          for (let i = 0; i < arr.length; i++) {
            const v = arr[i]; if (v == null) continue;
            const x = bX(i), y = H - (v / 100) * H;
            if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };
        draw(sk, blue);
        draw(sd, purple);
      }
      // Label
      ctx.fillStyle = amber; ctx.font = 'bold 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RSI', 4, 10);

      // Divergence marker on RSI sub-pane
      if (divergence) {
        const col = divergence.type.includes('bull') ? green : red;
        const dIdx = divergence.barIdx - startI;
        if (dIdx >= 0 && dIdx < visCount) {
          const v = rsiVals[startI + dIdx];
          if (v != null) {
            const x = bX(dIdx), y = H - (v / 100) * H;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();
          }
        }
      }

    } else if (type === 'macd') {
      const line = macdLine.slice(startI, startI + visCount);
      const sig  = macdSignal.slice(startI, startI + visCount);
      const hist = macdHist.slice(startI, startI + visCount);
      const maxH2 = Math.max(...hist.filter(v => v != null).map(v => Math.abs(v as number)), 0.0001);
      const midY  = H / 2;

      for (let i = 0; i < hist.length; i++) {
        const v = hist[i]; if (v == null) continue;
        const x = bX(i);
        const bh = (Math.abs(v) / maxH2) * (H / 2 - 4);
        ctx.fillStyle = v >= 0 ? hexAlpha(green, 0.5) : hexAlpha(red, 0.5);
        ctx.fillRect(x - barW/2 + 1, v >= 0 ? midY - bh : midY, Math.max(1, barW - 2), bh);
      }
      const drawMacdLine = (arr: (number|null)[], col: string) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        let s = false;
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i]; if (v == null) continue;
          const x = bX(i), y = midY - (v / maxH2) * (H / 2 - 4);
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawMacdLine(line, blue);
      drawMacdLine(sig,  red);
      ctx.strokeStyle = border; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
      ctx.fillStyle = blue; ctx.font = 'bold 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left'; ctx.fillText('MACD', 4, 10);

    } else if (type === 'vol') {
      const vols = allCandles.slice(startI, startI + visCount).map(c => c.v);
      const maxV = Math.max(...vols, 1);
      for (let i = 0; i < vols.length; i++) {
        const c = allCandles[startI + i];
        if (!c) continue;
        const x = bX(i);
        const bh = (vols[i] / maxV) * (H - 8);
        ctx.fillStyle = c.c >= c.o ? hexAlpha(green, 0.45) : hexAlpha(red, 0.45);
        ctx.fillRect(x - barW/2 + 1, H - 4 - bh, Math.max(1, barW - 2), bh);
      }
      ctx.fillStyle = green; ctx.font = 'bold 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left'; ctx.fillText('VOL', 4, 10);

    } else if (type === 'cvd') {
      const cvd  = cvdCumDeltas.slice(startI, startI + visCount);
      const bars = cvdBarDeltas.slice(startI, startI + visCount);
      const min2 = Math.min(...cvd.filter(v => v != null) as number[], 0);
      const max2 = Math.max(...cvd.filter(v => v != null) as number[], 0.0001);
      const rng2 = max2 - min2 || 1;
      const midY = H / 2;
      ctx.strokeStyle = green; ctx.lineWidth = 1; ctx.beginPath();
      let s = false;
      for (let i = 0; i < cvd.length; i++) {
        const v = cvd[i]; if (v == null) continue;
        const x = bX(i), y = H - 4 - ((v - min2) / rng2) * (H - 8);
        if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = border; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, H - 4 - ((0 - min2) / rng2) * (H - 8));
      ctx.lineTo(W, H - 4 - ((0 - min2) / rng2) * (H - 8)); ctx.stroke();
      ctx.fillStyle = green; ctx.font = 'bold 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left'; ctx.fillText('CVD', 4, 10);
    }

    // Crosshair vertical on sub-pane
    if (crosshair) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(crosshair.x, 0); ctx.lineTo(crosshair.x, H); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    rsiVals, stochRsiK, stochRsiD, activeIndicators,
    macdLine, macdSignal, macdHist,
    allCandles, cvdCumDeltas, cvdBarDeltas,
    divergence, crosshair,
  ]);

  // ── Trigger redraws ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const el  = canvas.parentElement;
    if (el) {
      const W = el.clientWidth;
      const H = fullscreen ? window.innerHeight - 220 : 340;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      canvas.getContext('2d')?.scale(dpr, dpr);
    }
    render();
  }, [render, fullscreen]);

  useEffect(() => {
    const refs = [
      { ref: rsiRef,  type: 'rsi'  as const, show: activeIndicators.rsi || activeIndicators.stochRsi },
      { ref: macdRef, type: 'macd' as const, show: activeIndicators.macd },
      { ref: volRef,  type: 'vol'  as const, show: activeIndicators.volume },
      { ref: cvdRef,  type: 'cvd'  as const, show: activeIndicators.cvd },
    ];

    const canvas = mainRef.current;
    if (!canvas) return;

    const chartW   = canvas.clientWidth;
    const barW     = coordRef.current.barW || 8;
    const visCount = Math.floor((chartW - PADDING.left - PADDING.right - VP_W) / barW);
    const startI   = coordRef.current.offset || 0;
    const dpr      = window.devicePixelRatio || 1;

    for (const { ref, type, show } of refs) {
      const c = ref.current;
      if (!c || !show) continue;
      if (c.width !== chartW * dpr) {
        c.width  = chartW * dpr;
        c.height = SUB_H * dpr;
        c.style.width  = chartW + 'px';
        c.style.height = SUB_H + 'px';
        c.getContext('2d')?.scale(dpr, dpr);
      }
      renderSubPane(c, rsiVals, stochRsiK, type, startI, visCount, barW);
    }
  }, [renderSubPane, activeIndicators, rsiVals, stochRsiK]);

  // ── Mouse handlers on main canvas ─────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const px     = (e.clientX - rect.left);
    const py     = (e.clientY - rect.top);
    const price  = pixToPrice(py, canvas.clientHeight);
    const barIdx = pixToBar(px);
    setCrosshair({ x: px, barIdx, price });
  }, []);

  const handleMouseLeave = useCallback(() => setCrosshair(null), []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const px     = (e.clientX - rect.left);
    const py     = (e.clientY - rect.top);
    const price  = pixToPrice(py, canvas.clientHeight);
    const barIdx = pixToBar(px);

    if (!activeTool) {
      // Check hit on existing drawing
      const hit = drawings.find(d => {
        if (d.kind === 'hline') return Math.abs(priceToPix(d.price, canvas.clientHeight) - py) < 6;
        return false;
      });
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (!activeDraw) {
      // First click — start
      setActiveDraw({
        kind: activeTool, startX: px, startY: py,
        startPrice: price, startBarIdx: barIdx,
      });
      if (activeTool === 'hline') {
        setDrawings(ds => [...ds, makeHLine(price)]);
        setActiveDraw(null);
      }
    } else {
      // Second click — finish
      if (activeDraw.kind === 'trendline') {
        setDrawings(ds => [...ds, makeTrendLine(activeDraw.startBarIdx, activeDraw.startPrice, barIdx, price)]);
      } else if (activeDraw.kind === 'fib') {
        setDrawings(ds => [...ds, makeFibDrawing(activeDraw.startBarIdx, activeDraw.startPrice, barIdx, price)]);
      } else if (activeDraw.kind === 'rect') {
        setDrawings(ds => [...ds, makeRect(activeDraw.startBarIdx, activeDraw.startPrice, barIdx, price)]);
      }
      setActiveDraw(null);
    }
  }, [activeTool, activeDraw, drawings, priceToPix, pixToBar, pixToPrice]);

  // ── Scroll wheel — load history ───────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaX < -40) loadOlderPage();
  }, [loadOlderPage]);

  // ── MTF confluence data ───────────────────────────────────────────────────
  const mtfConfluence = calcMTFConfluence(mtfSignals);
  const confColor: Record<string, string> = {
    strong_bull: 'var(--green)',
    weak_bull:   'rgba(0,229,160,0.55)',
    neutral:     'var(--text2)',
    weak_bear:   'rgba(255,61,90,0.55)',
    strong_bear: 'var(--red)',
  };
  const confLabel: Record<string, string> = {
    strong_bull: '▲ STRONG BULL',
    weak_bull:   '△ WEAK BULL',
    neutral:     '— NEUTRAL',
    weak_bear:   '▽ WEAK BEAR',
    strong_bear: '▼ STRONG BEAR',
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'relative' };

  return (
    <div ref={wrapRef} style={containerStyle}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        padding: '6px 10px', background: 'var(--bg2)', borderRadius: fullscreen ? 0 : 'var(--radius) var(--radius) 0 0',
        border: '1px solid var(--border)', borderBottom: 'none',
      }}>
        {/* Fullscreen */}
        <button
          onClick={() => setFullscreen(f => !f)}
          title="Fullscreen (F)"
          style={tbBtn(fullscreen)}
        >
          {fullscreen ? '⊠' : '⛶'}
        </button>

        <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />

        {/* Volume Profile */}
        <button onClick={() => setShowVP(v => !v)} style={tbBtn(showVP)} title="Volume Profile">VP</button>

        {/* Auto Fib */}
        <button onClick={() => setShowAutoFib(v => !v)} style={tbBtn(showAutoFib)} title="Auto Fibonacci">𝑓</button>

        <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />

        {/* Drawing tools */}
        {(['hline','trendline','fib','rect'] as DrawingToolKind[]).map(k => (
          <button
            key={k}
            onClick={() => setActiveTool(t => t === k ? null : k)}
            title={TOOL_DEFAULTS[k].label}
            style={tbBtn(activeTool === k)}
          >
            {TOOL_DEFAULTS[k].icon}
          </button>
        ))}

        {drawings.length > 0 && (
          <button
            onClick={() => { setDrawings([]); setSelectedId(null); }}
            title="Clear all drawings"
            style={tbBtn(false, 'var(--red)')}
          >
            ✕
          </button>
        )}

        <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />

        {/* Load older history */}
        <button
          onClick={loadOlderPage}
          disabled={loadingHistory}
          title="Load 200 older candles"
          style={tbBtn(false)}
        >
          {loadingHistory ? '…' : '←+200'}
        </button>

        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginLeft: 4 }}>
          {allCandles.length} bars
        </span>

        {/* Fib score badge */}
        {fiboScore.nearestLabel && (
          <span style={{
            marginLeft: 6, fontSize: 9, fontFamily: 'var(--mono)',
            padding: '2px 7px', borderRadius: 10,
            background: 'rgba(167,139,255,0.12)', color: 'var(--purple)',
            border: '1px solid rgba(167,139,255,0.25)',
          }}>
            Fib {fiboScore.nearestLabel} +{fiboScore.bonus}pt
          </span>
        )}

        {/* Divergence badge */}
        {divergence && (
          <span style={{
            marginLeft: 4, fontSize: 9, fontFamily: 'var(--mono)',
            padding: '2px 7px', borderRadius: 10,
            background: divergence.type.includes('bull') ? 'var(--green-bg)' : 'var(--red-bg)',
            color: divergence.type.includes('bull') ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${divergence.type.includes('bull') ? 'var(--green)' : 'var(--red)'}44`,
          }}>
            {divergence.label} RSI={divergence.rsi?.toFixed(0)}
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
          {activeTool ? `Drawing: ${TOOL_DEFAULTS[activeTool].label} — click to place` : 'F=fullscreen  ← scroll=history  Del=erase'}
        </span>
      </div>

      {/* ── Main canvas ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', lineHeight: 0 }}>
        <canvas
          ref={mainRef}
          style={{
            width: '100%',
            height: fullscreen ? 'calc(100vh - 220px)' : 340,
            display: 'block',
            background: 'var(--bg2)',
            cursor: activeTool ? 'crosshair' : 'default',
            border: '1px solid var(--border)',
            borderBottom: 'none',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>

      {/* ── Sub-panes ────────────────────────────────────────────────────── */}
      {(activeIndicators.rsi || activeIndicators.stochRsi) && (
        <canvas ref={rsiRef}  style={{ width: '100%', height: SUB_H, display: 'block', border: '1px solid var(--border)', borderBottom: 'none', cursor: 'default' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      )}
      {activeIndicators.macd && (
        <canvas ref={macdRef} style={{ width: '100%', height: SUB_H, display: 'block', border: '1px solid var(--border)', borderBottom: 'none', cursor: 'default' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      )}
      {activeIndicators.volume && (
        <canvas ref={volRef}  style={{ width: '100%', height: SUB_H, display: 'block', border: '1px solid var(--border)', borderBottom: 'none', cursor: 'default' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      )}
      {activeIndicators.cvd && (
        <canvas ref={cvdRef}  style={{ width: '100%', height: SUB_H, display: 'block', border: '1px solid var(--border)', cursor: 'default' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
      )}

      {/* ── Multi-TF Confluence Card ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)',
        padding: '10px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            MTF Confluence
          </span>
          {mtfLoading ? (
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>loading…</span>
          ) : (
            <>
              <span style={{
                fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                color: confColor[mtfConfluence.confluence],
                padding: '2px 8px', borderRadius: 10,
                background: `${confColor[mtfConfluence.confluence]}18`,
                border: `1px solid ${confColor[mtfConfluence.confluence]}44`,
              }}>
                {confLabel[mtfConfluence.confluence]}
              </span>

              {mtfSignals.map(s => (
                <div key={s.tf} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 8,
                  background: s.trend === 'bull' ? 'var(--green-bg)'
                            : s.trend === 'bear' ? 'var(--red-bg)'
                            : 'var(--bg3)',
                  border: `1px solid ${
                    s.trend === 'bull' ? 'rgba(0,229,160,0.2)'
                  : s.trend === 'bear' ? 'rgba(255,61,90,0.2)'
                  : 'var(--border)'}`,
                }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)' }}>{s.tf}</span>
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--mono)',
                    color: s.trend === 'bull' ? 'var(--green)' : s.trend === 'bear' ? 'var(--red)' : 'var(--text2)',
                  }}>
                    {s.trend === 'bull' ? '▲' : s.trend === 'bear' ? '▼' : '—'}
                  </span>
                  {s.rsi != null && (
                    <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                      {s.rsi}
                    </span>
                  )}
                </div>
              ))}

              <button
                onClick={loadMTF}
                style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)' }}
              >
                ↺
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Toolbar button helper ─────────────────────────────────────────────────────
function tbBtn(active: boolean, color?: string): React.CSSProperties {
  return {
    padding: '3px 8px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--border2)' : 'var(--border)'}`,
    background: active ? 'var(--bg3)' : 'transparent',
    color: color ?? (active ? 'var(--text)' : 'var(--text3)'),
    transition: 'all .12s',
  };
}