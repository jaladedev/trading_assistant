'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtK } from '@/lib/indicators';

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
const GC  = 'rgba(255,255,255,0.04)';
const TC  = 'rgba(255,255,255,0.22)';

function setupCanvas(el: HTMLCanvasElement) {
  const parent = el.parentElement!;
  const w = parent.clientWidth - 20 || 600;
  const h = el.getBoundingClientRect().height || (parseInt(el.style.height) || 220);
  el.width  = w * DPR;
  el.height = h * DPR;
  el.style.width  = w + 'px';
  el.style.height = h + 'px';
  const ctx = el.getContext('2d')!;
  ctx.scale(DPR, DPR);
  return { ctx, w, h };
}

export default function CandleChart() {
  const priceRef = useRef<HTMLCanvasElement>(null);
  const rsiRef   = useRef<HTMLCanvasElement>(null);
  const volRef   = useRef<HTMLCanvasElement>(null);
  const ttRef    = useRef<HTMLDivElement>(null);
  const hoverIdx = useRef(-1);

  const { candles, e9s, e20s, e50s, rsiVals, e9, e20, e50, currentCandle, crossovers, suggestion, tf, sym } = useStore();

  // ── Draw Price ───────────────────────────────────────────
  const drawPrice = useCallback(() => {
    const el = priceRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    const all  = [...candles, currentCandle].filter(Boolean) as typeof candles;
    const vis  = all.slice(-70);
    const n    = vis.length;
    if (n < 2) return;

    const pMin = Math.min(...vis.map((c: { l: any; }) => c.l));
    const pMax = Math.max(...vis.map((c: { h: any; }) => c.h));
    const pad  = (pMax - pMin) * 0.06 || pMax * 0.001;
    const plo  = pMin - pad, phi = pMax + pad;
    const pR   = phi - plo || 1;
    const padR = 66, padL = 2, padT = 10, padB = 6;
    const cW   = w - padR - padL, cH = h - padT - padB;
    const cw   = cW / n;
    const tx   = (i: number) => padL + i * cw + cw / 2;
    const ty   = (p: number) => padT + cH - (p - plo) / pR * cH;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padT + cH * i / 4;
      ctx.strokeStyle = GC; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(phi - pR * i / 4), padL + cW + 4, y + 3.5);
    }

    // Hover crosshair
    if (hoverIdx.current >= 0 && hoverIdx.current < n) {
      const hx = tx(hoverIdx.current);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + cH); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Suggestion levels
    if (suggestion?.entry && suggestion?.stop) {
      const levels = [
        { price: suggestion.entry, color: 'rgba(77,166,255,0.7)',  label: 'ENT ' + fmtPrice(suggestion.entry) },
        { price: suggestion.stop,  color: 'rgba(255,61,90,0.6)',   label: 'SL '  + fmtPrice(suggestion.stop) },
        { price: suggestion.target,color: 'rgba(0,229,160,0.6)',   label: 'TP '  + fmtPrice(suggestion.target) },
      ];
      ctx.setLineDash([4, 4]);
      levels.forEach(lv => {
        if (lv.price < plo || lv.price > phi) return;
        const ly = ty(lv.price);
        ctx.strokeStyle = lv.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + cW, ly); ctx.stroke();
        ctx.fillStyle = lv.color; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(lv.label, padL + cW + 4, ly + 3.5);
      });
      ctx.setLineDash([]);
    }

    // Candles
    vis.forEach((c: { c: number; o: number; h: number; l: number; }, i: number) => {
      const x  = tx(i);
      const bw = Math.max(2, cw * 0.62);
      const isLast = i === n - 1;
      const col = isLast ? '#888' : (c.c >= c.o ? '#00e5a0' : '#ff3d5a');
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, ty(c.h)); ctx.lineTo(x, ty(c.l)); ctx.stroke();
      const bT = ty(Math.max(c.o, c.c)), bB = ty(Math.min(c.o, c.c));
      ctx.fillStyle = isLast ? 'rgba(140,140,140,0.5)' : col;
      ctx.fillRect(x - bw / 2, bT, bw, Math.max(1, bB - bT));
    });

    // EMA lines
    const off = Math.max(0, candles.length - 69);
    const emaLines: [typeof e9s, string][] = [
      [e9s.slice(off).slice(-69),  '#ff6b35'],
      [e20s.slice(off).slice(-69), '#4da6ff'],
      [e50s.slice(off).slice(-69), '#a78bff'],
    ];
    emaLines.forEach(([vals, col]) => {
      if (!vals || vals.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); let started = false;
      vals.forEach((v: number | null, i: number) => {
        if (v === null) { started = false; return; }
        const xi = tx(i), yi = ty(v as number);
        if (!started) { ctx.moveTo(xi, yi); started = true; } else ctx.lineTo(xi, yi);
      });
      ctx.stroke();
    });

    // Crossover markers
    const visOff = all.length - n;
    crossovers.forEach((x: { idx: number; price: any; type: string; }) => {
      const vi = x.idx - visOff;
      if (vi < 0 || vi >= n) return;
      const cx_ = tx(vi);
      const cy  = ty((all[x.idx]?.l || x.price)) + 8;
      ctx.fillStyle = x.type === 'bull' ? 'rgba(0,229,160,0.9)' : 'rgba(255,61,90,0.9)';
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(x.type === 'bull' ? '▲' : '▼', cx_, cy + 6);
    });

    // X-axis time labels
    const step = Math.max(1, Math.floor(n / 5));
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    for (let i = step; i < n - 1; i += step) {
      const c = vis[i];
      if (!c?.t) continue;
      const d  = new Date(c.t);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      const label = (tf === '1d') ? `${d.getMonth()+1}/${d.getDate()}` : `${hh}:${mm}`;
      ctx.fillText(label, tx(i), h - 1);
    }
  }, [candles, currentCandle, e9s, e20s, e50s, crossovers, suggestion, tf]);

  // ── Draw RSI ─────────────────────────────────────────────
  const drawRSI = useCallback(() => {
    const el = rsiRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const padR = 66, padL = 2, padT = 4, padB = 4;
    const cW = w - padR - padL, cH = h - padT - padB;
    const n  = 70;
    const txr = (i: number) => padL + i * (cW / n) + cW / (n * 2);
    const ty  = (v: number) => padT + (100 - v) / 100 * cH;

    ctx.fillStyle = 'rgba(255,61,90,0.05)';  ctx.fillRect(padL, padT,    cW, ty(70) - padT);
    ctx.fillStyle = 'rgba(0,229,160,0.05)';  ctx.fillRect(padL, ty(30),  cW, padT + cH - ty(30));

    [70, 50, 30].forEach(lv => {
      ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5; ctx.setLineDash(lv === 50 ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, ty(lv)); ctx.lineTo(padL + cW, ty(lv)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = TC; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(String(lv), padL + cW + 4, ty(lv) + 3.5);
    });

    const rv = rsiVals.slice(-n);
    const validPts = rv
      .map((v: number | null, i: number) => v !== null ? { x: txr(i + (n - rv.length)), y: ty(v as number), v } : null)
      .filter(Boolean) as { x: number; y: number; v: number }[];

    if (validPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, padT + cH);
      validPts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(validPts[validPts.length - 1].x, padT + cH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
      grad.addColorStop(0, 'rgba(255,184,46,0.12)');
      grad.addColorStop(1, 'rgba(255,184,46,0)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#ffb82e'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      validPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  }, [rsiVals]);

  // ── Draw Volume ──────────────────────────────────────────
  const drawVol = useCallback(() => {
    const el = volRef.current;
    if (!el) return;
    const { ctx, w, h } = setupCanvas(el);
    ctx.clearRect(0, 0, w, h);
    const all = [...candles, currentCandle].filter(Boolean) as typeof candles;
    const vis = all.slice(-70);
    if (!vis.length) return;
    const maxV  = Math.max(...vis.map((c: { v: any; }) => c.v));
    const avgV  = vis.reduce((a: any, c: { v: any; }) => a + c.v, 0) / vis.length;
    const padR  = 66, padL = 2, padT = 4, padB = 2;
    const cW    = w - padR - padL, cH = h - padT - padB;
    const cw    = cW / vis.length;
    const avgY  = padT + cH - (avgV / maxV) * cH;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, avgY); ctx.lineTo(padL + cW, avgY); ctx.stroke();
    ctx.setLineDash([]);
    vis.forEach((c: { v: number; c: number; o: number; }, i: number) => {
      const isLast   = i === vis.length - 1;
      const aboveAvg = c.v > avgV;
      ctx.fillStyle = isLast
        ? 'rgba(150,148,138,0.3)'
        : (c.c >= c.o
          ? (aboveAvg ? 'rgba(0,229,160,0.55)'  : 'rgba(0,229,160,0.25)')
          : (aboveAvg ? 'rgba(255,61,90,0.55)'  : 'rgba(255,61,90,0.25)'));
      const bH = Math.max(1, (c.v / maxV) * cH);
      ctx.fillRect(padL + i * cw + 1, padT + cH - bH, Math.max(1, cw - 2), bH);
    });
  }, [candles, currentCandle]);

  // ── Hover tooltip ────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const el  = priceRef.current;
    const tt  = ttRef.current;
    if (!el || !tt) return;
    const rect = el.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const all  = [...candles, currentCandle].filter(Boolean) as typeof candles;
    const vis  = all.slice(-70);
    const n    = vis.length;
    const cW   = rect.width - 66 - 2;
    const cw   = cW / n;
    const i    = Math.floor((mx - 2) / cw);
    if (i < 0 || i >= n) { tt.style.opacity = '0'; hoverIdx.current = -1; drawPrice(); return; }
    hoverIdx.current = i;
    const c     = vis[i];
    const e9v   = e9s[Math.max(0, candles.length - n + i)];
    const e20v  = e20s[Math.max(0, candles.length - n + i)];
    const e50v  = e50s[Math.max(0, candles.length - n + i)];
    const rsiV  = rsiVals[Math.max(0, rsiVals.length - n + i)];
    const chPct = c.o ? ((c.c - c.o) / c.o * 100).toFixed(2) : '0.00';
    const col   = c.c >= c.o ? '#00e5a0' : '#ff3d5a';
    tt.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">O</span><span style="font-weight:600">${fmtPrice(c.o)}</span><span style="color:var(--text3)">H</span><span style="font-weight:600">${fmtPrice(c.h)}</span></div>
      <div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">L</span><span style="font-weight:600">${fmtPrice(c.l)}</span><span style="color:var(--text3)">C</span><span style="font-weight:600;color:${col}">${fmtPrice(c.c)}</span></div>
      <div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">Chg</span><span style="font-weight:600;color:${col}">${c.c >= c.o ? '+' : ''}${chPct}%</span></div>
      <div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">Vol</span><span style="font-weight:600">${fmtK(c.v)}</span></div>
      ${e9v  !== null && e9v  !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:#ff6b35">E9</span><span style="font-weight:600">${fmtPrice(e9v as number)}</span></div>`  : ''}
      ${e20v !== null && e20v !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:#4da6ff">E20</span><span style="font-weight:600">${fmtPrice(e20v as number)}</span></div>` : ''}
      ${e50v !== null && e50v !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:#a78bff">E50</span><span style="font-weight:600">${fmtPrice(e50v as number)}</span></div>` : ''}
      ${rsiV !== null && rsiV !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.7"><span style="color:var(--text3)">RSI</span><span style="font-weight:600">${rsiV}</span></div>` : ''}
    `;
    tt.style.opacity = '1';
    tt.style.left    = Math.min(mx + 8, rect.width - 160) + 'px';
    tt.style.top     = Math.max(e.clientY - rect.top - 80, 4) + 'px';
    drawPrice();
  }, [candles, currentCandle, e9s, e20s, e50s, rsiVals, drawPrice]);

  const handleMouseLeave = useCallback(() => {
    if (ttRef.current) ttRef.current.style.opacity = '0';
    hoverIdx.current = -1;
    drawPrice();
  }, [drawPrice]);

  // ── Effects ──────────────────────────────────────────────
  useEffect(() => { drawPrice(); drawRSI(); drawVol(); }, [drawPrice, drawRSI, drawVol]);
  useEffect(() => {
    const handler = () => { drawPrice(); drawRSI(); drawVol(); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [drawPrice, drawRSI, drawVol]);

  // RSI value display
  const latestRSI = rsiVals.filter((v: number | null) => v !== null).slice(-1)[0] as number | undefined;
  const rsiColor  = latestRSI !== undefined ? (latestRSI > 70 ? '#ff3d5a' : latestRSI < 30 ? '#00e5a0' : '#ffb82e') : 'var(--amber)';
  const stackLabel = e9 !== null && e20 !== null && e50 !== null
    ? e9 > e20 && e20 > e50 ? { text: '▲ BULLISH', color: '#00e5a0', bg: 'rgba(0,229,160,0.1)' }
    : e9 < e20 && e20 < e50 ? { text: '▼ BEARISH', color: '#ff3d5a', bg: 'rgba(255,61,90,0.1)' }
    : { text: '⚠ TANGLED', color: '#ffb82e', bg: 'rgba(255,184,46,0.1)' }
    : null;
  const latestVis = [...candles, currentCandle].filter(Boolean).slice(-70);
  const lastVol  = latestVis[latestVis.length - 1]?.v || 0;
  const avgVol   = latestVis.length ? latestVis.reduce((a, c) => a + (c?.v || 0), 0) / latestVis.length : 0;

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 10, position: 'relative' }}>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {[['e9', '#ff6b35', e9], ['e20', '#4da6ff', e20], ['e50', '#a78bff', e50]].map(([lbl, col, val]) => (
          <div key={lbl as string} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: col as string, flexShrink: 0 }} />
            EMA{(lbl as string).slice(1)} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{val !== null ? fmtPrice(val as number) : '—'}</span>
          </div>
        ))}
        {stackLabel && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '.04em', color: stackLabel.color, background: stackLabel.bg }}>
            {stackLabel.text}
          </span>
        )}
      </div>

      {/* Price canvas */}
      <canvas ref={priceRef} style={{ height: 220, width: '100%', borderRadius: 'var(--radius-sm)', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />

      {/* Tooltip */}
      <div ref={ttRef} style={{
        position: 'absolute', pointerEvents: 'none', zIndex: 10,
        background: 'var(--bg4)', border: '1px solid var(--border3)',
        borderRadius: 'var(--radius-sm)', padding: '7px 10px',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
        whiteSpace: 'nowrap', opacity: 0, transition: 'opacity .1s',
        minWidth: 130, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
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
    </div>
  );
}