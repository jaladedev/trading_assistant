'use client';

import { useEffect, useRef, useState } from 'react';
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

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'TONUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
type Tab = 'chart' | 'calc' | 'journal';

const STATUS_DOT: Record<string, string> = {
  idle: '#6b7591',
  live: '#00e5a0',
  warn: '#ffb82e',
  err:  '#ff3d5a',
};

export default function Home() {
  const [tab, setTab] = useState<Tab>('chart');
  const {
    sym, setSym, tf, setTf,
    livePrice, prevLivePrice, openPrice,
    connStatus, connLabel, setConnStatus,
    resetChartState, addCandleToState, setLivePrice,
  } = useStore();

  const lastKlineLoad = useRef(0);
  const pollingRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load candles ─────────────────────────────────────────
  const loadCandles = async (s: string, t: string) => {
    setConnStatus('idle', 'Loading candles…');
    const candles = await fetchKlines(s, t);
    if (!candles || candles.length === 0) {
      setConnStatus('err', 'Failed to load candles');
      return;
    }
    resetChartState();
    candles.slice(0, -1).forEach(c => addCandleToState(c));
    lastKlineLoad.current = Date.now();
    setConnStatus('live', 'Live');
  };

  // ── Tick (price poll) ─────────────────────────────────────
  const tick = async () => {
    const s = useStore.getState().sym;
    const t = useStore.getState().tf;
    const result = await fetchTicker(s);
    if (!result) {
      setConnStatus('warn', 'Price unavailable');
      return;
    }
    setLivePrice(result.price, result.api);
    setConnStatus('live', `Live · ${result.api}`);

    // Reload klines if interval elapsed
    const interval = TF_MS[t] ?? 300_000;
    if (Date.now() - lastKlineLoad.current > interval) {
      await loadCandles(s, t);
    }
  };

  // ── Bootstrap on sym/tf change ────────────────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    loadCandles(sym, tf).then(() => tick());
    pollingRef.current = setInterval(tick, 5_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tf]);

  const priceDir = livePrice >= prevLivePrice ? 'flash-green' : 'flash-red';
  const dayChgPct = openPrice > 0 ? ((livePrice - openPrice) / openPrice * 100) : 0;
  const dayChgCol = dayChgPct >= 0 ? 'var(--green)' : 'var(--red)';

  // ── Styles ────────────────────────────────────────────────
  const s = {
    root: {
      display: 'flex', flexDirection: 'column' as const,
      minHeight: '100vh', background: 'var(--bg)',
    },
    header: {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg2)', flexWrap: 'wrap' as const,
    },
    logo: {
      fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700,
      color: 'var(--accent)', letterSpacing: '.04em', marginRight: 8,
    },
    pill: (active: boolean): React.CSSProperties => ({
      padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
      borderRadius: 16, cursor: 'pointer', letterSpacing: '.04em',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`,
      background: active ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
      color: active ? 'var(--accent)' : 'var(--text2)',
      transition: 'all .15s',
    }),
    select: {
      padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)',
      background: 'var(--bg3)', color: 'var(--text)',
      border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
      outline: 'none', cursor: 'pointer',
    } as React.CSSProperties,
    price: {
      fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, marginLeft: 'auto',
    } as React.CSSProperties,
    statusDot: {
      width: 7, height: 7, borderRadius: '50%',
      background: STATUS_DOT[connStatus], flexShrink: 0,
      boxShadow: connStatus === 'live' ? '0 0 6px var(--green)' : 'none',
      animation: connStatus === 'live' ? 'pulse 2s infinite' : 'none',
    } as React.CSSProperties,
    tabs: {
      display: 'flex', gap: 2, padding: '8px 16px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg2)',
    },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '7px 20px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
      borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
      border: `1px solid ${active ? 'var(--border2)' : 'transparent'}`,
      background: active ? 'var(--bg3)' : 'transparent',
      color: active ? 'var(--text)' : 'var(--text2)',
      transition: 'all .15s',
    }),
    body: {
      flex: 1, padding: '14px 16px', maxWidth: 900,
      margin: '0 auto', width: '100%',
    } as React.CSSProperties,
  };

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <header style={s.header}>
        <span style={s.logo}>⚡ TradeAssist</span>

        {/* Symbol selector */}
        <select value={sym} onChange={e => setSym(e.target.value)} style={s.select}>
          {SYMBOLS.map(sy => (
            <option key={sy} value={sy}>{fmtSymDisplay(sy)}</option>
          ))}
        </select>

        {/* Timeframe pills */}
        <div style={{ display: 'flex', gap: 3 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} style={s.pill(tf === t)} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>

        {/* Live price */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
          {openPrice > 0 && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: dayChgCol, fontWeight: 600 }}>
              {dayChgPct >= 0 ? '+' : ''}{dayChgPct.toFixed(2)}%
            </span>
          )}
          <span className={priceDir} style={s.price}>
            {livePrice > 0 ? fmtPrice(livePrice) : '—'}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>USDT</span>
        </div>

        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20 }}>
          <div style={s.statusDot} />
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{connLabel}</span>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav style={s.tabs}>
        {(['chart', 'calc', 'journal'] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'chart' ? '📈 Chart' : t === 'calc' ? '🧮 Calculator' : '📓 Journal'}
          </button>
        ))}
      </nav>

      {/* ── Body ── */}
      <main style={s.body}>
        {tab === 'chart' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <CandleChart />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SuggestionCard />
              <EntryZones />
            </div>
            <CrossoverLog />
          </div>
        )}

        {tab === 'calc' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            <div>
              <RRCard />
              <GoalCard />
            </div>
            <FuturesCard />
          </div>
        )}

        {tab === 'journal' && (
          <TradeLog />
        )}
      </main>
    </div>
  );
}