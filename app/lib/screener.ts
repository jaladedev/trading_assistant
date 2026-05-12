import { calcAutoFibo } from './indicators2';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

export interface ScreenerResult {
  sym:        string;
  price:      number;
  change24h:  number;   // %
  volume24h:  number;
  // Indicators
  ema9:       number | null;
  ema20:      number | null;
  ema50:      number | null;
  rsi:        number | null;
  macdLine:   number | null;
  macdSig:    number | null;
  macdHist:   number | null;
  adx:        number | null;
  bbWidth:    number | null;
  atr:        number | null;
  stBull:     boolean | null;
  volAvg20:   number | null;
  highN:      number | null;   // N-bar high
  lowN:       number | null;   // N-bar low
  nearFib:    string | null;   // nearest fib label if within 0.5%
  // Filter matches
  filters:    string[];        // list of filter names that matched
  score:      number;          // how many filters matched
  // Multi-TF (optional, populated by MTF scan)
  mtf?:       Record<string, { trend: 'bull' | 'bear' | 'neutral'; rsi: number | null }>;
  // Strategy scan ()
  strategySignal?: { dir: 'long' | 'short'; score: number; reasons: string[] } | null;
  fetchedAt:  number;
}

// Quick filter definitions
export type FilterId =
  | 'ema_stack_bull'
  | 'ema_stack_bear'
  | 'rsi_oversold'
  | 'rsi_overbought'
  | 'macd_cross_bull'
  | 'macd_cross_bear'
  | 'supertrend_bull'
  | 'supertrend_bear'
  | 'bb_squeeze'
  | 'volume_spike'
  | 'price_near_ema9'
  | 'price_near_ema20'
  | 'price_near_ema50'
  | 'n_bar_high'
  | 'n_bar_low'
  | 'adx_trending'
  | 'fib_level';

export interface QuickFilter {
  id:       FilterId;
  label:    string;
  icon:     string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'price';
}

export const QUICK_FILTERS: QuickFilter[] = [
  { id: 'ema_stack_bull',   label: 'EMA Stack Bull',    icon: '▲', category: 'trend'      },
  { id: 'ema_stack_bear',   label: 'EMA Stack Bear',    icon: '▼', category: 'trend'      },
  { id: 'supertrend_bull',  label: 'SuperTrend Bull',   icon: '🟢', category: 'trend'     },
  { id: 'supertrend_bear',  label: 'SuperTrend Bear',   icon: '🔴', category: 'trend'     },
  { id: 'macd_cross_bull',  label: 'MACD Cross Bull',   icon: '⬆', category: 'momentum'  },
  { id: 'macd_cross_bear',  label: 'MACD Cross Bear',   icon: '⬇', category: 'momentum'  },
  { id: 'rsi_oversold',     label: 'RSI Oversold',      icon: '📉', category: 'momentum'  },
  { id: 'rsi_overbought',   label: 'RSI Overbought',    icon: '📈', category: 'momentum'  },
  { id: 'adx_trending',     label: 'ADX Trending >25',  icon: '💪', category: 'momentum'  },
  { id: 'bb_squeeze',       label: 'BB Squeeze',        icon: '🤏', category: 'volatility' },
  { id: 'volume_spike',     label: 'Volume Spike 2×',   icon: '📊', category: 'volume'    },
  { id: 'price_near_ema9',  label: 'Near EMA9',         icon: '〰', category: 'price'     },
  { id: 'price_near_ema20', label: 'Near EMA20',        icon: '〰', category: 'price'     },
  { id: 'price_near_ema50', label: 'Near EMA50',        icon: '〰', category: 'price'     },
  { id: 'n_bar_high',       label: '20-Bar High',       icon: '🔝', category: 'price'     },
  { id: 'n_bar_low',        label: '20-Bar Low',        icon: '🔻', category: 'price'     },
  { id: 'fib_level',        label: 'Near Fib Level',    icon: '🌀', category: 'price'     },
];

// Watchlist types
export interface WatchlistGroup {
  id:      string;
  name:    string;
  syms:    string[];
  preset?: boolean;
}

