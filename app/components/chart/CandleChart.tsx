'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtK } from '@/lib/indicators';
import { fetchKlines } from '@/lib/api';
import {
  calcVolumeProfile,
  calcAutoFibo, fiboEntryScore,
  detectRSIDivergence,
  calcMTFConfluence,
  type TFSignal, type FiboOverlay,
} from '@/lib/indicators2';
import {
  Drawing, DrawingToolKind, TOOL_DEFAULTS,
  makeHLine, makeTrendLine, makeFibDrawing, makeRect,
  ActiveDraw,
} from '@/lib/drawingTools';
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
  vpWidth:           54,
} as const;

const TIMEFRAMES_FOR_MTF = ['15m', '1h', '4h', '1d'];

const COL = {
  ema9:'#ff6b35', ema20:'#4da6ff', ema50:'#a78bff',
  vwap:'#00d4ff', vwapBand1:'rgba(0,212,255,0.15)', vwapBand2:'rgba(0,212,255,0.07)',
  bb:'rgba(255,184,46,0.7)', bbFill:'rgba(255,184,46,0.05)',
  stBull:'#00e5a0', stBear:'#ff3d5a',
  psar:'#ffb82e',
  bull:'#00e5a0', bear:'#ff3d5a',
  macdLine:'#4da6ff', macdSig:'#ff6b35',
  macdBull:'rgba(0,229,160,0.7)', macdBear:'rgba(255,61,90,0.7)',
  rsi:'#ffb82e', stochK:'#4da6ff', stochD:'#ff6b35',
  adx:'#a78bff', plusDI:'#00e5a0', minusDI:'#ff3d5a',
  obv:'#00d4ff', willR:'#ff6b35', cci:'#a78bff',
  cvdLine:'#e0c0ff',
  vpBull:'rgba(0,229,160,0.5)', vpBear:'rgba(255,61,90,0.4)', vpPOC:'#ffb82e',
  divBull:'rgba(0,229,160,0.9)', divBear:'rgba(255,61,90,0.9)',
  livePrice:'#00e5a0',
};

// ── Canvas setup ──────────────────────────────────────────────────────────────
function setupCanvas(el: HTMLCanvasElement, hPx?: number) {
  const parent = el.parentElement!;
  const w = (parent.clientWidth - 20) || 600;
  const h = hPx ?? (el.getBoundingClientRect().height || parseInt(el.style.height) || 220);
  if (el.width !== w * DPR || el.height !== h * DPR) {
    el.width = w * DPR; el.height = h * DPR;
    el.style.width = w + 'px'; el.style.height = h + 'px';
  }
  const ctx = el.getContext('2d')!;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { ctx, w, h };
}

// ── Pane coords ───────────────────────────────────────────────────────────────
function makePaneCoords(w: number, h: number, padR = 68, padL = 2, padT = 4, padB = 4, n = 80) {
  const cW = w - padR - padL, cH = h - padT - padB, cw = cW / n;
  const tx = (i: number) => padL + i * cw + cw / 2;
  return { cW, cH, cw, padL, padR, padT, padB, tx };
}

// ── Generic oscillator pane ───────────────────────────────────────────────────
function drawOscPane(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  series: (number | null)[], color: string, lo: number, hi: number,
  levels: Array<{ v: number; col?: string; dash?: boolean }>, n: number,
  series2?: { vals: (number | null)[]; color: string },
) {
  const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
  const range = hi - lo || 1;
  const ty = (v: number) => padT + (1 - (v - lo) / range) * cH;
  const startI = n - series.length;
  levels.forEach(lv => {
    ctx.strokeStyle = lv.col ?? GC; ctx.lineWidth = 0.5;
    if (lv.dash) ctx.setLineDash([3, 3]); else ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(padL, ty(lv.v)); ctx.lineTo(padL + cW, ty(lv.v)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
    ctx.fillText(String(lv.v), padL + cW + 4, ty(lv.v) + 3.5);
  });
  const pts = series.map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v) } : null).filter(Boolean) as { x: number; y: number }[];
  if (pts.length > 1) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
  }
  if (series2) {
    const pts2 = series2.vals.map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v) } : null).filter(Boolean) as { x: number; y: number }[];
    if (pts2.length > 1) {
      ctx.strokeStyle = series2.color; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); pts2.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

const sharedHoverX = { current: -1 };

