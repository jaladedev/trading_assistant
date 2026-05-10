import type { CrossoverEvent } from './indicators';

// ── Operands ──────────────────────────────────────────────────────────────────
export type IndicatorId =
  | 'price_close' | 'price_open' | 'price_high' | 'price_low'
  | 'ema9' | 'ema20' | 'ema50'
  | 'rsi' | 'stoch_rsi_k' | 'stoch_rsi_d'
  | 'macd_line' | 'macd_signal' | 'macd_hist'
  | 'bb_upper' | 'bb_middle' | 'bb_lower' | 'bb_pct' | 'bb_width'
  | 'atr'
  | 'supertrend_dir'   // 1 = bull, -1 = bear
  | 'adx' | 'plus_di' | 'minus_di'
  | 'obv'
  | 'williams_r'
  | 'cci'
  | 'psar_dir'          // 1 = bull, -1 = bear
  | 'vwap'
  | 'cvd_cum'
  | 'volume';

export type Operand =
  | { type: 'indicator'; id: IndicatorId }
  | { type: 'fixed';     value: number }
  | { type: 'pattern';   id: 'engulfing_bull' | 'engulfing_bear' | 'doji' | 'hammer' | 'shooting_star' | 'pin_bar_bull' | 'pin_bar_bear' };

// ── Conditions ────────────────────────────────────────────────────────────────
export type Condition =
  | 'crosses_above'
  | 'crosses_below'
  | 'greater_than'
  | 'less_than'
  | 'greater_equal'
  | 'less_equal'
  | 'equals'
  | 'is_true';        // for boolean/direction operands

// ── Single rule ───────────────────────────────────────────────────────────────
export interface Rule {
  id:        string;
  left:      Operand;
  condition: Condition;
  right:     Operand;
  lookback:  number;   // how many bars back to check (1 = current bar only)
}

// ── Entry condition group ─────────────────────────────────────────────────────
export interface EntryCondition {
  rules: Rule[];
  logic: 'AND' | 'OR';
  filters?: {
    minADX:      number;    // 0 = disabled; only trade when ADX > threshold
    sessionOnly: boolean;   // London/NY hours only (UTC 7–16)
  };
}

// ── Stop loss ─────────────────────────────────────────────────────────────────
export type StopType =
  | 'fixed_pct'      // fixed % from entry
  | 'atr_multiple'   // ATR × multiplier
  | 'swing_low'      // recent N-bar low/high
  | 'bb_band';       // opposite BB band

export interface StopConfig {
  type:         StopType;
  value:        number;        // % or ATR multiple or swing lookback bars
  breakEvenAt:  number;        // move SL to entry after X×R profit (0 = off)
  trailAfter:   number;        // start trailing after X×R profit (0 = off)
  trailType:    'fixed_pct' | 'atr_multiple';
  trailValue:   number;
}

// ── Take profit ───────────────────────────────────────────────────────────────
export interface TPTarget {
  rrMultiple:  number;   // e.g. 1.5, 2, 3
  sizePercent: number;   // % of position to close at this level
}

export interface TakeProfitConfig {
  targets: TPTarget[];   // must sum to 100%
}

// ── Position sizing ───────────────────────────────────────────────────────────
export type SizingMethod =
  | 'fixed_usd'        // fixed $ amount per trade
  | 'fixed_pct'        // fixed % of capital
  | 'risk_pct';        // risk X% of capital (auto-size from SL distance)

export interface SizingConfig {
  method:       SizingMethod;
  value:        number;    // $ or %
  maxPerTrade:  number;    // cap position size in $
  maxOpen:      number;    // max concurrent positions (0 = unlimited)
  maxDailyLoss: number;    // kill switch in $ (0 = disabled)
}

// ── Full strategy ─────────────────────────────────────────────────────────────
export interface Strategy {
  id:          string;
  name:        string;
  description: string;
  createdAt:   number;
  updatedAt:   number;
  enabled:     boolean;