export const PRESET_WATCHLISTS: WatchlistGroup[] = [
  {
    id: 'preset-majors', name: 'Majors', preset: true,
    syms: ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','DOGEUSDT'],
  },
  {
    id: 'preset-defi', name: 'DeFi', preset: true,
    syms: ['UNIUSDT','AAVEUSDT','COMPUSDT','MKRUSDT','CRVUSDT','SUSHIUSDT','1INCHUSDT','LDOUSDT'],
  },
  {
    id: 'preset-layer1', name: 'Layer 1', preset: true,
    syms: ['SOLUSDT','AVAXUSDT','NEARUSDT','ATOMUSDT','ALGOUSDT','FTMUSDT','APTUSDT','SUIUSDT'],
  },
  {
    id: 'preset-layer2', name: 'Layer 2', preset: true,
    syms: ['MATICUSDT','ARBUSDT','OPUSDT','IMXUSDT','STRKUSDT','ZKUSDT'],
  },
  {
    id: 'preset-memes', name: 'Memes', preset: true,
    syms: ['DOGEUSDT','SHIBUSDT','PEPEUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT'],
  },
];

// View modes
export type ScreenerView = 'table' | 'heatmap' | 'multitf';

// Auto-refresh config
export interface AutoRefreshConfig {
  enabled:       boolean;
  intervalSec:   number;   // default 300 (5 min)
  lastRefresh:   number;
  nextRefresh:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal indicator engine (self-contained, no store dependency)
// ─────────────────────────────────────────────────────────────────────────────

function ema(prev: number | null, val: number, k: number): number {
  return prev === null ? val : val * k + prev * (1 - k);
}

function computeIndicators(candles: Candle[], nBar = 20) {
  if (candles.length < 2) return null;

  const k9 = 2 / 10, k20 = 2 / 21, k50 = 2 / 51;
  const kF = 2 / 13, kS = 2 / 27, kSig = 2 / 10;

  let e9: number | null = null, e20: number | null = null, e50: number | null = null;
  let ef: number | null = null, es: number | null = null, esig: number | null = null;
  let prevClose: number | null = null;
  let gains = 0, losses = 0, rsiCount = 0;
  let atrSum = 0, atrCount = 0;
  let stUpperBand = 0, stLowerBand = 0, stVal = 0, stBull = false;
  let adxPlusDM = 0, adxMinusDM = 0, adxTR = 0, adxDX = 0, adxVal = 0, adxCount = 0;
  const bbCloses: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    e9  = ema(e9,  c.c, k9);
    e20 = ema(e20, c.c, k20);
    e50 = ema(e50, c.c, k50);

    // MACD
    ef   = ema(ef,   c.c, kF);
    es   = ema(es,   c.c, kS);
    const ml = (ef ?? c.c) - (es ?? c.c);
    esig = ema(esig, ml, kSig);

    // RSI (simple)
    if (prevClose !== null) {
      const ch = c.c - prevClose;
      if (ch > 0) gains += ch; else losses -= ch;
      rsiCount++;
    }

    // ATR
    if (prevClose !== null) {
      const tr = Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
      atrSum += tr; atrCount++;
    }

    // BB closes window
    bbCloses.push(c.c);
    if (bbCloses.length > 20) bbCloses.shift();

    prevClose = c.c;
  }

  // Final RSI
  const rsi = rsiCount > 0 && losses + gains > 0
    ? 100 - 100 / (1 + gains / Math.max(losses, 0.0001))
    : null;

  // Final MACD
  const macdLine = ef !== null && es !== null ? ef - es : null;
  const macdSig  = esig;
  const macdHist = macdLine !== null && macdSig !== null ? macdLine - macdSig : null;

  // MACD prev bar
  let prevMacdLine: number | null = null, prevMacdSig: number | null = null;
  if (candles.length >= 2) {
    let ef2: number | null = null, es2: number | null = null, esig2: number | null = null;
    for (let i = 0; i < candles.length - 1; i++) {
      const c = candles[i];
      ef2 = ema(ef2, c.c, kF); es2 = ema(es2, c.c, kS);
      const ml2 = (ef2 ?? c.c) - (es2 ?? c.c);
      esig2 = ema(esig2, ml2, kSig);
    }
    prevMacdLine = ef2 !== null && es2 !== null ? ef2 - es2 : null;
    prevMacdSig  = esig2;
  }

  // ATR (simple avg)
  const atr = atrCount > 0 ? atrSum / atrCount : null;

