'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { TradeJournalEntry } from '@/lib/store';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { Card, ActionBtn, Badge } from '../ui';
import { idbPutTrades } from '@/lib/journalDb';

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const OUTCOME_COLORS: Record<string, { color: string; bg: string }> = {
  win:  { color: 'var(--green)', bg: 'var(--green-bg)'          },
  loss: { color: 'var(--red)',   bg: 'var(--red-bg)'            },
  be:   { color: 'var(--amber)', bg: 'rgba(255,184,46,0.08)'    },
  open: { color: 'var(--blue)',  bg: 'rgba(77,166,255,0.08)'    },
};

const PRESET_TAGS = [
  'trend-follow', 'mean-revert', 'breakout', 'scalp', 'swing',
  'fomo', 'revenge', 'oversize', 'patient', 'clean-setup',
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Tiny canvas chart hook ────────────────────────────────────────────────────
function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
) {
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

// ── Equity curve ──────────────────────────────────────────────────────────────
function EquityCurve({ trades }: { trades: TradeJournalEntry[] }) {
  const sorted  = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const equity  = sorted.reduce<number[]>((acc, t) => {
    acc.push((acc[acc.length - 1] ?? 0) + (t.pnl || 0));
    return acc;
  }, [0]);

  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg3)'; ctx.fillRect(0, 0, w, h);
    if (equity.length < 2) { ctx.fillStyle = 'var(--text3)'; ctx.font = '10px var(--mono)'; ctx.textAlign = 'center'; ctx.fillText('No data', w/2, h/2); return; }

    const pad = { t:12, b:16, l:8, r:8 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const minE = Math.min(...equity), maxE = Math.max(...equity);
    const rng  = maxE - minE || 1;
    const xOf  = (i: number) => pad.l + (i / (equity.length - 1)) * cw;
    const yOf  = (v: number) => pad.t + (1 - (v - minE) / rng) * ch;

    // Zero line
    const z = yOf(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
    ctx.setLineDash([2,3]); ctx.beginPath(); ctx.moveTo(pad.l, z); ctx.lineTo(w-pad.r, z); ctx.stroke();
    ctx.setLineDash([]);

    // Fill
    const finalColor = equity[equity.length-1] >= 0 ? 'rgba(0,229,160,0.08)' : 'rgba(255,61,90,0.08)';
    ctx.fillStyle = finalColor;
    ctx.beginPath(); ctx.moveTo(xOf(0), yOf(0));
    equity.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.lineTo(xOf(equity.length-1), yOf(0)); ctx.closePath(); ctx.fill();

    // Line
    ctx.strokeStyle = equity[equity.length-1] >= 0 ? 'var(--green)' : 'var(--red)';
    ctx.lineWidth = 1.5; ctx.beginPath();
    equity.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'var(--text3)'; ctx.font = '9px var(--mono)'; ctx.textAlign = 'right';
    ctx.fillText('$' + maxE.toFixed(0), w - pad.r, pad.t + 10);
    ctx.fillText('$' + minE.toFixed(0), w - pad.r, h - pad.b);
  }, [equity.join(',')]);

  return <canvas ref={ref} style={{ width: '100%', height: 100, display: 'block', borderRadius: 6 }} />;
}

// ── Win rate by symbol bar chart ──────────────────────────────────────────────
function WinBySymbol({ trades }: { trades: TradeJournalEntry[] }) {
  const bySymbol: Record<string, { wins: number; total: number }> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { wins: 0, total: 0 };
    bySymbol[t.symbol].total++;
    if (t.outcome === 'win') bySymbol[t.symbol].wins++;
  }
  const entries = Object.entries(bySymbol)
    .map(([sym, v]) => ({ sym: sym.replace('USDT',''), wr: v.total > 0 ? v.wins/v.total : 0, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg3)'; ctx.fillRect(0, 0, w, h);
    if (!entries.length) return;
    const pad = { t:6, b:18, l:6, r:6 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const bw = cw / entries.length - 2;
    entries.forEach(({ sym, wr }, i) => {
      const bh = wr * ch;
      const x  = pad.l + i * (bw + 2);
      ctx.fillStyle = wr >= 0.5 ? 'rgba(0,229,160,0.6)' : 'rgba(255,61,90,0.6)';
      ctx.fillRect(x, pad.t + ch - bh, bw, bh);
      // 50% line
      ctx.strokeStyle = 'rgba(255,184,46,0.3)'; ctx.lineWidth = 0.5;
      ctx.setLineDash([2,2]); ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ch * 0.5); ctx.lineTo(w-pad.r, pad.t + ch * 0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'var(--text3)'; ctx.font = '7px var(--mono)'; ctx.textAlign = 'center';
      ctx.fillText(sym, x + bw/2, h - 4);
    });
  }, [entries.map(e => e.sym + e.wr).join(',')]);

  return <canvas ref={ref} style={{ width: '100%', height: 90, display: 'block', borderRadius: 6 }} />;
}

