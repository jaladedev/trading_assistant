import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Candle, CrossoverEvent, RSIState, VWAPState, CVDState } from './indicators';  
import {
  updEMA, emaK, calcWilderRSI, makeRSIState, computeSuggestion,
  scoreEntryQuality,
  calcVWAP, makeVWAPState, calcCVD, makeCVDState,
} from './indicators';



// ──────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────
export type ConnStatus = 'idle' | 'live' | 'err' | 'warn';

export interface Suggestion {
  entry: number;
  stop: number;
  target: number;
  dir: 'long' | 'short';
  reason: string;
}

export interface EntryQuality {
  score: number;
  label: string;
  cls: string;
  factors: string[];
}

export interface TradeJournalEntry {
  id: string;
  date: string;
  symbol: string;
  dir: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  outcome: 'win' | 'loss' | 'be' | 'open';
  pnl: number;
  notes: string;
}

// ──────────────────────────────────────────────────────────
//  Chart slice
// ──────────────────────────────────────────────────────────
interface ChartSlice {
  sym: string;
  tf: string;
  candles: Candle[];
  e9s: (number | null)[];
  e20s: (number | null)[];
  e50s: (number | null)[];
  rsiVals: (number | null)[];
  e9: number | null;
  e20: number | null;
  e50: number | null;
  crossovers: CrossoverEvent[];
  livePrice: number;
  prevLivePrice: number;
  openPrice: number;
  currentCandle: Candle | null;
  lastCandleTime: number;
  connStatus: ConnStatus;
  connLabel: string;
  suggestion: Suggestion | null;
  entryQuality: EntryQuality | null;
  vwapVals:      (number | null)[];
  cvdBarDeltas:  number[];
  cvdCumDeltas:  number[];
  // Internal RSI state (not persisted)
  _rsiState: RSIState;
  _prevClose: number | null;
  _e9: number | null;
  _e20: number | null;
  _e50: number | null;
  _vwapState:  VWAPState; 
  _cvdState:   CVDState;   
  _liveVwap:   number | null;
  _liveCvdBar: number | null;
  _liveCvdCum: number | null;
}

// ──────────────────────────────────────────────────────────
//  Calculator slice
// ──────────────────────────────────────────────────────────
interface CalcSlice {
  currentDir: 'long' | 'short';
  rrRatio: number;
  entryPrice: string;
  stopPrice: string;
  sizeUsd: string;
  tokens: string;
  leverage: number;
  feeType: 'maker' | 'taker';
  capital: string;
  goalPct: string;
  margin: string;
}

// ──────────────────────────────────────────────────────────
//  Journal slice
// ──────────────────────────────────────────────────────────
interface JournalSlice {
  trades: TradeJournalEntry[];
}

// ──────────────────────────────────────────────────────────
//  Settings slice
// ──────────────────────────────────────────────────────────
interface SettingsSlice {
  theme: 'dark' | 'light';
  defaultSym: string;
  defaultTf: string;
  defaultLeverage: number;
  defaultFeeType: 'maker' | 'taker';
  defaultCapital: number;
  defaultRR: number;
}

// ──────────────────────────────────────────────────────────
//  Combined store
// ──────────────────────────────────────────────────────────
interface Actions {
  // Chart
  setSym: (sym: string) => void;
  setTf: (tf: string) => void;
  resetChartState: () => void;
  addCandleToState: (c: Candle) => void;
  setCurrentCandle: (c: Candle | null) => void;
  setLivePrice: (price: number, apiName: string) => void;
  setConnStatus: (status: ConnStatus, label: string) => void;
  refreshSuggestion: () => void;
  // Calculator
  setCurrentDir: (dir: 'long' | 'short') => void;
  setRrRatio: (r: number) => void;
  setEntryPrice: (v: string) => void;
  setStopPrice: (v: string) => void;
  setSizeUsd: (v: string) => void;
  setTokens: (v: string) => void;
  setLeverage: (v: number) => void;
  setFeeType: (v: 'maker' | 'taker') => void;
  setCapital: (v: string) => void;
  setGoalPct: (v: string) => void;
  setMargin: (v: string) => void;
  applySuggestionToCalc: () => void;
  // Journal
  addTrade: (t: Omit<TradeJournalEntry, 'id'>) => void;
  updateTrade: (id: string, updates: Partial<TradeJournalEntry>) => void;
  deleteTrade: (id: string) => void;
  // Settings
  setSettings: (s: Partial<SettingsSlice>) => void;
}