  longEntry:   EntryCondition | null;
  shortEntry:  EntryCondition | null;
  exitRules:   EntryCondition | null;   // indicator-based exit (optional)
  stop:        StopConfig;
  takeProfit:  TakeProfitConfig;
  sizing:      SizingConfig;
}

// ── Signal output ─────────────────────────────────────────────────────────────
export interface StrategySignal {
  dir:       'long' | 'short';
  entry:     number;
  stop:      number;
  targets:   number[];
  size:      number;
  reasons:   string[];
  score:     number;
}

// ── Built-in preset strategies ────────────────────────────────────────────────
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function makeRule(
  left: Operand,
  condition: Condition,
  right: Operand,
  lookback = 1,
): Rule {
  return { id: makeId(), left, condition, right, lookback };
}

const defaultStop: StopConfig = {
  type: 'atr_multiple', value: 2,
  breakEvenAt: 1, trailAfter: 2, trailType: 'atr_multiple', trailValue: 1.5,
};

const defaultTP: TakeProfitConfig = {
  targets: [
    { rrMultiple: 1.5, sizePercent: 50 },
    { rrMultiple: 3,   sizePercent: 50 },
  ],
};

const defaultSizing: SizingConfig = {
  method: 'risk_pct', value: 1, maxPerTrade: 500, maxOpen: 1, maxDailyLoss: 0,
};