// ── Win rate by hour of day ───────────────────────────────────────────────────
function WinByHour({ trades }: { trades: TradeJournalEntry[] }) {
  // Use date string to bucket by hour (date only available, so we bucket by day of week)
  const byHour: Record<number, { wins: number; total: number }> = {};
  for (let i = 0; i < 24; i++) byHour[i] = { wins: 0, total: 0 };
  for (const t of trades) {
    // Use timestamp if available — fall back to 12 (noon) when only date is known
    const h = 12; // trades only have date string, not time
    byHour[h].total++;
    if (t.outcome === 'win') byHour[h].wins++;
  }
  // Since we only have date, show day-of-week win rate instead
  const byDay: Record<number, { wins: number; total: number }> = {};
  for (let i = 0; i < 7; i++) byDay[i] = { wins: 0, total: 0 };
  for (const t of trades) {
    const d = new Date(t.date + 'T00:00:00').getDay();
    byDay[d].total++;
    if (t.outcome === 'win') byDay[d].wins++;
  }

  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg3)'; ctx.fillRect(0, 0, w, h);
    const pad = { t:6, b:18, l:6, r:6 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const bw = cw / 7 - 2;
    for (let i = 0; i < 7; i++) {
      const { wins, total } = byDay[i];
      const wr = total > 0 ? wins / total : 0;
      const bh = wr * ch;
      const x  = pad.l + i * (bw + 2);
      ctx.fillStyle = total === 0 ? 'rgba(255,255,255,0.05)' : wr >= 0.5 ? 'rgba(0,229,160,0.6)' : 'rgba(255,61,90,0.6)';
      ctx.fillRect(x, pad.t + ch - bh, bw, Math.max(bh, 1));
      ctx.fillStyle = 'var(--text3)'; ctx.font = '7px var(--mono)'; ctx.textAlign = 'center';
      ctx.fillText(DAYS[i], x + bw/2, h - 4);
      if (total > 0) { ctx.fillStyle = 'var(--text2)'; ctx.fillText(Math.round(wr*100)+'%', x + bw/2, pad.t + ch - bh - 2); }
    }
    // 50% ref
    ctx.strokeStyle = 'rgba(255,184,46,0.3)'; ctx.lineWidth = 0.5; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ch * 0.5); ctx.lineTo(w-pad.r, pad.t + ch * 0.5); ctx.stroke();
    ctx.setLineDash([]);
  }, [JSON.stringify(byDay)]);

  return <canvas ref={ref} style={{ width: '100%', height: 90, display: 'block', borderRadius: 6 }} />;
}

