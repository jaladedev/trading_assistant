import type { Candle } from './indicators';

// ─────────────────────────────────────────────────────────────────────────────
//  Volume Profile
// ─────────────────────────────────────────────────────────────────────────────
export interface VPBucket {
  price:  number;   // mid-price of bucket
  vol:    number;
  buyVol: number;
  sellVol: number;
}

export interface VolumeProfile {
  buckets: VPBucket[];
  poc:     number;   // Point-Of-Control price
  vahPrice: number;  // Value Area High
  valPrice: number;  // Value Area Low
  totalVol: number;
}

export function calcVolumeProfile(
  candles: Candle[],
  numBuckets = 24,
): VolumeProfile {
  if (!candles.length) {
    return { buckets: [], poc: 0, vahPrice: 0, valPrice: 0, totalVol: 0 };
  }

  const lo  = Math.min(...candles.map(c => c.l));
  const hi  = Math.max(...candles.map(c => c.h));
  const rng = hi - lo;
  if (rng === 0) {
    return { buckets: [], poc: lo, vahPrice: lo, valPrice: lo, totalVol: 0 };
  }

  const step = rng / numBuckets;
  const buckets: VPBucket[] = Array.from({ length: numBuckets }, (_, i) => ({
    price:   lo + (i + 0.5) * step,
    vol:     0,
    buyVol:  0,
    sellVol: 0,
  }));

  for (const c of candles) {
    const bullish   = c.c >= c.o;
    const candleRng = c.h - c.l;
    if (candleRng === 0) continue;

    // Distribute volume uniformly across the candle's bucket range
    const iLo = Math.max(0, Math.floor((c.l - lo) / step));
    const iHi = Math.min(numBuckets - 1, Math.floor((c.h - lo) / step));

    const span = iHi - iLo + 1;
    const volPerBucket = c.v / span;
    for (let i = iLo; i <= iHi; i++) {
      buckets[i].vol += volPerBucket;
      if (bullish) buckets[i].buyVol  += volPerBucket;
      else         buckets[i].sellVol += volPerBucket;
    }
  }

  const totalVol = buckets.reduce((s, b) => s + b.vol, 0);
  const poc = buckets.reduce((best, b) => b.vol > best.vol ? b : best, buckets[0]).price;

  // Value area = 70 % of total vol
  const target = totalVol * 0.7;
  const pocIdx = buckets.findIndex(b => Math.abs(b.price - poc) < step * 0.5);
  let lo2 = pocIdx, hi2 = pocIdx, acc = buckets[pocIdx]?.vol ?? 0;

  while (acc < target && (lo2 > 0 || hi2 < numBuckets - 1)) {
    const addLo = lo2 > 0            ? (buckets[lo2 - 1]?.vol ?? 0) : -1;
    const addHi = hi2 < numBuckets-1 ? (buckets[hi2 + 1]?.vol ?? 0) : -1;
    if (addLo >= addHi && addLo >= 0) { lo2--; acc += addLo; }
    else if (addHi >= 0)              { hi2++; acc += addHi; }
    else break;
  }

  return {
    buckets,
    poc,
    vahPrice: buckets[hi2]?.price ?? hi,
    valPrice: buckets[lo2]?.price ?? lo,
    totalVol,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fibonacci
// ─────────────────────────────────────────────────────────────────────────────
export const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIBO_LABELS = ['0', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'];
export const FIBO_COLORS = [
  '#ff6b35',   // 0
  '#ffb82e',   // 23.6
  '#00e5a0',   // 38.2
  '#4da6ff',   // 50
  '#a78bff',   // 61.8
  '#ff3d5a',   // 78.6
  '#ff6b35',   // 100
];

export interface FiboLevel {
  ratio:  number;
  label:  string;
  price:  number;
  color:  string;
}

export interface FiboOverlay {
  swingHigh: number;
  swingLow:  number;
  dir:       'up' | 'down';   // trend direction
  levels:    FiboLevel[];
}

/**
 * Auto-detect swing high and swing low from the last `lookback` candles
 * and compute 7 Fibonacci retracement levels.
 */
export function calcAutoFibo(candles: Candle[], lookback = 50): FiboOverlay | null {
  if (candles.length < 5) return null;
  const slice = candles.slice(-Math.min(lookback, candles.length));

  const swingHigh = Math.max(...slice.map(c => c.h));
  const swingLow  = Math.min(...slice.map(c => c.l));
  const range     = swingHigh - swingLow;
  if (range === 0) return null;

  // Determine direction by comparing first-half avg close vs second-half
  const half    = Math.floor(slice.length / 2);
  const avgFirst  = slice.slice(0, half).reduce((s, c) => s + c.c, 0) / half;
  const avgSecond = slice.slice(half).reduce((s, c) => s + c.c, 0) / (slice.length - half);
  const dir: 'up' | 'down' = avgSecond > avgFirst ? 'up' : 'down';

  // For an uptrend:  retrace from high back toward low  (0 = high, 1 = low)
  // For a downtrend: retrace from low  back toward high (0 = low,  1 = high)
  const levels: FiboLevel[] = FIBO_LEVELS.map((ratio, i) => {
    const price = dir === 'up'
      ? swingHigh - ratio * range
      : swingLow  + ratio * range;
    return { ratio, label: FIBO_LABELS[i], price, color: FIBO_COLORS[i] };
  });

  return { swingHigh, swingLow, dir, levels };
}

/**
 * Score how close `price` is to a key Fibonacci level.
 * Returns a bonus (0-20) and the nearest label.
 */
export function fiboEntryScore(
  price: number,
  fibo: FiboOverlay | null,
  atr: number | null,
): { bonus: number; nearestLabel: string | null } {
  if (!fibo || !atr || atr === 0) return { bonus: 0, nearestLabel: null };

  const tolerance = atr * 0.5;
  let best = { dist: Infinity, label: null as string | null, idx: -1 };

  for (let i = 0; i < fibo.levels.length; i++) {
    const dist = Math.abs(price - fibo.levels[i].price);
    if (dist < best.dist) best = { dist, label: fibo.levels[i].label, idx: i };
  }

  if (best.dist > tolerance) return { bonus: 0, nearestLabel: null };

  // Key levels (38.2, 50, 61.8) get higher bonus
  const keyIdx = [2, 3, 4];
  const bonus  = keyIdx.includes(best.idx) ? 20 : 10;
  return { bonus, nearestLabel: best.label };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Divergence detector  (RSI vs price)
// ─────────────────────────────────────────────────────────────────────────────
export type DivergenceType = 'bullish' | 'bearish' | 'hidden_bull' | 'hidden_bear';

export interface DivergenceResult {
  type:    DivergenceType;
  label:   string;
  barIdx:  number;
  price:   number;
  rsi:     number;
}

/**
 * Scan the last `window` bars for classic and hidden RSI/price divergences.
 * Returns the most recent valid divergence found, or null.
 */
export function detectRSIDivergence(
  candles: Candle[],
  rsiVals: (number | null)[],
  window  = 50,
): DivergenceResult | null {
  const n   = Math.min(candles.length, rsiVals.length, window);
  if (n < 10) return null;

  const cs  = candles.slice(-n);
  const rs  = rsiVals.slice(-n) as (number | null)[];

  // Find swing lows and swing highs (simplified: local min/max with 3-bar lookback)
  const swingLows:  number[] = [];
  const swingHighs: number[] = [];

  for (let i = 2; i < n - 2; i++) {
    const isLow  = cs[i].l < cs[i-1].l && cs[i].l < cs[i+1].l
                && cs[i].l < cs[i-2].l && cs[i].l < cs[i+2].l;
    const isHigh = cs[i].h > cs[i-1].h && cs[i].h > cs[i+1].h
                && cs[i].h > cs[i-2].h && cs[i].h > cs[i+2].h;
    if (isLow)  swingLows.push(i);
    if (isHigh) swingHighs.push(i);
  }

  // Bullish: price makes lower low but RSI makes higher low
  if (swingLows.length >= 2) {
    const i1 = swingLows[swingLows.length - 2];
    const i2 = swingLows[swingLows.length - 1];
    const r1 = rs[i1], r2 = rs[i2];
    if (r1 !== null && r2 !== null) {
      if (cs[i2].l < cs[i1].l && r2 > r1 && r2 < 45) {
        return { type: 'bullish', label: 'Bull Div', barIdx: i2, price: cs[i2].l, rsi: r2 };
      }
      // Hidden bullish: price higher low, RSI lower low
      if (cs[i2].l > cs[i1].l && r2 < r1) {
        return { type: 'hidden_bull', label: 'Hidden↑', barIdx: i2, price: cs[i2].l, rsi: r2 };
      }
    }
  }

  // Bearish: price makes higher high but RSI makes lower high
  if (swingHighs.length >= 2) {
    const i1 = swingHighs[swingHighs.length - 2];
    const i2 = swingHighs[swingHighs.length - 1];
    const r1 = rs[i1], r2 = rs[i2];
    if (r1 !== null && r2 !== null) {
      if (cs[i2].h > cs[i1].h && r2 < r1 && r2 > 55) {
        return { type: 'bearish', label: 'Bear Div', barIdx: i2, price: cs[i2].h, rsi: r2 };
      }
      if (cs[i2].h < cs[i1].h && r2 > r1) {
        return { type: 'hidden_bear', label: 'Hidden↓', barIdx: i2, price: cs[i2].h, rsi: r2 };
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Multi-TF confluence
// ─────────────────────────────────────────────────────────────────────────────
export interface TFSignal {
  tf:    string;
  trend: 'bull' | 'bear' | 'neutral';
  rsi:   number | null;
  score: number;   // 0-100
}

export interface MTFConfluence {
  signals:    TFSignal[];
  bullCount:  number;
  bearCount:  number;
  confluence: 'strong_bull' | 'weak_bull' | 'neutral' | 'weak_bear' | 'strong_bear';
}

export function calcMTFConfluence(signals: TFSignal[]): MTFConfluence {
  const bullCount = signals.filter(s => s.trend === 'bull').length;
  const bearCount = signals.filter(s => s.trend === 'bear').length;
  const total     = signals.length;

  let confluence: MTFConfluence['confluence'];
  const bullRatio = total > 0 ? bullCount / total : 0;

  if (bullRatio >= 0.75)       confluence = 'strong_bull';
  else if (bullRatio >= 0.5)   confluence = 'weak_bull';
  else if (bullRatio <= 0.25)  confluence = 'strong_bear';
  else if (bullRatio < 0.5)    confluence = 'weak_bear';
  else                         confluence = 'neutral';

  return { signals, bullCount, bearCount, confluence };
}