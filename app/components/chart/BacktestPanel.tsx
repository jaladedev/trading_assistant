'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice } from '@/lib/indicators';
import { Card, ActionBtn } from '../ui';
import type { BacktestResult, BacktestTrade, MonthlyStats, WorkerMessage } from '@/lib/backtestTypes';

// ── Tiny canvas chart helpers ─────────────────────────────────────────────────
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    draw(ctx, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  green:  '#00e5a0',
  red:    '#ff3d5a',
  amber:  '#ffb82e',
  blue:   '#4da6ff',
  purple: '#a78bff',
  bg3:    '#131820',
  border: 'rgba(255,255,255,0.07)',
  text2:  '#6b7591',
  text3:  '#3d4460',
};

// ── Metric box ────────────────────────────────────────────────────────────────
function Metric({ label, val, color, danger, warn, good }: {
  label: string; val: string; color?: string; danger?: boolean; warn?: boolean; good?: boolean;
}) {
  const bg = danger ? 'rgba(255,61,90,0.06)' : warn ? 'rgba(255,184,46,0.05)' : good ? 'rgba(0,229,160,0.05)' : C.bg3;
  const bd = danger ? 'rgba(255,61,90,0.25)' : warn ? 'rgba(255,184,46,0.2)' : good ? 'rgba(0,229,160,0.2)' : C.border;
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '9px 11px', border: `1px solid ${bd}` }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontFamily: 'var(--mono)', fontWeight: 700, color: color ?? 'var(--text)' }}>{val}</div>
    </div>
  );
}

// ── Chart: Equity + Drawdown dual-axis ────────────────────────────────────────
function EquityChart({ result }: { result: BacktestResult }) {
  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg3;
    ctx.fillRect(0, 0, w, h);

    const eq = result.equity;
    const dd = result.drawdown;
    if (!eq.length) return;

    const pad = { t: 12, b: 16, l: 8, r: 8 };
    const cw  = w - pad.l - pad.r;
    const ch  = h - pad.t - pad.b;

    const minEq = Math.min(...eq);
    const maxEq = Math.max(...eq);
    const rngEq = maxEq - minEq || 1;
    const maxDD = Math.max(...dd, 1);

    const xOf = (i: number) => pad.l + (i / (eq.length - 1)) * cw;
    const yEq = (v: number) => pad.t + (1 - (v - minEq) / rngEq) * ch;
    const yDD = (v: number) => pad.t + (v / maxDD) * (ch * 0.3);

    // Drawdown fill (inverted, bottom area)
    ctx.fillStyle = 'rgba(255,61,90,0.12)';
    ctx.beginPath();
    ctx.moveTo(xOf(0), h - pad.b);
    for (let i = 0; i < dd.length; i++) ctx.lineTo(xOf(i), h - pad.b - yDD(dd[i]));
    ctx.lineTo(xOf(dd.length - 1), h - pad.b);
    ctx.closePath();
    ctx.fill();

    // Drawdown line
    ctx.strokeStyle = 'rgba(255,61,90,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < dd.length; i++) {
      const x = xOf(i), y = h - pad.b - yDD(dd[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Equity fill
    const startY = yEq(eq[0]);
    ctx.fillStyle = 'rgba(0,229,160,0.08)';
    ctx.beginPath();
    ctx.moveTo(xOf(0), startY);
    for (let i = 1; i < eq.length; i++) ctx.lineTo(xOf(i), yEq(eq[i]));
    ctx.lineTo(xOf(eq.length - 1), h - pad.b);
    ctx.lineTo(xOf(0), h - pad.b);
    ctx.closePath();
    ctx.fill();

    // Equity line
    ctx.strokeStyle = C.green; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < eq.length; i++) {
      const x = xOf(i), y = yEq(eq[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Trade entry markers
    ctx.fillStyle = C.green;
    for (const t of result.trades) {
      if (t.exitIdx >= eq.length) continue;
      const x = xOf(t.entryIdx);
      const y = yEq(eq[t.entryIdx]);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = t.pnl > 0 ? C.green : C.red;
      ctx.fill();
    }

    // Labels
    ctx.fillStyle = C.text2; ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('$' + maxEq.toFixed(0), w - pad.r, pad.t + 10);
    ctx.fillText('$' + minEq.toFixed(0), w - pad.r, h - pad.b);
    ctx.fillStyle = 'rgba(255,61,90,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('DD ' + result.maxDrawdownPct.toFixed(1) + '%', pad.l + 2, h - pad.b);
  }, [result]);

  return <canvas ref={ref} style={{ width: '100%', height: 140, display: 'block', borderRadius: 6 }} />;
}

// ── Monthly bar chart ─────────────────────────────────────────────────────────
function MonthlyChart({ monthly }: { monthly: MonthlyStats[] }) {
  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg3; ctx.fillRect(0, 0, w, h);
    if (!monthly.length) return;

    const pad = { t: 12, b: 22, l: 6, r: 6 };
    const cw  = w - pad.l - pad.r;
    const ch  = h - pad.t - pad.b;
    const n   = monthly.length;

    const maxAbs = Math.max(...monthly.map(m => Math.abs(m.pnl)), 1);
    const bw     = Math.max(4, (cw / n) - 2);
    const midY   = pad.t + ch / 2;

    // Zero line
    ctx.strokeStyle = C.border; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, midY); ctx.lineTo(w - pad.r, midY); ctx.stroke();

    monthly.forEach((m, i) => {
      const x    = pad.l + (i / n) * cw + 1;
      const norm = m.pnl / maxAbs;
      const bh   = Math.abs(norm) * (ch / 2 - 2);
      const y    = norm >= 0 ? midY - bh : midY;
      ctx.fillStyle = m.pnl >= 0 ? 'rgba(0,229,160,0.6)' : 'rgba(255,61,90,0.6)';
      ctx.fillRect(x, y, bw, bh || 1);

      // Month label
      ctx.fillStyle = C.text3; ctx.font = '7px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(m.month.slice(5), x + bw / 2, h - pad.b + 10);
    });
  }, [monthly]);

  return <canvas ref={ref} style={{ width: '100%', height: 100, display: 'block', borderRadius: 6 }} />;
}