export const PRESET_STRATEGIES: Strategy[] = [
  {
    id: 'preset-3ema',
    name: '3-EMA Trend Follow',
    description: 'Classic 3 EMA stack strategy. Long when EMA9 > EMA20 > EMA50, RSI in momentum zone. Short when stacked bearishly.',
    createdAt: 0, updatedAt: 0, enabled: true,
    longEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'ema9' },  'greater_than', { type: 'indicator', id: 'ema20' }),
        makeRule({ type: 'indicator', id: 'ema20' }, 'greater_than', { type: 'indicator', id: 'ema50' }),
        makeRule({ type: 'indicator', id: 'rsi' },   'greater_than', { type: 'fixed', value: 50 }),
        makeRule({ type: 'indicator', id: 'rsi' },   'less_than',    { type: 'fixed', value: 65 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    shortEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'ema9' },  'less_than', { type: 'indicator', id: 'ema20' }),
        makeRule({ type: 'indicator', id: 'ema20' }, 'less_than', { type: 'indicator', id: 'ema50' }),
        makeRule({ type: 'indicator', id: 'rsi' },   'less_than', { type: 'fixed', value: 50 }),
        makeRule({ type: 'indicator', id: 'rsi' },   'greater_than', { type: 'fixed', value: 35 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    exitRules: null,
    stop:       defaultStop,
    takeProfit: defaultTP,
    sizing:     defaultSizing,
  },
  {
    id: 'preset-bb-bounce',
    name: 'BB Bounce',
    description: 'Mean reversion. Long when price touches lower BB and RSI is oversold. Short on upper BB touch with RSI overbought.',
    createdAt: 0, updatedAt: 0, enabled: true,
    longEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'price_close' }, 'less_equal',    { type: 'indicator', id: 'bb_lower' }),
        makeRule({ type: 'indicator', id: 'rsi' },         'less_than',     { type: 'fixed', value: 35 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    shortEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'price_close' }, 'greater_equal', { type: 'indicator', id: 'bb_upper' }),
        makeRule({ type: 'indicator', id: 'rsi' },         'greater_than',  { type: 'fixed', value: 65 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    exitRules: {
      logic: 'OR',
      rules: [
        makeRule({ type: 'indicator', id: 'price_close' }, 'greater_equal', { type: 'indicator', id: 'bb_middle' }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    stop: { type: 'atr_multiple', value: 1.5, breakEvenAt: 0.8, trailAfter: 0, trailType: 'atr_multiple', trailValue: 1 },
    takeProfit: { targets: [{ rrMultiple: 1, sizePercent: 60 }, { rrMultiple: 2, sizePercent: 40 }] },
    sizing: defaultSizing,
  },
  {
    id: 'preset-macd-cross',
    name: 'MACD Crossover',
    description: 'Trend-following via MACD line crossing signal line. Filtered by EMA50 direction for trend alignment.',
    createdAt: 0, updatedAt: 0, enabled: true,
    longEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'macd_line' },    'crosses_above', { type: 'indicator', id: 'macd_signal' }),
        makeRule({ type: 'indicator', id: 'price_close' }, 'greater_than',  { type: 'indicator', id: 'ema50' }),
      ],
      filters: { minADX: 20, sessionOnly: false },
    },
    shortEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'macd_line' },    'crosses_below', { type: 'indicator', id: 'macd_signal' }),
        makeRule({ type: 'indicator', id: 'price_close' }, 'less_than',     { type: 'indicator', id: 'ema50' }),
      ],
      filters: { minADX: 20, sessionOnly: false },
    },
    exitRules: {
      logic: 'OR',
      rules: [
        makeRule({ type: 'indicator', id: 'macd_line' }, 'crosses_below', { type: 'indicator', id: 'macd_signal' }),
      ],
    },
    stop:       { type: 'atr_multiple', value: 2.5, breakEvenAt: 1, trailAfter: 2, trailType: 'atr_multiple', trailValue: 2 },
    takeProfit: defaultTP,
    sizing:     defaultSizing,
  },
  {
    id: 'preset-rsi-reversion',
    name: 'RSI Mean Reversion',
    description: 'Counter-trend. Buys extreme oversold readings, sells extreme overbought. Best on ranging markets with ADX < 25.',
    createdAt: 0, updatedAt: 0, enabled: true,
    longEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'rsi' }, 'less_than', { type: 'fixed', value: 25 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    shortEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'rsi' }, 'greater_than', { type: 'fixed', value: 75 }),
      ],
      filters: { minADX: 0, sessionOnly: false },
    },
    exitRules: {
      logic: 'OR',
      rules: [
        makeRule({ type: 'indicator', id: 'rsi' }, 'greater_than', { type: 'fixed', value: 50 }),
      ],
    },
    stop:       { type: 'fixed_pct', value: 3, breakEvenAt: 0, trailAfter: 0, trailType: 'fixed_pct', trailValue: 1 },
    takeProfit: { targets: [{ rrMultiple: 1.5, sizePercent: 100 }] },
    sizing:     defaultSizing,
  },
  {
    id: 'preset-supertrend',
    name: 'SuperTrend Flip',
    description: 'Enters on SuperTrend direction flip. Confirmed by EMA stack alignment. Clean trend-following approach.',
    createdAt: 0, updatedAt: 0, enabled: true,
    longEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'supertrend_dir' }, 'crosses_above', { type: 'fixed', value: 0 }),
        makeRule({ type: 'indicator', id: 'ema9' },           'greater_than',  { type: 'indicator', id: 'ema50' }),
      ],
      filters: { minADX: 15, sessionOnly: false },
    },
    shortEntry: {
      logic: 'AND',
      rules: [
        makeRule({ type: 'indicator', id: 'supertrend_dir' }, 'crosses_below', { type: 'fixed', value: 0 }),
        makeRule({ type: 'indicator', id: 'ema9' },           'less_than',     { type: 'indicator', id: 'ema50' }),
      ],
      filters: { minADX: 15, sessionOnly: false },
    },
    exitRules: {
      logic: 'OR',
      rules: [
        makeRule({ type: 'indicator', id: 'supertrend_dir' }, 'crosses_below', { type: 'fixed', value: 0 }),
      ],
    },
    stop:       { type: 'atr_multiple', value: 2, breakEvenAt: 1, trailAfter: 1.5, trailType: 'atr_multiple', trailValue: 1.5 },
    takeProfit: defaultTP,
    sizing:     defaultSizing,
  },
];

