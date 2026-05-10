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
export const emaK = (period: number) => 2 / (period + 1);

export function updEMA(prev: number | null, value: number, k: number): number {
  return prev === null ? value : value * k + prev * (1 - k);
}

// ── SMA ───────────────────────────────────────────────────────────────────────
export function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    return values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

// ── Formatting ────────────────────────────────────────────────────────────────
export function fmtPrice(p: number | null | undefined): string {
  if (p === null || p === undefined || isNaN(p as number)) return '—';
  if (p >= 10000)  return p.toFixed(1);
  if (p >= 1000)   return p.toFixed(2);
  if (p >= 10)     return p.toFixed(3);
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.1)    return p.toFixed(5);
  if (p >= 0.01)   return p.toFixed(6);
  if (p >= 0.0001) return p.toFixed(7);
  const s = p.toFixed(10);
  const match = s.match(/^0\.(0*[1-9]{1,2})/);
  return match ? '0.' + match[1].padEnd(match[1].length, '0') : p.toExponential(3);
}

export function fmtK(n: number): string {
  if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  if (n <= -1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n <= -1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n <= -1e3) return (n / 1e3).toFixed(1) + 'K';
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
export interface RSIState {
  avgGain:    number | null;
  avgLoss:    number | null;
  seedGains:  number[];
  seedLosses: number[];
}

export function makeRSIState(): RSIState {
  return { avgGain: null, avgLoss: null, seedGains: [], seedLosses: [] };
}

export function calcWilderRSI(
  close: number,
  prevClose: number | null,
  state: RSIState,
  period = 14,
): number | null {
  if (prevClose === null) return null;
  const ch   = close - prevClose;
  const gain = Math.max(0, ch);
  const loss = Math.max(0, -ch);

  if (state.avgGain === null) {
    state.seedGains.push(gain);
    state.seedLosses.push(loss);
    if (state.seedGains.length === period) {
      state.avgGain  = state.seedGains.reduce((a, b) => a + b, 0) / period;
      state.avgLoss  = state.seedLosses.reduce((a, b) => a + b, 0) / period;
      state.seedGains  = [];
      state.seedLosses = [];
      const rs = (state.avgLoss ?? 0) === 0 ? Infinity : state.avgGain / (state.avgLoss ?? 1);
      return (state.avgLoss ?? 0) === 0 ? 100 : Math.round(100 - 100 / (1 + rs));
    }
    return null;
  }

  state.avgGain = (state.avgGain * (period - 1) + gain) / period;
  state.avgLoss = ((state.avgLoss ?? 0) * (period - 1) + loss) / period;
  const rs = (state.avgLoss ?? 0) === 0 ? Infinity : state.avgGain / (state.avgLoss ?? 1);
  return (state.avgLoss ?? 0) === 0 ? 100 : Math.round(100 - 100 / (1 + rs));
}

// ── Stochastic RSI ────────────────────────────────────────────────────────────
export function calcStochRSISeries(
  rsiVals: (number | null)[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const rawK: (number | null)[] = rsiVals.map((_, i) => {
    if (i < period - 1) return null;
    const window = rsiVals.slice(i - period + 1, i + 1).filter(v => v !== null) as number[];
    if (window.length < period) return null;
    const lo  = Math.min(...window);
    const hi  = Math.max(...window);
    const cur = rsiVals[i] as number;
    return hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100;
  });

  // Smooth K
  const smoothedK: (number | null)[] = rawK.map((_, i) => {
    const window = rawK.slice(Math.max(0, i - smoothK + 1), i + 1).filter(v => v !== null) as number[];
    return window.length === smoothK ? window.reduce((a, b) => a + b, 0) / smoothK : null;
  });

  // Smooth D (SMA of smoothed K)
  const smoothedD: (number | null)[] = smoothedK.map((_, i) => {
    const window = smoothedK.slice(Math.max(0, i - smoothD + 1), i + 1).filter(v => v !== null) as number[];
    return window.length === smoothD ? window.reduce((a, b) => a + b, 0) / smoothD : null;
  });

  return { k: smoothedK, d: smoothedD };
}

// ── MACD ──────────────────────────────────────────────────────────────────────
export interface MACDState {
  emaFast:   number | null;
  emaSlow:   number | null;
  emaSignal: number | null;
}

export function makeMACDState(): MACDState {
  return { emaFast: null, emaSlow: null, emaSignal: null };
}

export function calcMACD(
  close: number,
  state: MACDState,
  fast = 12,
  slow = 26,
  signal = 9,
): { macdLine: number | null; signalLine: number | null; histogram: number | null } {
  state.emaFast = updEMA(state.emaFast, close, emaK(fast));
  state.emaSlow = updEMA(state.emaSlow, close, emaK(slow));

  if (state.emaFast === null || state.emaSlow === null) {
    return { macdLine: null, signalLine: null, histogram: null };
  }

  const macdLine = state.emaFast - state.emaSlow;
  state.emaSignal = updEMA(state.emaSignal, macdLine, emaK(signal));
  const signalLine = state.emaSignal;
  const histogram  = signalLine !== null ? macdLine - signalLine : null;

  return { macdLine, signalLine, histogram };
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
export interface BBState {
  closes: number[];
}

export function makeBBState(): BBState {
  return { closes: [] };
}

export function calcBB(
  close: number,
  state: BBState,
  period = 20,
  stdDevMult = 2,
): { upper: number | null; middle: number | null; lower: number | null; width: number | null; pct: number | null } {
  state.closes.push(close);
  if (state.closes.length > period) state.closes.shift();
  if (state.closes.length < period) {
    return { upper: null, middle: null, lower: null, width: null, pct: null };
  }

  const mean   = state.closes.reduce((a, b) => a + b, 0) / period;
  const variance = state.closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper  = mean + stdDevMult * stdDev;
  const lower  = mean - stdDevMult * stdDev;
  const width  = upper - lower;
  const pct    = width > 0 ? (close - lower) / width : 0.5;

  return { upper, middle: mean, lower, width, pct };
}

// ── ATR ───────────────────────────────────────────────────────────────────────
export interface ATRState {
  prevClose: number | null;
  atr:       number | null;
  seed:      number[];
}

export function makeATRState(): ATRState {
  return { prevClose: null, atr: null, seed: [] };
}

export function calcATR(
  candle: Candle,
  state: ATRState,
  period = 14,
): number | null {
  const tr = state.prevClose === null
    ? candle.h - candle.l
    : Math.max(
        candle.h - candle.l,
        Math.abs(candle.h - state.prevClose),
        Math.abs(candle.l - state.prevClose),
      );

  state.prevClose = candle.c;

  if (state.atr === null) {
    state.seed.push(tr);
    if (state.seed.length === period) {
      state.atr = state.seed.reduce((a, b) => a + b, 0) / period;
      state.seed = [];
    }
    return state.atr;
  }

  state.atr = (state.atr * (period - 1) + tr) / period;
  return state.atr;
}

// ── SuperTrend ────────────────────────────────────────────────────────────────
export interface SuperTrendState {
  atrState:   ATRState;
  upperBand:  number | null;
  lowerBand:  number | null;
  superTrend: number | null;
  direction:  1 | -1;   // 1 = bull, -1 = bear
}

export function makeSuperTrendState(): SuperTrendState {
  return {
    atrState:   makeATRState(),
    upperBand:  null,
    lowerBand:  null,
    superTrend: null,
    direction:  1,
  };
}

export function calcSuperTrend(
  candle: Candle,
  state: SuperTrendState,
  period = 10,
  multiplier = 3,
): { value: number | null; bull: boolean } {
  const atr = calcATR(candle, state.atrState, period);
  if (atr === null) return { value: null, bull: true };

  const hl2      = (candle.h + candle.l) / 2;
  const rawUpper = hl2 + multiplier * atr;
  const rawLower = hl2 - multiplier * atr;

  const prevUpper = state.upperBand ?? rawUpper;
  const prevLower = state.lowerBand ?? rawLower;
  const prevST    = state.superTrend ?? rawLower;
  const prevDir   = state.direction;

  // Final bands (don't widen unnecessarily)
  state.upperBand = rawUpper < prevUpper || candle.c > prevUpper ? rawUpper : prevUpper;
  state.lowerBand = rawLower > prevLower || candle.c < prevLower ? rawLower : prevLower;

  // Direction flip logic
  if (prevST === prevUpper) {
    state.direction = candle.c > state.upperBand ? 1 : -1;
  } else {
    state.direction = candle.c < state.lowerBand ? -1 : 1;
  }

  state.superTrend = state.direction === 1 ? state.lowerBand : state.upperBand;
  return { value: state.superTrend, bull: state.direction === 1 };
}

// ── ADX ───────────────────────────────────────────────────────────────────────
export interface ADXState {
  prevHigh:  number | null;
  prevLow:   number | null;
  prevClose: number | null;
  atr:       ATRState;
  plusDM:    number | null;
  minusDM:   number | null;
  adx:       number | null;
  seedTR:    number[];
  seedPlus:  number[];
  seedMinus: number[];
  seedDX:    number[];
}

export function makeADXState(): ADXState {
  return {
    prevHigh: null, prevLow: null, prevClose: null,
    atr: makeATRState(),
    plusDM: null, minusDM: null, adx: null,
    seedTR: [], seedPlus: [], seedMinus: [], seedDX: [],
  };
}

export function calcADX(
  candle: Candle,
  state: ADXState,
  period = 14,
): { adx: number | null; plusDI: number | null; minusDI: number | null } {
  if (state.prevHigh === null) {
    state.prevHigh  = candle.h;
    state.prevLow   = candle.l;
    state.prevClose = candle.c;
    return { adx: null, plusDI: null, minusDI: null };
  }

  const tr     = Math.max(candle.h - candle.l, Math.abs(candle.h - state.prevClose!), Math.abs(candle.l - state.prevClose!));
  const plusDM = candle.h - state.prevHigh > state.prevLow! - candle.l
    ? Math.max(candle.h - state.prevHigh, 0) : 0;
  const minusDM = state.prevLow! - candle.l > candle.h - state.prevHigh
    ? Math.max(state.prevLow! - candle.l, 0) : 0;

  state.prevHigh  = candle.h;
  state.prevLow   = candle.l;
  state.prevClose = candle.c;

  if (state.plusDM === null) {
    state.seedTR.push(tr);
    state.seedPlus.push(plusDM);
    state.seedMinus.push(minusDM);
    if (state.seedTR.length === period) {
      const sumTR    = state.seedTR.reduce((a, b) => a + b, 0);
      const sumPlus  = state.seedPlus.reduce((a, b) => a + b, 0);
      const sumMinus = state.seedMinus.reduce((a, b) => a + b, 0);
      state.plusDM  = sumPlus;
      state.minusDM = sumMinus;
      const plusDI  = (sumPlus  / sumTR) * 100;
      const minusDI = (sumMinus / sumTR) * 100;
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      state.seedDX.push(dx);
      state.seedTR = [sumTR]; state.seedPlus = [sumPlus]; state.seedMinus = [sumMinus];
    }
    return { adx: null, plusDI: null, minusDI: null };
  }

  const smoothTR    = state.seedTR[0]    - state.seedTR[0]    / period + tr;
  const smoothPlus  = state.plusDM!      - state.plusDM!      / period + plusDM;
  const smoothMinus = state.minusDM!     - state.minusDM!     / period + minusDM;

  state.seedTR[0]  = smoothTR;
  state.plusDM     = smoothPlus;
  state.minusDM    = smoothMinus;

  const plusDI  = (smoothPlus  / smoothTR) * 100;
  const minusDI = (smoothMinus / smoothTR) * 100;
  const dx      = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 1e-10) * 100;

  if (state.adx === null) {
    state.seedDX.push(dx);
    if (state.seedDX.length === period) {
      state.adx = state.seedDX.reduce((a, b) => a + b, 0) / period;
      state.seedDX = [];
    }
    return { adx: null, plusDI, minusDI };
  }

  state.adx = (state.adx * (period - 1) + dx) / period;
  return { adx: state.adx, plusDI, minusDI };
}

// ── OBV ───────────────────────────────────────────────────────────────────────
export interface OBVState {
  obv:       number;
  prevClose: number | null;
}

export function makeOBVState(): OBVState {
  return { obv: 0, prevClose: null };
}

export function calcOBV(candle: Candle, state: OBVState): number {
  if (state.prevClose === null) {
    state.prevClose = candle.c;
    return state.obv;
  }
  if (candle.c > state.prevClose)      state.obv += candle.v;
  else if (candle.c < state.prevClose) state.obv -= candle.v;
  state.prevClose = candle.c;
  return state.obv;
}

// ── Williams %R ───────────────────────────────────────────────────────────────
export interface WillRState {
  highs:  number[];
  lows:   number[];
}

export function makeWillRState(): WillRState {
  return { highs: [], lows: [] };
}

export function calcWilliamsR(candle: Candle, state: WillRState, period = 14): number | null {
  state.highs.push(candle.h);
  state.lows.push(candle.l);
  if (state.highs.length > period) { state.highs.shift(); state.lows.shift(); }
  if (state.highs.length < period) return null;
  const hh = Math.max(...state.highs);
  const ll  = Math.min(...state.lows);
  return hh === ll ? -50 : ((hh - candle.c) / (hh - ll)) * -100;
}

// ── CCI ───────────────────────────────────────────────────────────────────────
export interface CCIState {
  typicals: number[];
}

export function makeCCIState(): CCIState {
  return { typicals: [] };
}

export function calcCCI(candle: Candle, state: CCIState, period = 20): number | null {
  const tp = (candle.h + candle.l + candle.c) / 3;
  state.typicals.push(tp);
  if (state.typicals.length > period) state.typicals.shift();
  if (state.typicals.length < period) return null;
  const mean = state.typicals.reduce((a, b) => a + b, 0) / period;
  const meanDev = state.typicals.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  return meanDev === 0 ? 0 : (tp - mean) / (0.015 * meanDev);
}

// ── Parabolic SAR ─────────────────────────────────────────────────────────────
export interface PsarState {
  sar:       number | null;
  ep:        number | null;   // extreme point
  af:        number;          // acceleration factor
  bull:      boolean;
}

export function makePsarState(): PsarState {
  return { sar: null, ep: null, af: 0.02, bull: true };
}

export function calcPSAR(
  candle: Candle,
  state: PsarState,
  step = 0.02,
  max  = 0.2,
): { value: number | null; bull: boolean } {
  if (state.sar === null) {
    state.sar  = candle.l;
    state.ep   = candle.h;
    state.bull = true;
    return { value: null, bull: true };
  }

  const prevSar = state.sar;
  const prevEP  = state.ep!;
  const prevAF  = state.af;
  const prevBull = state.bull;

  let sar = prevSar + prevAF * (prevEP - prevSar);

  if (prevBull) {
    if (candle.l < sar) {
      // Flip to bear
      state.bull = false;
      state.sar  = prevEP;
      state.ep   = candle.l;
      state.af   = step;
    } else {
      if (candle.h > prevEP) { state.ep = candle.h; state.af = Math.min(prevAF + step, max); }
      state.sar = Math.min(sar, candle.l);
    }
  } else {
    if (candle.h > sar) {
      // Flip to bull
      state.bull = true;
      state.sar  = prevEP;
      state.ep   = candle.h;
      state.af   = step;
    } else {
      if (candle.l < prevEP) { state.ep = candle.l; state.af = Math.min(prevAF + step, max); }
      state.sar = Math.max(sar, candle.h);
    }
  }

  return { value: state.sar, bull: state.bull };
}

// ── VWAP ──────────────────────────────────────────────────────────────────────
export interface VWAPState {
  cumPV:   number;
  cumVol:  number;
  cumPV2:  number;   // for std dev bands
  lastDay: number;
}

export function makeVWAPState(): VWAPState {
  return { cumPV: 0, cumVol: 0, cumPV2: 0, lastDay: -1 };
}

export function calcVWAP(
  candle: Candle,
  state: VWAPState,
): { vwap: number | null; upper1: number | null; lower1: number | null; upper2: number | null; lower2: number | null } {
  const day = Math.floor(candle.t / 86_400_000);

  if (day !== state.lastDay) {
    state.cumPV   = 0;
    state.cumVol  = 0;
    state.cumPV2  = 0;
    state.lastDay = day;
  }

  const typical  = (candle.h + candle.l + candle.c) / 3;
  state.cumPV   += typical * candle.v;
  state.cumVol  += candle.v;
  state.cumPV2  += typical * typical * candle.v;

  if (state.cumVol === 0) return { vwap: null, upper1: null, lower1: null, upper2: null, lower2: null };

  const vwap    = state.cumPV / state.cumVol;
  const variance = state.cumPV2 / state.cumVol - vwap * vwap;
  const stdDev  = variance > 0 ? Math.sqrt(variance) : 0;

  return {
    vwap,
    upper1: vwap + stdDev,
    lower1: vwap - stdDev,
    upper2: vwap + 2 * stdDev,
    lower2: vwap - 2 * stdDev,
  };
}

export function calcVWAPSeries(candles: Candle[]): ReturnType<typeof calcVWAP>[] {
  const state = makeVWAPState();
  return candles.map(c => calcVWAP(c, state));
}

// ── CVD ───────────────────────────────────────────────────────────────────────
export function candleDelta(candle: Candle, wickWeighted = true): number {
  if (wickWeighted) {
    const range = candle.h - candle.l;
    if (range === 0) return 0;
    return candle.v * (candle.c - candle.l) / range - candle.v * (candle.h - candle.c) / range;
  }
  return candle.c >= candle.o ? candle.v : -candle.v;
}

export interface CVDState { cumDelta: number; }
export function makeCVDState(): CVDState { return { cumDelta: 0 }; }

export function calcCVD(
  candle: Candle,
  state: CVDState,
  wickWeighted = true,
): { barDelta: number; cumDelta: number } {
  const barDelta = candleDelta(candle, wickWeighted);
  state.cumDelta += barDelta;
  return { barDelta, cumDelta: state.cumDelta };
}

export function calcCVDSeries(candles: Candle[], wickWeighted = true) {
  const state = makeCVDState();
  const barDeltas: number[] = [], cumDeltas: number[] = [];
  for (const c of candles) {
    const { barDelta, cumDelta } = calcCVD(c, state, wickWeighted);
    barDeltas.push(barDelta); cumDeltas.push(cumDelta);
  }
  return { barDeltas, cumDeltas };
}

// ── Candlestick Patterns ──────────────────────────────────────────────────────
export interface PatternResult {
  name:  string;
  bull:  boolean;
  label: string;
}

export function detectPatterns(candle: Candle, prev: Candle | null): PatternResult[] {
  const results: PatternResult[] = [];
  const body    = Math.abs(candle.c - candle.o);
  const range   = candle.h - candle.l;
  const isBull  = candle.c > candle.o;
  const upperWick = candle.h - Math.max(candle.c, candle.o);
  const lowerWick = Math.min(candle.c, candle.o) - candle.l;

  if (range === 0) return results;

  const bodyRatio  = body / range;
  const upperRatio = upperWick / range;
  const lowerRatio = lowerWick / range;

  // Doji
  if (bodyRatio < 0.1) {
    results.push({ name: 'doji', bull: false, label: '十' });
  }

  // Hammer (bull reversal at bottom)
  if (lowerRatio > 0.55 && upperRatio < 0.1 && bodyRatio > 0.1) {
    results.push({ name: 'hammer', bull: true, label: '⬆H' });
  }

  // Shooting Star (bear reversal at top)
  if (upperRatio > 0.55 && lowerRatio < 0.1 && bodyRatio > 0.1) {
    results.push({ name: 'shooting_star', bull: false, label: '⬇S' });
  }

  // Pin bar (large wick, small body anywhere)
  if ((upperRatio > 0.6 || lowerRatio > 0.6) && bodyRatio < 0.2) {
    results.push({ name: 'pin_bar', bull: lowerRatio > upperRatio, label: lowerRatio > upperRatio ? '📌↑' : '📌↓' });
  }

  if (!prev) return results;

  const prevBody   = Math.abs(prev.c - prev.o);
  const prevIsBull = prev.c > prev.o;

  // Bullish engulfing
  if (!prevIsBull && isBull && candle.o < prev.c && candle.c > prev.o && body > prevBody) {
    results.push({ name: 'bull_engulfing', bull: true, label: '⬆E' });
  }

  // Bearish engulfing
  if (prevIsBull && !isBull && candle.o > prev.c && candle.c < prev.o && body > prevBody) {
    results.push({ name: 'bear_engulfing', bull: false, label: '⬇E' });
  }

  return results;
}

// ── Entry scoring ─────────────────────────────────────────────────────────────
export function scoreEntryQuality(
  dir: 'long' | 'short',
  rsi: number,
  e9: number,
  e20: number,
  e50: number,
  price: number,
  crossovers: CrossoverEvent[],
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
export function computeSuggestion(
  e9: number, e20: number, e50: number,
  livePrice: number,
  rsi: number,
  candles: Candle[],
  rrRatio: number,
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