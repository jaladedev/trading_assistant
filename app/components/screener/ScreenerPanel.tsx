'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useScreenerStore } from '@/lib/screenerStore';
import { useStore } from '@/lib/store';
import { QUICK_FILTERS, type FilterId, type ScreenerResult, type ScreenerView } from '@/lib/screener';
import { PRESET_STRATEGIES } from '@/lib/strategy';

const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };
const f = (v: number | null, d = 2) => v == null ? '—' : v.toFixed(d);
const fmtP = (v: number) => v > 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(v > 10 ? 2 : 4);
const fmtK = (v: number) => v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);

const TF_OPTIONS = ['1m','5m','15m','1h','4h','1d'];

const COL = {
  bull: '#00e5a0', bear: '#ff3d5a', amber: '#ffb82e',
  blue: '#4da6ff', purple: '#a78bff', text2: '#6b7591', text3: '#3d4460',
};

// ── Sortable column header ─────────────────────────────────────────────────────
function Th({ col, label, sortCol, sortDir, onSort }: {
  col: keyof ScreenerResult; label: string;
  sortCol: keyof ScreenerResult; sortDir: 'asc'|'desc'; onSort: (c: keyof ScreenerResult) => void;
}) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} style={{
      ...MONO, fontSize: 9, color: active ? 'var(--text)' : 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: '.06em', cursor: 'pointer',
      padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap',
      borderBottom: '1px solid var(--border)', userSelect: 'none',
      background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
    }}>
      {label}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
}

// ── Heatmap cell ──────────────────────────────────────────────────────────────
function HeatmapCell({ r, onClick }: { r: ScreenerResult; onClick: () => void }) {
  const bull = r.ema9 && r.ema20 && r.ema50 && r.ema9 > r.ema20 && r.ema20 > r.ema50;
  const bear = r.ema9 && r.ema20 && r.ema50 && r.ema9 < r.ema20 && r.ema20 < r.ema50;
  const bg   = bull ? 'rgba(0,229,160,0.12)' : bear ? 'rgba(255,61,90,0.12)' : 'rgba(255,255,255,0.04)';
  const bdr  = bull ? 'rgba(0,229,160,0.4)' : bear ? 'rgba(255,61,90,0.4)' : 'var(--border)';
  return (
    <div onClick={onClick} style={{
      background: bg, border: `1px solid ${bdr}`, borderRadius: 6,
      padding: '8px 10px', cursor: 'pointer', minWidth: 120,
    }}>
      <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{r.sym.replace('USDT','')}</div>
      <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: r.change24h >= 0 ? COL.bull : COL.bear, marginTop: 2 }}>
        {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
      </div>
      <div style={{ ...MONO, fontSize: 9, color: COL.text2, marginTop: 3 }}>{fmtP(r.price)}</div>
      {r.rsi != null && <div style={{ ...MONO, fontSize: 8, color: r.rsi > 70 ? COL.bear : r.rsi < 30 ? COL.bull : COL.amber }}>RSI {r.rsi}</div>}
      {r.score > 0 && <div style={{ ...MONO, fontSize: 8, color: COL.purple }}>{r.score} match{r.score !== 1 ? 'es' : ''}</div>}
    </div>
  );
}