// ── Indicator value resolver ───────────────────────────────────────────────────
// Pulls the current value of any IndicatorId from the store state snapshot
export interface IndicatorSnapshot {
  price:     number;
  open:      number;
  high:      number;
  low:       number;
  ema9:      number | null;
  ema20:     number | null;
  ema50:     number | null;
  rsi:       number | null;
  stochK:    number | null;
  stochD:    number | null;
  macdLine:  number | null;
  macdSig:   number | null;
  macdHist:  number | null;
  bbUpper:   number | null;
  bbMiddle:  number | null;
  bbLower:   number | null;
  bbPct:     number | null;
  bbWidth:   number | null;
  atr:       number | null;
  stDir:     number | null;    // 1 or -1
  adx:       number | null;
  plusDI:    number | null;
  minusDI:   number | null;
  obv:       number | null;
  willR:     number | null;
  cci:       number | null;
  psarDir:   number | null;    // 1 or -1
  vwap:      number | null;
  cvdCum:    number | null;
  volume:    number;
  // Previous bar values for crossover detection
  prev: Omit<IndicatorSnapshot, 'prev'> | null;
  // Patterns on current bar
  patterns:  string[];
}

function resolveOperand(op: Operand, snap: IndicatorSnapshot): number | null {
  if (op.type === 'fixed') return op.value;
  if (op.type === 'pattern') {
    return snap.patterns.includes(op.id) ? 1 : 0;
  }
  // indicator
  switch (op.id) {
    case 'price_close':    return snap.price;
    case 'price_open':     return snap.open;
    case 'price_high':     return snap.high;
    case 'price_low':      return snap.low;
    case 'ema9':           return snap.ema9;
    case 'ema20':          return snap.ema20;
    case 'ema50':          return snap.ema50;
    case 'rsi':            return snap.rsi;
    case 'stoch_rsi_k':    return snap.stochK;
    case 'stoch_rsi_d':    return snap.stochD;
    case 'macd_line':      return snap.macdLine;
    case 'macd_signal':    return snap.macdSig;
    case 'macd_hist':      return snap.macdHist;
    case 'bb_upper':       return snap.bbUpper;
    case 'bb_middle':      return snap.bbMiddle;
    case 'bb_lower':       return snap.bbLower;
    case 'bb_pct':         return snap.bbPct;
    case 'bb_width':       return snap.bbWidth;
    case 'atr':            return snap.atr;
    case 'supertrend_dir': return snap.stDir;
    case 'adx':            return snap.adx;
    case 'plus_di':        return snap.plusDI;
    case 'minus_di':       return snap.minusDI;
    case 'obv':            return snap.obv;
    case 'williams_r':     return snap.willR;
    case 'cci':            return snap.cci;
    case 'psar_dir':       return snap.psarDir;
    case 'vwap':           return snap.vwap;
    case 'cvd_cum':        return snap.cvdCum;
    case 'volume':         return snap.volume;
    default:               return null;
  }
}

// ── Rule evaluator ────────────────────────────────────────────────────────────
function evalRule(rule: Rule, snap: IndicatorSnapshot): boolean {
  const lv = resolveOperand(rule.left,  snap);
  const rv = resolveOperand(rule.right, snap);
  if (lv === null || rv === null) return false;

  // Crossover conditions need previous bar
  if (rule.condition === 'crosses_above') {
    if (!snap.prev) return false;
    const prevL = resolveOperand(rule.left,  { ...snap.prev, prev: null, patterns: snap.prev.patterns ?? [] });
    const prevR = resolveOperand(rule.right, { ...snap.prev, prev: null, patterns: snap.prev.patterns ?? [] });
    if (prevL === null || prevR === null) return false;
    return prevL <= prevR && lv > rv;
  }
  if (rule.condition === 'crosses_below') {
    if (!snap.prev) return false;
    const prevL = resolveOperand(rule.left,  { ...snap.prev, prev: null, patterns: snap.prev.patterns ?? [] });
    const prevR = resolveOperand(rule.right, { ...snap.prev, prev: null, patterns: snap.prev.patterns ?? [] });
    if (prevL === null || prevR === null) return false;
    return prevL >= prevR && lv < rv;
  }

  switch (rule.condition) {
    case 'greater_than':   return lv >  rv;
    case 'less_than':      return lv <  rv;
    case 'greater_equal':  return lv >= rv;
    case 'less_equal':     return lv <= rv;
    case 'equals':         return Math.abs(lv - rv) < 1e-10;
    case 'is_true':        return lv !== 0;
    default:               return false;
  }
}