// ── Win/Loss P&L histogram ────────────────────────────────────────────────────
function PnLHistogram({ trades }: { trades: BacktestTrade[] }) {
  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg3; ctx.fillRect(0, 0, w, h);
    if (!trades.length) return;

    const pad = { t: 8, b: 16, l: 6, r: 6 };
    const cw  = w - pad.l - pad.r;
    const ch  = h - pad.t - pad.b;

    // Bin trades into 20 buckets
    const pnls  = trades.map(t => t.pnl);
    const minP  = Math.min(...pnls);
    const maxP  = Math.max(...pnls);
    const range = maxP - minP || 1;
    const BINS  = 20;
    const bins  = new Array(BINS).fill(0);
    pnls.forEach(p => {
      const b = Math.min(BINS - 1, Math.floor(((p - minP) / range) * BINS));
      bins[b]++;
    });

    const maxBin = Math.max(...bins, 1);
    const bw     = cw / BINS;
    const zeroBin = Math.floor(((0 - minP) / range) * BINS);

    bins.forEach((cnt, i) => {
      const x  = pad.l + i * bw;
      const bh = (cnt / maxBin) * ch;
      ctx.fillStyle = i < zeroBin ? 'rgba(255,61,90,0.6)' : 'rgba(0,229,160,0.6)';
      ctx.fillRect(x + 1, pad.t + ch - bh, bw - 2, bh);
    });

    // Zero line
    const zeroX = pad.l + (zeroBin / BINS) * cw;
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zeroX, pad.t); ctx.lineTo(zeroX, h - pad.b); ctx.stroke();

    ctx.fillStyle = C.text3; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText('$' + minP.toFixed(0), pad.l + bw, h - 2);
    ctx.fillText('$' + maxP.toFixed(0), w - pad.r - bw, h - 2);
  }, [trades]);

  return <canvas ref={ref} style={{ width: '100%', height: 80, display: 'block', borderRadius: 6 }} />;
}