// ── P&L by day of week ────────────────────────────────────────────────────────
function PnLByDay({ trades }: { trades: TradeJournalEntry[] }) {
  const byDay: number[] = [0,0,0,0,0,0,0];
  for (const t of trades) {
    const d = new Date(t.date + 'T00:00:00').getDay();
    byDay[d] += t.pnl || 0;
  }

  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg3)'; ctx.fillRect(0, 0, w, h);
    const pad = { t:10, b:18, l:6, r:6 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxAbs = Math.max(...byDay.map(Math.abs), 0.01);
    const midY   = pad.t + ch / 2;
    const bw     = cw / 7 - 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, midY); ctx.lineTo(w-pad.r, midY); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const v  = byDay[i];
      const bh = Math.abs(v) / maxAbs * (ch / 2 - 2);
      const x  = pad.l + i * (bw + 2);
      const y  = v >= 0 ? midY - bh : midY;
      ctx.fillStyle = v >= 0 ? 'rgba(0,229,160,0.6)' : 'rgba(255,61,90,0.6)';
      ctx.fillRect(x, y, bw, Math.max(bh, 1));
      ctx.fillStyle = 'var(--text3)'; ctx.font = '7px var(--mono)'; ctx.textAlign = 'center';
      ctx.fillText(DAYS[i], x + bw/2, h - 4);
    }
  }, [byDay.join(',')]);

  return <canvas ref={ref} style={{ width: '100%', height: 80, display: 'block', borderRadius: 6 }} />;
}

// ── Avg RR achieved vs planned ────────────────────────────────────────────────
function RRChart({ trades }: { trades: TradeJournalEntry[] }) {
  const pts = trades
    .filter(t => t.entry > 0 && t.stop > 0 && t.target > 0 && t.pnl !== 0)
    .map(t => {
      const risk      = Math.abs(t.entry - t.stop);
      const planned   = risk > 0 ? Math.abs(t.target - t.entry) / risk : 0;
      const achieved  = risk > 0 ? t.pnl / (risk * (t.entry > 0 ? (t.entry === 0 ? 1 : 1) : 1)) : 0;
      // achieved R = pnl / (risk per unit * units); units = size / entry, but we only have pnl and risk
      // Simplified: achieved R = pnl / (entry * |1 - stop/entry|) when size unknown
      const riskUsd   = t.entry * Math.abs(1 - t.stop / t.entry);
      const achR      = riskUsd > 0 ? t.pnl / riskUsd : 0;
      return { planned: Math.min(planned, 10), achieved: Math.max(-5, Math.min(achR, 10)), win: t.outcome === 'win' };
    });

  const ref = useCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg3)'; ctx.fillRect(0, 0, w, h);
    if (!pts.length) { ctx.fillStyle = 'var(--text3)'; ctx.font = '9px var(--mono)'; ctx.textAlign = 'center'; ctx.fillText('No data', w/2, h/2); return; }

    const pad = { t:8, b:16, l:20, r:8 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxX = 6, maxY = 6, minY = -3;
    const xOf = (v: number) => pad.l + (v / maxX) * cw;
    const yOf = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * ch;

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, yOf(0)); ctx.lineTo(w-pad.r, yOf(0)); ctx.stroke();
    // Diagonal (planned = achieved)
    ctx.strokeStyle = 'rgba(255,184,46,0.2)'; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(xOf(0), yOf(0)); ctx.lineTo(xOf(maxX), yOf(maxX)); ctx.stroke();
    ctx.setLineDash([]);

    for (const { planned, achieved, win } of pts) {
      ctx.beginPath();
      ctx.arc(xOf(planned), yOf(achieved), 3, 0, Math.PI*2);
      ctx.fillStyle = win ? 'rgba(0,229,160,0.55)' : 'rgba(255,61,90,0.55)';
      ctx.fill();
    }
    // Axes labels
    ctx.fillStyle = 'var(--text3)'; ctx.font = '7px var(--mono)'; ctx.textAlign = 'center';
    ctx.fillText('Planned R', w/2, h-3);
    ctx.save(); ctx.translate(8, h/2); ctx.rotate(-Math.PI/2);
    ctx.fillText('Achieved R', 0, 0); ctx.restore();
  }, [pts.map(p => p.planned + p.achieved).join(',')]);

  return <canvas ref={ref} style={{ width: '100%', height: 100, display: 'block', borderRadius: 6 }} />;
}