// ── Entry condition evaluator ─────────────────────────────────────────────────
function evalCondition(cond: EntryCondition, snap: IndicatorSnapshot): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // ADX filter
  if (cond.filters?.minADX && cond.filters.minADX > 0) {
    if (snap.adx === null || snap.adx < cond.filters.minADX) {
      return { pass: false, reasons: [`ADX ${snap.adx?.toFixed(1) ?? '—'} below min ${cond.filters.minADX}`] };
    }
  }

  // Session filter (UTC 7–16 covers London + NY overlap)
  if (cond.filters?.sessionOnly) {
    const hour = new Date().getUTCHours();
    if (hour < 7 || hour > 16) {
      return { pass: false, reasons: ['Outside trading session'] };
    }
  }

  const results = cond.rules.map(rule => {
    const pass = evalRule(rule, snap);
    const lDesc = rule.left.type === 'indicator' ? rule.left.id : rule.left.type === 'fixed' ? String(rule.left.value) : rule.left.id;
    const rDesc = rule.right.type === 'indicator' ? rule.right.id : rule.right.type === 'fixed' ? String(rule.right.value) : rule.right.id;
    return { pass, label: `${lDesc} ${rule.condition.replace(/_/g, ' ')} ${rDesc}` };
  });

  const pass = cond.logic === 'AND'
    ? results.every(r => r.pass)
    : results.some(r => r.pass);

  results.filter(r => r.pass).forEach(r => reasons.push('✓ ' + r.label));
  results.filter(r => !r.pass).forEach(r => reasons.push('✗ ' + r.label));

  return { pass, reasons };
}

// ── Stop price calculator ─────────────────────────────────────────────────────
export function calcStopPrice(
  dir: 'long' | 'short',
  entry: number,
  stop: StopConfig,
  snap: IndicatorSnapshot,
  recentLow: number,
  recentHigh: number,
): number {
  switch (stop.type) {
    case 'fixed_pct': {
      const dist = entry * stop.value / 100;
      return dir === 'long' ? entry - dist : entry + dist;
    }
    case 'atr_multiple': {
      const atr = snap.atr ?? entry * 0.01;
      return dir === 'long' ? entry - atr * stop.value : entry + atr * stop.value;
    }
    case 'swing_low': {
      return dir === 'long' ? recentLow * 0.9995 : recentHigh * 1.0005;
    }
    case 'bb_band': {
      return dir === 'long'
        ? (snap.bbLower ?? entry * 0.98)
        : (snap.bbUpper ?? entry * 1.02);
    }
    default:
      return dir === 'long' ? entry * 0.98 : entry * 1.02;
  }
}

// ── Position size calculator ──────────────────────────────────────────────────
export function calcPositionSize(
  entry: number,
  stopPrice: number,
  capital: number,
  sizing: SizingConfig,
): number {
  let size = 0;
  switch (sizing.method) {
    case 'fixed_usd':
      size = sizing.value;
      break;
    case 'fixed_pct':
      size = capital * sizing.value / 100;
      break;
    case 'risk_pct': {
      const riskAmt  = capital * sizing.value / 100;
      const riskPerUnit = Math.abs(entry - stopPrice);
      const tokens   = riskPerUnit > 0 ? riskAmt / riskPerUnit : 0;
      size = tokens * entry;
      break;
    }
  }
  if (sizing.maxPerTrade > 0) size = Math.min(size, sizing.maxPerTrade);
  return Math.max(0, size);
}