// ── MAE / MFE scatter ─────────────────────────────────────────────────────────
function MAEMFEScatter({ trades }: { trades: BacktestTrade[] }) {
  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg3; ctx.fillRect(0, 0, w, h);
    if (!trades.length) return;

    const pad = { t: 6, b: 16, l: 24, r: 6 };
    const cw  = w - pad.l - pad.r;
    const ch  = h - pad.t - pad.b;

    const maxMFE = Math.max(...trades.map(t => t.mfe), 0.01);
    const minMAE = Math.min(...trades.map(t => t.mae), -0.01);

    trades.forEach(t => {
      const x = pad.l + (t.mfe / maxMFE) * cw;
      const y = pad.t + ch - ((t.mae - minMAE) / (0 - minMAE)) * ch;
      ctx.beginPath();
      ctx.arc(Math.max(pad.l, Math.min(w - pad.r, x)), Math.max(pad.t, Math.min(h - pad.b, y)), 3, 0, Math.PI * 2);
      ctx.fillStyle = t.pnl > 0 ? 'rgba(0,229,160,0.55)' : 'rgba(255,61,90,0.55)';
      ctx.fill();
    });

    // Axes
    ctx.strokeStyle = C.text3; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();

    ctx.fillStyle = C.text3; ctx.font = '7px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MFE%', w / 2, h - 2);
    ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('MAE%', 0, 0); ctx.restore();
  }, [trades]);

  return <canvas ref={ref} style={{ width: '100%', height: 90, display: 'block', borderRadius: 6 }} />;
}

