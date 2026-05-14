import { calcAutoFibo } from './indicators2';
import {
  type ExchangeId,
  type ExchangeAdapter,
  getAdapter,
  BinanceAdapter,
} from './exchangeAdapters';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type { ExchangeId };

export interface Candle {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

export interface ScreenerResult {
  sym:        string;
  price:      number;
  change24h:  number;
  volume24h:  number;
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
  /** ATR expressed as % of price — use for cross-symbol comparisons (SIGNAL-4) */
  atrPct:     number | null;
  stBull:     boolean | null;
  volAvg20:   number | null;
  highN:      number | null;
  lowN:       number | null;
  nearFib:    string | null;
  filters:    string[];
  score:      number;
  mtf?:       Record<string, { trend: 'bull' | 'bear' | 'neutral'; rsi: number | null }>;
  strategySignal?: { dir: 'long' | 'short'; score: number; reasons: string[] } | null;
  fetchedAt:  number;
  /** Which exchange this result came from */
  exchange:   ExchangeId;
}

export type FilterId =
  | 'ema_stack_bull' | 'ema_stack_bear'
  | 'rsi_oversold'   | 'rsi_overbought'
  | 'macd_cross_bull'| 'macd_cross_bear'
  | 'supertrend_bull'| 'supertrend_bear'
  | 'bb_squeeze'     | 'volume_spike'
  | 'price_near_ema9'| 'price_near_ema20' | 'price_near_ema50'
  | 'n_bar_high'     | 'n_bar_low'
  | 'adx_trending'   | 'fib_level';

export interface QuickFilter {
  id:       FilterId;
  label:    string;
  icon:     string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'price';
}

export const QUICK_FILTERS: QuickFilter[] = [
  { id: 'ema_stack_bull',   label: 'EMA Stack Bull',    icon: '▲',  category: 'trend'     },
  { id: 'ema_stack_bear',   label: 'EMA Stack Bear',    icon: '▼',  category: 'trend'     },
  { id: 'supertrend_bull',  label: 'SuperTrend Bull',   icon: '🟢', category: 'trend'     },
  { id: 'supertrend_bear',  label: 'SuperTrend Bear',   icon: '🔴', category: 'trend'     },
  { id: 'macd_cross_bull',  label: 'MACD Cross Bull',   icon: '⬆',  category: 'momentum'  },
  { id: 'macd_cross_bear',  label: 'MACD Cross Bear',   icon: '⬇',  category: 'momentum'  },
  { id: 'rsi_oversold',     label: 'RSI Oversold',      icon: '📉', category: 'momentum'  },
  { id: 'rsi_overbought',   label: 'RSI Overbought',    icon: '📈', category: 'momentum'  },
  { id: 'adx_trending',     label: 'ADX Trending >25',  icon: '💪', category: 'momentum'  },
  { id: 'bb_squeeze',       label: 'BB Squeeze',        icon: '🤏', category: 'volatility' },
  { id: 'volume_spike',     label: 'Volume Spike',      icon: '📊', category: 'volume'    },
  { id: 'price_near_ema9',  label: 'Near EMA9',         icon: '〰', category: 'price'     },
  { id: 'price_near_ema20', label: 'Near EMA20',        icon: '〰', category: 'price'     },
  { id: 'price_near_ema50', label: 'Near EMA50',        icon: '〰', category: 'price'     },
  { id: 'n_bar_high',       label: '20-Bar High',       icon: '🔝', category: 'price'     },
  { id: 'n_bar_low',        label: '20-Bar Low',        icon: '🔻', category: 'price'     },
  { id: 'fib_level',        label: 'Near Fib Level',    icon: '🌀', category: 'price'     },
];

const ALL_FILTER_IDS: FilterId[] = QUICK_FILTERS.map(f => f.id);

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

export type ScreenerView = 'table' | 'heatmap' | 'multitf';

export interface AutoRefreshConfig {
  enabled:     boolean;
  intervalSec: number;
  lastRefresh: number;
  nextRefresh: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeframe helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds per timeframe string */
const TF_MS: Record<string, number> = {
  '1m':  60_000,
  '3m':  3 * 60_000,
  '5m':  5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h':  3_600_000,
  '2h':  2 * 3_600_000,
  '4h':  4 * 3_600_000,
  '6h':  6 * 3_600_000,
  '8h':  8 * 3_600_000,
  '12h': 12 * 3_600_000,
  '1d':  86_400_000,
  '3d':  3 * 86_400_000,
  '1w':  7 * 86_400_000,
};

/**
 * Number of candles that span 24 hours for a given timeframe.
 * FIX SIGNAL-6: previously hardcoded to 24 regardless of TF.
 */
function candlesIn24h(tf: string): number {
  const ms = TF_MS[tf] ?? 3_600_000;
  return Math.max(1, Math.ceil(86_400_000 / ms));
}

/**
 * Volume-spike multiplier scaled to timeframe.
 * FIX SIGNAL-5: shorter TFs need higher multipliers to avoid noise.
 */
function volumeSpikeMultiplier(tf: string): number {
  const ms = TF_MS[tf] ?? 3_600_000;
  if (ms <= 60_000)       return 5.0;  // 1m
  if (ms <= 300_000)      return 4.0;  // 5m
  if (ms <= 900_000)      return 3.0;  // 15m
  if (ms <= 3_600_000)    return 2.5;  // 1h
  if (ms <= 14_400_000)   return 2.0;  // 4h
  return 1.5;                           // 1d+
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator engine
// ─────────────────────────────────────────────────────────────────────────────

const WILDER_PERIOD = 14;
const BB_PERIOD     = 20;

function ema(prev: number | null, val: number, k: number): number {
  return prev === null ? val : val * k + prev * (1 - k);
}

function computeIndicators(candles: Candle[], nBar = 20) {
  const n = candles.length;
  if (n < 2) return null;

  const k9 = 2/10, k20 = 2/21, k50 = 2/51;
  const kF = 2/13, kS  = 2/27, kSig = 2/10;

  let e9: number|null = null, e20: number|null = null, e50: number|null = null;
  let ef: number|null = null, es: number|null  = null, esig: number|null = null;

  // FIX PERF-2: ring-buffer for BB instead of array with O(n) shift()
  const bbBuf  = new Float64Array(BB_PERIOD);
  let   bbHead = 0;
  let   bbCount = 0;

  // FIX PERF-5: track previous-bar MACD values inside the single loop
  let prevEf: number|null = null, prevEs: number|null = null, prevSig: number|null = null;

  // FIX SIGNAL-2: proper SuperTrend with band memory
  let stUpperBand: number|null = null;
  let stLowerBand: number|null = null;
  let stDir = 1; // 1 = bull, -1 = bear

  for (let i = 0; i < n; i++) {
    const c = candles[i];

    // Save previous-bar MACD state before updating (PERF-5)
    prevEf  = ef;
    prevEs  = es;
    prevSig = esig;

    e9   = ema(e9,   c.c, k9);
    e20  = ema(e20,  c.c, k20);
    e50  = ema(e50,  c.c, k50);
    ef   = ema(ef,   c.c, kF);
    es   = ema(es,   c.c, kS);
    esig = ema(esig, (ef ?? c.c) - (es ?? c.c), kSig);

    // BB ring-buffer (PERF-2)
    bbBuf[bbHead % BB_PERIOD] = c.c;
    bbHead++;
    if (bbCount < BB_PERIOD) bbCount++;
  }

  const macdLine = ef !== null && es !== null ? ef - es : null;
  const macdSig  = esig;
  const macdHist = macdLine !== null && macdSig !== null ? macdLine - macdSig : null;

  // MACD previous-bar values (PERF-5 — derived from single-loop tracking)
  const prevMacdLine = prevEf !== null && prevEs !== null ? prevEf - prevEs : null;
  const prevMacdSig  = prevSig;

  // RSI — Wilder 14
  let rsi: number|null = null;
  if (n > WILDER_PERIOD) {
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      const ch = candles[i].c - candles[i-1].c;
      if (ch > 0) avgGain += ch; else avgLoss += -ch;
    }
    avgGain /= WILDER_PERIOD; avgLoss /= WILDER_PERIOD;
    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const ch = candles[i].c - candles[i-1].c;
      avgGain = (avgGain * (WILDER_PERIOD-1) + (ch > 0 ? ch : 0)) / WILDER_PERIOD;
      avgLoss = (avgLoss * (WILDER_PERIOD-1) + (ch < 0 ? -ch : 0)) / WILDER_PERIOD;
    }
    rsi = avgLoss < 1e-10 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
  }

