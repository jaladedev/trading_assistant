import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Strategy, StrategySignal } from './strategy';
import { PRESET_STRATEGIES, evaluateStrategy, buildSnapshot } from './strategy';

import type { Candle, CrossoverEvent, RSIState, VWAPState, CVDState, MACDState, BBState, ATRState, SuperTrendState, ADXState, OBVState, WillRState, CCIState, PsarState, PatternResult } from './indicators';
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


// ──────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────
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
  id:      string;
  date:    string;
  symbol:  string;
  dir:     'long' | 'short';
  entry:   number;
  stop:    number;
  target:  number;
  outcome: 'win' | 'loss' | 'be' | 'open';
  pnl:     number;
  notes:   string;
}

export interface ActiveIndicators {
  ema9:        boolean;
  ema20:       boolean;
  ema50:       boolean;
  vwap:        boolean;
  vwapBands:   boolean;
  bb:          boolean;
  superTrend:  boolean;
  psar:        boolean;
  macd:        boolean;
  rsi:         boolean;
  stochRsi:    boolean;
  adx:         boolean;
  obv:         boolean;
  williamsR:   boolean;
  cci:         boolean;
  volume:      boolean;
  cvd:         boolean;
  patterns:    boolean;
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

// ──────────────────────────────────────────────────────────
//  Slices
// ──────────────────────────────────────────────────────────
interface StrategySlice {
  strategies:       Strategy[];
  activeStrategyId: string | null;
  strategySignal:   StrategySignal | null;
}

interface ChartSlice {
  sym:           string;
  tf:            string;
  candles:       Candle[];
  e9s:           (number | null)[];
  e20s:          (number | null)[];
  e50s:          (number | null)[];
  e9:            number | null;
  e20:           number | null;
  e50:           number | null;
  rsiVals:       (number | null)[];
  stochRsiK:     (number | null)[];
  stochRsiD:     (number | null)[];
  macdLine:      (number | null)[];
  macdSignal:    (number | null)[];
  macdHist:      (number | null)[];
  bbUpper:       (number | null)[];
  bbMiddle:      (number | null)[];
  bbLower:       (number | null)[];
  bbWidth:       (number | null)[];
  bbPct:         (number | null)[];
  atrVals:       (number | null)[];
  stVals:        (number | null)[];
  stBull:        boolean[];
  adxVals:       (number | null)[];
  plusDI:        (number | null)[];
  minusDI:       (number | null)[];
  obvVals:       number[];
  willRVals:     (number | null)[];
  cciVals:       (number | null)[];
  psarVals:      (number | null)[];
  psarBull:      boolean[];
  vwapVals:      (number | null)[];
  vwapUpper1:    (number | null)[];
  vwapLower1:    (number | null)[];
  vwapUpper2:    (number | null)[];
  vwapLower2:    (number | null)[];
  cvdBarDeltas:  number[];
  cvdCumDeltas:  number[];
  patterns:      PatternResult[][];
  crossovers:    CrossoverEvent[];
  livePrice:     number;
  prevLivePrice: number;
  openPrice:     number;
  currentCandle: Candle | null;
  lastCandleTime: number;
  connStatus:    ConnStatus;
  connLabel:     string;
  suggestion:    Suggestion | null;
  entryQuality:  EntryQuality | null;
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
  activeTab:   'chart' | 'calc' | 'journal';
  currentDir:  'long' | 'short';
  rrRatio:     number;
  entryPrice:  string;
  stopPrice:   string;
  sizeUsd:     string;
  tokens:      string;
  leverage:    number;
  feeType:     'maker' | 'taker';
  capital:     string;
  goalPct:     string;
  margin:      string;
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
}

// ──────────────────────────────────────────────────────────
//  Actions
// ──────────────────────────────────────────────────────────
interface Actions {
  // Chart
  setSym:               (sym: string) => void;
  setTf:                (tf: string) => void;
  resetChartState:      () => void;
  addCandleToState:     (c: Candle) => void;
  setCurrentCandle:     (c: Candle | null) => void;
  setLivePrice:         (price: number, apiName: string) => void;
  setConnStatus:        (status: ConnStatus, label: string) => void;
  refreshSuggestion:    () => void;
  // Indicators
  toggleIndicator:      (key: keyof ActiveIndicators) => void;
  setIndicatorParam:    (key: keyof IndicatorParams, value: number) => void;
  resetIndicatorParams: () => void;
  // Calculator
  setActiveTab:         (tab: 'chart' | 'calc' | 'journal') => void;
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
  applySuggestionToCalc: () => void;
  // Journal
  addTrade:             (t: Omit<TradeJournalEntry, 'id'>) => void;
  updateTrade:          (id: string, updates: Partial<TradeJournalEntry>) => void;
  deleteTrade:          (id: string) => void;
  // Settings
  setSettings:          (s: Partial<SettingsSlice>) => void;
  // Strategy
  addStrategy:          (s: Strategy) => void;
  updateStrategy:       (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy:       (id: string) => void;
  setActiveStrategy:    (id: string | null) => void;
  evalActiveStrategy:   () => void;
}

type StoreState = ChartSlice & CalcSlice & JournalSlice & SettingsSlice & StrategySlice & Actions;

// ──────────────────────────────────────────────────────────
//  Defaults
// ──────────────────────────────────────────────────────────
const defaultActiveIndicators: ActiveIndicators = {
  ema9: true, ema20: true, ema50: true,
  vwap: true, vwapBands: false,
  bb: false, superTrend: false, psar: false,
  macd: false, rsi: true, stochRsi: false,
  adx: false, obv: false, williamsR: false, cci: false,
  volume: true, cvd: true, patterns: true,
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
    _rsiState:  makeRSIState(), _prevClose: null,
    _e9: null, _e20: null, _e50: null,
    _macdState:  makeMACDState(),
    _bbState:    makeBBState(),
    _atrState:   makeATRState(),
    _stState:    makeSuperTrendState(),
    _adxState:   makeADXState(),
    _obvState:   makeOBVState(),
    _willRState: makeWillRState(),
    _cciState:   makeCCIState(),
    _psarState:  makePsarState(),
    _vwapState:  makeVWAPState(),
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
};

const defaultStrategy: StrategySlice = {
  strategies:       [],
  activeStrategyId: 'preset-3ema',
  strategySignal:   null,
};

// ──────────────────────────────────────────────────────────
//  Store
// ──────────────────────────────────────────────────────────
export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...makeDefaultChartSlice(),
      ...defaultCalc,
      ...defaultJournal,
      ...defaultSettings,
      ...defaultStrategy,