type StoreState = ChartSlice & CalcSlice & JournalSlice & SettingsSlice & Actions;

const defaultChart: ChartSlice = {
  sym: 'BTCUSDT', tf: '5m',
  candles: [], e9s: [], e20s: [], e50s: [], rsiVals: [],
  e9: null, e20: null, e50: null, crossovers: [],
  livePrice: 0, prevLivePrice: 0, openPrice: 0,
  currentCandle: null, lastCandleTime: 0,
  connStatus: 'idle', connLabel: 'Connecting…',
  suggestion: null, entryQuality: null,
  vwapVals:     [],
  cvdBarDeltas: [],
  cvdCumDeltas: [],
  _rsiState: makeRSIState(), _prevClose: null,
  _e9: null, _e20: null, _e50: null,
  _vwapState: makeVWAPState(),
  _cvdState: makeCVDState(),
  _liveVwap:   null,
  _liveCvdBar: null,
  _liveCvdCum: null,
};

const defaultCalc: CalcSlice = {
  currentDir: 'long', rrRatio: 2,
  entryPrice: '', stopPrice: '', sizeUsd: '100', tokens: '',
  leverage: 10, feeType: 'maker',
  capital: '200', goalPct: '10', margin: '20',
};

const defaultJournal: JournalSlice = { trades: [] };