  // ATR — Wilder 14
  let atr: number|null = null;
  if (n > WILDER_PERIOD) {
    let atrVal = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      atrVal += Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i-1].c), Math.abs(candles[i].l - candles[i-1].c));
    }
    atrVal /= WILDER_PERIOD;
    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const tr = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i-1].c), Math.abs(candles[i].l - candles[i-1].c));
      atrVal = (atrVal * (WILDER_PERIOD-1) + tr) / WILDER_PERIOD;
    }
    atr = atrVal;
  }

  // ADX — Wilder 14
  let adx: number|null = null;
  if (n > WILDER_PERIOD * 2) {
    let smPlus = 0, smMinus = 0, smTR = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      const cur = candles[i], prv = candles[i-1];
      const up = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  += (up > dn && up > 0) ? up : 0;
      smMinus += (dn > up && dn > 0) ? dn : 0;
      smTR    += Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));
    }
    const dxBuf: number[] = [];
    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const cur = candles[i], prv = candles[i-1];
      const up = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  = smPlus  - smPlus  / WILDER_PERIOD + ((up > dn && up > 0) ? up : 0);
      smMinus = smMinus - smMinus / WILDER_PERIOD + ((dn > up && dn > 0) ? dn : 0);
      smTR    = smTR    - smTR    / WILDER_PERIOD + Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));
      if (smTR > 0) {
        const pDI = 100 * smPlus / smTR, mDI = 100 * smMinus / smTR;
        const dSum = pDI + mDI;
        dxBuf.push(dSum > 0 ? Math.abs(pDI - mDI) / dSum * 100 : 0);
      }
    }
    if (dxBuf.length >= WILDER_PERIOD) {
      let adxVal = dxBuf.slice(0, WILDER_PERIOD).reduce((a, b) => a + b, 0) / WILDER_PERIOD;
      for (let i = WILDER_PERIOD; i < dxBuf.length; i++) adxVal = (adxVal * (WILDER_PERIOD-1) + dxBuf[i]) / WILDER_PERIOD;
      adx = adxVal;
    }
  }

  // FIX SIGNAL-2: proper SuperTrend with band carry-forward
  let stBull = true;
  if (atr !== null && n > WILDER_PERIOD) {
    // Re-derive ATR per-bar for ST band computation, using Wilder smoothing
    let atrRun: number|null = null;
    let upperBand: number|null = null;
    let lowerBand: number|null = null;
    let dir = 1; // 1 bull, -1 bear

    for (let i = 1; i < n; i++) {
      const c = candles[i], p = candles[i-1];
      const tr = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
      atrRun = atrRun === null ? tr : (atrRun * (WILDER_PERIOD - 1) + tr) / WILDER_PERIOD;

      const hl2 = (c.h + c.l) / 2;
      const rawUpper = hl2 + 3 * atrRun;
      const rawLower = hl2 - 3 * atrRun;

      // Carry bands forward: tighten only, never widen
      const newUpper: number = upperBand !== null && rawUpper < upperBand ? rawUpper : upperBand ?? rawUpper;
      const newLower: number = lowerBand !== null && rawLower > lowerBand ? rawLower : lowerBand ?? rawLower;

      // Direction flip logic
      if (dir === 1 && c.c < newLower) dir = -1;
      else if (dir === -1 && c.c > newUpper) dir = 1;

      upperBand = newUpper;
      lowerBand = newLower;
    }
    stBull = dir === 1;
  }

  // BB width from ring-buffer (PERF-2)
  let bbWidth: number|null = null;
  if (bbCount > 0) {
    let bbSum = 0;
    for (let i = 0; i < bbCount; i++) bbSum += bbBuf[i];
    const bbMean = bbSum / bbCount;
    let bbSumSq = 0;
    for (let i = 0; i < bbCount; i++) bbSumSq += (bbBuf[i] - bbMean) ** 2;
    const bbStd = Math.sqrt(bbSumSq / bbCount);
    bbWidth = bbMean > 0 ? (bbStd * 4) / bbMean : null;
  }

  const last     = candles[n-1];
  const nSlice   = candles.slice(-nBar);
  const highN    = Math.max(...nSlice.map(c => c.h));
  const lowN     = Math.min(...nSlice.map(c => c.l));
  const volAvg20 = candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, n);

  // FIX SIGNAL-8: ATR-relative Fib proximity instead of hardcoded 0.5%
  let nearFib: string|null = null;
  try {
    const fibo = calcAutoFibo(candles, Math.min(50, n));
    if (fibo) {
      const fibThreshold = atr !== null ? (atr * 0.3) / last.c : 0.005;
      for (const lv of fibo.levels) {
        if (Math.abs(lv.price - last.c) / last.c < fibThreshold) { nearFib = lv.label; break; }
      }
    }
  } catch { /* skip */ }

  return {
    price: last.c, e9, e20, e50,
    rsi, macdLine, macdSig, macdHist, prevMacdLine, prevMacdSig,
    atr, bbWidth, stBull, highN, lowN, volAvg20, lastVol: last.v,
    adx, nearFib,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter application
// FIX SIGNAL-1: weighted scoring — run once over ALL_FILTER_IDS, then derive
// active-filter matches by intersection (eliminates double applyFilters call).
// FIX SIGNAL-3: BB squeeze uses per-symbol rolling percentile.
// FIX SIGNAL-5: volume spike multiplier is TF-aware (passed in via opts).
// ─────────────────────────────────────────────────────────────────────────────

/** Weighted score values per filter (SIGNAL-1) */
const FILTER_WEIGHTS: Record<FilterId, number> = {
  // Crossovers / reversals — rare, high value
  macd_cross_bull:  4,
  macd_cross_bear:  4,
  // Trend confirmation — meaningful but sustained
  ema_stack_bull:   2,
  ema_stack_bear:   2,
  supertrend_bull:  2,
  supertrend_bear:  2,
  adx_trending:     2,
  rsi_oversold:     2,
  rsi_overbought:   2,
  // Structural / volatility
  bb_squeeze:       2,
  volume_spike:     2,
  n_bar_high:       2,
  n_bar_low:        2,
  // Proximity — fire frequently, low weight
  price_near_ema9:  1,
  price_near_ema20: 1,
  price_near_ema50: 1,
  fib_level:        1,
};

interface FilterOpts {
  /** TF-aware volume spike multiplier (SIGNAL-5) */
  volSpikeMultiplier?: number;
  /** Rolling BB-width percentile-20 for this symbol (SIGNAL-3) */
  bbWidthP20?: number | null;
}

/**
 * Evaluates all filters once and returns both:
 *   - `matched`: filters from `activeFilters` that fired
 *   - `score`: weighted sum across ALL filters (SIGNAL-1 + PERF-1)
 */
function evaluateAllFilters(
  ind:           NonNullable<ReturnType<typeof computeIndicators>>,
  activeFilters: FilterId[],
  opts:          FilterOpts = {},
): { matched: string[]; score: number } {
  const { price, e9, e20, e50, rsi, macdLine, macdSig, prevMacdLine, prevMacdSig,
    adx, bbWidth, stBull, volAvg20, lastVol, highN, lowN, nearFib } = ind;

  const activeSet = new Set<FilterId>(activeFilters);
  const matched: string[] = [];
  let score = 0;

  const volMult  = opts.volSpikeMultiplier ?? 2.0;
  // SIGNAL-3: use per-symbol rolling percentile-20 if available, else fallback
  const bbThresh = opts.bbWidthP20 ?? 0.03;

  for (const f of ALL_FILTER_IDS) {
    let fired = false;
    switch (f) {
      case 'ema_stack_bull':   fired = !!(e9 && e20 && e50 && e9>e20 && e20>e50); break;
      case 'ema_stack_bear':   fired = !!(e9 && e20 && e50 && e9<e20 && e20<e50); break;
      case 'rsi_oversold':     fired = rsi !== null && rsi < 30; break;
      case 'rsi_overbought':   fired = rsi !== null && rsi > 70; break;
      case 'macd_cross_bull':
        fired = macdLine!==null && macdSig!==null && prevMacdLine!==null && prevMacdSig!==null
          && prevMacdLine<=prevMacdSig && macdLine>macdSig; break;
      case 'macd_cross_bear':
        fired = macdLine!==null && macdSig!==null && prevMacdLine!==null && prevMacdSig!==null
          && prevMacdLine>=prevMacdSig && macdLine<macdSig; break;
      case 'supertrend_bull':  fired = stBull === true; break;
      case 'supertrend_bear':  fired = stBull === false; break;
      case 'bb_squeeze':       fired = bbWidth !== null && bbWidth < bbThresh; break;  // SIGNAL-3
      case 'volume_spike':     fired = !!(volAvg20 && lastVol > volAvg20 * volMult); break; // SIGNAL-5
      case 'price_near_ema9':  fired = !!(e9  && Math.abs(price - e9)  / price < 0.003); break;
      case 'price_near_ema20': fired = !!(e20 && Math.abs(price - e20) / price < 0.003); break;
      case 'price_near_ema50': fired = !!(e50 && Math.abs(price - e50) / price < 0.005); break;
      case 'n_bar_high':       fired = highN !== null && price >= highN * 0.998; break;
      case 'n_bar_low':        fired = lowN  !== null && price <= lowN  * 1.002; break;
      case 'adx_trending':     fired = adx !== null && adx > 25; break;
      case 'fib_level':        fired = nearFib !== null; break;
    }
    if (fired) {
      score += FILTER_WEIGHTS[f];
      if (activeSet.has(f)) matched.push(f);
    }
  }

  return { matched, score };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-exchange candle cache  key = `${exchange}:${sym}:${tf}`
// ─────────────────────────────────────────────────────────────────────────────

const CACHE     = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL = 60_000;
/** Max entries kept; oldest evicted first (PERF-4). */
const CACHE_MAX = 2_000;

/** FIX PERF-4: evict all expired entries after each scan completes. */
function evictExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of CACHE) {
    if (now - entry.ts >= CACHE_TTL) CACHE.delete(key);
  }
  // Hard cap: remove oldest entries if still over limit
  if (CACHE.size > CACHE_MAX) {
    let overflow = CACHE.size - CACHE_MAX;
    for (const key of CACHE.keys()) {
      CACHE.delete(key);
      if (--overflow <= 0) break;
    }
  }
}

