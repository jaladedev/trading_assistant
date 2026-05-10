'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { fetchKlines, fetchTicker, TF_MS } from '@/lib/api';
import CandleChart from '@/components/chart/CandleChart';
import CrossoverLog from '@/components/chart/CrossoverLog';
import EntryZones from '@/components/chart/EntryZones';
import SuggestionCard from '@/components/chart/SuggestionCard';
import RRCard from '@/components/calculator/RRCard';
import FuturesCard from '@/components/calculator/FuturesCard';
import GoalCard from '@/components/calculator/GoalCard';
import TradeLog from '@/components/journal/TradeLog';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { useState } from 'react';

// ── Symbol catalogue ──────────────────────────────────────────────────────────
const PRESET_SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'TONUSDT'];

const ALL_SYMS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'TONUSDT',
  'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'TRXUSDT', 'LINKUSDT', 'DOTUSDT',
  'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
  'APTUSDT', 'OPUSDT', 'ARBUSDT', 'INJUSDT', 'SUIUSDT', 'SEIUSDT',
  'SANDUSDT', 'MANAUSDT', 'AAVEUSDT', 'COMPUSDT', 'SNXUSDT', 'MKRUSDT',
  'RUNEUSDT', 'FTMUSDT', 'ALGOUSDT', 'ICPUSDT', 'FILUSDT', 'HBARUSDT',
  'EGLDUSDT', 'FLOWUSDT', 'AXSUSDT', 'GALAUSDT', 'APEUSDT', 'WOOUSDT',
  'RENDERUSDT', 'FETUSDT', 'AGIXUSDT', 'OCEANUSDT', 'TAOUSDT',
  'ETHBTC', 'BNBBTC', 'PEPEUSDT', 'FLOKIUSDT', 'SHIBUSDT',
];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
type Tab = 'chart' | 'calc' | 'journal';

const STATUS_COLOR: Record<string, string> = {
  idle: '#6b7591',
  live: '#00e5a0',
  warn: '#ffb82e',
  err:  '#ff3d5a',
};