// ── R-distribution bar chart ──────────────────────────────────────────────────
function RDistChart({ trades }: { trades: BacktestTrade[] }) {
  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg3; ctx.fillRect(0, 0, w, h);
    if (!trades.length) return;

    const pad = { t: 6, b: 14, l: 6, r: 6 };
    const cw  = w - pad.l - pad.r;
    const ch  = h - pad.t - pad.b;

    const rs     = trades.map(t => t.r);
    const minR   = Math.floor(Math.min(...rs, -2));
    const maxR   = Math.ceil(Math.max(...rs, 5));
    const range  = maxR - minR || 1;
    const BINS   = maxR - minR;
    const bins   = new Array(BINS).fill(0);
    rs.forEach(r => {
      const b = Math.min(BINS - 1, Math.floor(((r - minR) / range) * BINS));
      bins[Math.max(0, b)]++;
    });

    const maxBin = Math.max(...bins, 1);
    const bw     = cw / BINS;
    const zeroBin = -minR;

    bins.forEach((cnt, i) => {
      const x  = pad.l + i * bw;
      const bh = (cnt / maxBin) * ch;
      ctx.fillStyle = i < zeroBin ? 'rgba(255,61,90,0.55)' : 'rgba(0,229,160,0.55)';
      ctx.fillRect(x + 1, pad.t + ch - bh, bw - 2, bh);
    });

    const zeroX = pad.l + (zeroBin / BINS) * cw;
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zeroX, pad.t); ctx.lineTo(zeroX, h - pad.b); ctx.stroke();

    ctx.fillStyle = C.text3; ctx.font = '7px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText(minR + 'R', pad.l + bw, h - 2);
    ctx.fillText(maxR + 'R', w - pad.r - bw, h - 2);
  }, [trades]);

  return <canvas ref={ref} style={{ width: '100%', height: 70, display: 'block', borderRadius: 6 }} />;
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function downloadCSV(result: BacktestResult) {
  const headers = ['#', 'Dir', 'Entry Time', 'Exit Time', 'Entry', 'Exit', 'Size', 'PnL', 'PnL%', 'R', 'Exit Reason', 'MAE%', 'MFE%'];
  const rows = result.trades.map((t, i) => [
    i + 1, t.dir,
    new Date(t.entryTime).toISOString(),
    new Date(t.exitTime).toISOString(),
    t.entryPrice.toFixed(4),
    t.exitPrice.toFixed(4),
    t.size.toFixed(2),
    t.pnl.toFixed(2),
    t.pnlPct.toFixed(2),
    t.r.toFixed(2),
    t.exitReason,
    t.mae.toFixed(2),
    t.mfe.toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  dl('backtest_trades.csv', 'text/csv', csv);
}

function downloadJSON(result: BacktestResult, strategyName: string) {
  const summary = {
    strategy:       strategyName,
    generatedAt:    new Date().toISOString(),
    totalTrades:    result.totalTrades,
    winRate:        (result.winRate * 100).toFixed(2) + '%',
    profitFactor:   result.profitFactor.toFixed(3),
    sharpe:         result.sharpe.toFixed(3),
    sortino:        result.sortino.toFixed(3),
    maxDrawdownPct: result.maxDrawdownPct.toFixed(2) + '%',
    totalPnl:       result.totalPnl.toFixed(2),
    totalPnlPct:    result.totalPnlPct.toFixed(2) + '%',
    expectancy:     result.expectancy.toFixed(2),
    avgWin:         result.avgWin.toFixed(2),
    avgLoss:        result.avgLoss.toFixed(2),
    avgR:           result.avgR.toFixed(3),
    monthly:        result.monthly,
    trades:         result.trades,
  };
  dl('backtest_summary.json', 'application/json', JSON.stringify(summary, null, 2));
}

function dl(filename: string, type: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BacktestPanel() {
  const {
    candles, strategies, activeStrategyId,
    capital, backtestResult, setBacktestResult,
    backtestRunning, setBacktestRunning,
  } = useStore();

  const workerRef = useRef<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStratId, setSelectedStratId] = useState(activeStrategyId ?? '');

  const activeStrat = strategies.find(s => s.id === selectedStratId) ?? strategies[0];

  const runBacktest = useCallback(() => {
    if (!candles.length || !activeStrat) return;
    setError(null);
    setBacktestRunning(true);
    setBacktestResult(null);

    // Lazy-load worker
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker('/backtest.worker.js');
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      setBacktestRunning(false);
      if (e.data.ok && e.data.result) {
        setBacktestResult(e.data.result);
      } else {
        setError(e.data.error ?? 'Unknown error');
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      setBacktestRunning(false);
      setError(err.message);
    };

    worker.postMessage({ candles, strategy: activeStrat, capital: parseFloat(String(capital)) || 1000 });
  }, [candles, activeStrat, capital, setBacktestResult, setBacktestRunning]);

  const r = backtestResult;

  const pf       = r ? r.profitFactor : null;
  const pfColor  = pf === null ? undefined : pf >= 2 ? C.green : pf >= 1.2 ? C.amber : C.red;

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>⚙ Backtest</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Strategy selector */}
          {strategies.length > 1 && (
            <select
              value={selectedStratId}
              onChange={e => setSelectedStratId(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
            >
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
            {candles.length} bars
          </span>
          <ActionBtn
            variant={backtestRunning ? 'default' : 'green'}
            onClick={runBacktest}
            style={{ opacity: backtestRunning ? 0.6 : 1 }}
          >
            {backtestRunning ? '⏳ Running…' : '▶ Run Backtest'}
          </ActionBtn>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 10px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)', marginBottom: 10 }}>
          Error: {error}
        </div>
      )}

      {!r && !backtestRunning && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
          Click "Run Backtest" to simulate {activeStrat?.name ?? 'the selected strategy'} on {candles.length} historical candles.
        </div>
      )}

      {backtestRunning && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>
          Running simulation… (Web Worker)
        </div>
      )}

      {r && (
        <>
          {/* ── Metrics grid ──────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
            <Metric label="Total P&L" val={(r.totalPnl >= 0 ? '+' : '') + '$' + r.totalPnl.toFixed(2)} color={r.totalPnl >= 0 ? C.green : C.red} good={r.totalPnl > 0} danger={r.totalPnl < 0} />
            <Metric label="P&L %" val={(r.totalPnlPct >= 0 ? '+' : '') + r.totalPnlPct.toFixed(2) + '%'} color={r.totalPnlPct >= 0 ? C.green : C.red} />
            <Metric label="Win Rate" val={(r.winRate * 100).toFixed(1) + '%'} color={r.winRate >= 0.5 ? C.green : C.red} good={r.winRate >= 0.55} warn={r.winRate < 0.45} />
            <Metric label="Profit Factor" val={r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)} color={pfColor} good={(pf??0) >= 1.5} warn={(pf??0) >= 1 && (pf??0) < 1.5} danger={(pf??0) < 1} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12 }}>
            <Metric label="Sharpe" val={r.sharpe.toFixed(2)} color={r.sharpe >= 1.5 ? C.green : r.sharpe >= 0.5 ? C.amber : C.red} />
            <Metric label="Sortino" val={r.sortino.toFixed(2)} color={r.sortino >= 2 ? C.green : r.sortino >= 1 ? C.amber : C.red} />
            <Metric label="Max DD" val={r.maxDrawdownPct.toFixed(1) + '%'} color={C.red} danger={r.maxDrawdownPct > 20} warn={r.maxDrawdownPct > 10} />
            <Metric label="Expectancy" val={'$' + r.expectancy.toFixed(2)} color={r.expectancy >= 0 ? C.green : C.red} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
            <Metric label="Trades" val={String(r.totalTrades)} />
            <Metric label="Wins / Loss" val={`${r.wins} / ${r.losses}`} />
            <Metric label="Avg Win" val={'$' + r.avgWin.toFixed(2)} color={C.green} />
            <Metric label="Avg Loss" val={'$' + r.avgLoss.toFixed(2)} color={C.red} />
          </div>

          {/* ── Visualisations ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: 12 }}>
            <ChartLabel>Equity Curve + Drawdown · Trade Markers</ChartLabel>
            <EquityChart result={r} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <ChartLabel>Monthly P&amp;L</ChartLabel>
              <MonthlyChart monthly={r.monthly} />
            </div>
            <div>
              <ChartLabel>P&amp;L Distribution (Win/Loss)</ChartLabel>
              <PnLHistogram trades={r.trades} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <ChartLabel>MAE vs MFE Scatter</ChartLabel>
              <MAEMFEScatter trades={r.trades} />
            </div>
            <div>
              <ChartLabel>R-Multiple Distribution</ChartLabel>
              <RDistChart trades={r.trades} />
            </div>
          </div>

          {/* ── Trade table (last 20) ─────────────────────────────────────── */}
          <details style={{ marginBottom: 10 }}>
            <summary style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', cursor: 'pointer', marginBottom: 6 }}>
              Trade Log (last 20 of {r.trades.length})
            </summary>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['#','Dir','Entry','Exit','P&L','R','Exit'].map(h => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.trades.slice(-20).map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 6px', color: 'var(--text3)' }}>{r.trades.length - 19 + i}</td>
                      <td style={{ padding: '4px 6px', color: t.dir === 'long' ? C.green : C.red, fontWeight: 700 }}>{t.dir === 'long' ? '▲' : '▼'}</td>
                      <td style={{ padding: '4px 6px' }}>{fmtPrice(t.entryPrice)}</td>
                      <td style={{ padding: '4px 6px' }}>{fmtPrice(t.exitPrice)}</td>
                      <td style={{ padding: '4px 6px', color: t.pnl >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </td>
                      <td style={{ padding: '4px 6px', color: t.r >= 0 ? C.green : C.red }}>{t.r.toFixed(2)}R</td>
                      <td style={{ padding: '4px 6px', color: 'var(--text3)' }}>{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* ── Export ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn onClick={() => downloadCSV(r)}>⬇ CSV</ActionBtn>
            <ActionBtn onClick={() => downloadJSON(r, activeStrat?.name ?? 'strategy')}>⬇ JSON</ActionBtn>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Tiny helper ───────────────────────────────────────────────────────────────
function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
      {children}
    </div>
  );
}