async function fetchCandlesCached(
  adapter: ExchangeAdapter,
  sym:     string,
  tf:      string,
): Promise<Candle[]> {
  const key    = `${adapter.id}:${sym}:${tf}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const data = await adapter.fetchCandles(sym, tf, 100);
  CACHE.set(key, { data, ts: Date.now() });
  return data;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Stagger: Binance allows 1200/min, Bybit 120/min (IP), OKX 20/2s
const FETCH_DELAY: Record<ExchangeId, number> = {
  binance: 120,
  bybit:   500,
  okx:     300,
};

/**
 * FIX SIGNAL-7: find the candle whose open timestamp is closest to `targetMs`.
 * Returns that candle's open price, or the oldest candle's open as fallback.
 */
function findOpen24h(candles: Candle[], targetMs: number): number {
  if (candles.length === 0) return 0;
  let best = candles[0];
  let bestDelta = Math.abs(candles[0].t - targetMs);
  for (let i = 1; i < candles.length; i++) {
    const delta = Math.abs(candles[i].t - targetMs);
    if (delta < bestDelta) { bestDelta = delta; best = candles[i]; }
  }
  return best.o;
}

/** FIX SIGNAL-3: compute rolling 20th-percentile of bbWidth across recent bbWidth samples. */
function rollingBBWidthPercentile20(samples: number[]): number | null {
  if (samples.length < 5) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx    = Math.floor(sorted.length * 0.2);
  return sorted[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchAllUSDTPairs — exchange-aware
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllUSDTPairs(exchangeId: ExchangeId = 'binance'): Promise<string[]> {
  return getAdapter(exchangeId).fetchAllPairs('USDT');
}

// ─────────────────────────────────────────────────────────────────────────────
// runScreener — FIX PERF-3: concurrency pool (8 parallel fetches)
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCY = 8;

export async function runScreener(
  syms:          string[],
  tf:            string,
  activeFilters: FilterId[],
  onProgress?:   (done: number, total: number, latest: ScreenerResult | null) => void,
  signal?:       AbortSignal,
  strategyEval?: (sym: string, candles: Candle[]) => { dir: 'long'|'short'; score: number; reasons: string[] } | null,
  exchangeId:    ExchangeId = 'binance',
): Promise<ScreenerResult[]> {
  const adapter  = getAdapter(exchangeId);
  const delay    = FETCH_DELAY[exchangeId];
  const results: ScreenerResult[] = [];

  // SIGNAL-3: accumulate bbWidth samples per symbol for percentile computation
  // We use the previous scan's results if available; first scan uses fallback
  const bbWidthSamples = new Map<string, number[]>();

  let done = 0;

  // FIX PERF-3: process symbols in concurrent batches
  for (let batchStart = 0; batchStart < syms.length; batchStart += CONCURRENCY) {
    if (signal?.aborted) break;

    const batch = syms.slice(batchStart, batchStart + CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (sym, batchIdx) => {
        // Stagger within batch to respect rate limits
        if (batchIdx > 0) await sleep(delay);
        if (signal?.aborted) return null;

        const candles = await fetchCandlesCached(adapter, sym, tf);
        const ind     = computeIndicators(candles);
        if (!ind) return null;

        // SIGNAL-7: use true 24h-ago open, not prev-bar open
        const target24hMs = Date.now() - 86_400_000;
        const open24      = findOpen24h(candles, target24hMs);
        const change24h   = open24 > 0 ? (ind.price - open24) / open24 * 100 : 0;

        // SIGNAL-6: volume summed over correct number of candles for this TF
        const nCandles24h = candlesIn24h(tf);
        const volume24h   = candles.slice(-nCandles24h).reduce((a, c) => a + c.v, 0);

        // SIGNAL-3: build per-symbol bbWidth history
        const symSamples = bbWidthSamples.get(sym) ?? [];
        if (ind.bbWidth !== null) { symSamples.push(ind.bbWidth); if (symSamples.length > 50) symSamples.shift(); }
        bbWidthSamples.set(sym, symSamples);
        const bbWidthP20 = rollingBBWidthPercentile20(symSamples);

        // FIX PERF-1 + SIGNAL-1: single evaluation pass, weighted score
        const { matched: filters, score } = evaluateAllFilters(ind, activeFilters, {
          volSpikeMultiplier: volumeSpikeMultiplier(tf),
          bbWidthP20,
        });

        const strategySignal = strategyEval ? strategyEval(sym, candles) : null;

        // FIX SIGNAL-4: expose atrPct for cross-symbol comparisons
        const atrPct = ind.atr !== null && ind.price > 0 ? ind.atr / ind.price * 100 : null;

        const result: ScreenerResult = {
          sym, price: ind.price, change24h, volume24h,
          ema9: ind.e9, ema20: ind.e20, ema50: ind.e50,
          rsi: ind.rsi, macdLine: ind.macdLine, macdSig: ind.macdSig, macdHist: ind.macdHist,
          adx: ind.adx, bbWidth: ind.bbWidth, atr: ind.atr, atrPct,
          stBull: ind.stBull, volAvg20: ind.volAvg20, highN: ind.highN, lowN: ind.lowN,
          nearFib: ind.nearFib,
          filters, score, strategySignal,
          fetchedAt: Date.now(),
          exchange:  exchangeId,
        };

        return result;
      }),
    );

    for (const settled of batchResults) {
      done++;
      if (settled.status === 'fulfilled' && settled.value !== null) {
        results.push(settled.value);
        onProgress?.(done, syms.length, settled.value);
      } else {
        onProgress?.(done, syms.length, null);
      }
    }
  }

  // FIX PERF-4: evict stale cache entries after scan completes
  evictExpiredCache();

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// runMultiTFScan — exchange-aware, also uses concurrency pool
// ─────────────────────────────────────────────────────────────────────────────

export async function runMultiTFScan(
  syms:        string[],
  tfs:         string[],
  onProgress?: (done: number, total: number) => void,
  signal?:     AbortSignal,
  exchangeId:  ExchangeId = 'binance',
): Promise<ScreenerResult[]> {
  const adapter = getAdapter(exchangeId);
  const delay   = FETCH_DELAY[exchangeId];
  const baseResults = await runScreener(syms, tfs[0], [], onProgress, signal, undefined, exchangeId);

  for (const result of baseResults) {
    result.mtf = {};
    for (const tf of tfs.slice(1)) {
      if (signal?.aborted) break;
      try {
        const candles = await fetchCandlesCached(adapter, result.sym, tf);
        const ind     = computeIndicators(candles);
        if (!ind) continue;
        const trend: 'bull'|'bear'|'neutral' =
          ind.e9 && ind.e20 && ind.e50
            ? ind.e9 > ind.e20 && ind.e20 > ind.e50 ? 'bull'
            : ind.e9 < ind.e20 && ind.e20 < ind.e50 ? 'bear'
            : 'neutral'
          : 'neutral';
        result.mtf![tf] = { trend, rsi: ind.rsi };
      } catch { /* skip */ }
      await sleep(delay);
    }
  }
  return baseResults;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack-flip detection
// ─────────────────────────────────────────────────────────────────────────────

export interface StackFlipAlert {
  sym:  string;
  dir:  'bull' | 'bear';
  time: number;
}

const prevStackState = new Map<string, 'bull' | 'bear' | 'neutral'>();

function playBeep(freq: number, dur: number) {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(); osc.stop(ctx.currentTime + dur / 1000);
  } catch { /* no audio */ }
}

export function checkStackFlips(results: ScreenerResult[], onFlip?: (alert: StackFlipAlert) => void): StackFlipAlert[] {
  const flips: StackFlipAlert[] = [];
  for (const r of results) {
    const cur: 'bull'|'bear'|'neutral' =
      r.ema9 && r.ema20 && r.ema50
        ? r.ema9 > r.ema20 && r.ema20 > r.ema50 ? 'bull'
        : r.ema9 < r.ema20 && r.ema20 < r.ema50 ? 'bear'
        : 'neutral'
      : 'neutral';

    const key  = `${r.exchange}:${r.sym}`;
    const prev = prevStackState.get(key);
    if (prev && prev !== cur && cur !== 'neutral') {
      const flip: StackFlipAlert = { sym: r.sym, dir: cur, time: Date.now() };
      flips.push(flip);
      onFlip?.(flip);
      if (typeof window !== 'undefined') playBeep(cur === 'bull' ? 880 : 440, 300);
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`📊 Stack Flip — ${r.sym}`, {
          body: `${r.sym} flipped ${cur === 'bull' ? '▲ BULLISH' : '▼ BEARISH'} on EMA stack`,
          icon: '/favicon.ico',
        });
      }
    }
    prevStackState.set(key, cur);
  }
  return flips;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export (includes atrPct column)
// ─────────────────────────────────────────────────────────────────────────────

export function exportScreenerCSV(results: ScreenerResult[], tf: string): void {
  const headers = [
    'Exchange','Symbol','Price','Change24h%','Volume24h','EMA9','EMA20','EMA50',
    'RSI','MACD','ADX','BB Width','ATR','ATR%','SuperTrend','Near Fib','Active Filters','Score (weighted)',
  ];
  const rows = results.map(r => [
    r.exchange ?? 'binance',
    r.sym,
    r.price.toFixed(4),
    r.change24h.toFixed(2),
    r.volume24h.toFixed(0),
    r.ema9?.toFixed(4)   ?? '',
    r.ema20?.toFixed(4)  ?? '',
    r.ema50?.toFixed(4)  ?? '',
    r.rsi?.toFixed(0)    ?? '',
    r.macdLine?.toFixed(6) ?? '',
    r.adx?.toFixed(1)    ?? '',
    r.bbWidth?.toFixed(4) ?? '',
    r.atr?.toFixed(4)    ?? '',
    r.atrPct?.toFixed(3) ?? '',   // SIGNAL-4
    r.stBull === null ? '' : r.stBull ? 'Bull' : 'Bear',
    r.nearFib ?? '',
    `"${r.filters.join(', ')}"`,
    String(r.score),
  ]);
  const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `screener_${tf}_${new Date().toISOString().slice(0, 16).replace('T', '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook output
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookConfig {
  id:      string;
  name:    string;
  type:    'telegram' | 'discord' | 'custom';
  url:     string;
  chatId?: string;
  enabled: boolean;
}

export async function sendWebhook(
  cfg:     WebhookConfig,
  results: ScreenerResult[],
  tf:      string,
): Promise<{ ok: boolean; error?: string }> {
  const topHits = results.filter(r => r.score > 0).slice(0, 10);
  if (!topHits.length) return { ok: true };

  const lines = topHits.map(r =>
    `[${(r.exchange ?? 'binance').toUpperCase()}] ${r.sym}: ${r.price.toFixed(4)} | ${r.change24h >= 0 ? '+' : ''}${r.change24h.toFixed(2)}% | score ${r.score} | ${r.filters.join(', ')}`,
  );
  const text = `📊 Screener [${tf}] — ${new Date().toUTCString()}\n\n${lines.join('\n')}`;

  try {
    if (cfg.type === 'telegram') {
      const res = await fetch(cfg.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML' }),
      });
      return { ok: res.ok, error: res.ok ? undefined : await res.text() };
    }
    if (cfg.type === 'discord') {
      const res = await fetch(cfg.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `\`\`\`\n${text}\n\`\`\`` }),
      });
      return { ok: res.ok, error: res.ok ? undefined : await res.text() };
    }
    const res = await fetch(cfg.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, results: topHits, tf, timestamp: Date.now() }),
    });
    return { ok: res.ok, error: res.ok ? undefined : await res.text() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}