// ── Main strategy evaluator ───────────────────────────────────────────────────
export function evaluateStrategy(
  strategy: Strategy,
  snap: IndicatorSnapshot,
  capital: number,
  recentLow: number,
  recentHigh: number,
): StrategySignal | null {
  if (!strategy.enabled) return null;

  const entry = snap.price;
  let dir: 'long' | 'short' | null = null;
  let reasons: string[] = [];
  let score = 0;

  // Try long
  if (strategy.longEntry) {
    const { pass, reasons: r } = evalCondition(strategy.longEntry, snap);
    if (pass) {
      dir = 'long';
      reasons = r.filter(x => x.startsWith('✓'));
      score   = Math.round((reasons.length / strategy.longEntry.rules.length) * 100);
    }
  }

  // Try short if long didn't fire
  if (!dir && strategy.shortEntry) {
    const { pass, reasons: r } = evalCondition(strategy.shortEntry, snap);
    if (pass) {
      dir = 'short';
      reasons = r.filter(x => x.startsWith('✓'));
      score   = Math.round((reasons.length / strategy.shortEntry.rules.length) * 100);
    }
  }

  if (!dir) return null;

  const stopPrice = calcStopPrice(dir, entry, strategy.stop, snap, recentLow, recentHigh);
  const riskPerUnit = Math.abs(entry - stopPrice);
  const targets = strategy.takeProfit.targets.map(t => {
    const dist = riskPerUnit * t.rrMultiple;
    return dir === 'long' ? entry + dist : entry - dist;
  });

  const size = calcPositionSize(entry, stopPrice, capital, strategy.sizing);

  return { dir, entry, stop: stopPrice, targets, size, reasons, score };
}