// ── Multi-TF row ──────────────────────────────────────────────────────────────
function MTFRow({ r, onClick }: { r: ScreenerResult; onClick: () => void }) {
  const tfs = ['5m','1h','4h'];
  return (
    <tr onClick={onClick} style={{ cursor: 'pointer' }}>
      <td style={{ ...MONO, fontSize: 10, fontWeight: 700, padding: '6px 8px', color: 'var(--text)' }}>{r.sym.replace('USDT','')}</td>
      <td style={{ ...MONO, fontSize: 10, padding: '6px 8px', color: COL.text2 }}>{fmtP(r.price)}</td>
      {tfs.map(tf => {
        const mtfData = r.mtf?.[tf];
        const col = !mtfData ? COL.text3 : mtfData.trend === 'bull' ? COL.bull : mtfData.trend === 'bear' ? COL.bear : COL.text2;
        return (
          <td key={tf} style={{ ...MONO, fontSize: 10, padding: '6px 8px', textAlign: 'center', color: col }}>
            {!mtfData ? '—' : mtfData.trend === 'bull' ? '▲' : mtfData.trend === 'bear' ? '▼' : '—'}
            {mtfData?.rsi != null && <span style={{ fontSize: 8, color: COL.text3, marginLeft: 3 }}>{mtfData.rsi}</span>}
          </td>
        );
      })}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ScreenerPanel
// ─────────────────────────────────────────────────────────────────────────────

export default function ScreenerPanel() {
  const sc = useScreenerStore();
  const mainStore = useStore();
  const [tab, setTab] = useState<'screener'|'watchlist'|'webhooks'|'kelly'>('screener');
  const [webhookForm, setWebhookForm] = useState({ name:'', type:'discord' as 'discord'|'telegram'|'custom', url:'', chatId:'' });
  const [importJson, setImportJson] = useState('');
  const [importErr, setImportErr] = useState('');
  const [newWlName, setNewWlName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-refresh ticker
  useEffect(() => {
    const id = setInterval(() => sc.tickAutoRefresh(), 1000);
    return () => clearInterval(id);
  }, []);

  const handleLoadSymbol = (sym: string) => {
    mainStore.setSym(sym);
    mainStore.resetChartState();
  };

  const countdown = sc.autoRefresh.enabled && sc.autoRefresh.nextRefresh
    ? Math.max(0, Math.round((sc.autoRefresh.nextRefresh - Date.now()) / 1000))
    : null;

  const activeWl = sc.watchlists.find(w => w.id === sc.activeWatchlistId);
  const allStrats = [...PRESET_STRATEGIES, ...mainStore.strategies ?? []];

  const btnStyle = (active: boolean, color?: string): React.CSSProperties => ({
    ...MONO, fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${active ? (color || 'var(--accent)') : 'var(--border2)'}`,
    background: active ? (color ? color + '22' : 'rgba(0,229,160,0.1)') : 'var(--bg3)',
    color: active ? (color || 'var(--accent)') : 'var(--text3)',
    fontWeight: active ? 700 : 400,
  });

  // ── Tab bar ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: '.04em' }}>📡 Screener</span>
        {(['screener','watchlist','webhooks','kelly'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={btnStyle(tab === t)}>
            {t === 'kelly' ? '📐 Kelly' : t === 'webhooks' ? '🔗 Webhooks' : t === 'watchlist' ? '👁 Watchlist' : '🔍 Scan'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', ...MONO, fontSize: 9, color: 'var(--text3)' }}>
          {sc.screenerResults.length} results
        </span>
      </div>

      {/* ── SCREENER TAB ────────────────────────────────────────────────────── */}
      {tab === 'screener' && (
        <div style={{ padding: 12 }}>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {/* TF selector */}
            <select value={sc.screenerTf} onChange={e => sc.setScreenerTf(e.target.value)}
              style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
              {TF_OPTIONS.map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>

            {/* View toggle —  */}
            {(['table','heatmap','multitf'] as ScreenerView[]).map(v => (
              <button key={v} onClick={() => sc.setScreenerView(v)} style={btnStyle(sc.screenerView === v)}>
                {v === 'table' ? '≡ Table' : v === 'heatmap' ? '■ Heatmap' : '⊞ Multi-TF'}
              </button>
            ))}

            {/* Strategy scan —  */}
            <select value={sc.scanStrategyId ?? ''} onChange={e => sc.setScanStrategy(e.target.value || null)}
              style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
              <option value=''>Strategy: None</option>
              {allStrats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* Run/abort */}
            <button onClick={sc.screenerRunning ? sc.abortScan : sc.runScan}
              style={{ ...btnStyle(!sc.screenerRunning, sc.screenerRunning ? '#ff3d5a' : undefined), marginLeft: 'auto' }}>
              {sc.screenerRunning ? `⏹ Abort (${sc.screenerProgress.done}/${sc.screenerProgress.total})` : '▶ Run Scan'}
            </button>

            {/* Auto-refresh —  */}
            <button onClick={() => sc.setAutoRefresh(!sc.autoRefresh.enabled)} style={btnStyle(sc.autoRefresh.enabled, COL.amber)}>
              {sc.autoRefresh.enabled ? `↺ Auto ${countdown !== null ? countdown+'s' : ''}` : '↺ Auto'}
            </button>

            {/* Export CSV —  */}
            <button onClick={sc.exportCSV} style={btnStyle(false)} title="Export CSV">⬇ CSV</button>
          </div>

          {/* Quick filters —  */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {QUICK_FILTERS.map(f => (
              <button key={f.id} onClick={() => sc.toggleFilter(f.id as FilterId)}
                style={{
                  ...MONO, fontSize: 9, padding: '3px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${sc.activeFilters.includes(f.id as FilterId) ? 'var(--accent)' : 'var(--border)'}`,
                  background: sc.activeFilters.includes(f.id as FilterId) ? 'rgba(0,229,160,0.1)' : 'transparent',
                  color: sc.activeFilters.includes(f.id as FilterId) ? 'var(--accent)' : 'var(--text3)',
                }}>
                {f.icon} {f.label}
              </button>
            ))}
            {sc.activeFilters.length > 0 && (
              <button onClick={sc.clearFilters} style={{ ...MONO, fontSize: 9, padding: '3px 8px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: '#ff3d5a' }}>✕ Clear</button>
            )}
          </div>

          {/* Error */}
          {sc.screenerError && (
            <div style={{ ...MONO, fontSize: 10, color: '#ff3d5a', marginBottom: 8, padding: '6px 10px', background: 'rgba(255,61,90,0.08)', borderRadius: 6 }}>
              {sc.screenerError}
            </div>
          )}

          {/* Stack flip alerts —  */}
          {sc.stackFlipAlerts.length > 0 && (
            <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(255,184,46,0.08)', borderRadius: 6, border: '1px solid rgba(255,184,46,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...MONO, fontSize: 9, fontWeight: 700, color: COL.amber }}>🔔 STACK FLIPS</span>
                <button onClick={sc.clearStackFlips} style={{ ...MONO, fontSize: 8, color: COL.text3, background: 'none', border: 'none', cursor: 'pointer' }}>clear</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {sc.stackFlipAlerts.slice(0, 8).map((a, i) => (
                  <span key={i} style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 10, background: a.dir === 'bull' ? 'rgba(0,229,160,0.15)' : 'rgba(255,61,90,0.15)', color: a.dir === 'bull' ? COL.bull : COL.bear }}>
                    {a.dir === 'bull' ? '▲' : '▼'} {a.sym}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Results —  */}
          {sc.screenerView === 'heatmap' ? (
            /*  heatmap */
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sc.screenerResults.map(r => (
                <HeatmapCell key={r.sym} r={r} onClick={() => handleLoadSymbol(r.sym)} />
              ))}
              {sc.screenerResults.length === 0 && !sc.screenerRunning && (
                <div style={{ ...MONO, fontSize: 10, color: 'var(--text3)', padding: 20 }}>Run a scan to see results</div>
              )}
            </div>
          ) : sc.screenerView === 'multitf' ? (
            /*  multi-TF */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Symbol','Price','5m','1h','4h'].map(h => (
                      <th key={h} style={{ ...MONO, fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sc.screenerResults.map(r => (
                    <MTFRow key={r.sym} r={r} onClick={() => handleLoadSymbol(r.sym)} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /*  sortable table */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...MONO, fontSize: 9, color: 'var(--text3)', padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>Symbol</th>
                    {([
                      ['price','Price'], ['change24h','24h%'], ['volume24h','Vol'],
                      ['rsi','RSI'], ['adx','ADX'], ['score','Score'],
                      ['ema9','E9'], ['stBull','ST'],
                    ] as [keyof ScreenerResult, string][]).map(([col, label]) => (
                      <Th key={col} col={col} label={label} sortCol={sc.sortCol} sortDir={sc.sortDir} onSort={sc.setSortCol} />
                    ))}
                    <th style={{ ...MONO, fontSize: 9, color: 'var(--text3)', padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>Filters</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.screenerResults.map((r, i) => {
                    const bull = r.ema9 && r.ema20 && r.ema50 && r.ema9 > r.ema20 && r.ema20 > r.ema50;
                    const bear = r.ema9 && r.ema20 && r.ema50 && r.ema9 < r.ema20 && r.ema20 < r.ema50;
                    return (
                      <tr key={r.sym} onClick={() => handleLoadSymbol(r.sym)}
                        style={{ cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)')}>
                        <td style={{ ...MONO, fontSize: 10, fontWeight: 700, padding: '5px 8px', color: bull ? COL.bull : bear ? COL.bear : 'var(--text)' }}>
                          {r.sym.replace('USDT','')}
                        </td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmtP(r.price)}</td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right', color: r.change24h >= 0 ? COL.bull : COL.bear }}>
                          {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
                        </td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right', color: 'var(--text2)' }}>{fmtK(r.volume24h)}</td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right',
                          color: r.rsi == null ? COL.text3 : r.rsi > 70 ? COL.bear : r.rsi < 30 ? COL.bull : COL.amber }}>
                          {f(r.rsi, 0)}
                        </td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right', color: r.adx != null && r.adx > 25 ? COL.purple : COL.text3 }}>
                          {f(r.adx, 0)}
                        </td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right' }}>
                          {r.score > 0 ? (
                            <span style={{ background: 'rgba(167,139,255,0.15)', color: COL.purple, padding: '1px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{r.score}</span>
                          ) : '—'}
                        </td>
                        <td style={{ ...MONO, fontSize: 9, padding: '5px 8px', textAlign: 'right', color: COL.text2 }}>{f(r.ema9, 4)}</td>
                        <td style={{ ...MONO, fontSize: 10, padding: '5px 8px', textAlign: 'right', color: r.stBull === null ? COL.text3 : r.stBull ? COL.bull : COL.bear }}>
                          {r.stBull === null ? '—' : r.stBull ? '▲' : '▼'}
                        </td>
                        <td style={{ ...MONO, fontSize: 8, padding: '5px 8px', maxWidth: 160, overflow: 'hidden' }}>
                          {r.filters.slice(0, 3).map(fi => {
                            const def = QUICK_FILTERS.find(qf => qf.id === fi);
                            return (
                              <span key={fi} style={{ display: 'inline-block', marginRight: 3, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,229,160,0.1)', color: COL.bull, fontSize: 8 }}>
                                {def?.icon} {def?.label.split(' ')[0]}
                              </span>
                            );
                          })}
                          {r.filters.length > 3 && <span style={{ color: COL.text3, fontSize: 8 }}>+{r.filters.length - 3}</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {sc.screenerResults.length === 0 && !sc.screenerRunning && (
                    <tr><td colSpan={10} style={{ ...MONO, fontSize: 10, color: 'var(--text3)', padding: '20px 8px', textAlign: 'center' }}>
                      Select a watchlist and click Run Scan
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── WATCHLIST TAB —  ────────────────────────────────────── */}
      {tab === 'watchlist' && (
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {sc.watchlists.map(wl => (
              <button key={wl.id} onClick={() => sc.setActiveWatchlist(wl.id)}
                style={{ ...btnStyle(sc.activeWatchlistId === wl.id), display: 'flex', alignItems: 'center', gap: 4 }}>
                {wl.preset ? '📌' : '📋'} {wl.name}
                <span style={{ fontSize: 8, color: 'var(--text3)', marginLeft: 2 }}>({wl.syms.length})</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={newWlName} onChange={e => setNewWlName(e.target.value)}
                placeholder="New list name…"
                style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', width: 120 }} />
              <button onClick={() => { if (newWlName.trim()) { sc.createWatchlist(newWlName.trim()); setNewWlName(''); } }}
                style={btnStyle(false)}>+ Create</button>
            </div>
          </div>

          {activeWl && (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{activeWl.name}</span>
                {!activeWl.preset && (
                  <button onClick={() => sc.deleteWatchlist(activeWl.id)}
                    style={{ ...MONO, fontSize: 9, color: '#ff3d5a', background: 'rgba(255,61,90,0.07)', border: '1px solid rgba(255,61,90,0.2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', marginLeft: 'auto' }}>
                    🗑 Delete List
                  </button>
                )}
              </div>

              {/* Symbol grid */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {activeWl.syms.map(sym => (
                  <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <span style={{ ...MONO, fontSize: 10, color: 'var(--text)', cursor: 'pointer' }} onClick={() => handleLoadSymbol(sym)}>{sym}</span>
                    {!activeWl.preset && (
                      <button onClick={() => sc.removeCustomSym(sym)}
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add symbol */}
              {!activeWl.preset && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={sc.customSymInput} onChange={e => sc.setCustomSymInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && sc.customSymInput.trim()) { sc.addCustomSym(sc.customSymInput.trim()); sc.setCustomSymInput(''); } }}
                    placeholder="BTCUSDT…"
                    style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', width: 120 }} />
                  <button onClick={() => { if (sc.customSymInput.trim()) { sc.addCustomSym(sc.customSymInput.trim()); sc.setCustomSymInput(''); } }}
                    style={btnStyle(false)}>+ Add</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── WEBHOOKS TAB —  ─────────────────────────────────────── */}
      {tab === 'webhooks' && (
        <div style={{ padding: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Add Webhook</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input value={webhookForm.name} onChange={e => setWebhookForm(f => ({...f, name: e.target.value}))}
                placeholder="Name…"
                style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', width: 100 }} />
              <select value={webhookForm.type} onChange={e => setWebhookForm(f => ({...f, type: e.target.value as any}))}
                style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
                <option value="discord">Discord</option>
                <option value="telegram">Telegram</option>
                <option value="custom">Custom</option>
              </select>
              <input value={webhookForm.url} onChange={e => setWebhookForm(f => ({...f, url: e.target.value}))}
                placeholder={webhookForm.type === 'telegram' ? 'Bot API URL…' : 'Webhook URL…'}
                style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', flex: 1, minWidth: 200 }} />
              {webhookForm.type === 'telegram' && (
                <input value={webhookForm.chatId} onChange={e => setWebhookForm(f => ({...f, chatId: e.target.value}))}
                  placeholder="Chat ID…"
                  style={{ ...MONO, fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', width: 100 }} />
              )}
              <button onClick={() => {
                if (!webhookForm.url.trim()) return;
                sc.addWebhook({ name: webhookForm.name || 'Webhook', type: webhookForm.type, url: webhookForm.url, chatId: webhookForm.chatId || undefined, enabled: true });
                setWebhookForm({ name:'', type:'discord', url:'', chatId:'' });
              }} style={btnStyle(false)}>+ Add</button>
            </div>
          </div>

          {sc.webhooks.length === 0 ? (
            <div style={{ ...MONO, fontSize: 10, color: 'var(--text3)' }}>No webhooks configured</div>
          ) : (
            sc.webhooks.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, marginBottom: 6, border: '1px solid var(--border)' }}>
                <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{w.name}</span>
                <span style={{ ...MONO, fontSize: 9, color: 'var(--text3)' }}>{w.type}</span>
                <span style={{ ...MONO, fontSize: 9, color: 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</span>
                <button onClick={() => sc.updateWebhook(w.id, { enabled: !w.enabled })} style={btnStyle(w.enabled, w.enabled ? COL.bull : undefined)}>
                  {w.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => sc.removeWebhook(w.id)} style={{ ...MONO, fontSize: 9, color: '#ff3d5a', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))
          )}

          <button onClick={sc.sendWebhooks} style={{ ...btnStyle(false), marginTop: 8 }}>📤 Send Now</button>
        </div>
      )}

      {/* ── KELLY TAB — ────────────────────────────────────────── */}
      {tab === 'kelly' && (
        <div style={{ padding: 16, maxWidth: 400 }}>
          <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>📐 Kelly Criterion Sizing</div>

          {[
            { key: 'winRate', label: 'Win Rate %', placeholder: '55' },
            { key: 'avgWinR', label: 'Avg Win (R)', placeholder: '1.5' },
            { key: 'avgLossR', label: 'Avg Loss (R)', placeholder: '1.0' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ ...MONO, fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
              <input
                value={(sc.kelly as any)[key]}
                onChange={e => sc.setKellyInput(key as any, e.target.value)}
                placeholder={placeholder}
                style={{ ...MONO, fontSize: 12, padding: '6px 10px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', width: '100%' }} />
            </div>
          ))}

          <button onClick={sc.calcKellyResult} style={{ ...btnStyle(true), width: '100%', marginTop: 4, justifyContent: 'center' }}>
            Calculate Kelly %
          </button>

          {sc.kelly.kellyPct !== null && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...MONO, fontSize: 10, color: 'var(--text2)' }}>Full Kelly</span>
                <span style={{ ...MONO, fontSize: 14, fontWeight: 700, color: COL.bull }}>{sc.kelly.kellyPct.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: 10, color: 'var(--text2)' }}>Half Kelly (recommended)</span>
                <span style={{ ...MONO, fontSize: 14, fontWeight: 700, color: COL.amber }}>{sc.kelly.halfKelly?.toFixed(1)}%</span>
              </div>
              <div style={{ ...MONO, fontSize: 9, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                Half-Kelly reduces variance while preserving ~75% of optimal growth. Use this as your risk-per-trade % in position sizing.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StrategyCardActions({ stratId, enabled }: { stratId: string; enabled: boolean }) {
  const { exportStrategy, importStrategy, duplicateStrategy, toggleStrategyEnabled } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErr, setImportErr] = useState('');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const json = ev.target?.result as string;
      const res = importStrategy?.(json);
      if (res && !res.ok) setImportErr(res.error ?? 'Import failed');
      else setImportErr('');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* enable/disable toggle */}
      <button onClick={() => toggleStrategyEnabled?.(stratId)}
        style={{
          fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
          border: `1px solid ${enabled ? 'rgba(0,229,160,0.4)' : 'var(--border)'}`,
          background: enabled ? 'rgba(0,229,160,0.1)' : 'transparent',
          color: enabled ? '#00e5a0' : 'var(--text3)',
        }}>
        {enabled ? '● ON' : '○ OFF'}
      </button>

      {/* duplicate */}
      <button onClick={() => duplicateStrategy?.(stratId)}
        title="Duplicate strategy"
        style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)' }}>
        ⧉ Copy
      </button>

      {/* export */}
      <button onClick={() => exportStrategy?.(stratId)}
        title="Export as JSON"
        style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)' }}>
        ⬇ Export
      </button>

      {/* import */}
      <button onClick={() => fileRef.current?.click()}
        title="Import JSON"
        style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)' }}>
        ⬆ Import
      </button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />

      {importErr && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#ff3d5a' }}>{importErr}</span>}
    </div>
  );
}