  // BB
  const bbPeriod = Math.min(20, bbCloses.length);
  const bbMean   = bbCloses.reduce((a, b) => a + b, 0) / bbCloses.length;
  const bbStd    = Math.sqrt(bbCloses.reduce((a, b) => a + (b - bbMean) ** 2, 0) / bbCloses.length);
  const bbWidth  = bbMean > 0 ? (bbStd * 4) / bbMean : null;

  // SuperTrend (simplified last bar)
  const last = candles[candles.length - 1];
  const hl2  = (last.h + last.l) / 2;
  const stUp = atr !== null ? hl2 + 3 * atr : hl2;
  const stDn = atr !== null ? hl2 - 3 * atr : hl2;
  stBull = last.c > stDn;

  // N-bar high/low
  const nSlice = candles.slice(-nBar);
  const highN  = Math.max(...nSlice.map(c => c.h));
  const lowN   = Math.min(...nSlice.map(c => c.l));

  // Volume avg
  const volAvg20 = candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, candles.length);

  // ADX simplified
  let adx: number | null = null;
  if (candles.length >= 14) {
    let sm_plus = 0, sm_minus = 0, sm_tr = 0;
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prev = candles[i - 1];
      const upMove = cur.h - prev.h, downMove = prev.l - cur.l;
      const plusDM  = upMove > downMove && upMove > 0 ? upMove : 0;
      const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
      const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
      sm_plus += plusDM; sm_minus += minusDM; sm_tr += tr;
    }
    if (sm_tr > 0) {
      const pDI = 100 * sm_plus / sm_tr;
      const mDI = 100 * sm_minus / sm_tr;
      const dx  = Math.abs(pDI - mDI) / (pDI + mDI + 0.0001) * 100;
      adx = dx;
    }
  }

  // Near Fib
  let nearFib: string | null = null;
  try {
  const fibo = calcAutoFibo(candles, Math.min(50, candles.length));
  if (fibo) {
    const price = last.c;
    for (const lv of fibo.levels) {
      if (Math.abs(lv.price - price) / price < 0.005) { nearFib = lv.label; break; }
    }
  }
  } catch { /* skip */ }

  return {
    price: last.c, e9, e20, e50,
    rsi: rsi !== null ? Math.round(rsi) : null,
    macdLine, macdSig, macdHist,
    prevMacdLine, prevMacdSig,
    atr, bbWidth, stBull,
    highN, lowN, volAvg20, lastVol: last.v,
    adx, nearFib,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply quick filters to computed result
// ─────────────────────────────────────────────────────────────────────────────

function applyFilters(
  ind: NonNullable<ReturnType<typeof computeIndicators>>,
  activeFilters: FilterId[],
): string[] {
  const matched: string[] = [];
  const { price, e9, e20, e50, rsi, macdLine, macdSig, prevMacdLine, prevMacdSig,
    adx, bbWidth, stBull, volAvg20, lastVol, highN, lowN, nearFib } = ind;

  for (const f of activeFilters) {
    switch (f) {
      case 'ema_stack_bull':
        if (e9 && e20 && e50 && e9 > e20 && e20 > e50) matched.push(f); break;
      case 'ema_stack_bear':
        if (e9 && e20 && e50 && e9 < e20 && e20 < e50) matched.push(f); break;
      case 'rsi_oversold':
        if (rsi !== null && rsi < 30) matched.push(f); break;
      case 'rsi_overbought':
        if (rsi !== null && rsi > 70) matched.push(f); break;
      case 'macd_cross_bull':
        if (macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine <= prevMacdSig && macdLine > macdSig) matched.push(f); break;
      case 'macd_cross_bear':
        if (macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine >= prevMacdSig && macdLine < macdSig) matched.push(f); break;
      case 'supertrend_bull':
        if (stBull === true)  matched.push(f); break;
      case 'supertrend_bear':
        if (stBull === false) matched.push(f); break;
      case 'bb_squeeze':
        if (bbWidth !== null && bbWidth < 0.03) matched.push(f); break;
      case 'volume_spike':
        if (volAvg20 && lastVol > volAvg20 * 2) matched.push(f); break;
      case 'price_near_ema9':
        if (e9 && Math.abs(price - e9) / price < 0.003) matched.push(f); break;
      case 'price_near_ema20':
        if (e20 && Math.abs(price - e20) / price < 0.003) matched.push(f); break;
      case 'price_near_ema50':
        if (e50 && Math.abs(price - e50) / price < 0.005) matched.push(f); break;
      case 'n_bar_high':
        if (highN !== null && price >= highN * 0.998) matched.push(f); break;
      case 'n_bar_low':
        if (lowN !== null && price <= lowN * 1.002) matched.push(f); break;
      case 'adx_trending':
        if (adx !== null && adx > 25) matched.push(f); break;
      case 'fib_level':
        if (nearFib !== null) matched.push(f); break;
    }
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staggered fetch with cache + rate-limit safety
// ─────────────────────────────────────────────────────────────────────────────

const CACHE = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL = 60_000; // 1 min per symbol
const FETCH_DELAY_MS = 120; // ~8 req/s, well under Binance 1200/min limit

async function fetchCandlesCached(sym: string, tf: string): Promise<Candle[]> {
  const key = `${sym}_${tf}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=100`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const raw = await r.json() as string[][];
  const data: Candle[] = raw.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
  CACHE.set(key, { data, ts: Date.now() });
  return data;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Main scan runner
export async function runScreener(
  syms: string[],
  tf: string,
  activeFilters: FilterId[],
  onProgress?: (done: number, total: number, latest: ScreenerResult | null) => void,
  signal?: AbortSignal,
  strategyEval?: (sym: string, candles: Candle[]) => { dir: 'long'|'short'; score: number; reasons: string[] } | null,
): Promise<ScreenerResult[]> {
  const results: ScreenerResult[] = [];

  for (let i = 0; i < syms.length; i++) {
    if (signal?.aborted) break;
    const sym = syms[i];

    try {
      const candles = await fetchCandlesCached(sym, tf);
      const ind = computeIndicators(candles);
      if (!ind) continue;

      // 24h change
      const open24 = candles.length >= 2 ? candles[candles.length - 2].o : ind.price;
      const change24h = open24 > 0 ? (ind.price - open24) / open24 * 100 : 0;
      const volume24h = candles.slice(-24).reduce((a, c) => a + c.v, 0);

      const filters = applyFilters(ind, activeFilters);

      // strategy scan
      const strategySignal = strategyEval ? strategyEval(sym, candles) : null;

      const result: ScreenerResult = {
        sym, price: ind.price, change24h, volume24h,
        ema9: ind.e9, ema20: ind.e20, ema50: ind.e50,
        rsi: ind.rsi, macdLine: ind.macdLine, macdSig: ind.macdSig, macdHist: ind.macdHist,
        adx: ind.adx, bbWidth: ind.bbWidth, atr: ind.atr,
        stBull: ind.stBull, volAvg20: ind.volAvg20, highN: ind.highN, lowN: ind.lowN,
        nearFib: ind.nearFib,
        filters, score: filters.length,
        strategySignal,
        fetchedAt: Date.now(),
      };
      results.push(result);
      onProgress?.(i + 1, syms.length, result);
    } catch { /* skip failed symbol silently */ }

    //  stagger
    if (i < syms.length - 1) await sleep(FETCH_DELAY_MS);
  }

  return results;
}

//  Multi-TF scan (adds mtf field)
export async function runMultiTFScan(
  syms: string[],
  tfs: string[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ScreenerResult[]> {
  const baseResults = await runScreener(syms, tfs[0], [], onProgress, signal);

  for (const result of baseResults) {
    result.mtf = {};
    for (const tf of tfs.slice(1)) {
      if (signal?.aborted) break;
      try {
        const candles = await fetchCandlesCached(result.sym, tf);
        const ind = computeIndicators(candles);
        if (!ind) continue;
        const trend = ind.e9 && ind.e20 && ind.e50
          ? (ind.e9 > ind.e20 && ind.e20 > ind.e50 ? 'bull' : ind.e9 < ind.e20 && ind.e20 < ind.e50 ? 'bear' : 'neutral')
          : 'neutral';
        result.mtf![tf] = { trend, rsi: ind.rsi };
      } catch { /* skip */ }
      await sleep(FETCH_DELAY_MS);
    }
  }
  return baseResults;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack-flip detection for alerts (sound + notification)
// ─────────────────────────────────────────────────────────────────────────────

export interface StackFlipAlert {
  sym:  string;
  dir:  'bull' | 'bear';
  time: number;
}

let prevStackState = new Map<string, 'bull' | 'bear' | 'neutral'>();

function playBeep(freq: number, dur: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(); osc.stop(ctx.currentTime + dur / 1000);
  } catch { /* no audio context */ }
}

export function checkStackFlips(
  results: ScreenerResult[],
  onFlip?: (alert: StackFlipAlert) => void,
): StackFlipAlert[] {
  const flips: StackFlipAlert[] = [];
  for (const r of results) {
    const cur: 'bull' | 'bear' | 'neutral' =
      r.ema9 && r.ema20 && r.ema50
        ? r.ema9 > r.ema20 && r.ema20 > r.ema50 ? 'bull'
        : r.ema9 < r.ema20 && r.ema20 < r.ema50 ? 'bear'
        : 'neutral'
      : 'neutral';

    const prev = prevStackState.get(r.sym);
    if (prev && prev !== cur && cur !== 'neutral') {
      const flip: StackFlipAlert = { sym: r.sym, dir: cur, time: Date.now() };
      flips.push(flip);
      onFlip?.(flip);
      // Sound
      if (typeof window !== 'undefined') {
        playBeep(cur === 'bull' ? 880 : 440, 300);
      }
      // Notification
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`📊 Stack Flip — ${r.sym}`, {
          body: `${r.sym} flipped ${cur === 'bull' ? '▲ BULLISH' : '▼ BEARISH'} on EMA stack`,
          icon: '/favicon.ico',
        });
      }
    }
    prevStackState.set(r.sym, cur);
  }
  return flips;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────────────────────

export function exportScreenerCSV(results: ScreenerResult[], tf: string): void {
  const headers = [
    'Symbol','Price','Change24h%','Volume24h','EMA9','EMA20','EMA50',
    'RSI','MACD','ADX','BB Width','ATR','SuperTrend','Near Fib','Filters','Score',
  ];
  const rows = results.map(r => [
    r.sym,
    r.price.toFixed(4),
    r.change24h.toFixed(2),
    r.volume24h.toFixed(0),
    r.ema9?.toFixed(4) ?? '',
    r.ema20?.toFixed(4) ?? '',
    r.ema50?.toFixed(4) ?? '',
    r.rsi?.toFixed(1) ?? '',
    r.macdLine?.toFixed(6) ?? '',
    r.adx?.toFixed(1) ?? '',
    r.bbWidth?.toFixed(4) ?? '',
    r.atr?.toFixed(4) ?? '',
    r.stBull === null ? '' : r.stBull ? 'Bull' : 'Bear',
    r.nearFib ?? '',
    `"${r.filters.join(', ')}"`,
    String(r.score),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `screener_${tf}_${new Date().toISOString().slice(0,16).replace('T','_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook output (Telegram / Discord / custom)
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookConfig {
  id:      string;
  name:    string;
  type:    'telegram' | 'discord' | 'custom';
  url:     string;           // Telegram: bot API URL, Discord: webhook URL, custom: any
  chatId?: string;           // Telegram only
  enabled: boolean;
}

export async function sendWebhook(
  cfg: WebhookConfig,
  results: ScreenerResult[],
  tf: string,
): Promise<{ ok: boolean; error?: string }> {
  const topHits = results.filter(r => r.score > 0).slice(0, 10);
  if (!topHits.length) return { ok: true };

  const lines = topHits.map(r =>
    `${r.sym}: ${r.price.toFixed(4)} | ${r.change24h >= 0 ? '+' : ''}${r.change24h.toFixed(2)}% | ${r.filters.join(', ')}`
  );
  const text = `📊 Screener [${tf}] — ${new Date().toUTCString()}\n\n${lines.join('\n')}`;

  try {
    if (cfg.type === 'telegram') {
      const r = await fetch(`${cfg.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML' }),
      });
      return { ok: r.ok, error: r.ok ? undefined : await r.text() };
    }

    if (cfg.type === 'discord') {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `\`\`\`\n${text}\n\`\`\`` }),
      });
      return { ok: r.ok, error: r.ok ? undefined : await r.text() };
    }

    // custom
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, results: topHits, tf, timestamp: Date.now() }),
    });
    return { ok: r.ok, error: r.ok ? undefined : await r.text() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}