const defaultSettings: SettingsSlice = {
  theme: 'dark', defaultSym: 'BTCUSDT', defaultTf: '5m',
  defaultLeverage: 10, defaultFeeType: 'maker',
  defaultCapital: 200, defaultRR: 2,
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...defaultChart,
      ...defaultCalc,
      ...defaultJournal,
      ...defaultSettings,

      // ── Chart actions ──────────────────────────────────
      setSym: (sym) => set({ sym }),
      setTf:  (tf)  => set({ tf }),

      resetChartState: () => set({
        ...defaultChart,
        _rsiState: makeRSIState(),
        _prevClose: null,
        _e9: null, _e20: null, _e50: null,
        _vwapState: makeVWAPState(),
        _cvdState: makeCVDState(),
      }),

      addCandleToState: (c) => {
        const s = get();
        const prevE9  = s._e9;
        const prevE20 = s._e20;
        const newE9   = updEMA(s._e9,  c.c, emaK(9));
        const newE20  = updEMA(s._e20, c.c, emaK(20));
        const newE50  = updEMA(s._e50, c.c, emaK(50));

        const rsiState = { ...s._rsiState };
        const rsiVal   = calcWilderRSI(c.c, s._prevClose, rsiState);

        // ── VWAP ──────────────────────────────────────────
        const vwapState = { ...s._vwapState };
        const vwapVal   = calcVWAP(c, vwapState);

        // ── CVD ───────────────────────────────────────────
        const cvdState = { ...s._cvdState };
        const { barDelta, cumDelta } = calcCVD(c, cvdState);

        // ── Crossovers ────────────────────────────────────
        let newCrossovers = [...s.crossovers];
        if (prevE9 !== null && prevE20 !== null) {
          const bull = prevE9 <= (s._e20 ?? 0) && newE9 > newE20;
          const bear = prevE9 >= (s._e20 ?? 0) && newE9 < newE20;
          if (bull || bear) {
            newCrossovers.push({ type: bull ? 'bull' : 'bear', price: c.c, idx: s.candles.length, time: Date.now() });
            if (newCrossovers.length > 8) newCrossovers.shift();
          }
        }

        // ── Append all series ─────────────────────────────
        let newCandles      = [...s.candles, c];
        let newE9s          = [...s.e9s,          newE9];
        let newE20s         = [...s.e20s,         newE20];
        let newE50s         = [...s.e50s,         newE50];
        let newRsiVals      = [...s.rsiVals,      rsiVal];
        let newVwapVals     = [...s.vwapVals,     vwapVal];
        let newCvdBarDeltas = [...s.cvdBarDeltas, barDelta];
        let newCvdCumDeltas = [...s.cvdCumDeltas, cumDelta];

        // ── Trim to 150 candles ───────────────────────────
        if (newCandles.length > 150) {
          newCandles.shift();
          newE9s.shift(); newE20s.shift(); newE50s.shift(); newRsiVals.shift();
          newVwapVals.shift(); newCvdBarDeltas.shift(); newCvdCumDeltas.shift();
          newCrossovers = newCrossovers.map(x => ({ ...x, idx: x.idx - 1 })).filter(x => x.idx >= 0);
        }

        set({
          candles:      newCandles,
          e9s:          newE9s,
          e20s:         newE20s,
          e50s:         newE50s,
          rsiVals:      newRsiVals,
          vwapVals:     newVwapVals,
          cvdBarDeltas: newCvdBarDeltas,
          cvdCumDeltas: newCvdCumDeltas,
          e9: newE9, e20: newE20, e50: newE50,
          crossovers: newCrossovers,
          _e9: newE9, _e20: newE20, _e50: newE50,
          _prevClose: c.c,
          _rsiState:  rsiState,
          _vwapState: vwapState,
          _cvdState:  cvdState,
        });
      },

      setCurrentCandle: (c) => {
        if (!c) return set({ currentCandle: null });
        const s = get();
        // Preview VWAP and CVD for the live unclosed bar.
        // Use spread copies so the stored state objects are never mutated prematurely.
        const vwapPreview              = calcVWAP(c, { ...s._vwapState });
        const { barDelta, cumDelta }   = calcCVD(c,  { ...s._cvdState  });
        set({
          currentCandle: c,
          _liveVwap:   vwapPreview,
          _liveCvdBar: barDelta,
          _liveCvdCum: cumDelta,
        });
      },

      setLivePrice: (price, apiName) => {
        const s = get();
        const tf   = s.tf;
        const prev = s.livePrice;
        let cur    = s.currentCandle;
        const now  = Date.now();

        if (!cur) {
          cur = { o: price, h: price, l: price, c: price, v: 500, t: now };
          set({ currentCandle: cur, lastCandleTime: now, livePrice: price, prevLivePrice: prev });
        } else {
          const updated: Candle = {
            ...cur,
            c: price,
            h: Math.max(cur.h, price),
            l: Math.min(cur.l, price),
            v: cur.v + 50 + Math.random() * 200,
          };
          // Route through setCurrentCandle so VWAP/CVD previews stay in sync
          get().setCurrentCandle(updated);
          set({ livePrice: price, prevLivePrice: prev });
        }

        // Close candle if interval elapsed
        const interval = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 }[tf] ?? 300000;
        if (now - get().lastCandleTime >= interval) {
          const finished = get().currentCandle;
          if (finished) get().addCandleToState({ ...finished });
          get().setCurrentCandle({ o: price, h: price, l: price, c: price, v: 500, t: now });
          set({ lastCandleTime: now });
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
      },

      // ── Calculator actions ─────────────────────────────
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
          currentDir: suggestion.dir,
          entryPrice: suggestion.entry.toFixed(d),
          stopPrice:  suggestion.stop.toFixed(d),
        });
      },

      // ── Journal actions ────────────────────────────────
      addTrade: (t) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        set(s => ({ trades: [...s.trades, { ...t, id }] }));
      },
      updateTrade: (id, updates) =>
        set(s => ({ trades: s.trades.map(t => t.id === id ? { ...t, ...updates } : t) })),
      deleteTrade: (id) =>
        set(s => ({ trades: s.trades.filter(t => t.id !== id) })),

      // ── Settings actions ───────────────────────────────
      setSettings: (s) => set(s),
    }),
    {
      name: 'trading_assistant',
      // Only persist certain slices — chart real-time data is ephemeral
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
      }),
    }
  )
);