export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

export interface CrossoverEvent {
  type: 'bull' | 'bear';
  price: number;
  idx: number;
  time: number;
}

// ── EMA ───────────────────────────────────────────────────────────────────────

/** k multiplier for EMA */
export const emaK = (period: number) => 2 / (period + 1);

/** Incremental EMA update */
export function updEMA(prev: number | null, value: number, k: number): number {
  return prev === null ? value : value * k + prev * (1 - k);
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Format price based on magnitude */
export function fmtPrice(p: number | null | undefined): string {
  if (p === null || p === undefined || isNaN(p as number)) return '—';
  if (p > 10000) return p.toFixed(1);
  if (p > 1000)  return p.toFixed(2);
  if (p > 10)    return p.toFixed(3);
  return p.toFixed(4);
}

export function fmtK(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function fmtSymDisplay(s: string): string {
  const m: Record<string, string> = {
    BTCUSDT: 'BTC/USDT', TONUSDT: 'TON/USDT', ETHUSDT: 'ETH/USDT',
    SOLUSDT: 'SOL/USDT', XRPUSDT: 'XRP/USDT', BNBUSDT: 'BNB/USDT',
  };
  return m[s] || s.replace('USDT', '/USDT');
}

// ── RSI (Wilder) ──────────────────────────────────────────────────────────────

/** Wilder RMA RSI state — must be held externally and passed per tick */
export interface RSIState {
  avgGain: number | null;
  avgLoss: number | null;
  seedGains: number[];
  seedLosses: number[];
}

export function makeRSIState(): RSIState {
  return { avgGain: null, avgLoss: null, seedGains: [], seedLosses: [] };
}

export function calcWilderRSI(
  close: number,
  prevClose: number | null,
  state: RSIState
): number | null {
  if (prevClose === null) return null;
  const ch   = close - prevClose;
  const gain = Math.max(0, ch);
  const loss = Math.max(0, -ch);

  if (state.avgGain === null) {
    state.seedGains.push(gain);
    state.seedLosses.push(loss);
    if (state.seedGains.length === 14) {
      state.avgGain  = state.seedGains.reduce((a, b) => a + b, 0)  / 14;
      state.avgLoss  = state.seedLosses.reduce((a, b) => a + b, 0) / 14;
      state.seedGains  = [];
      state.seedLosses = [];
      const rs = (state.avgLoss ?? 0) === 0 ? Infinity : state.avgGain / (state.avgLoss ?? 1);
      return (state.avgLoss ?? 0) === 0 ? 100 : Math.round(100 - 100 / (1 + rs));
    }
    return null;
  }

  state.avgGain = (state.avgGain * 13 + gain) / 14;
  state.avgLoss = ((state.avgLoss ?? 0) * 13 + loss) / 14;
  const rs = (state.avgLoss ?? 0) === 0 ? Infinity : state.avgGain / (state.avgLoss ?? 1);
  return (state.avgLoss ?? 0) === 0 ? 100 : Math.round(100 - 100 / (1 + rs));
}

// ── VWAP ──────────────────────────────────────────────────────────────────────

/**
 * Session VWAP state.
 * Resets when the candle's UTC day differs from the last candle's UTC day.
 */
export interface VWAPState {
  cumPV:    number;   // Σ (typical_price × volume)
  cumVol:   number;   // Σ volume
  lastDay:  number;   // UTC day-of-year used for session reset
}

export function makeVWAPState(): VWAPState {
  return { cumPV: 0, cumVol: 0, lastDay: -1 };
}

/**
 * Calculates VWAP for a single candle, mutating `state` in-place.
 * Session resets at UTC midnight.
 * Returns the current session VWAP, or null if no volume has accumulated yet.
 */
export function calcVWAP(candle: Candle, state: VWAPState): number | null {
  const d   = new Date(candle.t);
  const day = Math.floor(candle.t / 86_400_000); // UTC day integer

  // Reset at start of new session
  if (day !== state.lastDay) {
    state.cumPV  = 0;
    state.cumVol = 0;
    state.lastDay = day;
  }

  const typical = (candle.h + candle.l + candle.c) / 3;
  state.cumPV  += typical * candle.v;
  state.cumVol += candle.v;

  return state.cumVol === 0 ? null : state.cumPV / state.cumVol;
}

/**
 * Batch-calculate VWAP for an array of candles, returning one value per candle.
 * Useful for initial history load.
 */
export function calcVWAPSeries(candles: Candle[]): (number | null)[] {
  const state = makeVWAPState();
  return candles.map(c => calcVWAP(c, state));
}

// ── CVD (Cumulative Volume Delta) ─────────────────────────────────────────────

/**
 * Volume Delta approximation using close-vs-open:
 *   - Bullish candle (c >= o): all volume attributed to buyers  → delta = +v
 *   - Bearish candle (c <  o): all volume attributed to sellers → delta = -v
 *
 * A more precise method (trade-by-trade) requires tick data. This candle-level
 * proxy is standard for OHLCV-only feeds.
 *
 * For a finer estimate, the wick-weighted formula is also available:
 *   buyVol  = v × (c - l) / (h - l)
 *   sellVol = v × (h - c) / (h - l)
 *   delta   = buyVol - sellVol
 * Set `wickWeighted = true` to use it.
 */
export function candleDelta(candle: Candle, wickWeighted = true): number {
  if (wickWeighted) {
    const range = candle.h - candle.l;
    if (range === 0) return 0;
    const buyVol  = candle.v * (candle.c - candle.l) / range;
    const sellVol = candle.v * (candle.h - candle.c) / range;
    return buyVol - sellVol;
  }
  return candle.c >= candle.o ? candle.v : -candle.v;
}

export interface CVDState {
  cumDelta: number;
}

export function makeCVDState(): CVDState {
  return { cumDelta: 0 };
}

/**
 * Incremental CVD update. Returns [barDelta, cumDelta].
 * `barDelta`  — the delta for this single candle (useful for histogram colouring)
 * `cumDelta`  — the running cumulative total
 */
export function calcCVD(
  candle: Candle,
  state: CVDState,
  wickWeighted = true
): { barDelta: number; cumDelta: number } {
  const barDelta = candleDelta(candle, wickWeighted);
  state.cumDelta += barDelta;
  return { barDelta, cumDelta: state.cumDelta };
}

/**
 * Batch-calculate CVD for an array of candles.
 * Returns parallel arrays: barDeltas and cumDeltas.
 */
export function calcCVDSeries(
  candles: Candle[],
  wickWeighted = true
): { barDeltas: number[]; cumDeltas: number[] } {
  const state = makeCVDState();
  const barDeltas: number[]  = [];
  const cumDeltas: number[]  = [];
  for (const c of candles) {
    const { barDelta, cumDelta } = calcCVD(c, state, wickWeighted);
    barDeltas.push(barDelta);
    cumDeltas.push(cumDelta);
  }
  return { barDeltas, cumDeltas };
}

// ── Entry scoring ─────────────────────────────────────────────────────────────

/** Score entry quality 0-100 */
export function scoreEntryQuality(
  dir: 'long' | 'short',
  rsi: number,
  e9: number,
  e20: number,
  e50: number,
  price: number,
  crossovers: CrossoverEvent[]
): { score: number; label: string; cls: string; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  if (dir === 'long') {
    if (e9 > e20 && e20 > e50)      { score += 30; factors.push('Full bullish stack'); }
    else if (e9 > e50)               { score += 15; factors.push('Price above EMA50'); }
  } else {
    if (e9 < e20 && e20 < e50)      { score += 30; factors.push('Full bearish stack'); }
    else if (e9 < e50)               { score += 15; factors.push('Price below EMA50'); }
  }

  if (dir === 'long') {
    if (rsi > 50 && rsi < 65)        { score += 25; factors.push('RSI momentum zone'); }
    else if (rsi >= 40 && rsi <= 50) { score += 15; factors.push('RSI midzone'); }
    else if (rsi < 35)               { score += 20; factors.push('RSI oversold bounce'); }
    else if (rsi >= 65)              { score -= 10; factors.push('RSI overbought'); }
  } else {
    if (rsi < 50 && rsi > 35)       { score += 25; factors.push('RSI bearish momentum'); }
    else if (rsi >= 50 && rsi <= 60) { score += 15; factors.push('RSI midzone'); }
    else if (rsi > 65)               { score += 20; factors.push('RSI overbought fade'); }
    else if (rsi <= 35)              { score -= 10; factors.push('RSI oversold'); }
  }

  if (dir === 'long'  && price > e20) { score += 20; factors.push('Price > EMA20'); }
  if (dir === 'short' && price < e20) { score += 20; factors.push('Price < EMA20'); }

  const recent = crossovers[crossovers.length - 1];
  if (recent) {
    const age = (Date.now() - recent.time) / 60000;
    if (recent.type === 'bull' && dir === 'long'  && age < 30) { score += 25; factors.push('Fresh bull cross'); }
    if (recent.type === 'bear' && dir === 'short' && age < 30) { score += 25; factors.push('Fresh bear cross'); }
  }

  score = Math.max(0, Math.min(100, score));

  let label: string, cls: string;
  if (score >= 75)      { label = '★ PRIME ENTRY'; cls = 'strong-' + dir; }
  else if (score >= 50) { label = '◆ GOOD SETUP';  cls = dir === 'long' ? 'strong-long' : 'strong-short'; }
  else if (score >= 30) { label = '◇ WEAK SETUP';  cls = 'weak'; }
  else                  { label = '○ WAIT';         cls = 'none'; }

  return { score, label, cls, factors };
}

// ── Trade suggestion ──────────────────────────────────────────────────────────

/** Compute 3-EMA setup suggestion */
export function computeSuggestion(
  e9: number, e20: number, e50: number,
  livePrice: number,
  rsi: number,
  candles: Candle[],
  rrRatio: number
): { entry: number; stop: number; target: number; dir: 'long' | 'short'; reason: string } {
  const recent    = candles.slice(-20);
  const swingLow  = Math.min(...recent.map(c => c.l));
  const swingHigh = Math.max(...recent.map(c => c.h));
  const bullish   = e9 > e20 && e20 > e50;
  const bearish   = e9 < e20 && e20 < e50;

  let dir: 'long' | 'short', entry: number, stop: number, target: number, reason: string;

  if (bullish && rsi < 65) {
    dir = 'long'; entry = livePrice;
    stop   = Math.min(e20, swingLow) * 0.9995;
    target = entry + (entry - stop) * rrRatio;
    reason = `Bullish EMA stack (9=${fmtPrice(e9)} > 20=${fmtPrice(e20)} > 50=${fmtPrice(e50)}). RSI ${rsi} — momentum intact. Entry near market, SL below EMA20 / recent low.`;
  } else if (bearish && rsi > 35) {
    dir = 'short'; entry = livePrice;
    stop   = Math.max(e20, swingHigh) * 1.0005;
    target = entry - (stop - entry) * rrRatio;
    reason = `Bearish EMA stack (9=${fmtPrice(e9)} < 20=${fmtPrice(e20)} < 50=${fmtPrice(e50)}). RSI ${rsi} — downside pressure. SL above EMA20 / recent high.`;
  } else if (rsi < 35 && e9 > e50) {
    dir = 'long'; entry = livePrice;
    stop   = swingLow * 0.999;
    target = entry + (entry - stop) * rrRatio;
    reason = `RSI oversold at ${rsi} while price holds above EMA50. Potential mean-reversion bounce. SL below recent swing low ${fmtPrice(swingLow)}.`;
  } else if (rsi > 65 && e9 < e50) {
    dir = 'short'; entry = livePrice;
    stop   = swingHigh * 1.001;
    target = entry - (stop - entry) * rrRatio;
    reason = `RSI overbought at ${rsi} with EMA9 below EMA50. Potential fade setup. SL above recent swing high ${fmtPrice(swingHigh)}.`;
  } else {
    dir = 'long'; entry = e9;
    stop   = e50 * 0.999;
    target = entry + (entry - stop) * rrRatio;
    reason = `EMAs are tangled — low conviction. Waiting for EMA9/20 to separate cleanly. Tentative long levels near EMA9.`;
  }

  return { entry, stop, target, dir, reason };
}