export default function CandleChart() {
  const [showPanel, setShowPanel]         = useState(false);
  const [fullscreen, setFullscreen]       = useState(false);
  const [activeTool, setActiveTool]       = useState<DrawingToolKind | null>(null);
  const [drawings, setDrawings]           = useState<Drawing[]>([]);
  const [activeDraw, setActiveDraw]       = useState<ActiveDraw | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);

  // ── Doc 4 additions ───────────────────────────────────────────────────────
  const [showVP, setShowVP]               = useState(true);
  const [showAutoFib, setShowAutoFib]     = useState(true);
  const [historyCandles, setHistoryCandles] = useState<ReturnType<typeof useStore.getState>['candles']>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [mtfSignals, setMtfSignals]       = useState<TFSignal[]>([]);
  const [mtfLoading, setMtfLoading]       = useState(false);
  const histPageRef = useRef(0);

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
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    candles, currentCandle, crossovers, suggestion, tf, sym,
    livePrice,
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
    patterns, activeIndicators,
  } = useStore();

  // ── All candles (live + history) ──────────────────────────────────────────
  const committedCandles = useMemo(() => {
    if (!currentCandle) return candles;
    const last = candles[candles.length - 1];
    if (last && last.t === currentCandle.t) return candles;
    return [...candles, currentCandle];
  }, [candles, currentCandle]);

  const allCandles = useMemo(
    () => historyCandles.length ? [...historyCandles, ...committedCandles] : committedCandles,
    [historyCandles, committedCandles],
  );

  const visCandles = useMemo(() => allCandles.slice(-CHART.visibleCandles), [allCandles]);
  const visOffset  = useMemo(() => Math.max(0, allCandles.length - CHART.visibleCandles), [allCandles]);

  // Derived overlays
  const volumeProfile = useMemo(() => calcVolumeProfile(visCandles, 24), [visCandles]);
  const fiboOverlay   = useMemo(() => showAutoFib && allCandles.length >= 10 ? calcAutoFibo(allCandles, 50) : null, [allCandles, showAutoFib]);
  const divergence    = useMemo(() => detectRSIDivergence(allCandles, rsiVals), [allCandles, rsiVals]);
  const lastAtr       = atrVals.length ? atrVals[atrVals.length - 1] : null;
  const fiboScore     = useMemo(
    () => fiboOverlay && livePrice ? fiboEntryScore(livePrice, fiboOverlay, lastAtr) : { bonus: 0, nearestLabel: null },
    [fiboOverlay, livePrice, lastAtr],
  );

  // ── History pagination ────────────────────────────────────────────────────
  const loadOlderPage = useCallback(async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    try {
      const oldest = allCandles[0];
      if (!oldest) { setLoadingHistory(false); return; }
      const endTime = oldest.t - 1;
      const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=200&endTime=${endTime}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed');
      const raw = await r.json() as string[][];
      if (!raw.length) { setLoadingHistory(false); return; }
      const older = raw.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
      setHistoryCandles(prev => [...older, ...prev]);
      histPageRef.current += 1;
    } catch { /* silent */ }
    setLoadingHistory(false);
  }, [sym, tf, allCandles, loadingHistory]);

  // Reset history when symbol/tf changes
  useEffect(() => {
    setHistoryCandles([]);
    histPageRef.current = 0;
  }, [sym, tf]);

  // ── MTF confluence ────────────────────────────────────────────────────────
  const loadMTF = useCallback(async () => {
    setMtfLoading(true);
    const results: TFSignal[] = [];
    for (const t of TIMEFRAMES_FOR_MTF) {
      try {
        const ks = await fetchKlines(sym, t);
        if (!ks || ks.length < 20) { results.push({ tf: t, trend: 'neutral', rsi: null, score: 50 }); continue; }
        let e9v = ks[0].c, e20v = ks[0].c, e50v = ks[0].c;
        const k9 = 2/10, k20 = 2/21, k50 = 2/51;
        for (const k of ks) {
          e9v  = k.c * k9  + e9v  * (1 - k9);
          e20v = k.c * k20 + e20v * (1 - k20);
          e50v = k.c * k50 + e50v * (1 - k50);
        }
        let gains = 0, losses = 0;
        const last14 = ks.slice(-15);
        for (let i = 1; i < last14.length; i++) {
          const ch = last14[i].c - last14[i-1].c;
          if (ch > 0) gains += ch; else losses -= ch;
        }
        const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));
        const trend = e9v > e20v && e20v > e50v ? 'bull' : e9v < e20v && e20v < e50v ? 'bear' : 'neutral';
        const score = trend === 'bull' ? Math.min(100, 50 + rsi / 2) : trend === 'bear' ? Math.max(0, 50 - (100 - rsi) / 2) : 50;
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

  // ── Keyboard / event shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') setFullscreen(fs => !fs);
      if (e.key === 'Escape') { setFullscreen(false); setActiveTool(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setDrawings(ds => ds.filter(d => d.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    const fsListener  = () => setFullscreen(fs => !fs);
    const indListener = () => setShowPanel(true);
    window.addEventListener('chart:fullscreen', fsListener as EventListener);
    window.addEventListener('chart:openIndicators', indListener as EventListener);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('chart:fullscreen', fsListener as EventListener);
      window.removeEventListener('chart:openIndicators', indListener as EventListener);
    };
  }, [selectedId]);

  // ── Price pane coordinate factory ─────────────────────────────────────────
  function makePriceCoords(w: number, h: number) {
    const { padRight: padR, padLeft: padL, padTop: padT, padBottom: padB, vpWidth } = CHART;
    const cW = w - padR - padL - vpWidth;
    const cH = h - padT - padB;
    const n  = visCandles.length;
    const cw = cW / n;
    let pMin = Math.min(...visCandles.map(c => c.l));
    let pMax = Math.max(...visCandles.map(c => c.h));
    if (activeIndicators.bb) {
      bbUpper.slice(visOffset).forEach(v => { if (v) pMax = Math.max(pMax, v); });
      bbLower.slice(visOffset).forEach(v => { if (v) pMin = Math.min(pMin, v); });
    }
    if (fiboOverlay) {
      fiboOverlay.levels.forEach(l => { pMin = Math.min(pMin, l.price); pMax = Math.max(pMax, l.price); });
    }
    if (livePrice > 0) { pMin = Math.min(pMin, livePrice); pMax = Math.max(pMax, livePrice); }
    const pad = (pMax - pMin) * CHART.pricePadPct || pMax * 0.001;
    const plo = pMin - pad, phi = pMax + pad, pR = phi - plo || 1;
    const tx = (i: number) => padL + i * cw + cw / 2;
    const ty = (p: number) => padT + cH - (p - plo) / pR * cH;
    return { cW, cH, cw, plo, phi, pR, padL, padT, tx, ty, n, vpX: padL + cW };
  }

  // ── Draw Price Pane ───────────────────────────────────────────────────────
  const drawPrice = useCallback(() => {
    const el = priceRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    const n = visCandles.length;
    if (n < 2) return;
    const { cW, cH, plo, phi, pR, padL, padT, tx, ty, vpX } = makePriceCoords(w, h);

    ctx.clearRect(0, 0, w, h);

    // Grid
    for (let i = 0; i <= CHART.gridDivisions; i++) {
      const y = padT + cH * i / CHART.gridDivisions;
      ctx.strokeStyle = GC; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(phi - pR * i / CHART.gridDivisions), padL + cW + 4, y + 3.5);
    }

    // ── Fibonacci overlay ────────────────────────────────────────────────────
    if (activeIndicators.fib && fiboOverlay) {
      ctx.setLineDash([4, 4]);
      fiboOverlay.levels.forEach(lv => {
        if (lv.price < plo || lv.price > phi) return;
        const ly = ty(lv.price);
        ctx.strokeStyle = lv.color + 'aa'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + cW, ly); ctx.stroke();
        ctx.fillStyle = lv.color; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'right';
        ctx.fillText(lv.label + ' ' + fmtPrice(lv.price), padL + cW - 2, ly - 2);
      });
      ctx.setLineDash([]);
      const l382 = fiboOverlay.levels.find(l => l.ratio === 0.382);
      const l618 = fiboOverlay.levels.find(l => l.ratio === 0.618);
      if (l382 && l618) {
        const y1 = ty(Math.max(l382.price, l618.price));
        const y2 = ty(Math.min(l382.price, l618.price));
        ctx.fillStyle = 'rgba(167,139,255,0.06)';
        ctx.fillRect(padL, y1, cW, y2 - y1);
      }
    }

    // ── Suggestion levels ───────────────────────────────────────────────────
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
        ctx.fillStyle = lv.color; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
        ctx.fillText(lv.label, padL + cW + 4, ly + 3.5);
      });
      ctx.setLineDash([]);
    }

    // ── Bollinger Bands ──────────────────────────────────────────────────────
    if (activeIndicators.bb) {
      const ubSlice = bbUpper.slice(visOffset), mbSlice = bbMiddle.slice(visOffset), lbSlice = bbLower.slice(visOffset);
      const startI = n - ubSlice.length;
      ctx.beginPath();
      ubSlice.forEach((v, i) => { if (v == null) return; ctx[i === 0 ? 'moveTo' : 'lineTo'](tx(startI + i), ty(v)); });
      lbSlice.slice().reverse().forEach((v, i) => { if (v == null) return; ctx.lineTo(tx(startI + lbSlice.length - 1 - i), ty(v)); });
      ctx.closePath(); ctx.fillStyle = COL.bbFill; ctx.fill();
      [ubSlice, mbSlice, lbSlice].forEach((sl, bi) => {
        ctx.strokeStyle = COL.bb; ctx.lineWidth = bi === 1 ? 0.8 : 1; ctx.lineJoin = 'round';
        if (bi === 1) ctx.setLineDash([3, 3]);
        ctx.beginPath(); let started = false;
        sl.forEach((v, i) => { if (v == null) { started = false; return; } if (!started) { ctx.moveTo(tx(startI + i), ty(v)); started = true; } else ctx.lineTo(tx(startI + i), ty(v)); });
        ctx.stroke(); ctx.setLineDash([]);
      });
    }

    // ── VWAP ────────────────────────────────────────────────────────────────
    if (activeIndicators.vwap) {
      const vSlice = vwapVals.slice(visOffset), startI = n - vSlice.length;
      if (activeIndicators.vwapBands) {
        [[vwapUpper2, vwapLower2, COL.vwapBand2], [vwapUpper1, vwapLower1, COL.vwapBand1]].forEach(([u, l, fill]) => {
          const us = (u as (number|null)[]).slice(visOffset), ls = (l as (number|null)[]).slice(visOffset);
          ctx.beginPath();
          us.forEach((v, i) => { if (v == null) return; ctx[i === 0 ? 'moveTo' : 'lineTo'](tx(startI + i), ty(v)); });
          ls.slice().reverse().forEach((v, i) => { if (v == null) return; ctx.lineTo(tx(startI + ls.length - 1 - i), ty(v)); });
          ctx.closePath(); ctx.fillStyle = fill as string; ctx.fill();
        });
      }
      ctx.strokeStyle = COL.vwap; ctx.lineWidth = 1.4; ctx.setLineDash([5, 3]);
      ctx.beginPath(); let vs = false;
      vSlice.forEach((v, i) => { if (v == null) { vs = false; return; } if (!vs) { ctx.moveTo(tx(startI + i), ty(v)); vs = true; } else ctx.lineTo(tx(startI + i), ty(v)); });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // ── SuperTrend ───────────────────────────────────────────────────────────
    if (activeIndicators.superTrend) {
      const stSlice = stVals.slice(visOffset), bullSlice = stBull.slice(visOffset), startI = n - stSlice.length;
      let prevBull = bullSlice[0]; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      let started = false;
      stSlice.forEach((v, i) => {
        if (v == null) { started = false; return; }
        const bull = bullSlice[i];
        if (bull !== prevBull || !started) {
          if (started) ctx.stroke();
          ctx.strokeStyle = bull ? COL.stBull : COL.stBear;
          ctx.beginPath(); ctx.moveTo(tx(startI + i), ty(v));
          started = true; prevBull = bull;
        } else { ctx.lineTo(tx(startI + i), ty(v)); }
      });
      if (started) ctx.stroke();
    }

    // ── PSAR ────────────────────────────────────────────────────────────────
    if (activeIndicators.psar) {
      const psSlice = psarVals.slice(visOffset), pbSlice = psarBull.slice(visOffset), startI = n - psSlice.length;
      psSlice.forEach((v, i) => {
        if (v == null) return;
        ctx.fillStyle = pbSlice[i] ? COL.stBull : COL.stBear;
        ctx.beginPath(); ctx.arc(tx(startI + i), ty(v), 2.5, 0, Math.PI * 2); ctx.fill();
      });
    }

    // ── EMA lines ────────────────────────────────────────────────────────────
    ([
      [e50s.slice(visOffset), COL.ema50, activeIndicators.ema50],
      [e20s.slice(visOffset), COL.ema20, activeIndicators.ema20],
      [e9s.slice(visOffset),  COL.ema9,  activeIndicators.ema9],
    ] as [(number|null)[], string, boolean][]).forEach(([vals, col, show]) => {
      if (!show || vals.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => { if (v == null) { started = false; return; } if (!started) { ctx.moveTo(tx(i), ty(v)); started = true; } else ctx.lineTo(tx(i), ty(v)); });
      ctx.stroke();
    });

    // ── Candles ──────────────────────────────────────────────────────────────
    const cw2 = (w - CHART.padRight - CHART.padLeft - CHART.vpWidth) / n;
    visCandles.forEach((c, i) => {
      const x = tx(i), bw = Math.max(2, cw2 * CHART.candleWidthRatio);
      const isLast = i === n - 1;
      const col = isLast ? '#888' : (c.c >= c.o ? COL.bull : COL.bear);
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, ty(c.h)); ctx.lineTo(x, ty(c.l)); ctx.stroke();
      const bT = ty(Math.max(c.o, c.c)), bB = ty(Math.min(c.o, c.c));
      ctx.fillStyle = isLast ? 'rgba(140,140,140,0.5)' : col;
      ctx.fillRect(x - bw / 2, bT, bw, Math.max(1, bB - bT));
    });

    // ── Crossover markers ────────────────────────────────────────────────────
    crossovers.forEach((x: { idx: number; price: number; type: string }) => {
      const vi = x.idx - visOffset;
      if (vi < 0 || vi >= n) return;
      const candle = allCandles[x.idx];
      if (!candle) return;
      ctx.fillStyle = x.type === 'bull' ? 'rgba(0,229,160,0.9)' : 'rgba(255,61,90,0.9)';
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(x.type === 'bull' ? '▲' : '▼', tx(vi), ty(candle.l) + 14);
    });

    // ── Candlestick pattern markers ───────────────────────────────────────────
    if (activeIndicators.patterns) {
      patterns.slice(visOffset).forEach((pats, i) => {
        if (!pats?.length) return;
        const candle = visCandles[i];
        if (!candle) return;
        const bull = pats.some(p => p.bull);
        ctx.fillStyle = bull ? 'rgba(0,229,160,0.8)' : 'rgba(255,61,90,0.8)';
        ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(pats[0].label, tx(i), bull ? ty(candle.l) + 22 : ty(candle.h) - 6);
      });
    }

    // ── Divergence markers on price ───────────────────────────────────────────
    if (divergence) {
      const vi = divergence.barIdx - (allCandles.length - visCandles.length);
      if (vi >= 0 && vi < n) {
        const isBull = divergence.type === 'bullish' || divergence.type === 'hidden_bull';
        ctx.fillStyle = isBull ? COL.divBull : COL.divBear;
        ctx.font = 'bold 9px JetBrains Mono,monospace'; ctx.textAlign = 'center';
        const candle = visCandles[vi];
        if (candle) ctx.fillText(divergence.label, tx(vi), isBull ? ty(candle.l) + 30 : ty(candle.h) - 14);
      }
    }

    // ── Saved drawings ───────────────────────────────────────────────────────
    drawings.forEach(d => drawDrawing(ctx, d, ty, tx, padL, cW, selectedId === d.id));

    // ── Volume Profile (right side) ──────────────────────────────────────────
    if (showVP && activeIndicators.volumeProfile && volumeProfile.buckets.length) {
      const maxVol = Math.max(...volumeProfile.buckets.map(b => b.vol));
      const vpAreaW = CHART.vpWidth - 6;
      volumeProfile.buckets.forEach(b => {
        if (b.price < plo || b.price > phi) return;
        const barW = (b.vol / maxVol) * vpAreaW;
        const y    = ty(b.price);
        const barH = Math.max(1, cH / volumeProfile.buckets.length - 1);
        const isPOC = Math.abs(b.price - volumeProfile.poc) < (phi - plo) / volumeProfile.buckets.length;
        ctx.fillStyle = isPOC ? COL.vpPOC : (b.buyVol >= b.sellVol ? COL.vpBull : COL.vpBear);
        ctx.fillRect(vpX + 2, y - barH / 2, barW, barH);
      });
      const pocY = ty(volumeProfile.poc);
      ctx.strokeStyle = COL.vpPOC; ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, pocY); ctx.lineTo(vpX, pocY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.vpPOC; ctx.font = '8px JetBrains Mono,monospace'; ctx.textAlign = 'left';
      ctx.fillText('POC', vpX + 2, pocY - 2);
    }

    // ── Live price line ───────────────────────────────────────────────────────
    if (livePrice > 0 && livePrice >= plo && livePrice <= phi) {
      const ly = ty(livePrice);
      ctx.strokeStyle = 'rgba(0,229,160,0.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + cW, ly); ctx.stroke();
      ctx.setLineDash([]);
      // Badge on right axis
      const txt = fmtPrice(livePrice);
      ctx.font = '9px JetBrains Mono,monospace';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,229,160,0.18)';
      ctx.fillRect(padL + cW + 2, ly - 8, tw + 10, 16);
      ctx.strokeStyle = 'rgba(0,229,160,0.5)'; ctx.lineWidth = 0.6;
      ctx.strokeRect(padL + cW + 2, ly - 8, tw + 10, 16);
      ctx.fillStyle = COL.livePrice; ctx.textAlign = 'left';
      ctx.fillText(txt, padL + cW + 7, ly + 3.5);
    }

    // ── Fib score badge (top-left) ────────────────────────────────────────────
    if (fiboScore.nearestLabel && fiboScore.bonus > 0) {
      ctx.font = '9px JetBrains Mono,monospace';
      const label = `Fib ${fiboScore.nearestLabel} +${fiboScore.bonus}pt`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(167,139,255,0.15)';
      ctx.fillRect(padL + 4, padT + 4, tw + 10, 14);
      ctx.fillStyle = '#a78bff'; ctx.textAlign = 'left';
      ctx.fillText(label, padL + 9, padT + 14);
    }

    // ── X-axis time labels ────────────────────────────────────────────────────
    const step = Math.max(1, Math.floor(n / 6));
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '8px JetBrains Mono,monospace'; ctx.textAlign = 'center';
    for (let i = step; i < n - 1; i += step) {
      const c = visCandles[i];
      if (!c?.t) continue;
      const d = new Date(c.t);
      const label = tf === '1d' ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
      ctx.fillText(label, tx(i), h - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visCandles, allCandles, visOffset, e9s, e20s, e50s,
      bbUpper, bbMiddle, bbLower, vwapVals, vwapUpper1, vwapLower1, vwapUpper2, vwapLower2,
      stVals, stBull, psarVals, psarBull, crossovers, patterns, suggestion, tf,
      activeIndicators, fiboOverlay, fiboScore, divergence, drawings, selectedId,
      volumeProfile, showVP, livePrice]);

  // ── Draw a single Drawing object ──────────────────────────────────────────
  function drawDrawing(
    ctx: CanvasRenderingContext2D, d: Drawing,
    ty: (p: number) => number, tx: (i: number) => number,
    padL: number, cW: number, selected: boolean,
  ) {
    ctx.save();
    ctx.strokeStyle = selected ? '#fff' : d.color;
    ctx.lineWidth   = selected ? 2 : 1.5;
    ctx.setLineDash([]);
    if (d.kind === 'hline') {
      const y = ty(d.price);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      if (d.label) { ctx.fillStyle = d.color; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'right'; ctx.fillText(d.label || fmtPrice(d.price), padL + cW - 4, y - 3); }
    } else if (d.kind === 'trendline') {
      ctx.beginPath(); ctx.moveTo(tx(d.x1), ty(d.y1)); ctx.lineTo(tx(d.x2), ty(d.y2)); ctx.stroke();
    } else if (d.kind === 'fib') {
      const range = d.y1 - d.y2;
      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const fibColors = ['#ff6b35','#ffb82e','#00e5a0','#4da6ff','#a78bff','#ff3d5a','#ff6b35'];
      fibLevels.forEach((ratio, i) => {
        const price = d.y1 - ratio * range, y = ty(price);
        ctx.strokeStyle = fibColors[i] + 'cc'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(tx(d.x1), y); ctx.lineTo(tx(d.x2), y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = fibColors[i]; ctx.font = '8px JetBrains Mono,monospace'; ctx.textAlign = 'right';
        ctx.fillText(`${(ratio * 100).toFixed(1)}% ${fmtPrice(price)}`, tx(d.x2) - 4, y - 2);
      });
    } else if (d.kind === 'rect') {
      const x1 = tx(d.x1), y1 = ty(d.y1), x2 = tx(d.x2), y2 = ty(d.y2);
      ctx.fillStyle = d.color.replace(')', `, ${d.fillOpacity})`).replace('rgb', 'rgba');
      ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    }
    ctx.restore();
  }

  // ── Crosshair overlay ─────────────────────────────────────────────────────
  const drawCrosshair = useCallback((idx: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    if (idx < 0 || idx >= visCandles.length) return;
    const { cH, padL, padT, tx } = makePriceCoords(w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(tx(idx), padT); ctx.lineTo(tx(idx), padT + cH); ctx.stroke();
    ctx.setLineDash([]);
    sharedHoverX.current = idx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visCandles]);

  // ── Sub-pane draw functions ───────────────────────────────────────────────
  const drawMACD = useCallback(() => {
    const el = macdRef.current;
    if (!el || !activeIndicators.macd) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
    const hSlice = macdHist.slice(visOffset), lSlice = macdLine.slice(visOffset), sSlice = macdSignal.slice(visOffset);
    const startI = n - hSlice.length;
    const allV = [...hSlice, ...lSlice, ...sSlice].filter(v => v != null) as number[];
    if (!allV.length) return;
    const loV = Math.min(...allV), hiV = Math.max(...allV), range = hiV - loV || 1;
    const midY = padT + cH / 2, ty = (v: number) => padT + (1 - (v - loV) / range) * cH;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + cW, midY); ctx.stroke();
    hSlice.forEach((v, i) => {
      if (v == null) return;
      const barH = Math.abs(ty(v) - ty(0));
      ctx.fillStyle = v >= 0 ? COL.macdBull : COL.macdBear;
      ctx.fillRect(padL + (startI + i) * cw + 1, v >= 0 ? ty(v) : ty(0), Math.max(1, cw - 2), Math.max(1, barH));
    });
    [[lSlice, COL.macdLine, 1.5], [sSlice, COL.macdSig, 1]].forEach(([sl, col, lw]) => {
      const series = sl as (number|null)[];
      ctx.strokeStyle = col as string; ctx.lineWidth = lw as number; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      series.forEach((v, i) => { if (v == null) { started = false; return; } if (!started) { ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)); started = true; } else ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v)); });
      ctx.stroke();
    });
  }, [macdHist, macdLine, macdSignal, visOffset, activeIndicators.macd]);

  const drawRSI = useCallback(() => {
    const el = rsiRef.current;
    if (!el || !activeIndicators.rsi) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    const rv = rsiVals.slice(visOffset);
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
    const ty = (v: number) => padT + (100 - v) / 100 * cH;
    ctx.fillStyle = 'rgba(255,61,90,0.05)'; ctx.fillRect(padL, padT, cW, ty(70) - padT);
    ctx.fillStyle = 'rgba(0,229,160,0.05)'; ctx.fillRect(padL, ty(30), cW, padT + cH - ty(30));
    drawOscPane(ctx, w, h, rv, COL.rsi, 0, 100,
      [{ v:70, col:'rgba(255,61,90,0.3)', dash:true }, { v:50, col:'rgba(255,255,255,0.08)' }, { v:30, col:'rgba(0,229,160,0.3)', dash:true }], n);
    if (divergence) {
      const vi = divergence.barIdx - (allCandles.length - n);
      if (vi >= 0 && vi < n && rv[vi - (n - rv.length)] != null) {
        const startI = n - rv.length;
        const x = padL + (startI + (vi - (n - rv.length))) * cw + cw / 2;
        const y = ty(rv[vi - (n - rv.length)] as number);
        const isBull = divergence.type === 'bullish' || divergence.type === 'hidden_bull';
        ctx.fillStyle = isBull ? COL.divBull : COL.divBear;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    const startI = n - rv.length;
    const validPts = rv.map((v, i) => v != null ? { x: padL + (startI + i) * cw + cw / 2, y: ty(v as number) } : null).filter(Boolean) as { x: number; y: number }[];
    if (validPts.length > 1) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
      grad.addColorStop(0, 'rgba(255,184,46,0.15)'); grad.addColorStop(1, 'rgba(255,184,46,0)');
      ctx.beginPath(); ctx.moveTo(validPts[0].x, padT + cH);
      validPts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(validPts[validPts.length - 1].x, padT + cH);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }
  }, [rsiVals, visOffset, activeIndicators.rsi, divergence, allCandles]);

  const drawStochRSI = useCallback(() => {
    const el = stochRef.current;
    if (!el || !activeIndicators.stochRsi) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    drawOscPane(ctx, w, h, stochRsiK.slice(visOffset), COL.stochK, 0, 100,
      [{ v:80, col:'rgba(255,61,90,0.3)', dash:true }, { v:50, col:'rgba(255,255,255,0.08)' }, { v:20, col:'rgba(0,229,160,0.3)', dash:true }],
      CHART.visibleCandles, { vals: stochRsiD.slice(visOffset), color: COL.stochD });
  }, [stochRsiK, stochRsiD, visOffset, activeIndicators.stochRsi]);

  const drawADX = useCallback(() => {
    const el = adxRef.current;
    if (!el || !activeIndicators.adx) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    drawOscPane(ctx, w, h, adxVals.slice(visOffset), COL.adx, 0, 100,
      [{ v:25, col:'rgba(167,139,255,0.3)', dash:true }, { v:50, col:'rgba(255,255,255,0.06)' }], n);
    [{ vals: plusDI.slice(visOffset), col: COL.plusDI }, { vals: minusDI.slice(visOffset), col: COL.minusDI }].forEach(({ vals, col }) => {
      const { cW, cw, padL, padT, cH } = makePaneCoords(w, h, 68, 2, 4, 4, n);
      const startI = n - vals.length;
      const ty = (v: number) => padT + (1 - v / 100) * cH;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => { if (v == null) { started = false; return; } if (!started) { ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)); started = true; } else ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v)); });
      ctx.stroke(); ctx.setLineDash([]);
    });
  }, [adxVals, plusDI, minusDI, visOffset, activeIndicators.adx]);

  const drawWillR = useCallback(() => {
    const el = willRRef.current;
    if (!el || !activeIndicators.williamsR) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    drawOscPane(ctx, w, h, willRVals.slice(visOffset), COL.willR, -100, 0,
      [{ v:-20, col:'rgba(255,61,90,0.3)', dash:true }, { v:-50, col:'rgba(255,255,255,0.08)' }, { v:-80, col:'rgba(0,229,160,0.3)', dash:true }],
      CHART.visibleCandles);
  }, [willRVals, visOffset, activeIndicators.williamsR]);

  const drawCCI = useCallback(() => {
    const el = cciRef.current;
    if (!el || !activeIndicators.cci) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const cv = cciVals.slice(visOffset);
    const allV = cv.filter(v => v != null) as number[];
    const lo = Math.min(-200, ...allV), hi = Math.max(200, ...allV);
    drawOscPane(ctx, w, h, cv, COL.cci, lo, hi,
      [{ v:100, col:'rgba(255,61,90,0.3)', dash:true }, { v:0, col:'rgba(255,255,255,0.08)' }, { v:-100, col:'rgba(0,229,160,0.3)', dash:true }],
      CHART.visibleCandles);
  }, [cciVals, visOffset, activeIndicators.cci]);

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
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, avgY); ctx.lineTo(padL + cW, avgY); ctx.stroke(); ctx.setLineDash([]);
    visCandles.forEach((c, i) => {
      const isLast = i === visCandles.length - 1, aboveAvg = c.v > avgV;
      ctx.fillStyle = isLast ? 'rgba(150,148,138,0.3)' : c.c >= c.o ? (aboveAvg ? 'rgba(0,229,160,0.55)' : 'rgba(0,229,160,0.25)') : (aboveAvg ? 'rgba(255,61,90,0.55)' : 'rgba(255,61,90,0.25)');
      const bH = Math.max(1, (c.v / maxV) * cH);
      ctx.fillRect(padL + i * cw + 1, padT + cH - bH, Math.max(1, cw - 2), bH);
    });
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
    ctx.fillText('avg ' + fmtK(avgV), padL + cW + 4, avgY + 3.5);
  }, [visCandles, activeIndicators.volume]);

  const drawOBV = useCallback(() => {
    const el = obvRef.current;
    if (!el || !activeIndicators.obv) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const n = CHART.visibleCandles;
    const ov = obvVals.slice(visOffset);
    if (ov.length < 2) return;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 4, 4, n);
    const lo = Math.min(...ov), hi = Math.max(...ov), range = hi - lo || 1;
    const ty = (v: number) => padT + (1 - (v - lo) / range) * cH;
    const startI = n - ov.length;
    ctx.strokeStyle = COL.obv; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ov.forEach((v, i) => i === 0 ? ctx.moveTo(padL + (startI + i) * cw + cw / 2, ty(v)) : ctx.lineTo(padL + (startI + i) * cw + cw / 2, ty(v)));
    ctx.stroke();
    ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
    ctx.fillText(fmtK(ov[ov.length - 1]), padL + cW + 4, ty(ov[ov.length - 1]) + 3.5);
  }, [obvVals, visOffset, activeIndicators.obv]);

  const drawCVD = useCallback(() => {
    const el = cvdRef.current;
    if (!el || !activeIndicators.cvd) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const barSlice = cvdBarDeltas.slice(visOffset), cumSlice = cvdCumDeltas.slice(visOffset);
    const n = visCandles.length;
    if (!barSlice.length || n < 2) return;
    const { cW, cH, cw, padL, padT } = makePaneCoords(w, h, 68, 2, 6, 4, n);
    const maxBarAbs = Math.max(...barSlice.map(Math.abs), 1);
    const midY = padT + cH / 2, barScale = (cH / 2) / maxBarAbs;
    const cumMin = Math.min(...cumSlice), cumMax = Math.max(...cumSlice), cumRng = (cumMax - cumMin) || 1;
    const tyCum = (v: number) => padT + (1 - (v - cumMin) / cumRng) * cH;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + cW, midY); ctx.stroke(); ctx.setLineDash([]);
    barSlice.forEach((delta, i) => {
      const barH = Math.max(1, Math.abs(delta) * barScale);
      ctx.fillStyle = delta >= 0 ? 'rgba(0,229,160,0.45)' : 'rgba(255,61,90,0.45)';
      ctx.fillRect(padL + i * cw + 1, delta >= 0 ? midY - barH : midY, Math.max(1, cw - 2), barH);
    });
    const cumPts = cumSlice.map((v, i) => ({ x: padL + i * cw + cw / 2, y: tyCum(v) }));
    if (cumPts.length > 1) {
      ctx.strokeStyle = COL.cvdLine; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); cumPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
    }
    const lastCum = cumSlice[cumSlice.length - 1];
    if (lastCum != null) {
      ctx.fillStyle = COL.cvdLine; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtK(lastCum), padL + cW + 4, tyCum(lastCum) + 3.5);
    }
  }, [cvdBarDeltas, cvdCumDeltas, visCandles, visOffset, activeIndicators.cvd]);

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const getBarIdx = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const n  = visCandles.length;
    const cW = rect.width - CHART.padRight - CHART.padLeft - CHART.vpWidth;
    return Math.floor((mx - CHART.padLeft) / (cW / n));
  }, [visCandles]);

  const getPrice = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const el = overlayRef.current!;
    const rect = el.getBoundingClientRect();
    const { ctx, w, h } = setupCanvas(el);
    const { plo, pR, padT, cH } = makePriceCoords(w, h);
    const my = e.clientY - rect.top;
    return plo + (1 - (my - padT) / cH) * pR;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visCandles]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const i  = getBarIdx(e);
    const tt = ttRef.current;
    if (!tt) return;

    if (i < 0 || i >= visCandles.length) {
      tt.style.opacity = '0'; drawCrosshair(-1); return;
    }
    drawCrosshair(i);

    // In-progress drawing preview
    if (activeDraw) {
      const el = overlayRef.current!;
      const { ctx, w, h } = setupCanvas(el);
      const { ty, tx, padL, cW } = makePriceCoords(w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = TOOL_DEFAULTS[activeDraw.kind].color;
      ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      const curPrice = getPrice(e);
      if (activeDraw.kind === 'hline') {
        const y = ty(activeDraw.startPrice);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(tx(activeDraw.startBarIdx), ty(activeDraw.startPrice));
        ctx.lineTo(tx(i), ty(curPrice)); ctx.stroke();
      }
      ctx.setLineDash([]);
      return;
    }

    // Tooltip rows
    const c      = visCandles[i];
    const absIdx = visOffset + i;
    const chPct  = c.o ? ((c.c - c.o) / c.o * 100).toFixed(2) : '0.00';
    const col    = c.c >= c.o ? COL.bull : COL.bear;
    const rows: [string, string, string?][] = [
      ['O', fmtPrice(c.o)], ['H', fmtPrice(c.h)], ['L', fmtPrice(c.l)],
      ['C', fmtPrice(c.c), col], ['Chg', (c.c >= c.o ? '+' : '') + chPct + '%', col],
      ['Vol', fmtK(c.v)],
    ];
    const maybeAdd = (label: string, arr: (number|null|undefined)[], color?: string, fmt?: (v: number) => string) => {
      const v = arr[absIdx]; if (v != null) rows.push([label, fmt ? fmt(v as number) : fmtPrice(v as number), color]);
    };
    if (activeIndicators.vwap)        maybeAdd('VWAP', vwapVals,   COL.vwap);
    if (activeIndicators.ema9)        maybeAdd('E9',   e9s,        COL.ema9);
    if (activeIndicators.ema20)       maybeAdd('E20',  e20s,       COL.ema20);
    if (activeIndicators.ema50)       maybeAdd('E50',  e50s,       COL.ema50);
    if (activeIndicators.bb) {
      maybeAdd('BB↑', bbUpper,  COL.bb);
      maybeAdd('BB—', bbMiddle, COL.bb);
      maybeAdd('BB↓', bbLower,  COL.bb);
    }
    if (activeIndicators.superTrend)  maybeAdd('ST',   stVals,    stBull[absIdx] ? COL.stBull : COL.stBear);
    if (activeIndicators.psar)        maybeAdd('PSAR', psarVals,  COL.psar);
    if (activeIndicators.rsi)         maybeAdd('RSI',  rsiVals,   COL.rsi,      v => String(Math.round(v)));
    if (activeIndicators.macd) {
      maybeAdd('MACD', macdLine,   COL.macdLine, v => v.toFixed(4));
      maybeAdd('Sig',  macdSignal, COL.macdSig,  v => v.toFixed(4));
      maybeAdd('Hist', macdHist,   undefined,    v => v.toFixed(4));
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
    if (activeIndicators.williamsR)   maybeAdd('%R',   willRVals, COL.willR, v => v.toFixed(1));
    if (activeIndicators.cci)         maybeAdd('CCI',  cciVals,   COL.cci,   v => v.toFixed(1));
    if (activeIndicators.obv)         maybeAdd('OBV',  obvVals,   COL.obv,   fmtK);
    if (activeIndicators.cvd) {
      const bd = cvdBarDeltas[absIdx], cd = cvdCumDeltas[absIdx];
      if (bd != null) rows.push(['ΔVol', (bd >= 0 ? '+' : '') + fmtK(bd), bd >= 0 ? COL.bull : COL.bear]);
      if (cd != null) rows.push(['CVD',  (cd >= 0 ? '+' : '') + fmtK(cd), COL.cvdLine]);
    }
    if (atrVals?.[absIdx] != null)    maybeAdd('ATR',  atrVals,   '#ffb82e', v => v.toFixed(4));
    if (fiboOverlay) {
      const nearest = fiboEntryScore(c.c, fiboOverlay, atrVals[absIdx] ?? null);
      if (nearest.nearestLabel) rows.push(['Fib', nearest.nearestLabel, '#a78bff']);
    }
    if (divergence && divergence.barIdx === absIdx) {
      rows.push(['Div', divergence.label, divergence.type.startsWith('bull') ? COL.divBull : COL.divBear]);
    }
    if (activeIndicators.patterns && patterns[absIdx]?.length) {
      const pats = patterns[absIdx];
      const bull = pats.some(p => p.bull);
      rows.push(['Pat', pats.map(p => p.name).join(', '), bull ? COL.bull : COL.bear]);
    }

    const rect = overlayRef.current!.getBoundingClientRect();
    tt.innerHTML = rows.map(([l, v, c]) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">${l}</span><span style="font-weight:600${c ? `;color:${c}` : ''}">${v}</span></div>`
    ).join('');
    tt.style.opacity = '1';
    tt.style.left    = Math.min(e.clientX - rect.left + 8, rect.width - 160) + 'px';
    tt.style.top     = Math.max(e.clientY - rect.top - 80, 4) + 'px';
  }, [visCandles, visOffset, drawCrosshair, activeDraw, getBarIdx, getPrice,
      e9s, e20s, e50s, rsiVals, stochRsiK, stochRsiD, macdLine, macdSignal, macdHist,
      bbUpper, bbMiddle, bbLower, stVals, stBull, psarVals, adxVals, plusDI, minusDI,
      willRVals, cciVals, obvVals, vwapVals, cvdBarDeltas, cvdCumDeltas, atrVals,
      fiboOverlay, divergence, patterns, activeIndicators]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTool) return;
    const i = getBarIdx(e), price = getPrice(e);
    setActiveDraw({ kind: activeTool, startX: e.clientX, startY: e.clientY, startPrice: price, startBarIdx: i });
  }, [activeTool, getBarIdx, getPrice]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDraw) return;
    const i = getBarIdx(e), price = getPrice(e);
    const { kind, startBarIdx, startPrice } = activeDraw;
    let newDrawing: Drawing | null = null;
    if (kind === 'hline')     newDrawing = makeHLine(startPrice);
    else if (kind === 'trendline') newDrawing = makeTrendLine(startBarIdx, startPrice, i, price);
    else if (kind === 'fib')  newDrawing = makeFibDrawing(startBarIdx, startPrice, i, price);
    else if (kind === 'rect') newDrawing = makeRect(startBarIdx, startPrice, i, price);
    if (newDrawing) setDrawings(ds => [...ds, newDrawing!]);
    setActiveDraw(null);
  }, [activeDraw, getBarIdx, getPrice]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (selectedId) { setDrawings(ds => ds.filter(d => d.id !== selectedId)); setSelectedId(null); }
  }, [selectedId]);

  const handleMouseLeave = useCallback(() => {
    if (ttRef.current) ttRef.current.style.opacity = '0';
    drawCrosshair(-1);
  }, [drawCrosshair]);

  // Scroll wheel → load older history
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaX < -40 || (e.shiftKey && e.deltaY < 0)) loadOlderPage();
  }, [loadOlderPage]);

  // ── Effects ────────────────────────────────────────────────────────────────
  const redrawAll = useCallback(() => {
    drawPrice(); drawMACD(); drawRSI(); drawStochRSI();
    drawADX(); drawWillR(); drawCCI(); drawVol(); drawOBV(); drawCVD();
  }, [drawPrice, drawMACD, drawRSI, drawStochRSI, drawADX, drawWillR, drawCCI, drawVol, drawOBV, drawCVD]);

  useEffect(() => { redrawAll(); }, [redrawAll]);
  useEffect(() => {
    window.addEventListener('resize', redrawAll);
    return () => window.removeEventListener('resize', redrawAll);
  }, [redrawAll]);

  // ── Derived display values ─────────────────────────────────────────────────
  const latestRSI   = useMemo(() => rsiVals.filter(v => v !== null).slice(-1)[0] as number | undefined, [rsiVals]);
  const rsiColor    = latestRSI !== undefined ? (latestRSI > 70 ? COL.bear : latestRSI < 30 ? COL.bull : COL.rsi) : COL.rsi;
  const latestVWAP  = useMemo(() => vwapVals.filter(v => v != null).slice(-1)[0] as number | undefined, [vwapVals]);
  const latestCVD   = useMemo(() => cvdCumDeltas[cvdCumDeltas.length - 1], [cvdCumDeltas]);
  const latestMACD  = useMemo(() => macdLine.filter(v => v != null).slice(-1)[0] as number | undefined, [macdLine]);
  const latestADX   = useMemo(() => adxVals.filter(v => v != null).slice(-1)[0] as number | undefined, [adxVals]);
  const lastVol     = visCandles[visCandles.length - 1]?.v || 0;
  const avgVol      = useMemo(() => visCandles.length ? visCandles.reduce((a, c) => a + c.v, 0) / visCandles.length : 0, [visCandles]);

  const stackLabel = useMemo(() => {
    if (e9 === null || e20 === null || e50 === null) return null;
    if (e9 > e20 && e20 > e50) return { text: '▲ BULLISH', color: COL.bull, bg: 'rgba(0,229,160,0.1)' };
    if (e9 < e20 && e20 < e50) return { text: '▼ BEARISH', color: COL.bear, bg: 'rgba(255,61,90,0.1)' };
    return { text: '⚠ TANGLED', color: '#ffb82e', bg: 'rgba(255,184,46,0.1)' };
  }, [e9, e20, e50]);

  const mtfConfluence = useMemo(() => calcMTFConfluence(mtfSignals), [mtfSignals]);
  const confColor: Record<string, string> = {
    strong_bull: COL.bull, weak_bull: 'rgba(0,229,160,0.55)',
    neutral: 'var(--text2)',
    weak_bear: 'rgba(255,61,90,0.55)', strong_bear: COL.bear,
  };
  const confLabel: Record<string, string> = {
    strong_bull: '▲ STRONG BULL', weak_bull: '△ WEAK BULL',
    neutral: '— NEUTRAL',
    weak_bear: '▽ WEAK BEAR', strong_bear: '▼ STRONG BEAR',
  };

  const paneLabel = (title: string, right?: { val: string | number | undefined; col?: string }) => (
    <div style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text3)', letterSpacing:'.08em', textTransform:'uppercase', display:'flex', justifyContent:'space-between', alignItems:'center', margin:'6px 0 3px', padding:'0 2px' }}>
      <span>{title}</span>
      {right && <span style={{ color: right.col ?? 'var(--text3)' }}>{right.val ?? '—'}</span>}
    </div>
  );

  const divBadge = divergence ? (
    <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700, padding:'2px 8px', borderRadius:10, marginLeft:4,
      color: divergence.type.startsWith('bull') ? COL.divBull : COL.divBear,
      background: divergence.type.startsWith('bull') ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)',
      border: `1px solid ${divergence.type.startsWith('bull') ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)'}`,
    }}>{divergence.label}</span>
  ) : null;

  const containerStyle: React.CSSProperties = fullscreen
    ? { position:'fixed', inset:0, zIndex:800, background:'var(--bg)', padding:10, overflowY:'auto' }
    : { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:10, marginBottom:10, position:'relative' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={containerStyle}>

      {/* ── Legend row ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
        {activeIndicators.ema9  && <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}><div style={{ width:8, height:8, borderRadius:'50%', background:COL.ema9 }} />EMA{useStore.getState().indicatorParams.ema9Period} <span style={{ color:'var(--text)', fontWeight:600 }}>{e9 !== null ? fmtPrice(e9) : '—'}</span></div>}
        {activeIndicators.ema20 && <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}><div style={{ width:8, height:8, borderRadius:'50%', background:COL.ema20 }} />EMA{useStore.getState().indicatorParams.ema20Period} <span style={{ color:'var(--text)', fontWeight:600 }}>{e20 !== null ? fmtPrice(e20) : '—'}</span></div>}
        {activeIndicators.ema50 && <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}><div style={{ width:8, height:8, borderRadius:'50%', background:COL.ema50 }} />EMA{useStore.getState().indicatorParams.ema50Period} <span style={{ color:'var(--text)', fontWeight:600 }}>{e50 !== null ? fmtPrice(e50) : '—'}</span></div>}
        {activeIndicators.vwap && latestVWAP != null && <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}><div style={{ width:14, height:2, background:COL.vwap, borderRadius:1 }} />VWAP <span style={{ color:COL.vwap, fontWeight:600 }}>{fmtPrice(latestVWAP)}</span></div>}
        {latestMACD != null && activeIndicators.macd && <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}>MACD <span style={{ color: latestMACD >= 0 ? COL.bull : COL.bear, fontWeight:600 }}>{latestMACD.toFixed(4)}</span></div>}
        {latestADX  != null && activeIndicators.adx  && <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)' }}>ADX <span style={{ color: latestADX > 25 ? COL.adx : 'var(--text3)', fontWeight:600 }}>{latestADX.toFixed(1)}</span></div>}
        {divBadge}
        {stackLabel && <span style={{ marginLeft:'auto', fontSize:10, fontFamily:'var(--mono)', fontWeight:700, padding:'3px 10px', borderRadius:20, color:stackLabel.color, background:stackLabel.bg }}>{stackLabel.text}</span>}
        <button onClick={() => setShowPanel(true)} style={{ marginLeft: stackLabel ? 6 : 'auto', fontSize:10, fontFamily:'var(--mono)', fontWeight:600, padding:'4px 10px', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)' }}>⚙ Indicators</button>
        <button onClick={() => setFullscreen(fs => !fs)} title="Fullscreen (F)" style={{ fontSize:11, fontFamily:'var(--mono)', padding:'4px 8px', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)' }}>{fullscreen ? '⛶✕' : '⛶'}</button>
      </div>

      {/* ── Toolbar row: drawings + VP/Fib toggles + history ── */}
      <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {(Object.entries(TOOL_DEFAULTS) as [DrawingToolKind, typeof TOOL_DEFAULTS[DrawingToolKind]][]).map(([kind, def]) => (
          <button key={kind} onClick={() => setActiveTool(t => t === kind ? null : kind)} title={def.label}
            style={{ fontSize:10, fontFamily:'var(--mono)', padding:'3px 9px', borderRadius:'var(--radius-sm)', cursor:'pointer',
              border: `1px solid ${activeTool === kind ? 'var(--accent)' : 'var(--border2)'}`,
              background: activeTool === kind ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
              color: activeTool === kind ? 'var(--accent)' : 'var(--text2)' }}>
            {def.icon} {def.label}
          </button>
        ))}
        {drawings.length > 0 && (
          <button onClick={() => { setDrawings([]); setSelectedId(null); }}
            style={{ fontSize:10, fontFamily:'var(--mono)', padding:'3px 9px', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid rgba(255,61,90,0.3)', background:'rgba(255,61,90,0.07)', color:'var(--red)' }}>
            Clear All
          </button>
        )}

        <div style={{ width:1, height:14, background:'var(--border2)', margin:'0 2px' }} />

        {/* VP / Fib toggles */}
        <button onClick={() => setShowVP(v => !v)} title="Volume Profile"
          style={{ fontSize:10, fontFamily:'var(--mono)', padding:'3px 9px', borderRadius:'var(--radius-sm)', cursor:'pointer',
            border: `1px solid ${showVP ? 'var(--accent)' : 'var(--border2)'}`,
            background: showVP ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
            color: showVP ? 'var(--accent)' : 'var(--text2)' }}>VP</button>
        <button onClick={() => setShowAutoFib(v => !v)} title="Auto Fibonacci"
          style={{ fontSize:10, fontFamily:'var(--mono)', padding:'3px 9px', borderRadius:'var(--radius-sm)', cursor:'pointer',
            border: `1px solid ${showAutoFib ? 'var(--accent)' : 'var(--border2)'}`,
            background: showAutoFib ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
            color: showAutoFib ? 'var(--accent)' : 'var(--text2)' }}>𝑓 Fib</button>

        <div style={{ width:1, height:14, background:'var(--border2)', margin:'0 2px' }} />

        {/* History pagination */}
        <button onClick={loadOlderPage} disabled={loadingHistory} title="Load 200 older candles (or Shift+scroll)"
          style={{ fontSize:10, fontFamily:'var(--mono)', padding:'3px 9px', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', opacity: loadingHistory ? 0.5 : 1 }}>
          {loadingHistory ? '…' : '← +200'}
        </button>
        <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)' }}>{allCandles.length} bars</span>

        {activeTool && <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', marginLeft:4 }}>Click{activeTool === 'hline' ? '' : ' + drag'} · ESC cancel</span>}
      </div>

      {/* ── OHLCV hover bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'3px 6px', background:'var(--bg3)', borderRadius:'var(--radius-sm)', marginBottom:6, minHeight:22, border:'1px solid var(--border)' }}>
        {(() => {
          // find the last hovered candle from tooltip state — we track via hoverIdx equivalent
          // In doc 3 we use the overlay mousemove, so we read from a ref
          return (
            <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)' }}>
              Hover chart to see OHLCV · {tf} · {sym}
              {livePrice > 0 && <> · <span style={{ color: COL.livePrice, fontWeight:600 }}>{fmtPrice(livePrice)}</span></>}
            </span>
          );
        })()}
      </div>

      {/* ── Price canvas ── */}
      <div style={{ position:'relative' }}>
        <canvas ref={priceRef} style={{ height: fullscreen ? 'calc(100vh - 320px)' : 240, width:'100%', borderRadius:'var(--radius-sm)', display:'block' }} />
        <canvas ref={overlayRef}
          style={{ position:'absolute', inset:0, height: fullscreen ? 'calc(100vh - 320px)' : 240, width:'100%', borderRadius:'var(--radius-sm)', cursor: activeTool ? 'crosshair' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
        />
      </div>

      {/* Tooltip */}
      <div ref={ttRef} style={{ position:'absolute', pointerEvents:'none', zIndex:10, background:'var(--bg4)', border:'1px solid var(--border3)', borderRadius:'var(--radius-sm)', padding:'7px 10px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text)', whiteSpace:'nowrap', opacity:0, transition:'opacity .1s', minWidth:140, boxShadow:'0 4px 20px rgba(0,0,0,.5)' }} />

      {/* ── Sub-panes ── */}
      {activeIndicators.macd      && <>{paneLabel('MACD',                  { val: latestMACD != null ? latestMACD.toFixed(4) : undefined, col: latestMACD != null ? (latestMACD >= 0 ? COL.bull : COL.bear) : undefined })}<canvas ref={macdRef}  style={{ height:70, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.rsi       && <>{paneLabel('RSI (14) · Wilder',     { val: latestRSI,  col: rsiColor })}<canvas ref={rsiRef}   style={{ height:70, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.stochRsi  && <>{paneLabel('Stoch RSI')}<canvas ref={stochRef} style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.adx       && <>{paneLabel('ADX · Trend Strength',  { val: latestADX?.toFixed(1), col: COL.adx })}<canvas ref={adxRef}   style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.williamsR && <>{paneLabel('Williams %R')}<canvas ref={willRRef} style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.cci       && <>{paneLabel('CCI')}<canvas ref={cciRef}   style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.volume    && <>{paneLabel('Volume',                 { val: 'cur ' + fmtK(lastVol) + ' · avg ' + fmtK(avgVol) })}<canvas ref={volRef}   style={{ height:52, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.obv       && <>{paneLabel('OBV · On-Balance Vol',  { val: obvVals.length ? fmtK(obvVals[obvVals.length - 1]) : undefined, col: COL.obv })}<canvas ref={obvRef}   style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}
      {activeIndicators.cvd       && <>{paneLabel('CVD · Cumul. Vol Delta',{ val: latestCVD != null ? (latestCVD >= 0 ? '+' : '') + fmtK(latestCVD) : undefined, col: latestCVD != null ? (latestCVD >= 0 ? COL.bull : COL.bear) : undefined })}<canvas ref={cvdRef}   style={{ height:60, width:'100%', borderRadius:'var(--radius-sm)' }} /></>}

      {/* ── MTF Confluence card ── */}
      <div style={{ marginTop:8, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em' }}>MTF Confluence</span>
          {mtfLoading ? (
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)' }}>loading…</span>
          ) : (
            <>
              <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700,
                color: confColor[mtfConfluence.confluence],
                padding:'2px 8px', borderRadius:10,
                background: `${confColor[mtfConfluence.confluence]}18`,
                border: `1px solid ${confColor[mtfConfluence.confluence]}44` }}>
                {confLabel[mtfConfluence.confluence]}
              </span>
              {mtfSignals.map(s => (
                <div key={s.tf} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:8,
                  background: s.trend === 'bull' ? 'var(--green-bg)' : s.trend === 'bear' ? 'var(--red-bg)' : 'var(--bg2)',
                  border: `1px solid ${s.trend === 'bull' ? 'rgba(0,229,160,0.2)' : s.trend === 'bear' ? 'rgba(255,61,90,0.2)' : 'var(--border)'}` }}>
                  <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700, color:'var(--text3)' }}>{s.tf}</span>
                  <span style={{ fontSize:10, fontFamily:'var(--mono)', color: s.trend === 'bull' ? COL.bull : s.trend === 'bear' ? COL.bear : 'var(--text2)' }}>
                    {s.trend === 'bull' ? '▲' : s.trend === 'bear' ? '▼' : '—'}
                  </span>
                  {s.rsi != null && <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)' }}>{s.rsi}</span>}
                </div>
              ))}
              <button onClick={loadMTF}
                style={{ marginLeft:'auto', fontSize:9, fontFamily:'var(--mono)', padding:'2px 8px', borderRadius:6, cursor:'pointer', border:'1px solid var(--border2)', background:'var(--bg2)', color:'var(--text3)' }}>↺</button>
            </>
          )}
        </div>
      </div>

      {/* ── Indicator Panel ── */}
      {showPanel && <IndicatorPanel onClose={() => setShowPanel(false)} />}
    </div>
  );
}