      // ── Chart ──────────────────────────────────────────
      setSym: (sym) => set({ sym }),
      setTf:  (tf)  => set({ tf }),

      resetChartState: () => set(s => ({
        ...makeDefaultChartSlice(),
        sym: s.sym,
        tf:  s.tf,
      })),

      addCandleToState: (c) => {
        const s  = get();
        const p  = s.indicatorParams;
        const prev = s.candles[s.candles.length - 1] ?? null;

        // EMA
        const prevE9  = s._e9;
        const prevE20 = s._e20;
        const newE9   = updEMA(s._e9,  c.c, emaK(p.ema9Period));
        const newE20  = updEMA(s._e20, c.c, emaK(p.ema20Period));
        const newE50  = updEMA(s._e50, c.c, emaK(p.ema50Period));

        // RSI
        const rsiState = { ...s._rsiState };
        const rsiVal   = calcWilderRSI(c.c, s._prevClose, rsiState, p.rsiPeriod);

        // MACD
        const macdState = { ...s._macdState };
        const { macdLine, signalLine: macdSig, histogram: macdH } = calcMACD(
          c.c, macdState, p.macdFast, p.macdSlow, p.macdSignal
        );

        // Bollinger Bands
        const bbState = { closes: [...s._bbState.closes] };
        const { upper: bbU, middle: bbM, lower: bbL, width: bbW, pct: bbP } = calcBB(
          c.c, bbState, p.bbPeriod, p.bbStdDev
        );

        // ATR
        const atrState = {
          prevClose: s._atrState.prevClose,
          atr:       s._atrState.atr,
          seed:      [...s._atrState.seed],
        };
        const atrVal = calcATR(c, atrState, p.atrPeriod);

        // SuperTrend
        const stState: SuperTrendState = {
          atrState:  { prevClose: s._stState.atrState.prevClose, atr: s._stState.atrState.atr, seed: [...s._stState.atrState.seed] },
          upperBand: s._stState.upperBand,
          lowerBand: s._stState.lowerBand,
          superTrend: s._stState.superTrend,
          direction:  s._stState.direction,
        };
        const { value: stVal, bull: stB } = calcSuperTrend(c, stState, p.stPeriod, p.stMultiplier);

        // ADX
        const adxState: ADXState = {
          prevHigh:  s._adxState.prevHigh,
          prevLow:   s._adxState.prevLow,
          prevClose: s._adxState.prevClose,
          atr:       { ...s._adxState.atr, seed: [...s._adxState.atr.seed] },
          plusDM:    s._adxState.plusDM,
          minusDM:   s._adxState.minusDM,
          adx:       s._adxState.adx,
          seedTR:    [...s._adxState.seedTR],
          seedPlus:  [...s._adxState.seedPlus],
          seedMinus: [...s._adxState.seedMinus],
          seedDX:    [...s._adxState.seedDX],
        };
        const { adx: adxVal, plusDI: pDI, minusDI: mDI } = calcADX(c, adxState, p.adxPeriod);

        // OBV
        const obvState = { ...s._obvState };
        const obvVal   = calcOBV(c, obvState);

        // Williams %R
        const willRState = { highs: [...s._willRState.highs], lows: [...s._willRState.lows] };
        const willRVal   = calcWilliamsR(c, willRState, p.williamsRPeriod);

        // CCI
        const cciState = { typicals: [...s._cciState.typicals] };
        const cciVal   = calcCCI(c, cciState, p.cciPeriod);

        // PSAR
        const psarState = { ...s._psarState };
        const { value: psarVal, bull: psarB } = calcPSAR(c, psarState, p.psarStep, p.psarMax);

        // VWAP
        const vwapState = { ...s._vwapState };
        const { vwap: vwapV, upper1: vu1, lower1: vl1, upper2: vu2, lower2: vl2 } = calcVWAP(c, vwapState);

        // CVD
        const cvdState = { ...s._cvdState };
        const { barDelta, cumDelta } = calcCVD(c, cvdState);

        // Patterns
        const candlePatterns = detectPatterns(c, prev);

        // Crossovers
        let newCrossovers = [...s.crossovers];
        if (prevE9 !== null && prevE20 !== null) {
          const bull = prevE9 <= (s._e20 ?? 0) && newE9 > newE20;
          const bear = prevE9 >= (s._e20 ?? 0) && newE9 < newE20;
          if (bull || bear) {
            newCrossovers.push({ type: bull ? 'bull' : 'bear', price: c.c, idx: s.candles.length, time: Date.now() });
            if (newCrossovers.length > 8) newCrossovers.shift();
          }
        }

        // Append series
        const push = <T>(arr: T[], val: T) => [...arr, val];
        let newCandles    = push(s.candles,       c);
        let newE9s        = push(s.e9s,           newE9);
        let newE20s       = push(s.e20s,          newE20);
        let newE50s       = push(s.e50s,          newE50);
        let newRsi        = push(s.rsiVals,       rsiVal);
        let newMacdLine   = push(s.macdLine,      macdLine);
        let newMacdSig    = push(s.macdSignal,    macdSig);
        let newMacdHist   = push(s.macdHist,      macdH);
        let newBbUpper    = push(s.bbUpper,       bbU);
        let newBbMiddle   = push(s.bbMiddle,      bbM);
        let newBbLower    = push(s.bbLower,       bbL);
        let newBbWidth    = push(s.bbWidth,       bbW);
        let newBbPct      = push(s.bbPct,         bbP);
        let newAtr        = push(s.atrVals,       atrVal);
        let newStVals     = push(s.stVals,        stVal);
        let newStBull     = push(s.stBull,        stB);
        let newAdx        = push(s.adxVals,       adxVal);
        let newPlusDI     = push(s.plusDI,        pDI);
        let newMinusDI    = push(s.minusDI,       mDI);
        let newObv        = push(s.obvVals,       obvVal);
        let newWillR      = push(s.willRVals,     willRVal);
        let newCci        = push(s.cciVals,       cciVal);
        let newPsarVals   = push(s.psarVals,      psarVal);
        let newPsarBull   = push(s.psarBull,      psarB);
        let newVwap       = push(s.vwapVals,      vwapV);
        let newVwapU1     = push(s.vwapUpper1,    vu1);
        let newVwapL1     = push(s.vwapLower1,    vl1);
        let newVwapU2     = push(s.vwapUpper2,    vu2);
        let newVwapL2     = push(s.vwapLower2,    vl2);
        let newCvdBar     = push(s.cvdBarDeltas,  barDelta);
        let newCvdCum     = push(s.cvdCumDeltas,  cumDelta);
        let newPatterns   = push(s.patterns,      candlePatterns);

        // Stoch RSI (windowed from rsiVals)
        const rsiWindow  = newRsi.slice(-50);
        const srPeriod   = p.stochRsiPeriod;
        const stochKRaw  = rsiWindow.map((_, i) => {
          const win = rsiWindow.slice(Math.max(0, i - srPeriod + 1), i + 1).filter(v => v !== null) as number[];
          if (win.length < srPeriod) return null;
          const lo = Math.min(...win), hi = Math.max(...win), cur = rsiWindow[i] as number;
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
        let newStochK = push(s.stochRsiK, smoothK[smoothK.length - 1] ?? null);
        let newStochD = push(s.stochRsiD, smoothD[smoothD.length - 1] ?? null);

        // Trim to 200 candles
        if (newCandles.length > 200) {
          newCandles.shift();   newE9s.shift();      newE20s.shift();   newE50s.shift();
          newRsi.shift();       newMacdLine.shift();  newMacdSig.shift(); newMacdHist.shift();
          newBbUpper.shift();   newBbMiddle.shift();  newBbLower.shift(); newBbWidth.shift(); newBbPct.shift();
          newAtr.shift();       newStVals.shift();    newStBull.shift();
          newAdx.shift();       newPlusDI.shift();    newMinusDI.shift();
          newObv.shift();       newWillR.shift();     newCci.shift();
          newPsarVals.shift();  newPsarBull.shift();
          newVwap.shift();      newVwapU1.shift();    newVwapL1.shift(); newVwapU2.shift(); newVwapL2.shift();
          newCvdBar.shift();    newCvdCum.shift();
          newPatterns.shift();  newStochK.shift();    newStochD.shift();
          newCrossovers = newCrossovers
            .map(x => ({ ...x, idx: x.idx - 1 }))
            .filter(x => x.idx >= 0);
        }

        set({
          candles:      newCandles,
          e9s: newE9s, e20s: newE20s, e50s: newE50s,
          e9: newE9, e20: newE20, e50: newE50,
          rsiVals:      newRsi,
          stochRsiK:    newStochK, stochRsiD: newStochD,
          macdLine:     newMacdLine, macdSignal: newMacdSig, macdHist: newMacdHist,
          bbUpper:      newBbUpper, bbMiddle: newBbMiddle, bbLower: newBbLower, bbWidth: newBbWidth, bbPct: newBbPct,
          atrVals:      newAtr,
          stVals:       newStVals, stBull: newStBull,
          adxVals:      newAdx, plusDI: newPlusDI, minusDI: newMinusDI,
          obvVals:      newObv,
          willRVals:    newWillR,
          cciVals:      newCci,
          psarVals:     newPsarVals, psarBull: newPsarBull,
          vwapVals:     newVwap, vwapUpper1: newVwapU1, vwapLower1: newVwapL1, vwapUpper2: newVwapU2, vwapLower2: newVwapL2,
          cvdBarDeltas: newCvdBar, cvdCumDeltas: newCvdCum,
          patterns:     newPatterns,
          crossovers:   newCrossovers,
          _e9: newE9, _e20: newE20, _e50: newE50,
          _prevClose:  c.c,
          _rsiState:   rsiState,
          _macdState:  macdState,
          _bbState:    bbState,
          _atrState:   atrState,
          _stState:    stState,
          _adxState:   adxState,
          _obvState:   obvState,
          _willRState: willRState,
          _cciState:   cciState,
          _psarState:  psarState,
          _vwapState:  vwapState,
          _cvdState:   cvdState,
        });
      },

      setCurrentCandle: (c) => {
        if (!c) return set({ currentCandle: null });
        set({ currentCandle: c });
      },

      setLivePrice: (price, _apiName) => {
        const s   = get();
        const tf  = s.tf;
        const prev = s.livePrice;
        let cur   = s.currentCandle;
        const now = Date.now();

        if (!cur) {
          cur = { o: price, h: price, l: price, c: price, v: 500, t: now };
          set({ currentCandle: cur, lastCandleTime: now, livePrice: price, prevLivePrice: prev });
        } else {
          const updated: Candle = {
            ...cur, c: price,
            h: Math.max(cur.h, price),
            l: Math.min(cur.l, price),
            v: cur.v + 50 + Math.random() * 200,
          };
          set({ currentCandle: updated, livePrice: price, prevLivePrice: prev });
        }

        const interval = {
          '1m': 60000, '5m': 300000, '15m': 900000,
          '1h': 3600000, '4h': 14400000, '1d': 86400000,
        }[tf] ?? 300000;

        if (now - get().lastCandleTime >= interval) {
          const finished = get().currentCandle;
          if (finished) get().addCandleToState({ ...finished });
          set({
            currentCandle: { o: price, h: price, l: price, c: price, v: 500, t: now },
            lastCandleTime: now,
          });
        }

        get().refreshSuggestion();
      },

      setConnStatus: (connStatus, connLabel) => set({ connStatus, connLabel }),

      refreshSuggestion: () => {
        const s = get();
        if (!s.e9 || !s.e20 || !s.e50 || s.candles.length < 20) return;
        const rsi = s.rsiVals.filter(v => v !== null).slice(-1)[0] ?? 50;
        const sug = computeSuggestion(s.e9, s.e20, s.e50, s.livePrice, rsi as number, s.candles, s.rrRatio);
        const q   = scoreEntryQuality(sug.dir, rsi as number, s.e9, s.e20, s.e50, s.livePrice, s.crossovers);
        set({ suggestion: sug, entryQuality: q });
        // Evaluate active strategy after updating suggestion data
        get().evalActiveStrategy();
      },

      // ── Indicators ─────────────────────────────────────
      toggleIndicator: (key) => set(s => ({
        activeIndicators: { ...s.activeIndicators, [key]: !s.activeIndicators[key] },
      })),

      setIndicatorParam: (key, value) => set(s => ({
        indicatorParams: { ...s.indicatorParams, [key]: value },
      })),

      resetIndicatorParams: () => set({ indicatorParams: defaultIndicatorParams }),

      // ── Calculator ─────────────────────────────────────
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

      applySuggestionToCalc: () => {
        const { suggestion } = get();
        if (!suggestion) return;
        const d = suggestion.entry > 100 ? 2 : 4;
        set({
          activeTab:  'calc',
          currentDir: suggestion.dir,
          entryPrice: suggestion.entry.toFixed(d),
          stopPrice:  suggestion.stop.toFixed(d),
        });
      },

      // ── Journal ────────────────────────────────────────
      addTrade: (t) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        set(s => ({ trades: [...s.trades, { ...t, id }] }));
      },
      updateTrade: (id, updates) =>
        set(s => ({ trades: s.trades.map(t => t.id === id ? { ...t, ...updates } : t) })),
      deleteTrade: (id) =>
        set(s => ({ trades: s.trades.filter(t => t.id !== id) })),

      // ── Settings ───────────────────────────────────────
      setSettings: (patch) => set(patch),

      // ── Strategy ───────────────────────────────────────
      addStrategy: (s) =>
        set(st => ({ strategies: [...st.strategies, s] })),

      updateStrategy: (id, patch) =>
        set(st => ({
          strategies: st.strategies.map(s => s.id === id ? { ...s, ...patch } : s),
        })),

      deleteStrategy: (id) =>
        set(st => ({
          strategies: st.strategies.filter(s => s.id !== id),
          // Fall back to default preset when the active strategy is deleted
          activeStrategyId: st.activeStrategyId === id ? 'preset-3ema' : st.activeStrategyId,
          strategySignal:   st.activeStrategyId === id ? null : st.strategySignal,
        })),

      setActiveStrategy: (id) => set({ activeStrategyId: id, strategySignal: null }),

      evalActiveStrategy: () => {
        const st = get();
        const { activeStrategyId, strategies, livePrice, candles, capital } = st;
        if (!activeStrategyId || !livePrice || candles.length < 10) return;

        const allStrategies = [...PRESET_STRATEGIES, ...strategies];
        const strat = allStrategies.find(s => s.id === activeStrategyId);
        if (!strat) return;

        const snap     = buildSnapshot(st);
        const recent   = candles.slice(-20);
        const recentLow  = Math.min(...recent.map(c => c.l));
        const recentHigh = Math.max(...recent.map(c => c.h));
        const cap      = parseFloat(capital) || 200;

        const signal = evaluateStrategy(strat, snap, cap, recentLow, recentHigh);
        set({ strategySignal: signal });
      },
    }),
    {
      name: 'trading_assistant',
      partialize: (s) => ({
        trades:           s.trades,
        theme:            s.theme,
        defaultSym:       s.defaultSym,
        defaultTf:        s.defaultTf,
        defaultLeverage:  s.defaultLeverage,
        defaultFeeType:   s.defaultFeeType,
        defaultCapital:   s.defaultCapital,
        defaultRR:        s.defaultRR,
        capital:          s.capital,
        margin:           s.margin,
        goalPct:          s.goalPct,
        leverage:         s.leverage,
        feeType:          s.feeType,
        rrRatio:          s.rrRatio,
        activeIndicators: s.activeIndicators,
        indicatorParams:  s.indicatorParams,
        strategies:       s.strategies,
        activeStrategyId: s.activeStrategyId,
      }),
    }
  )
);