import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useStore } from './store';
import type {
  ScreenerResult, FilterId, WatchlistGroup, ScreenerView,
  AutoRefreshConfig, WebhookConfig, StackFlipAlert, ExchangeId,
} from './screener';
import {
  runScreener, runMultiTFScan, PRESET_WATCHLISTS,
  exportScreenerCSV, sendWebhook, checkStackFlips,
  fetchAllUSDTPairs,
} from './screener';
import { EXCHANGE_LABELS } from './exchangeAdapters';
import type { Strategy } from './strategy';
import { PRESET_STRATEGIES } from './strategy';
import type { Candle } from './indicators';

// ─────────────────────────────────────────────────────────────────────────────
//  Kelly Criterion
// ─────────────────────────────────────────────────────────────────────────────

export function calcKelly(winRate: number, avgWinR: number, avgLossR: number): number {
  if (avgWinR <= 0 || avgLossR <= 0) return 0;
  const k = (winRate / avgLossR) - ((1 - winRate) / avgWinR);
  return Math.max(0, Math.min(k * 100, 25));
}

export interface KellyState {
  winRate:   string;
  avgWinR:   string;
  avgLossR:  string;
  kellyPct:  number | null;
  halfKelly: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screener store types
// ─────────────────────────────────────────────────────────────────────────────

interface ScreenerState {
  screenerResults:   ScreenerResult[];
  screenerRunning:   boolean;
  screenerProgress:  { done: number; total: number };
  screenerTf:        string;
  screenerError:     string | null;
  activeFilters:     FilterId[];
  sortCol:           keyof ScreenerResult;
  sortDir:           'asc' | 'desc';

  // watchlist
  watchlists:        WatchlistGroup[];
  activeWatchlistId: string;
  customSymInput:    string;

  // strategy scan
  scanStrategyId:    string | null;

  // auto-refresh
  autoRefresh:       AutoRefreshConfig;

  // stack flip alerts
  stackFlipAlerts:   StackFlipAlert[];

  // view
  screenerView:      ScreenerView;

  // webhooks
  webhooks:          WebhookConfig[];

  // Kelly
  kelly:             KellyState;

  // ── Exchange ────────────────────────────────────────────────────────────────
  /** Currently selected exchange */
  exchange:          ExchangeId;

  // ── All-pairs mode ─────────────────────────────────────────────────────────
  allPairsMode:      boolean;
  fetchingPairs:     boolean;
  allPairsCount:     number;
  allPairsMinVol:    number;

