import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Strategy, StrategySignal } from './strategy';
import { PRESET_STRATEGIES, evaluateStrategy, buildSnapshot } from './strategy';

import type {
  Candle, CrossoverEvent, RSIState, VWAPState, CVDState,
  MACDState, BBState, ATRState, SuperTrendState, ADXState,
  OBVState, WillRState, CCIState, PsarState, PatternResult,
} from './indicators';
import {
  updEMA, emaK,
  calcWilderRSI, makeRSIState,
  calcMACD, makeMACDState,
  calcBB, makeBBState,
  calcATR, makeATRState,
  calcSuperTrend, makeSuperTrendState,
  calcADX, makeADXState,
  calcOBV, makeOBVState,
  calcWilliamsR, makeWillRState,
  calcCCI, makeCCIState,
  calcPSAR, makePsarState,
  calcVWAP, makeVWAPState,
  calcCVD, makeCVDState,
  detectPatterns,
  computeSuggestion, scoreEntryQuality,
} from './indicators';
import { calcAutoFibo, fiboEntryScore } from './indicators2';
import type { Drawing } from './drawingTools';
import type { BacktestResult } from './backtestTypes';
import type { PaperAccount, PaperPosition } from './paperTrading';
import { tickPosition } from './paperTrading';
import { idbPutTrade, idbDeleteTrade, idbGetAllTrades, idbReplaceTrades } from './journalDb';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
export type ConnStatus = 'idle' | 'live' | 'err' | 'warn';

export interface Suggestion {
  entry:  number;
  stop:   number;
  target: number;
  dir:    'long' | 'short';
  reason: string;
}

export interface EntryQuality {
  score:   number;
  label:   string;
  cls:     string;
  factors: string[];
}

export interface TradeJournalEntry {
  id:            string;
  date:          string;
  symbol:        string;
  dir:           'long' | 'short';
  entry:         number;
  stop:          number;
  target:        number;
  outcome:       'win' | 'loss' | 'be' | 'open';
  pnl:           number;
  notes:         string;
  tags:          string[];
  screenshotUrl: string;
}
 
export interface PartialTP {
  ratio:  number;
  pct:    number;
  price:  number;
  pnlUsd: number;
  hit:    boolean;
}

export interface SessionTrade {
  id:    string;
  time:  number;
  sym:   string;
  dir:   'long' | 'short';
  entry: number;
  exit:  number;
  size:  number;
  pnl:   number;
  note?: string;
}

export interface PriceAlert {
  id:        string;
  sym:       string;
  price:     number;
  dir:       'above' | 'below';
  label:     string;
  triggered: boolean;
  createdAt: number;
}

export interface ActiveIndicators {
  ema9:          boolean;
  ema20:         boolean;
  ema50:         boolean;
  vwap:          boolean;
  vwapBands:     boolean;
  bb:            boolean;
  superTrend:    boolean;
  psar:          boolean;
  macd:          boolean;
  rsi:           boolean;
  stochRsi:      boolean;
  adx:           boolean;
  obv:           boolean;
  williamsR:     boolean;
  cci:           boolean;
  volume:        boolean;
  cvd:           boolean;
  patterns:      boolean;
  fib:           boolean;
  volumeProfile: boolean;
}