// ── Build snapshot from store state ──────────────────────────────────────────
// Call this in the component / store to get the current bar snapshot
export function buildSnapshot(
  storeState: {
    livePrice: number;
    candles: { o: number; h: number; l: number; c: number; v: number; t: number }[];
    currentCandle: { o: number; h: number; l: number; c: number; v: number; t: number } | null;
    e9: number | null; e20: number | null; e50: number | null;
    rsiVals: (number | null)[];
    stochRsiK: (number | null)[]; stochRsiD: (number | null)[];
    macdLine: (number | null)[]; macdSignal: (number | null)[]; macdHist: (number | null)[];
    bbUpper: (number | null)[]; bbMiddle: (number | null)[]; bbLower: (number | null)[];
    bbPct: (number | null)[]; bbWidth: (number | null)[];
    atrVals: (number | null)[];
    stVals: (number | null)[]  ; stBull: boolean[];
    adxVals: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[];
    obvVals: number[];
    willRVals: (number | null)[];
    cciVals: (number | null)[];
    psarVals: (number | null)[]; psarBull: boolean[];
    vwapVals: (number | null)[];
    cvdCumDeltas: number[];
    patterns: { name: string; bull: boolean; label: string }[][];
  }
): IndicatorSnapshot {
  const last = <T>(arr: T[]): T | null => arr.length ? arr[arr.length - 1] : null;
  const prevLast = <T>(arr: T[]): T | null => arr.length >= 2 ? arr[arr.length - 2] : null;

  const cur = storeState.currentCandle;
  const prevBar = storeState.candles[storeState.candles.length - 1];

  const stDir = storeState.stBull.length
    ? (storeState.stBull[storeState.stBull.length - 1] ? 1 : -1) : null;
  const prevStDir = storeState.stBull.length >= 2
    ? (storeState.stBull[storeState.stBull.length - 2] ? 1 : -1) : null;
  const psarDir = storeState.psarBull.length
    ? (storeState.psarBull[storeState.psarBull.length - 1] ? 1 : -1) : null;
  const prevPsarDir = storeState.psarBull.length >= 2
    ? (storeState.psarBull[storeState.psarBull.length - 2] ? 1 : -1) : null;

  const curPatterns = storeState.patterns.length
    ? storeState.patterns[storeState.patterns.length - 1].map(p => p.name)
    : [];
  const prevPatterns = storeState.patterns.length >= 2
    ? storeState.patterns[storeState.patterns.length - 2].map(p => p.name)
    : [];

  const snap: IndicatorSnapshot = {
    price:   storeState.livePrice,
    open:    cur?.o ?? prevBar?.o ?? storeState.livePrice,
    high:    cur?.h ?? prevBar?.h ?? storeState.livePrice,
    low:     cur?.l ?? prevBar?.l ?? storeState.livePrice,
    ema9:    storeState.e9,
    ema20:   storeState.e20,
    ema50:   storeState.e50,
    rsi:     last(storeState.rsiVals),
    stochK:  last(storeState.stochRsiK),
    stochD:  last(storeState.stochRsiD),
    macdLine: last(storeState.macdLine),
    macdSig:  last(storeState.macdSignal),
    macdHist: last(storeState.macdHist),
    bbUpper:  last(storeState.bbUpper),
    bbMiddle: last(storeState.bbMiddle),
    bbLower:  last(storeState.bbLower),
    bbPct:    last(storeState.bbPct),
    bbWidth:  last(storeState.bbWidth),
    atr:      last(storeState.atrVals),
    stDir,
    adx:      last(storeState.adxVals),
    plusDI:   last(storeState.plusDI),
    minusDI:  last(storeState.minusDI),
    obv:      last(storeState.obvVals),
    willR:    last(storeState.willRVals),
    cci:      last(storeState.cciVals),
    psarDir,
    vwap:     last(storeState.vwapVals),
    cvdCum:   last(storeState.cvdCumDeltas) ?? null,
    volume:   cur?.v ?? prevBar?.v ?? 0,
    patterns: curPatterns,
    prev: prevBar ? {
      price:   prevBar.c,
      open:    prevBar.o,
      high:    prevBar.h,
      low:     prevBar.l,
      ema9:    prevLast(storeState.rsiVals) !== undefined ? storeState.e9 : null,
      ema20:   storeState.e20,
      ema50:   storeState.e50,
      rsi:     prevLast(storeState.rsiVals),
      stochK:  prevLast(storeState.stochRsiK),
      stochD:  prevLast(storeState.stochRsiD),
      macdLine: prevLast(storeState.macdLine),
      macdSig:  prevLast(storeState.macdSignal),
      macdHist: prevLast(storeState.macdHist),
      bbUpper:  prevLast(storeState.bbUpper),
      bbMiddle: prevLast(storeState.bbMiddle),
      bbLower:  prevLast(storeState.bbLower),
      bbPct:    prevLast(storeState.bbPct),
      bbWidth:  prevLast(storeState.bbWidth),
      atr:      prevLast(storeState.atrVals),
      stDir:    prevStDir,
      adx:      prevLast(storeState.adxVals),
      plusDI:   prevLast(storeState.plusDI),
      minusDI:  prevLast(storeState.minusDI),
      obv:      storeState.obvVals.length >= 2 ? storeState.obvVals[storeState.obvVals.length - 2] : null,
      willR:    prevLast(storeState.willRVals),
      cci:      prevLast(storeState.cciVals),
      psarDir:  prevPsarDir,
      vwap:     prevLast(storeState.vwapVals),
      cvdCum:   storeState.cvdCumDeltas.length >= 2 ? storeState.cvdCumDeltas[storeState.cvdCumDeltas.length - 2] : null,
      volume:   prevBar.v,
      patterns: prevPatterns,
    } : null,
  };

  return snap;
}