  // Actions
  runScan:               () => Promise<void>;
  abortScan:             () => void;
  setScreenerTf:         (tf: string) => void;
  toggleFilter:          (id: FilterId) => void;
  clearFilters:          () => void;
  setSortCol:            (col: keyof ScreenerResult) => void;
  setScreenerView:       (v: ScreenerView) => void;
  // Exchange
  setExchange:           (id: ExchangeId) => void;
  // Watchlist
  setActiveWatchlist:    (id: string) => void;
  addCustomSym:          (sym: string) => void;
  removeCustomSym:       (sym: string) => void;
  createWatchlist:       (name: string) => void;
  deleteWatchlist:       (id: string) => void;
  renameWatchlist:       (id: string, name: string) => void;
  setCustomSymInput:     (v: string) => void;
  // Strategy scan
  setScanStrategy:       (id: string | null) => void;
  // Auto-refresh
  setAutoRefresh:        (enabled: boolean, intervalSec?: number) => void;
  tickAutoRefresh:       () => void;
  // Stack flip
  clearStackFlips:       () => void;
  // Webhook
  addWebhook:            (cfg: Omit<WebhookConfig, 'id'>) => void;
  updateWebhook:         (id: string, patch: Partial<WebhookConfig>) => void;
  removeWebhook:         (id: string) => void;
  sendWebhooks:          () => Promise<void>;
  exportCSV:             () => void;
  // Kelly
  setKellyInput:         (field: keyof Omit<KellyState,'kellyPct'|'halfKelly'>, val: string) => void;
  calcKellyResult:       () => void;
  // All-pairs mode
  setAllPairsMode:       (enabled: boolean) => void;
  setAllPairsMinVol:     (minVol: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisted screener store
// ─────────────────────────────────────────────────────────────────────────────

let abortController: AbortController | null = null;
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

export const useScreenerStore = create<ScreenerState>()(
  persist(
    (set, get) => ({
      screenerResults:   [],
      screenerRunning:   false,
      screenerProgress:  { done: 0, total: 0 },
      screenerTf:        '1h',
      screenerError:     null,
      activeFilters:     [],
      sortCol:           'score',
      sortDir:           'desc',
      watchlists:        [...PRESET_WATCHLISTS, {
        id: 'custom', name: 'My Watchlist', syms: ['BTCUSDT','ETHUSDT','SOLUSDT'], preset: false,
      }],
      activeWatchlistId: 'preset-majors',
      customSymInput:    '',
      scanStrategyId:    null,
      autoRefresh:       { enabled: false, intervalSec: 300, lastRefresh: 0, nextRefresh: 0 },
      stackFlipAlerts:   [],
      screenerView:      'table',
      webhooks:          [],
      kelly:             { winRate: '55', avgWinR: '1.5', avgLossR: '1', kellyPct: null, halfKelly: null },

      // Exchange — default Binance
      exchange:          'binance',

      // All-pairs defaults
      allPairsMode:      false,
      fetchingPairs:     false,
      allPairsCount:     0,
      allPairsMinVol:    0,

      // ── Run scan ──────────────────────────────────────────────────────────
      runScan: async () => {
        const s = get();
        abortController?.abort();
        abortController = new AbortController();

        set({ screenerRunning: true, screenerError: null, screenerProgress: { done: 0, total: 0 } });

        // ── Resolve symbol list ───────────────────────────────────────────
        let syms: string[];

        if (s.allPairsMode) {
          set({ fetchingPairs: true });
          try {
            // Pass current exchange to pair fetcher
            const allPairs = await fetchAllUSDTPairs(s.exchange);
            syms = allPairs;
            set({ allPairsCount: allPairs.length, fetchingPairs: false,
                  screenerProgress: { done: 0, total: allPairs.length } });
          } catch (e) {
            set({ screenerRunning: false, fetchingPairs: false, screenerError: `Failed to fetch pairs: ${String(e)}` });
            return;
          }
        } else {
          const wl = s.watchlists.find(w => w.id === s.activeWatchlistId);
          if (!wl || !wl.syms.length) {
            set({ screenerError: 'No symbols in watchlist', screenerRunning: false }); return;
          }
          syms = wl.syms;
          set({ screenerProgress: { done: 0, total: syms.length } });
        }

        try {
          // ── Build optional strategy evaluator ────────────────────────────
          interface StratEvalResult {
            dir:     'long' | 'short';
            score:   number;
            reasons: string[];
          }

          let stratEval: ((sym: string, candles: Candle[]) => StratEvalResult | null) | undefined;
          if (s.scanStrategyId) {
            const allStrats = [...PRESET_STRATEGIES, ...useStore.getState().strategies];
            const strat = allStrats.find(st => st.id === s.scanStrategyId);
            if (strat) {
              stratEval = (_sym, candles) => {
                if (candles.length < 30) return null;
                let e9: number|null  = null;
                let e20: number|null = null;
                let e50: number|null = null;
                const k9 = 2/10, k20 = 2/21, k50 = 2/51;
                for (const c of candles) {
                  e9  = e9  === null ? c.c : c.c * k9  + e9  * (1-k9);
                  e20 = e20 === null ? c.c : c.c * k20 + e20 * (1-k20);
                  e50 = e50 === null ? c.c : c.c * k50 + e50 * (1-k50);
                }
                if (e9 === null || e20 === null || e50 === null) return null;
                const bull = e9 > e20 && e20 > e50;
                const bear = e9 < e20 && e20 < e50;
                if (!bull && !bear) return null;
                return {
                  dir:     bull ? 'long' : 'short',
                  score:   75,
                  reasons: [bull ? 'EMA stack bullish' : 'EMA stack bearish'],
                };
              };
            }
          }

          // ── Execute scan — pass exchange ─────────────────────────────────
          let results: ScreenerResult[];
          if (s.screenerView === 'multitf') {
            results = await runMultiTFScan(
              syms, ['5m', '1h', '4h'],
              (done, total) => set({ screenerProgress: { done, total } }),
              abortController.signal,
              s.exchange,  // ← new
            );
          } else {
            results = await runScreener(
              syms, s.screenerTf, s.activeFilters,
              (done, total) => set({ screenerProgress: { done, total } }),
              abortController.signal,
              stratEval,
              s.exchange,  // ← new
            );
          }

          // ── Apply minVol post-filter in all-pairs mode ───────────────────
          const { allPairsMode, allPairsMinVol } = get();
          if (allPairsMode && allPairsMinVol > 0) {
            results = results.filter(r => r.volume24h >= allPairsMinVol);
          }

          // ── Stack flip detection ─────────────────────────────────────────
          checkStackFlips(results, flip => {
            set(st => ({ stackFlipAlerts: [flip, ...st.stackFlipAlerts].slice(0, 50) }));
          });

          // ── Sort ─────────────────────────────────────────────────────────
          const col = s.sortCol as string;
          const sorted = [...results].sort((a, b) => {
            const av = (a[col as keyof ScreenerResult] as number) ?? 0;
            const bv = (b[col as keyof ScreenerResult] as number) ?? 0;
            return s.sortDir === 'desc' ? bv - av : av - bv;
          });

          set({
            screenerResults: sorted,
            screenerRunning: false,
            autoRefresh: {
              ...s.autoRefresh,
              lastRefresh: Date.now(),
              nextRefresh: Date.now() + s.autoRefresh.intervalSec * 1000,
            },
          });

          get().sendWebhooks();

        } catch (e) {
          set({ screenerRunning: false, screenerError: String(e) });
        }
      },

      abortScan: () => {
        abortController?.abort();
        set({ screenerRunning: false, fetchingPairs: false });
      },

      setScreenerTf: (tf) => set({ screenerTf: tf }),

      toggleFilter: (id) => set(s => ({
        activeFilters: s.activeFilters.includes(id)
          ? s.activeFilters.filter(f => f !== id)
          : [...s.activeFilters, id],
      })),
      clearFilters: () => set({ activeFilters: [] }),

      setSortCol: (col) => set(s => ({
        sortCol: col,
        sortDir: s.sortCol === col && s.sortDir === 'desc' ? 'asc' : 'desc',
        screenerResults: [...s.screenerResults].sort((a, b) => {
          const av = (a[col as keyof ScreenerResult] as number) ?? 0;
          const bv = (b[col as keyof ScreenerResult] as number) ?? 0;
          return (s.sortCol === col && s.sortDir === 'desc') ? av - bv : bv - av;
        }),
      })),

      setScreenerView: (v) => set({ screenerView: v }),

      // ── Exchange ──────────────────────────────────────────────────────────
      setExchange: (id) => set({
        exchange:        id,
        screenerResults: [],   // clear stale results from old exchange
        allPairsCount:   0,
        screenerError:   null,
      }),

      // Watchlist
      setActiveWatchlist: (id) => set({ activeWatchlistId: id }),
      setCustomSymInput: (v) => set({ customSymInput: v.toUpperCase() }),

      addCustomSym: (sym) => set(s => {
        const wl = s.watchlists.find(w => w.id === s.activeWatchlistId);
        if (!wl || wl.preset || wl.syms.includes(sym.toUpperCase())) return s;
        return { watchlists: s.watchlists.map(w => w.id === s.activeWatchlistId
          ? { ...w, syms: [...w.syms, sym.toUpperCase()] } : w) };
      }),

      removeCustomSym: (sym) => set(s => ({
        watchlists: s.watchlists.map(w =>
          w.id === s.activeWatchlistId && !w.preset
            ? { ...w, syms: w.syms.filter(s => s !== sym) } : w
        ),
      })),

      createWatchlist: (name) => set(s => ({
        watchlists: [...s.watchlists, {
          id: Date.now().toString(36), name, syms: [], preset: false,
        }],
      })),

      deleteWatchlist: (id) => set(s => ({
        watchlists: s.watchlists.filter(w => w.id !== id || w.preset),
        activeWatchlistId: s.activeWatchlistId === id ? 'preset-majors' : s.activeWatchlistId,
      })),

      renameWatchlist: (id, name) => set(s => ({
        watchlists: s.watchlists.map(w => w.id === id && !w.preset ? { ...w, name } : w),
      })),

      setScanStrategy: (id) => set({ scanStrategyId: id }),

      setAutoRefresh: (enabled, intervalSec) => {
        if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
        const cfg = { ...get().autoRefresh, enabled, ...(intervalSec ? { intervalSec } : {}) };
        set({ autoRefresh: cfg });
        if (enabled) {
          autoRefreshTimer = setInterval(() => get().tickAutoRefresh(), 1000);
        }
      },

      tickAutoRefresh: () => {
        const s = get();
        if (!s.autoRefresh.enabled) return;
        if (Date.now() >= s.autoRefresh.nextRefresh && !s.screenerRunning) {
          get().runScan();
        }
      },

      clearStackFlips: () => set({ stackFlipAlerts: [] }),

      addWebhook: (cfg) => set(s => ({
        webhooks: [...s.webhooks, { ...cfg, id: Date.now().toString(36) }],
      })),
      updateWebhook: (id, patch) => set(s => ({
        webhooks: s.webhooks.map(w => w.id === id ? { ...w, ...patch } : w),
      })),
      removeWebhook: (id) => set(s => ({ webhooks: s.webhooks.filter(w => w.id !== id) })),

      sendWebhooks: async () => {
        const { webhooks, screenerResults, screenerTf } = get();
        for (const cfg of webhooks.filter(w => w.enabled)) {
          await sendWebhook(cfg, screenerResults, screenerTf).catch(() => {});
        }
      },

      exportCSV: () => {
        const { screenerResults, screenerTf } = get();
        exportScreenerCSV(screenerResults, screenerTf);
      },

      setKellyInput: (field, val) => set(s => ({ kelly: { ...s.kelly, [field]: val } })),
      calcKellyResult: () => {
        const { kelly } = get();
        const wr = parseFloat(kelly.winRate) / 100;
        const aw = parseFloat(kelly.avgWinR);
        const al = parseFloat(kelly.avgLossR);
        if (isNaN(wr) || isNaN(aw) || isNaN(al)) return;
        const k = calcKelly(wr, aw, al);
        set({ kelly: { ...get().kelly, kellyPct: k, halfKelly: k / 2 } });
      },

      setAllPairsMode:  (enabled) => set({ allPairsMode: enabled }),
      setAllPairsMinVol: (minVol) => set({ allPairsMinVol: minVol }),
    }),

    {
      name: 'screener_store',
      partialize: (s) => ({
        watchlists:        s.watchlists,
        activeWatchlistId: s.activeWatchlistId,
        screenerTf:        s.screenerTf,
        activeFilters:     s.activeFilters,
        sortCol:           s.sortCol,
        sortDir:           s.sortDir,
        screenerView:      s.screenerView,
        autoRefresh:       { ...s.autoRefresh, enabled: false },
        webhooks:          s.webhooks,
        scanStrategyId:    s.scanStrategyId,
        kelly:             s.kelly,
        exchange:          s.exchange,    // ← persist selected exchange
        allPairsMode:      s.allPairsMode,
        allPairsMinVol:    s.allPairsMinVol,
      }),
    }
  )
);