export interface IndicatorParams {
  ema9Period:      number;
  ema20Period:     number;
  ema50Period:     number;
  bbPeriod:        number;
  bbStdDev:        number;
  rsiPeriod:       number;
  stochRsiPeriod:  number;
  macdFast:        number;
  macdSlow:        number;
  macdSignal:      number;
  atrPeriod:       number;
  stPeriod:        number;
  stMultiplier:    number;
  adxPeriod:       number;
  williamsRPeriod: number;
  cciPeriod:       number;
  psarStep:        number;
  psarMax:         number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Slices
// ─────────────────────────────────────────────────────────────────────────────
interface StrategySlice {
  strategies:       Strategy[];
  activeStrategyId: string | null;
  strategySignal:   StrategySignal | null;
}

interface ChartSlice {
  sym:            string;
  tf:             string;
  candles:        Candle[];
  e9s:            (number | null)[];
  e20s:           (number | null)[];
  e50s:           (number | null)[];
  e9:             number | null;
  e20:            number | null;
  e50:            number | null;
  rsiVals:        (number | null)[];
  stochRsiK:      (number | null)[];
  stochRsiD:      (number | null)[];
  macdLine:       (number | null)[];
  macdSignal:     (number | null)[];
  macdHist:       (number | null)[];
  bbUpper:        (number | null)[];
  bbMiddle:       (number | null)[];
  bbLower:        (number | null)[];
  bbWidth:        (number | null)[];
  bbPct:          (number | null)[];
  atrVals:        (number | null)[];
  stVals:         (number | null)[];
  stBull:         boolean[];
  adxVals:        (number | null)[];
  plusDI:         (number | null)[];
  minusDI:        (number | null)[];
  obvVals:        number[];
  willRVals:      (number | null)[];
  cciVals:        (number | null)[];
  psarVals:       (number | null)[];
  psarBull:       boolean[];
  vwapVals:       (number | null)[];
  vwapUpper1:     (number | null)[];
  vwapLower1:     (number | null)[];
  vwapUpper2:     (number | null)[];
  vwapLower2:     (number | null)[];
  cvdBarDeltas:   number[];
  cvdCumDeltas:   number[];
  patterns:       PatternResult[][];
  crossovers:     CrossoverEvent[];
  livePrice:      number;
  prevLivePrice:  number;
  openPrice:      number;
  currentCandle:  Candle | null;
  lastCandleTime: number;
  connStatus:     ConnStatus;
  connLabel:      string;
  suggestion:     Suggestion | null;
  entryQuality:   EntryQuality | null;
  partialTPs:               PartialTP[];
  atrTrailActive:           boolean;
  trailingStopPrice:        number | null;
  sessionTrades:            SessionTrade[];
  sessionPnL:               number;
  maxDailyLossUsd:          number;
  dailyLossBannerDismissed: boolean;
  priceAlerts:              PriceAlert[];
  backtestResult:           BacktestResult | null;
  backtestRunning:          boolean;
  paperAccount:             PaperAccount;
  _rsiState:    RSIState;
  _prevClose:   number | null;
  _e9:          number | null;
  _e20:         number | null;
  _e50:         number | null;
  _macdState:   MACDState;
  _bbState:     BBState;
  _atrState:    ATRState;
  _stState:     SuperTrendState;
  _adxState:    ADXState;
  _obvState:    OBVState;
  _willRState:  WillRState;
  _cciState:    CCIState;
  _psarState:   PsarState;
  _vwapState:   VWAPState;
  _cvdState:    CVDState;
}

interface CalcSlice {
  activeTab:  'chart' | 'calc' | 'journal' | 'strategy' | 'screener';
  currentDir: 'long' | 'short';
  rrRatio:    number;
  entryPrice: string;
  stopPrice:  string;
  sizeUsd:    string;
  tokens:     string;
  leverage:   number;
  feeType:    'maker' | 'taker';
  capital:    string;
  goalPct:    string;
  margin:     string;
}

interface JournalSlice {
  trades: TradeJournalEntry[];
}

interface SettingsSlice {
  theme:            'dark' | 'light';
  defaultSym:       string;
  defaultTf:        string;
  defaultLeverage:  number;
  defaultFeeType:   'maker' | 'taker';
  defaultCapital:   number;
  defaultRR:        number;
  activeIndicators: ActiveIndicators;
  indicatorParams:  IndicatorParams;
  chartDrawings:    Drawing[];
  atrTrailMult:     number;
  soundEnabled:     boolean;
  notifEnabled:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Actions
// ─────────────────────────────────────────────────────────────────────────────
interface Actions {
  setSym:               (sym: string) => void;
  setTf:                (tf: string) => void;
  resetChartState:      () => void;
  addCandleToState:     (c: Candle) => void;
  setCurrentCandle:     (c: Candle | null) => void;
  setLivePrice:         (price: number, apiName: string) => void;
  setConnStatus:        (status: ConnStatus, label: string) => void;
  refreshSuggestion:    () => void;
  toggleIndicator:      (key: keyof ActiveIndicators) => void;
  setIndicatorParam:    (key: keyof IndicatorParams, value: number) => void;
  resetIndicatorParams: () => void;
  setActiveTab:         (tab: 'chart' | 'calc' | 'journal' | 'strategy' | 'screener') => void;
  setCurrentDir:        (dir: 'long' | 'short') => void;
  setRrRatio:           (r: number) => void;
  setEntryPrice:        (v: string) => void;
  setStopPrice:         (v: string) => void;
  setSizeUsd:           (v: string) => void;
  setTokens:            (v: string) => void;
  setLeverage:          (v: number) => void;
  setFeeType:           (v: 'maker' | 'taker') => void;
  setCapital:           (v: string) => void;
  setGoalPct:           (v: string) => void;
  setMargin:            (v: string) => void;
  applySuggestionToCalc:() => void;
  addTrade:             (t: Omit<TradeJournalEntry, 'id'>) => void;
  updateTrade:          (id: string, updates: Partial<TradeJournalEntry>) => void;
  deleteTrade:          (id: string) => void;
  setSettings:          (s: Partial<SettingsSlice>) => void;
  addStrategy:          (s: Strategy) => void;
  updateStrategy:       (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy:       (id: string) => void;
  setActiveStrategy:    (id: string | null) => void;
  evalActiveStrategy:   () => void;
  setChartDrawings:     (d: Drawing[]) => void;
  setPartialTPs:        (tps: PartialTP[]) => void;
  toggleTPHit:          (idx: number) => void;
  setAtrTrailMult:      (v: number) => void;
  setAtrTrailActive:    (v: boolean) => void;
  addSessionTrade:      (t: Omit<SessionTrade, 'id' | 'time'>) => void;
  clearSessionTrades:   () => void;
  setMaxDailyLossUsd:   (v: number) => void;
  setDailyLossBannerDismissed: (v: boolean) => void;
  addPriceAlert:        (a: Omit<PriceAlert, 'id' | 'triggered' | 'createdAt'>) => void;
  removePriceAlert:     (id: string) => void;
  clearTriggeredAlerts: () => void;
  setSoundEnabled:      (v: boolean) => void;
  setNotifEnabled:      (v: boolean) => void;
  setBacktestResult:    (r: BacktestResult | null) => void;
  setBacktestRunning:   (v: boolean) => void;
  exportStrategy:       (id: string) => void;
  importStrategy:       (json: string) => { ok: boolean; error?: string };
  duplicateStrategy:    (id: string) => void;
  toggleStrategyEnabled:(id: string) => void;
  // Paper trading
  openPaperPos:         (pos: PaperPosition) => void;
  closePaperPos:        (id: string, price: number, reason: PaperPosition['status']) => void;
  tickPaperPositions:   (price: number, atr: number | null) => void;
  resetPaperAccount:    (startBalance?: number) => void;
  updatePaperNote:      (id: string, note: string) => void;
  hydrateTradesFromIdb: () => Promise<void>;
  importTradesCsv:      (csv: string, mode: 'merge' | 'replace') => Promise<{ count: number; errors: number }>;
  exportTradesCsv:      () => string;
}

type StoreState = ChartSlice & CalcSlice & JournalSlice & SettingsSlice & StrategySlice & Actions;

// ─────────────────────────────────────────────────────────────────────────────
//  Defaults
// ─────────────────────────────────────────────────────────────────────────────
const defaultActiveIndicators: ActiveIndicators = {
  ema9: true, ema20: true, ema50: true,
  vwap: true, vwapBands: false,
  bb: false, superTrend: false, psar: false,
  macd: false, rsi: true, stochRsi: false,
  adx: false, obv: false, williamsR: false, cci: false,
  volume: true, cvd: true, patterns: true,
  fib: true, volumeProfile: true,
};

const defaultIndicatorParams: IndicatorParams = {
  ema9Period: 9, ema20Period: 20, ema50Period: 50,
  bbPeriod: 20, bbStdDev: 2,
  rsiPeriod: 14, stochRsiPeriod: 14,
  macdFast: 12, macdSlow: 26, macdSignal: 9,
  atrPeriod: 14, stPeriod: 10, stMultiplier: 3,
  adxPeriod: 14, williamsRPeriod: 14, cciPeriod: 20,
  psarStep: 0.02, psarMax: 0.2,
};

const defaultPaperAccount: PaperAccount = {
  balance:         10_000,
  startBalance:    10_000,
  totalPnl:        0,
  winCount:        0,
  lossCount:       0,
  openPositions:   [],
  closedPositions: [],
};

function makeDefaultChartSlice(): ChartSlice {
  return {
    sym: 'BTCUSDT', tf: '5m',
    candles: [],
    e9s: [], e20s: [], e50s: [],
    e9: null, e20: null, e50: null,
    rsiVals: [], stochRsiK: [], stochRsiD: [],
    macdLine: [], macdSignal: [], macdHist: [],
    bbUpper: [], bbMiddle: [], bbLower: [], bbWidth: [], bbPct: [],
    atrVals: [], stVals: [], stBull: [],
    adxVals: [], plusDI: [], minusDI: [],
    obvVals: [], willRVals: [], cciVals: [],
    psarVals: [], psarBull: [],
    vwapVals: [], vwapUpper1: [], vwapLower1: [], vwapUpper2: [], vwapLower2: [],
    cvdBarDeltas: [], cvdCumDeltas: [],
    patterns: [], crossovers: [],
    livePrice: 0, prevLivePrice: 0, openPrice: 0,
    currentCandle: null, lastCandleTime: 0,
    connStatus: 'idle', connLabel: 'Connecting…',
    suggestion: null, entryQuality: null,
    partialTPs:               [],
    atrTrailActive:           false,
    trailingStopPrice:        null,
    sessionTrades:            [],
    sessionPnL:               0,
    maxDailyLossUsd:          0,
    dailyLossBannerDismissed: false,
    priceAlerts:              [],
    backtestResult:           null,
    backtestRunning:          false,
    paperAccount:             { ...defaultPaperAccount },
    _rsiState:  makeRSIState(), _prevClose: null,
    _e9: null, _e20: null, _e50: null,
    _macdState:  makeMACDState(),  _bbState:    makeBBState(),
    _atrState:   makeATRState(),   _stState:    makeSuperTrendState(),
    _adxState:   makeADXState(),   _obvState:   makeOBVState(),
    _willRState: makeWillRState(), _cciState:   makeCCIState(),
    _psarState:  makePsarState(),  _vwapState:  makeVWAPState(),
    _cvdState:   makeCVDState(),
  };
}

const defaultCalc: CalcSlice = {
  activeTab: 'chart', currentDir: 'long', rrRatio: 2,
  entryPrice: '', stopPrice: '', sizeUsd: '100', tokens: '',
  leverage: 10, feeType: 'maker',
  capital: '200', goalPct: '10', margin: '20',
};

const defaultJournal: JournalSlice = { trades: [] };

const defaultSettings: SettingsSlice = {
  theme: 'dark', defaultSym: 'BTCUSDT', defaultTf: '5m',
  defaultLeverage: 10, defaultFeeType: 'maker',
  defaultCapital: 200, defaultRR: 2,
  activeIndicators: defaultActiveIndicators,
  indicatorParams:  defaultIndicatorParams,
  chartDrawings:    [],
  atrTrailMult:     2.5,
  soundEnabled:     true,
  notifEnabled:     false,
};

const defaultStrategy: StrategySlice = {
  strategies: [], activeStrategyId: 'preset-3ema', strategySignal: null,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function computeAtrTrail(livePrice: number, suggestion: Suggestion | null, atrVals: (number | null)[], mult: number): number | null {
  if (!suggestion || !livePrice) return null;
  const atr = (atrVals.filter(v => v != null) as number[]).slice(-1)[0];
  if (!atr) return null;
  return suggestion.dir === 'long' ? livePrice - atr * mult : livePrice + atr * mult;
}

function fireNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
  else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' }); });
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result.map(s => s.replace(/^"|"$/g, ''));
}

export function playAlertSound(type: 'alert' | 'crossover' = 'alert') {
  if (typeof window === 'undefined') return;
  try {
    const ctx  = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'crossover') {
      osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime); osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); osc.frequency.setValueAtTime(660, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.22, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    }
    osc.onended = () => ctx.close();
  } catch { /* no AudioContext */ }
}

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ─────────────────────────────────────────────────────────────────────────────
//  Store
// ─────────────────────────────────────────────────────────────────────────────
export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...makeDefaultChartSlice(),
      ...defaultCalc,
      ...defaultJournal,
      ...defaultSettings,
      ...defaultStrategy,