// ── Tag selector ──────────────────────────────────────────────────────────────
function TagSelector({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const toggle = (tag: string) =>
    onChange(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);
  const addCustom = () => {
    const t = custom.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) { onChange([...tags, t]); }
    setCustom('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
        {PRESET_TAGS.map(tag => (
          <button key={tag} onClick={() => toggle(tag)} style={{
            fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${tags.includes(tag) ? 'var(--accent)' : 'var(--border)'}`,
            background: tags.includes(tag) ? 'rgba(0,229,160,0.1)' : 'transparent',
            color: tags.includes(tag) ? 'var(--accent)' : 'var(--text3)',
          }}>{tag}</button>
        ))}
      </div>
      {/* Custom tags already on the trade */}
      {tags.filter(t => !PRESET_TAGS.includes(t)).map(tag => (
        <button key={tag} onClick={() => toggle(tag)} style={{
          fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 10, cursor: 'pointer', marginRight: 4,
          border: '1px solid var(--accent)', background: 'rgba(0,229,160,0.1)', color: 'var(--accent)',
        }}>{tag} ×</button>
      ))}
      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="Custom tag…"
          style={{ flex: 1, padding: '4px 7px', fontSize: 10, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }} />
        <button onClick={addCustom} style={{ padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' }}>+</button>
      </div>
    </div>
  );
}
export function CsvImportButton() {
  const { importTradesCsv } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode]       = useState<'merge' | 'replace'>('merge');
  const [status, setStatus]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus(null);
    try {
      const text   = await file.text();
      const result = await importTradesCsv(text, mode);
      setStatus(`✓ Imported ${result.count} trades${result.errors ? ` (${result.errors} skipped)` : ''}`);
    } catch (err) {
      setStatus(`✗ ${String(err)}`);
    }
    setLoading(false);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {/* Mode toggle */}
      {(['merge', 'replace'] as const).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px',
            borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border2)'}`,
            background: mode === m ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
            color: mode === m ? 'var(--accent)' : 'var(--text3)',
          }}
        >
          {m}
        </button>
      ))}

      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        style={{
          fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
          padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '…' : '⬆ Import CSV'}
      </button>

      {/* Status */}
      {status && (
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)',
          color: status.startsWith('✓') ? 'var(--green)' : 'var(--red)',
        }}>
          {status}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main TradeLog component
// ─────────────────────────────────────────────────────────────────────────────
export default function TradeLog() {
  const {
    trades, addTrade, updateTrade, deleteTrade,
    sym, livePrice, entryPrice, stopPrice, suggestion, currentDir,
    hydrateTradesFromIdb, exportTradesCsv, importTradesCsv,
  } = useStore();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [editing,   setEditing]   = useState<string | null>(null);
  const [draft,     setDraft]     = useState<Partial<TradeJournalEntry>>({});
  const [showForm,  setShowForm]  = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [page,      setPage]      = useState(0);
  const [importMode, setImportMode] = useState<'merge'|'replace'>('merge');
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [fOutcome, setFOutcome] = useState('');
  const [fSymbol,  setFSymbol]  = useState('');
  const [fDateFrom,setFDateFrom]= useState('');
  const [fDateTo,  setFDateTo]  = useState('');
  const [fTag,     setFTag]     = useState('');
  const [fDir,     setFDir]     = useState('');

  // ── New trade defaults ───────────────────────────────────────────────────────
  const blankTrade = (): Partial<Omit<TradeJournalEntry,'id'>> => ({
    symbol: sym, dir: currentDir, outcome: 'open',
    entry: parseFloat(entryPrice) || livePrice,
    stop: parseFloat(stopPrice) || 0,
    target: suggestion?.target || 0,
    pnl: 0, notes: '',
    tags: [], screenshotUrl: '',
    date: new Date().toISOString().slice(0,10),
  });
  const [newTrade, setNewTrade] = useState<Partial<Omit<TradeJournalEntry,'id'>>>(blankTrade);

  // ── Hydrate from IDB on mount ────────────────────────────────────────────────
  useEffect(() => { hydrateTradesFromIdb?.(); }, []);

  // ── Filtered + paginated trades ──────────────────────────────────────────────
  const filtered = trades.filter(t => {
    if (fOutcome && t.outcome !== fOutcome) return false;
    if (fSymbol  && !t.symbol.toLowerCase().includes(fSymbol.toLowerCase())) return false;
    if (fDir     && t.dir !== fDir) return false;
    if (fDateFrom && t.date < fDateFrom) return false;
    if (fDateTo   && t.date > fDateTo)   return false;
    if (fTag && !(t.tags ?? []).includes(fTag)) return false;
    return true;
  });
  const sorted    = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => setPage(0), [fOutcome, fSymbol, fDir, fDateFrom, fDateTo, fTag]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    total:  filtered.length,
    wins:   filtered.filter(t => t.outcome === 'win').length,
    losses: filtered.filter(t => t.outcome === 'loss').length,
    pnl:    filtered.reduce((a, t) => a + (t.pnl || 0), 0),
  };
  const wr = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(0) : '—';

  // ── All unique tags for filter dropdown ──────────────────────────────────────
  const allTags = [...new Set(trades.flatMap(t => t.tags ?? []))].sort();

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!newTrade.entry) return;
    addTrade({
      date:          newTrade.date          ?? new Date().toISOString().slice(0,10),
      symbol:        newTrade.symbol        ?? sym,
      dir:           newTrade.dir           ?? 'long',
      entry:         newTrade.entry         ?? 0,
      stop:          newTrade.stop          ?? 0,
      target:        newTrade.target        ?? 0,
      outcome:       newTrade.outcome       ?? 'open',
      pnl:           newTrade.pnl           ?? 0,
      notes:         newTrade.notes         ?? '',
      tags:          newTrade.tags          ?? [],
      screenshotUrl: newTrade.screenshotUrl ?? '',
    });
    setShowForm(false);
  };

  const handleExportCSV = () => {
    const csv  = exportTradesCsv?.() ?? '';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `journal_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const csv = ev.target?.result as string;
      try {
        const result = await importTradesCsv?.(csv, importMode);
        setImportMsg(`✓ Imported ${result?.count ?? 0} trades${result?.errors ? `, ${result.errors} errors` : ''}`);
      } catch (err) {
        setImportMsg(`✗ ${String(err)}`);
      }
      setTimeout(() => setImportMsg(''), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Input style ──────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)',
    background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', outline: 'none', width: '100%',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
        {[
          { label: 'Total',    val: stats.total, col: 'var(--text)' },
          { label: 'Win Rate', val: wr + (wr !== '—' ? '%' : ''), col: 'var(--green)' },
          { label: 'W / L',    val: `${stats.wins} / ${stats.losses}`, col: 'var(--text2)' },
          { label: 'Net P&L',  val: (stats.pnl >= 0 ? '+' : '') + '$' + stats.pnl.toFixed(2), col: stats.pnl >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 700, color: s.col }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <ActionBtn variant="green" onClick={() => { setNewTrade(blankTrade()); setShowForm(f => !f); }}>
          {showForm ? '✕ Cancel' : '+ Log Trade'}
        </ActionBtn>
        <ActionBtn onClick={() => setShowCharts(c => !c)}>
          {showCharts ? '✕ Charts' : '📈 Charts'}
        </ActionBtn>
        <ActionBtn onClick={handleExportCSV}>⬇ CSV</ActionBtn>

        {/* Import */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select value={importMode} onChange={e => setImportMode(e.target.value as 'merge'|'replace')}
            style={{ ...inp, width: 90, padding: '4px 6px', fontSize: 10 }}>
            <option value="merge">Merge</option>
            <option value="replace">Replace</option>
          </select>
          <ActionBtn onClick={() => fileRef.current?.click()}>⬆ Import</ActionBtn>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
        {importMsg && <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: importMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{importMsg}</span>}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[
          { label: 'Outcome', state: fOutcome, set: setFOutcome, opts: ['', 'win', 'loss', 'be', 'open'] },
          { label: 'Dir',     state: fDir,     set: setFDir,     opts: ['', 'long', 'short'] },
        ].map(({ label, state, set, opts }) => (
          <select key={label} value={state} onChange={e => set(e.target.value)}
            style={{ ...inp, width: 'auto', padding: '4px 7px', fontSize: 10 }}>
            {opts.map(o => <option key={o} value={o}>{o || label + ': All'}</option>)}
          </select>
        ))}
        <input value={fSymbol} onChange={e => setFSymbol(e.target.value)}
          placeholder="Symbol…" style={{ ...inp, width: 110, fontSize: 10, padding: '4px 7px' }} />
        <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
          style={{ ...inp, width: 'auto', fontSize: 10, padding: '4px 7px' }} />
        <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
          style={{ ...inp, width: 'auto', fontSize: 10, padding: '4px 7px' }} />
        {allTags.length > 0 && (
          <select value={fTag} onChange={e => setFTag(e.target.value)}
            style={{ ...inp, width: 'auto', padding: '4px 7px', fontSize: 10 }}>
            <option value="">Tag: All</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(fOutcome || fSymbol || fDir || fDateFrom || fDateTo || fTag) && (
          <button onClick={() => { setFOutcome(''); setFSymbol(''); setFDir(''); setFDateFrom(''); setFDateTo(''); setFTag(''); }}
            style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '4px 9px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: 'var(--red)' }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Add trade form ─────────────────────────────────────────────────── */}
      {showForm && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, marginBottom: 10 }}>📝 Log New Trade</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'Date',    type: 'date',   key: 'date',   val: newTrade.date },
              { label: 'Symbol',  type: 'text',   key: 'symbol', val: newTrade.symbol },
              { label: 'Entry',   type: 'number', key: 'entry',  val: newTrade.entry   || '' },
              { label: 'Stop',    type: 'number', key: 'stop',   val: newTrade.stop    || '' },
              { label: 'Target',  type: 'number', key: 'target', val: newTrade.target  || '' },
              { label: 'P&L ($)', type: 'number', key: 'pnl',    val: newTrade.pnl     || '' },
            ].map(({ label, type, key, val }) => (
              <div key={key}>
                <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</label>
                <input type={type} step={type === 'number' ? '0.01' : undefined}
                  value={String(val ?? '')}
                  onChange={e => setNewTrade(p => ({ ...p, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  style={inp} />
              </div>
            ))}
          </div>
          {/* Direction + Outcome */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Direction</label>
              <select value={newTrade.dir} onChange={e => setNewTrade(p => ({ ...p, dir: e.target.value as 'long'|'short' }))} style={inp}>
                <option value="long">Long</option><option value="short">Short</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Outcome</label>
              <select value={newTrade.outcome} onChange={e => setNewTrade(p => ({ ...p, outcome: e.target.value as 'win'|'loss'|'be'|'open' }))} style={inp}>
                <option value="open">Open</option><option value="win">Win</option>
                <option value="loss">Loss</option><option value="be">Break-even</option>
              </select>
            </div>
          </div>
          {/* Notes */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Notes</label>
            <textarea value={newTrade.notes} onChange={e => setNewTrade(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          {/* Screenshot URL */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Screenshot URL (optional)</label>
            <input value={newTrade.screenshotUrl ?? ''} onChange={e => setNewTrade(p => ({ ...p, screenshotUrl: e.target.value }))}
              placeholder="https://…" style={inp} />
          </div>
          {/* Tags */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tags</label>
            <TagSelector tags={newTrade.tags ?? []} onChange={tags => setNewTrade(p => ({ ...p, tags }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn variant="green" onClick={handleAdd}>Save Trade</ActionBtn>
            <ActionBtn onClick={() => setShowForm(false)}>Cancel</ActionBtn>
          </div>
        </Card>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {showCharts && filtered.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, marginBottom: 10 }}>📈 Journal Charts</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Equity Curve</div>
              <EquityCurve trades={filtered} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Win Rate by Symbol</div>
              <WinBySymbol trades={filtered} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Win Rate by Day of Week</div>
              <WinByHour trades={filtered} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>P&L by Day of Week</div>
              <PnLByDay trades={filtered} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Achieved R vs Planned R</div>
              <RRChart trades={filtered} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Trade list ────────────────────────────────────────────────────── */}
      {!filtered.length ? (
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>
          {trades.length === 0 ? 'No trades logged yet.' : 'No trades match the current filters.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paginated.map(trade => {
              const oc     = OUTCOME_COLORS[trade.outcome];
              const isEdit = editing === trade.id;
              return (
                <div key={trade.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  {isEdit ? (
                    // ── Edit mode ──────────────────────────────────────────
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                        <div>
                          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Outcome</label>
                          <select value={draft.outcome ?? trade.outcome}
                            onChange={e => setDraft(p => ({ ...p, outcome: e.target.value as 'win'|'loss'|'be'|'open' }))}
                            style={inp}>
                            <option value="open">Open</option><option value="win">Win</option>
                            <option value="loss">Loss</option><option value="be">Break-even</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>P&L ($)</label>
                          <input type="number" step="0.01" value={draft.pnl ?? trade.pnl}
                            onChange={e => setDraft(p => ({ ...p, pnl: parseFloat(e.target.value) || 0 }))}
                            style={inp} />
                        </div>
                      </div>
                      <textarea value={draft.notes ?? trade.notes}
                        onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
                        rows={2} style={{ ...inp, marginBottom: 6, resize: 'vertical' }} />
                      <div style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Screenshot URL</label>
                        <input value={draft.screenshotUrl ?? trade.screenshotUrl ?? ''}
                          onChange={e => setDraft(p => ({ ...p, screenshotUrl: e.target.value }))}
                          placeholder="https://…" style={inp} />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tags</label>
                        <TagSelector
                          tags={draft.tags ?? trade.tags ?? []}
                          onChange={tags => setDraft(p => ({ ...p, tags }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <ActionBtn variant="green" onClick={() => { updateTrade(trade.id, draft); setEditing(null); setDraft({}); }}>Save</ActionBtn>
                        <ActionBtn onClick={() => { setEditing(null); setDraft({}); }}>Cancel</ActionBtn>
                      </div>
                    </div>
                  ) : (
                    // ── View mode ──────────────────────────────────────────
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{trade.date}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtSymDisplay(trade.symbol)}</span>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: trade.dir === 'long' ? 'var(--green)' : 'var(--red)', background: trade.dir === 'long' ? 'var(--green-bg)' : 'var(--red-bg)' }}>
                          {trade.dir === 'long' ? '▲ L' : '▼ S'}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>@ {fmtPrice(trade.entry)}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 7px', borderRadius: 4, color: oc.color, background: oc.bg }}>
                          {trade.outcome.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: (trade.pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 'auto' }}>
                          {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                        </span>
                      </div>
                      {/* Tags */}
                      {(trade.tags ?? []).length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {(trade.tags ?? []).map(tag => (
                            <span key={tag} style={{ fontSize: 8, fontFamily: 'var(--mono)', padding: '1px 6px', borderRadius: 8, background: 'rgba(0,229,160,0.08)', color: 'var(--accent)', border: '1px solid rgba(0,229,160,0.2)' }}>{tag}</span>
                          ))}
                        </div>
                      )}
                      {/* Notes */}
                      {trade.notes && <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3 }}>{trade.notes}</div>}
                      {/* Screenshot thumbnail */}
                      {trade.screenshotUrl && (
                        <a href={trade.screenshotUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--blue)', marginTop: 3, display: 'inline-block' }}>
                          📷 Screenshot ↗
                        </a>
                      )}
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                        <button onClick={() => { setEditing(trade.id); setDraft({}); }}
                          style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' }}>Edit</button>
                        <button onClick={() => deleteTrade(trade.id)}
                          style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: 'var(--red)' }}>×</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ─────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              <button onClick={() => setPage(0)} disabled={page === 0} style={pgBtn(page === 0)}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={pgBtn(page === 0)}>‹</button>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                {page + 1} / {totalPages} ({filtered.length} trades)
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1} style={pgBtn(page === totalPages-1)}>›</button>
              <button onClick={() => setPage(totalPages-1)} disabled={page === totalPages-1} style={pgBtn(page === totalPages-1)}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pagination button style ───────────────────────────────────────────────────
function pgBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: 12, fontFamily: 'var(--mono)',
    borderRadius: 'var(--radius-sm)', cursor: disabled ? 'default' : 'pointer',
    border: '1px solid var(--border2)', background: 'var(--bg3)',
    color: disabled ? 'var(--text3)' : 'var(--text2)',
    opacity: disabled ? 0.4 : 1,
  };
}