// ── SymbolSearch ──────────────────────────────────────────────────────────────
function SymbolSearch({ sym, onSelect }: { sym: string; onSelect: (s: string) => void }) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(-1);
  const listRef             = useRef<HTMLDivElement>(null);
  const blurTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalise = (s: string) => s.replace(/[\s/\-_.]/g, '').toUpperCase();

  const filtered = query.trim()
    ? ALL_SYMS.filter(s =>
        normalise(s).includes(normalise(query)) ||
        s.replace('USDT', '').includes(normalise(query))
      ).slice(0, 20)
    : [];

  const commit = useCallback((s: string) => {
    let val = normalise(s);
    if (val && !val.endsWith('USDT') && !val.endsWith('BTC') && !val.endsWith('ETH')) val += 'USDT';
    if (val) { onSelect(val); setQuery(''); setOpen(false); setCursor(-1); }
  }, [onSelect]);

  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      (listRef.current.children[cursor] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <input
        value={query}
        placeholder={fmtSymDisplay(sym)}
        onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => { setOpen(false); setQuery(''); setCursor(-1); }, 180);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (cursor >= 0 && filtered[cursor]) commit(filtered[cursor]); else if (query.trim()) commit(query.trim()); }
          else if (e.key === 'Escape') { setOpen(false); setQuery(''); setCursor(-1); }
        }}
        autoComplete="off" spellCheck={false}
        style={{
          width: 120, padding: '5px 8px', fontSize: 11,
          fontFamily: 'var(--mono)', fontWeight: 600,
          background: 'var(--bg3)', color: 'var(--text)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius-sm)', outline: 'none',
          letterSpacing: '.06em', transition: 'border-color .15s',
        }}
      />

      {open && (
        <div
          ref={listRef}
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            borderRadius: 'var(--radius-sm)', maxHeight: 240, overflowY: 'auto',
            minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
          }}
        >
          {filtered.length > 0 ? (
            <>
              <div style={{ padding: '5px 12px 3px', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Search results
              </div>
              {filtered.map((s, i) => (
                <div
                  key={s}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={() => commit(s)}
                  style={{
                    padding: '7px 12px', fontSize: 11, fontFamily: 'var(--mono)',
                    cursor: 'pointer',
                    color:      s === sym ? 'var(--accent)' : 'var(--text)',
                    background: i === cursor ? 'var(--bg3)' : s === sym ? 'rgba(0,229,160,0.07)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}
                >
                  <span>{fmtSymDisplay(s)}</span>
                  {s === sym && <span style={{ fontSize: 9, color: 'var(--accent)' }}>active</span>}
                </div>
              ))}
            </>
          ) : query.trim() ? (
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Custom pair</div>
              <div
                onMouseDown={() => commit(query.trim())}
                style={{ padding: '7px 12px', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>Load {normalise(query.trim()).endsWith('USDT') ? normalise(query.trim()) : normalise(query.trim()) + 'USDT'}</span>
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>↵</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '10px 12px', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              Type a symbol to search…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const {
    sym, setSym, tf, setTf,
    livePrice, prevLivePrice, openPrice,
    connStatus, connLabel, setConnStatus,
    resetChartState, addCandleToState, setLivePrice,
    activeTab,
  } = useStore();

  const lastKlineLoad = useRef(0);
  const pollingRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load candles ──────────────────────────────────────────────────────────
  const loadCandles = useCallback(async (s: string, t: string) => {
    setConnStatus('idle', 'Loading…');
    const candles = await fetchKlines(s, t);
    if (!candles || candles.length === 0) {
      setConnStatus('err', 'Failed to load candles');
      return;
    }
    resetChartState();
    candles.slice(0, -1).forEach(c => addCandleToState(c));
    lastKlineLoad.current = Date.now();
    setConnStatus('live', 'Live');
  }, [setConnStatus, resetChartState, addCandleToState]);

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = useCallback(async () => {
    const s      = useStore.getState().sym;
    const t      = useStore.getState().tf;
    const result = await fetchTicker(s);
    if (!result) { setConnStatus('warn', 'Price unavailable'); return; }
    setLivePrice(result.price, result.api);
    setConnStatus('live', `Live · ${result.api}`);
    const interval = TF_MS[t] ?? 300_000;
    if (Date.now() - lastKlineLoad.current > interval) await loadCandles(s, t);
  }, [setConnStatus, setLivePrice, loadCandles]);

  // ── Bootstrap on sym / tf change ──────────────────────────────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    loadCandles(sym, tf).then(() => tick());
    pollingRef.current = setInterval(tick, 5_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [sym, tf, loadCandles, tick]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'c' || e.key === 'C') useStore.setState({ activeTab: 'chart' });
      if (e.key === 'k' || e.key === 'K') useStore.setState({ activeTab: 'calc' });
      if (e.key === 'j' || e.key === 'J') useStore.setState({ activeTab: 'journal' });
      if (e.key === '1') useStore.getState().setTf('1m');
      if (e.key === '2') useStore.getState().setTf('5m');
      if (e.key === '3') useStore.getState().setTf('15m');
      if (e.key === '4') useStore.getState().setTf('1h');
      if (e.key === '5') useStore.getState().setTf('4h');
      if (e.key === '6') useStore.getState().setTf('1d');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const priceFlash  = livePrice >= prevLivePrice ? 'flash-green' : 'flash-red';
  const dayChgPct   = openPrice > 0 ? (livePrice - openPrice) / openPrice * 100 : 0;
  const dayChgColor = dayChgPct >= 0 ? 'var(--green)' : 'var(--red)';

  // ── Style helpers ──────────────────────────────────────────────────────────
  const pill = (active: boolean, accent = false): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 16, cursor: 'pointer', letterSpacing: '.04em',
    border: `1px solid ${active ? (accent ? 'var(--accent)' : 'var(--border2)') : 'var(--border2)'}`,
    background: active ? (accent ? 'rgba(0,229,160,0.15)' : 'var(--bg3)') : 'transparent',
    color:  active ? (accent ? 'var(--accent)' : 'var(--text)') : 'var(--text2)',
    transition: 'all .15s',
  });

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 20px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
    border: `1px solid ${active ? 'var(--border2)' : 'transparent'}`,
    background: active ? 'var(--bg3)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text2)',
    transition: 'all .15s',
  });

  const TAB_LABELS: Record<Tab, string> = {
    chart:   '📈 Chart',
    calc:    '🧮 Calculator',
    journal: '📓 Journal',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <span style={{
          fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700,
          color: 'var(--accent)', letterSpacing: '.04em', flexShrink: 0, marginRight: 4,
        }}>
          ⚡ TradeAssist
        </span>

        {/* Symbol search + presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <SymbolSearch sym={sym} onSelect={setSym} />
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {PRESET_SYMS.map(s => (
              <button key={s} onClick={() => setSym(s)} style={pill(sym === s, sym === s)}>
                {s.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border2)', flexShrink: 0, margin: '0 2px' }} />

        {/* Timeframe pills */}
        <div style={{ display: 'flex', gap: 3 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} style={pill(tf === t)} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>

        {/* Live price */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {openPrice > 0 && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: dayChgColor }}>
              {dayChgPct >= 0 ? '+' : ''}{dayChgPct.toFixed(2)}%
            </span>
          )}
          <span className={priceFlash} style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700 }}>
            {livePrice > 0 ? fmtPrice(livePrice) : '—'}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>USDT</span>
        </div>

        {/* Connection badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '4px 10px', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 20,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: STATUS_COLOR[connStatus] ?? 'var(--text3)',
            boxShadow: connStatus === 'live' ? '0 0 6px var(--green)' : 'none',
            animation: connStatus === 'live' ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{connLabel}</span>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav style={{
        display: 'flex', gap: 2, padding: '8px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg2)',
      }}>
        {(['chart', 'calc', 'journal'] as Tab[]).map(t => (
          <button
            key={t}
            style={tabStyle(activeTab === t)}
            onClick={() => useStore.setState({ activeTab: t })}
          >
            {TAB_LABELS[t]}
          </button>
        ))}

        {/* Keyboard shortcut hints */}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        }}>
          {[['C', 'chart'], ['K', 'calc'], ['J', 'journal'], ['1-6', 'tf']].map(([key, label]) => (
            <span key={key} style={{
              padding: '1px 5px', borderRadius: 3,
              border: '1px solid var(--border2)', background: 'var(--bg3)',
              letterSpacing: '.04em',
            }}>
              {key}
            </span>
          ))}
        </div>
      </nav>

      {/* ── Body ── */}
      <main style={{ flex: 1, padding: '14px 16px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>

        {activeTab === 'chart' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <CandleChart />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SuggestionCard />
              <EntryZones />
            </div>
            <CrossoverLog />
          </div>
        )}

        {activeTab === 'calc' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            <div>
              <RRCard />
              <GoalCard />
            </div>
            <FuturesCard />
          </div>
        )}

        {activeTab === 'journal' && <TradeLog />}
      </main>
    </div>
  );
}