      setChartDrawings: (d) => set({ chartDrawings: d }),
      setSym: (sym) => set({ sym }),
      setTf:  (tf)  => set({ tf }),

      resetChartState: () => set(s => ({
        ...makeDefaultChartSlice(),
        sym: s.sym, tf: s.tf,
        paperAccount: s.paperAccount, // preserve paper account
      })),

      addCandleToState: (c) => {
        const s = get(), p = s.indicatorParams, prev = s.candles[s.candles.length - 1] ?? null;

        const prevE9 = s._e9;
        const newE9  = updEMA(s._e9,  c.c, emaK(p.ema9Period));
        const newE20 = updEMA(s._e20, c.c, emaK(p.ema20Period));
        const newE50 = updEMA(s._e50, c.c, emaK(p.ema50Period));

        const rsiState  = { ...s._rsiState };
        const rsiVal    = calcWilderRSI(c.c, s._prevClose, rsiState, p.rsiPeriod);
        const macdState = { ...s._macdState };
        const { macdLine, signalLine: macdSig, histogram: macdH } = calcMACD(c.c, macdState, p.macdFast, p.macdSlow, p.macdSignal);
        const bbState   = { closes: [...s._bbState.closes] };
        const { upper: bbU, middle: bbM, lower: bbL, width: bbW, pct: bbP } = calcBB(c.c, bbState, p.bbPeriod, p.bbStdDev);
        const atrState  = { prevClose: s._atrState.prevClose, atr: s._atrState.atr, seed: [...s._atrState.seed] };
        const atrVal    = calcATR(c, atrState, p.atrPeriod);
        const stState: SuperTrendState = { atrState: { prevClose: s._stState.atrState.prevClose, atr: s._stState.atrState.atr, seed: [...s._stState.atrState.seed] }, upperBand: s._stState.upperBand, lowerBand: s._stState.lowerBand, superTrend: s._stState.superTrend, direction: s._stState.direction };
        const { value: stVal, bull: stB } = calcSuperTrend(c, stState, p.stPeriod, p.stMultiplier);
        const adxState: ADXState = { prevHigh: s._adxState.prevHigh, prevLow: s._adxState.prevLow, prevClose: s._adxState.prevClose, atr: { ...s._adxState.atr, seed: [...s._adxState.atr.seed] }, plusDM: s._adxState.plusDM, minusDM: s._adxState.minusDM, adx: s._adxState.adx, seedTR: [...s._adxState.seedTR], seedPlus: [...s._adxState.seedPlus], seedMinus: [...s._adxState.seedMinus], seedDX: [...s._adxState.seedDX] };
        const { adx: adxVal, plusDI: pDI, minusDI: mDI } = calcADX(c, adxState, p.adxPeriod);
        const obvState   = { ...s._obvState };   const obvVal     = calcOBV(c, obvState);
        const willRState = { highs: [...s._willRState.highs], lows: [...s._willRState.lows] }; const willRVal = calcWilliamsR(c, willRState, p.williamsRPeriod);
        const cciState   = { typicals: [...s._cciState.typicals] }; const cciVal = calcCCI(c, cciState, p.cciPeriod);
        const psarState  = { ...s._psarState }; const { value: psarVal, bull: psarB } = calcPSAR(c, psarState, p.psarStep, p.psarMax);
        const vwapState  = { ...s._vwapState }; const { vwap: vwapV, upper1: vu1, lower1: vl1, upper2: vu2, lower2: vl2 } = calcVWAP(c, vwapState);
        const cvdState   = { ...s._cvdState };  const { barDelta, cumDelta } = calcCVD(c, cvdState);
        const candlePatterns = detectPatterns(c, prev);

        let newCrossovers = [...s.crossovers];
        if (prevE9 !== null && s._e20 !== null) {
          const bull = prevE9 <= s._e20 && newE9 > newE20;
          const bear = prevE9 >= s._e20 && newE9 < newE20;
          if (bull || bear) {
            newCrossovers.push({ type: bull ? 'bull' : 'bear', price: c.c, idx: s.candles.length, time: Date.now() });
            if (newCrossovers.length > 8) newCrossovers.shift();
            if (s.soundEnabled) playAlertSound('crossover');
          }
        }

        const push = <T>(arr: T[], val: T) => [...arr, val];
        let nC   = push(s.candles, c),           nE9  = push(s.e9s, newE9),          nE20 = push(s.e20s, newE20),       nE50 = push(s.e50s, newE50);
        let nR   = push(s.rsiVals, rsiVal),       nML  = push(s.macdLine, macdLine),  nMS  = push(s.macdSignal, macdSig), nMH = push(s.macdHist, macdH);
        let nBU  = push(s.bbUpper, bbU),          nBM  = push(s.bbMiddle, bbM),       nBL  = push(s.bbLower, bbL),       nBW = push(s.bbWidth, bbW), nBP = push(s.bbPct, bbP);
        let nA   = push(s.atrVals, atrVal),       nSV  = push(s.stVals, stVal),       nSB  = push(s.stBull, stB);
        let nAD  = push(s.adxVals, adxVal),       nPD  = push(s.plusDI, pDI),         nMD  = push(s.minusDI, mDI);
        let nOB  = push(s.obvVals, obvVal),        nWR  = push(s.willRVals, willRVal);
        let nCCI = push(s.cciVals, cciVal);
        let nPV  = push(s.psarVals, psarVal),     nPB  = push(s.psarBull, psarB);
        let nVW  = push(s.vwapVals, vwapV),       nVU1 = push(s.vwapUpper1, vu1),    nVL1 = push(s.vwapLower1, vl1),    nVU2 = push(s.vwapUpper2, vu2), nVL2 = push(s.vwapLower2, vl2);
        let nCB  = push(s.cvdBarDeltas, barDelta), nCvdCumDeltas = push(s.cvdCumDeltas, cumDelta);
        let nPat = push(s.patterns, candlePatterns);

        const srPeriod  = p.stochRsiPeriod;
        const stochKRaw = nR.map((_, i) => {
          const win = nR.slice(Math.max(0, i - srPeriod + 1), i + 1).filter(v => v !== null) as number[];
          if (win.length < srPeriod) return null;
          const lo = Math.min(...win), hi = Math.max(...win), cur = nR[i] as number;
          return hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100;
        });
        const smoothK = stochKRaw.map((_, i) => {
          const w = stochKRaw.slice(Math.max(0, i - 2), i + 1).filter(v => v !== null) as number[];
          return w.length === 3 ? w.reduce((a, b) => a + b, 0) / 3 : null;
        });
        const smoothD = smoothK.map((_, i) => {
          const w = smoothK.slice(Math.max(0, i - 2), i + 1).filter(v => v !== null) as number[];
          return w.length === 3 ? w.reduce((a, b) => a + b, 0) / 3 : null;
        });
        let nSK = [...s.stochRsiK, smoothK[smoothK.length - 1] ?? null];
        let nSD = [...s.stochRsiD, smoothD[smoothD.length - 1] ?? null];

        if (nC.length > 200) {
          nC.shift();  nE9.shift(); nE20.shift(); nE50.shift();
          nR.shift();  nML.shift(); nMS.shift();  nMH.shift();
          nBU.shift(); nBM.shift(); nBL.shift();  nBW.shift(); nBP.shift();
          nA.shift();  nSV.shift(); nSB.shift();
          nAD.shift(); nPD.shift(); nMD.shift();
          nOB.shift(); nWR.shift(); nCCI.shift();   
          nPV.shift(); nPB.shift();
          nVW.shift(); nVU1.shift(); nVL1.shift(); nVU2.shift(); nVL2.shift();
          nCB.shift(); nCvdCumDeltas.shift();        
          nPat.shift(); nSK.shift(); nSD.shift();
          newCrossovers = newCrossovers.map(x=>({...x,idx:x.idx-1})).filter(x=>x.idx>=0);
        }

        set({
          candles:nC, e9s:nE9, e20s:nE20, e50s:nE50, e9:newE9, e20:newE20, e50:newE50,
          rsiVals:nR, stochRsiK:nSK, stochRsiD:nSD,
          macdLine:nML, macdSignal:nMS, macdHist:nMH,
          bbUpper:nBU, bbMiddle:nBM, bbLower:nBL, bbWidth:nBW, bbPct:nBP,
          atrVals:nA, stVals:nSV, stBull:nSB,
          adxVals:nAD, plusDI:nPD, minusDI:nMD,
          obvVals:nOB, willRVals:nWR, cciVals:nCCI,       
          psarVals:nPV, psarBull:nPB,
          vwapVals:nVW, vwapUpper1:nVU1, vwapLower1:nVL1, vwapUpper2:nVU2, vwapLower2:nVL2,
          cvdBarDeltas:nCB, cvdCumDeltas:nCvdCumDeltas,   
          patterns:nPat, crossovers:newCrossovers,
          _e9:newE9, _e20:newE20, _e50:newE50,
          _prevClose:c.c, _rsiState:rsiState, _macdState:macdState, _bbState:bbState,
          _atrState:atrState, _stState:stState, _adxState:adxState, _obvState:obvState,
          _willRState:willRState, _cciState:cciState, _psarState:psarState,
          _vwapState:vwapState, _cvdState:cvdState,
        });
      },

      setCurrentCandle: (c) => { if (!c) return set({ currentCandle: null }); set({ currentCandle: c }); },

      setLivePrice: (price, _apiName) => {
        const s = get(), tf = s.tf, prev = s.livePrice, cur = s.currentCandle, now = Date.now();
        if (!cur) {
          set({ currentCandle: { o:price,h:price,l:price,c:price,v:500,t:now }, lastCandleTime:now, livePrice:price, prevLivePrice:prev });
        } else {
          set({ currentCandle: { ...cur,c:price,h:Math.max(cur.h,price),l:Math.min(cur.l,price),v:cur.v+50+Math.random()*200 }, livePrice:price, prevLivePrice:prev });
        }
        const interval = {'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[tf]??300000;
        if (now - get().lastCandleTime >= interval) {
          const fin = get().currentCandle;
          if (fin) get().addCandleToState({...fin});
          set({ currentCandle:{o:price,h:price,l:price,c:price,v:500,t:now}, lastCandleTime:now });
        }
        // Price alerts
        const alerts = get().priceAlerts;
        if (alerts.length) {
          const sym = get().sym;
          const upd = alerts.map(a => {
            if (a.triggered || a.sym !== sym) return a;
            const hit = a.dir==='above'?price>=a.price:price<=a.price;
            if (hit) { if(get().soundEnabled) playAlertSound('alert'); if(get().notifEnabled) fireNotification(`🔔 ${a.sym}`,`${a.label||a.dir} ${a.price} hit`); return {...a,triggered:true}; }
            return a;
          });
          if (upd.some((a,i)=>a.triggered!==alerts[i].triggered)) set({ priceAlerts:upd });
        }
        // ATR trail ratchet
        const st = get();
        if (st.atrTrailActive) {
          const newTrail = computeAtrTrail(price, st.suggestion, st.atrVals, st.atrTrailMult);
          if (newTrail !== null) {
            const p2 = st.trailingStopPrice, dir = st.suggestion?.dir??'long';
            set({ trailingStopPrice: p2===null?newTrail:dir==='long'?Math.max(p2,newTrail):Math.min(p2,newTrail) });
          }
        }
        get().refreshSuggestion();
      },

      setConnStatus: (connStatus, connLabel) => set({ connStatus, connLabel }),

      refreshSuggestion: () => {
        const s = get();
        if (!s.e9||!s.e20||!s.e50||s.candles.length<20) return;
        const rsi = (s.rsiVals.filter(v=>v!==null) as number[]).slice(-1)[0]??50;
        const sug = computeSuggestion(s.e9,s.e20,s.e50,s.livePrice,rsi,s.candles,s.rrRatio);
        const fibo = calcAutoFibo(s.candles,50);
        const lastAtr = s.atrVals.length?s.atrVals[s.atrVals.length-1]:null;
        const { bonus } = fiboEntryScore(s.livePrice,fibo,lastAtr);
        const q = scoreEntryQuality(sug.dir,rsi,s.e9,s.e20,s.e50,s.livePrice,s.crossovers,bonus);
        set({ suggestion:sug, entryQuality:q });
        get().evalActiveStrategy();
      },

      toggleIndicator:      (key)        => set(s => ({ activeIndicators: { ...s.activeIndicators, [key]: !s.activeIndicators[key] } })),
      setIndicatorParam:    (key, value) => set(s => ({ indicatorParams:  { ...s.indicatorParams,  [key]: value } })),
      resetIndicatorParams: ()           => set({ indicatorParams: defaultIndicatorParams }),

      setActiveTab:   (activeTab)   => set({ activeTab }),
      setCurrentDir:  (currentDir)  => set({ currentDir }),
      setRrRatio:     (rrRatio)     => set({ rrRatio }),
      setEntryPrice:  (entryPrice)  => set({ entryPrice }),
      setStopPrice:   (stopPrice)   => set({ stopPrice }),
      setSizeUsd:     (sizeUsd)     => set({ sizeUsd }),
      setTokens:      (tokens)      => set({ tokens }),
      setLeverage:    (leverage)    => set({ leverage }),
      setFeeType:     (feeType)     => set({ feeType }),
      setCapital:     (capital)     => set({ capital }),
      setGoalPct:     (goalPct)     => set({ goalPct }),
      setMargin:      (margin)      => set({ margin }),
      applySuggestionToCalc: () => { const { suggestion } = get(); if (!suggestion) return; const d=suggestion.entry>100?2:4; set({ activeTab:'calc',currentDir:suggestion.dir,entryPrice:suggestion.entry.toFixed(d),stopPrice:suggestion.stop.toFixed(d) }); },

      addTrade: (t) => {
        const id    = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const trade: TradeJournalEntry = {
          ...t,
          id,
          tags:          t.tags          ?? [],
          screenshotUrl: t.screenshotUrl ?? '',
        };
        set(s => ({ trades: [...s.trades, trade] }));
        idbPutTrade(trade).catch(console.error);
      },
    
      updateTrade: (id, updates) => {
        set(s => {
          const trades = s.trades.map(t => t.id === id ? { ...t, ...updates } : t);
          const updated = trades.find(t => t.id === id);
          if (updated) idbPutTrade(updated).catch(console.error);
          return { trades };
        });
      },
    
      deleteTrade: (id) => {
        set(s => ({ trades: s.trades.filter(t => t.id !== id) }));
        idbDeleteTrade(id).catch(console.error);
      },

      hydrateTradesFromIdb: async () => {
        try {
          const trades = await idbGetAllTrades();
          if (trades && trades.length > 0) {
            set({ trades });
          }
        } catch (e) {
          console.error('hydrateTradesFromIdb failed:', e);
        }
      },

      importTradesCsv: async (csv, mode) => {
        const lines  = csv.trim().split('\n');
        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        let count = 0, errors = 0;
   
        const parsed: TradeJournalEntry[] = [];
        for (let i = 1; i < lines.length; i++) {
          try {
            const cols = splitCsvLine(lines[i]);
            const row: Record<string, string> = {};
            header.forEach((h, j) => { row[h] = cols[j] ?? ''; });
            parsed.push({
              id:            row['id']            || Date.now().toString(36) + i,
              date:          row['date']          || new Date().toISOString().slice(0,10),
              symbol:        row['symbol']        || 'UNKNOWN',
              dir:           (row['dir'] === 'short' ? 'short' : 'long'),
              entry:         parseFloat(row['entry'])   || 0,
              stop:          parseFloat(row['stop'])    || 0,
              target:        parseFloat(row['target'])  || 0,
              outcome:       (['win','loss','be','open'].includes(row['outcome']) ? row['outcome'] : 'open') as 'win'|'loss'|'be'|'open',
              pnl:           parseFloat(row['pnl'])     || 0,
              notes:         row['notes']         || '',
              tags:          row['tags']          ? row['tags'].split(';').filter(Boolean) : [],
              screenshotUrl: row['screenshotUrl'] || '',
            });
            count++;
          } catch { errors++; }
        }
   
        if (mode === 'replace') {
          set({ trades: parsed });
          await idbReplaceTrades(parsed);
        } else {
          set(s => {
            const existing = new Set(s.trades.map(t => t.id));
            const toAdd    = parsed.filter(t => !existing.has(t.id));
            return { trades: [...s.trades, ...toAdd] };
          });
          await Promise.all(parsed.map(t => idbPutTrade(t)));
        }
        return { count, errors };
      },
   
      exportTradesCsv: () => {
        const trades = get().trades;
        const headers = ['id','date','symbol','dir','entry','stop','target','outcome','pnl','notes','tags','screenshotUrl'];
        const rows = trades.map(t => [
          t.id, t.date, t.symbol, t.dir,
          t.entry.toFixed(4), t.stop.toFixed(4), t.target.toFixed(4),
          t.outcome, t.pnl.toFixed(2),
          `"${(t.notes || '').replace(/"/g, '""')}"`,
          `"${(t.tags || []).join(';')}"`,
          `"${t.screenshotUrl || ''}"`,
        ]);
        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      },

      setSettings: (patch) => set(patch),

      addStrategy:    (s)         => set(st => ({ strategies: [...st.strategies, s] })),
      updateStrategy: (id, patch) => set(st => ({ strategies: st.strategies.map(s=>s.id===id?{...s,...patch}:s) })),
      deleteStrategy: (id)        => set(st => ({ strategies:st.strategies.filter(s=>s.id!==id), activeStrategyId:st.activeStrategyId===id?'preset-3ema':st.activeStrategyId, strategySignal:st.activeStrategyId===id?null:st.strategySignal })),
      setActiveStrategy: (id)     => set({ activeStrategyId:id, strategySignal:null }),
      evalActiveStrategy: () => {
        const st = get();
        const { activeStrategyId, strategies, livePrice, candles, capital } = st;
        if (!activeStrategyId||!livePrice||candles.length<10) return;
        const strat = [...PRESET_STRATEGIES,...strategies].find(s=>s.id===activeStrategyId);
        if (!strat) return;
        const snap=buildSnapshot(st), recent=candles.slice(-20);
        set({ strategySignal: evaluateStrategy(strat,snap,parseFloat(capital)||200,Math.min(...recent.map(c=>c.l)),Math.max(...recent.map(c=>c.h))) });
      },
      exportStrategy: (id) => {
        const strat = [...PRESET_STRATEGIES,...get().strategies].find(st=>st.id===id);
        if (!strat) return;
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(strat,null,2)],{type:'application/json'})); a.download=`strategy_${strat.name.replace(/\s+/g,'_')}.json`; a.click();
      },
      importStrategy: (json) => {
        try {
          const p = JSON.parse(json);
          if (!p?.name) return { ok:false, error:'Missing name' };
          if (!p.longEntry&&!p.shortEntry) return { ok:false, error:'No entry conditions' };
          set(s => ({ strategies:[...s.strategies,{...p,id:makeId(),createdAt:Date.now(),updatedAt:Date.now(),enabled:p.enabled??true}] }));
          return { ok:true };
        } catch(e) { return { ok:false, error:`${e}` }; }
      },
      duplicateStrategy: (id) => {
        const orig = [...PRESET_STRATEGIES,...get().strategies].find(st=>st.id===id);
        if (!orig) return;
        set(s => ({ strategies:[...s.strategies,{...JSON.parse(JSON.stringify(orig)),id:makeId(),name:orig.name+' (copy)',createdAt:Date.now(),updatedAt:Date.now(),enabled:false}] }));
      },
      toggleStrategyEnabled: (id) => set(s => ({ strategies:s.strategies.map(st=>st.id===id?{...st,enabled:!st.enabled,updatedAt:Date.now()}:st) })),

      setPartialTPs: (tps) => set({ partialTPs:tps }),
      toggleTPHit:   (idx) => set(s => ({ partialTPs:s.partialTPs.map((t,i)=>i===idx?{...t,hit:!t.hit}:t) })),
      setAtrTrailMult:   (v) => set({ atrTrailMult:v, trailingStopPrice:null }),
      setAtrTrailActive: (v) => { set({ atrTrailActive:v }); if(!v) set({ trailingStopPrice:null }); },

      addSessionTrade: (t) => set(s => { const trade:SessionTrade={...t,id:makeId(),time:Date.now()}; const trades=[...s.sessionTrades,trade]; return { sessionTrades:trades, sessionPnL:trades.reduce((a,x)=>a+x.pnl,0) }; }),
      clearSessionTrades: () => set({ sessionTrades:[],sessionPnL:0,dailyLossBannerDismissed:false }),
      setMaxDailyLossUsd:          (v) => set({ maxDailyLossUsd:v }),
      setDailyLossBannerDismissed: (v) => set({ dailyLossBannerDismissed:v }),

      addPriceAlert: (a) => { if(typeof window!=='undefined'&&Notification.permission==='default') Notification.requestPermission(); set(s=>({priceAlerts:[...s.priceAlerts,{...a,id:makeId(),triggered:false,createdAt:Date.now()}]})); },
      removePriceAlert:     (id) => set(s => ({ priceAlerts:s.priceAlerts.filter(a=>a.id!==id) })),
      clearTriggeredAlerts: ()   => set(s => ({ priceAlerts:s.priceAlerts.filter(a=>!a.triggered) })),

      setSoundEnabled: (v) => set({ soundEnabled:v }),
      setNotifEnabled: (v) => set({ notifEnabled:v }),
      setBacktestResult:  (r) => set({ backtestResult:r }),
      setBacktestRunning: (v) => set({ backtestRunning:v }),

      // ── Paper trading ─────────────────────────────────────────────────────
      openPaperPos: (pos) => set(s => ({
        paperAccount: { ...s.paperAccount, openPositions:[...s.paperAccount.openPositions,pos] },
      })),

      closePaperPos: (id, price, reason) => set(s => {
        const pos = s.paperAccount.openPositions.find(p=>p.id===id);
        if (!pos) return s;
        const units=pos.size/pos.entryPrice, isLong=pos.dir==='long';
        const hitPct=pos.tpLevels.filter(t=>t.hit).reduce((acc,t)=>acc+t.sizePercent,0);
        const remainUnits=units*((100-hitPct)/100);
        const closePnl=isLong?(price-pos.entryPrice)*remainUnits:(pos.entryPrice-price)*remainUnits;
        const totalPnl=pos.realised+closePnl, isWin=totalPnl>0;
        const closed:PaperPosition={...pos,status:reason,closedAt:Date.now(),closePrice:price,realised:totalPnl};
        const acc=s.paperAccount;
        return { paperAccount:{ ...acc, balance:acc.balance+totalPnl, totalPnl:acc.totalPnl+totalPnl, winCount:isWin?acc.winCount+1:acc.winCount, lossCount:!isWin?acc.lossCount+1:acc.lossCount, openPositions:acc.openPositions.filter(p=>p.id!==id), closedPositions:[closed,...acc.closedPositions].slice(0,100) } };
      }),

      tickPaperPositions: (price, atr) => {
        const s = get();
        const acc = s.paperAccount;
        if (!acc.openPositions.length) return;
        let balDelta = 0, wins = 0, losses = 0;
        const stillOpen: PaperPosition[] = [], newClosed: PaperPosition[] = [];
        for (const pos of acc.openPositions) {
          const r = tickPosition(pos, price, atr);
          balDelta += r.pnlDelta;
          if (r.closed) { r.position.realised > 0 ? wins++ : losses++; newClosed.push(r.position); }
          else stillOpen.push(r.position);
        }
        // Auto-journal closed positions before updating store state.
        for (const closed of newClosed) {
          const riskPerUnit = Math.abs(closed.entryPrice - closed.initialStop);
          const units = closed.size / closed.entryPrice;
          get().addTrade({
            date:    new Date().toISOString().slice(0, 10),
            symbol:  closed.sym,
            dir:     closed.dir,
            entry:   closed.entryPrice,
            stop:    closed.initialStop,
            target:  closed.tpLevels[0]?.price ?? closed.closePrice ?? closed.entryPrice,
            outcome: closed.realised > 0 ? 'win' : closed.realised < 0 ? 'loss' : 'be',
            pnl:     closed.realised,
            notes:   `[Paper] ${closed.strategyName} · ${(closed.realised / (riskPerUnit * units)).toFixed(2)}R`,
            tags:          [],
            screenshotUrl: '',
          });
        }
        if (balDelta === 0 && newClosed.length === 0) return;
        set({
          paperAccount: {
            ...acc,
            balance:          acc.balance + balDelta,
            totalPnl:         acc.totalPnl + balDelta,
            winCount:         acc.winCount + wins,
            lossCount:        acc.lossCount + losses,
            openPositions:    stillOpen,
            closedPositions:  [...newClosed, ...acc.closedPositions].slice(0, 100),
          },
        });
      },

      resetPaperAccount: (startBalance) => {
        const bal=startBalance??get().paperAccount.startBalance;
        set({ paperAccount:{ ...defaultPaperAccount, balance:bal, startBalance:bal } });
      },

      updatePaperNote: (id, note) => set(s => ({
        paperAccount:{ ...s.paperAccount, openPositions:s.paperAccount.openPositions.map(p=>p.id===id?{...p,notes:note}:p) },
      })),
    }),
    {
      name: 'trading_assistant',
      partialize: (s) => ({
        trades:s.trades, theme:s.theme, defaultSym:s.defaultSym, defaultTf:s.defaultTf,
        defaultLeverage:s.defaultLeverage, defaultFeeType:s.defaultFeeType,
        defaultCapital:s.defaultCapital, defaultRR:s.defaultRR,
        capital:s.capital, margin:s.margin, goalPct:s.goalPct,
        leverage:s.leverage, feeType:s.feeType, rrRatio:s.rrRatio,
        activeIndicators:s.activeIndicators, indicatorParams:s.indicatorParams,
        strategies:s.strategies, activeStrategyId:s.activeStrategyId,
        chartDrawings:s.chartDrawings, atrTrailMult:s.atrTrailMult,
        maxDailyLossUsd:s.maxDailyLossUsd, soundEnabled:s.soundEnabled, notifEnabled:s.notifEnabled,
        priceAlerts:s.priceAlerts.filter(a=>!a.triggered),
        paperAccount:{ ...s.paperAccount, openPositions:[] },
      }),
    },
  ),
);