// ─────────────────────────────────────────────────────────────────────────────
//  exchangeAdapters.ts
//  Multi-exchange adapter layer for the screener.
//  Supported: Binance, Bybit, OKX
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle } from './screener';

// ── Exchange IDs ──────────────────────────────────────────────────────────────

export type ExchangeId = 'binance' | 'bybit' | 'okx';

export const EXCHANGE_LABELS: Record<ExchangeId, string> = {
  binance: 'Binance',
  bybit:   'Bybit',
  okx:     'OKX',
};

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface ExchangeAdapter {
  id:             ExchangeId;
  label:          string;
  /** Map app TF strings → exchange-specific interval strings */
  intervalMap:    Record<string, string>;
  /** Fetch OHLCV candles, always returned oldest-first */
  fetchCandles(sym: string, tf: string, limit?: number): Promise<Candle[]>;
  /** Fetch all actively-trading quote-asset pairs (returns normalized syms, e.g. BTCUSDT) */
  fetchAllPairs(quoteAsset?: string): Promise<string[]>;
  /** Convert internal symbol (BTCUSDT) to display ticker (BTC) */
  displaySym(sym: string): string;
  /** Convert internal symbol to exchange-native format for API calls */
  toNative(sym: string): string;
  /** Convert exchange-native symbol back to internal format */
  fromNative(native: string, quoteAsset?: string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BINANCE adapter
// ─────────────────────────────────────────────────────────────────────────────

export const BinanceAdapter: ExchangeAdapter = {
  id:    'binance',
  label: 'Binance',

  intervalMap: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M',
  },

  displaySym(sym) {
    return sym.replace(/USDT$/, '').replace(/BUSD$/, '');
  },

  toNative(sym) { return sym; },
  fromNative(native) { return native; },

  async fetchCandles(sym, tf, limit = 100) {
    const interval = this.intervalMap[tf] ?? tf;
    const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`Binance ${sym}: HTTP ${r.status}`);
    const raw = await r.json() as string[][];
    // Binance: oldest-first already
    return raw.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
  },

  async fetchAllPairs(quoteAsset = 'USDT') {
    const url = 'https://api.binance.com/api/v3/exchangeInfo';
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`Binance exchangeInfo: HTTP ${r.status}`);
    const data = await r.json() as {
      symbols: { symbol: string; status: string; quoteAsset: string }[];
    };
    return data.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === quoteAsset)
      .map(s => s.symbol);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  BYBIT adapter
//  REST v5  — spot market (linear inverse handled separately)
//  Candles endpoint returns newest-first → we reverse
// ─────────────────────────────────────────────────────────────────────────────

export const BybitAdapter: ExchangeAdapter = {
  id:    'bybit',
  label: 'Bybit',

  intervalMap: {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M',
  },

  displaySym(sym) {
    return sym.replace(/USDT$/, '');
  },

  toNative(sym) { return sym; },            // Bybit spot also uses BTCUSDT
  fromNative(native) { return native; },

  async fetchCandles(sym, tf, limit = 100) {
    const interval = this.intervalMap[tf] ?? tf;
    // Bybit v5 spot kline — category=spot
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${interval}&limit=${limit}`;
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`Bybit ${sym}: HTTP ${r.status}`);
    const data = await r.json() as {
      retCode: number;
      result:  { list: string[][] };
    };
    if (data.retCode !== 0) throw new Error(`Bybit ${sym}: retCode ${data.retCode}`);
    // Bybit returns newest-first → reverse to oldest-first
    const list = [...data.result.list].reverse();
    // [startTime, open, high, low, close, volume, turnover]
    return list.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
  },

  async fetchAllPairs(quoteAsset = 'USDT') {
    const url = `https://api.bybit.com/v5/market/instruments-info?category=spot&status=Trading&limit=1000`;
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`Bybit instruments-info: HTTP ${r.status}`);
    const data = await r.json() as {
      retCode: number;
      result:  { list: { symbol: string; quoteCoin: string; status: string }[] };
    };
    if (data.retCode !== 0) throw new Error(`Bybit instruments: retCode ${data.retCode}`);
    return data.result.list
      .filter(s => s.quoteCoin === quoteAsset && s.status === 'Trading')
      .map(s => s.symbol);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  OKX adapter
//  REST v5 — spot market
//  Symbol format on OKX: BTC-USDT (instId)
//  Internal format we keep: BTCUSDT (consistent with Binance/Bybit)
//  Candles endpoint returns newest-first → we reverse
// ─────────────────────────────────────────────────────────────────────────────

export const OKXAdapter: ExchangeAdapter = {
  id:    'okx',
  label: 'OKX',

  intervalMap: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '1w': '1W', '1M': '1M',
  },

  displaySym(sym) {
    return sym.replace(/USDT$/, '');
  },

  /** Internal BTCUSDT → OKX BTC-USDT */
  toNative(sym) {
    // Assume all internal syms end in USDT (extend for USDC etc. if needed)
    const base = sym.replace(/USDT$/, '');
    return `${base}-USDT`;
  },

  /** OKX BTC-USDT → internal BTCUSDT */
  fromNative(native) {
    return native.replace('-', '');
  },

  async fetchCandles(sym, tf, limit = 100) {
    const instId   = this.toNative(sym);
    const bar      = this.intervalMap[tf] ?? tf;
    const url      = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
    const r        = await fetch(url);
    if (!r.ok) throw new Error(`OKX ${sym}: HTTP ${r.status}`);
    const data = await r.json() as {
      code: string;
      data: string[][];
    };
    if (data.code !== '0') throw new Error(`OKX ${sym}: code ${data.code}`);
    // OKX returns newest-first → reverse to oldest-first
    const list = [...data.data].reverse();
    // [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    return list.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
  },

  async fetchAllPairs(quoteAsset = 'USDT') {
    const url = `https://www.okx.com/api/v5/public/instruments?instType=SPOT`;
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`OKX instruments: HTTP ${r.status}`);
    const data = await r.json() as {
      code: string;
      data: { instId: string; quoteCcy: string; state: string }[];
    };
    if (data.code !== '0') throw new Error(`OKX instruments: code ${data.code}`);
    return data.data
      .filter(s => s.quoteCcy === quoteAsset && s.state === 'live')
      .map(s => this.fromNative(s.instId));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Registry
// ─────────────────────────────────────────────────────────────────────────────

export const EXCHANGE_ADAPTERS: Record<ExchangeId, ExchangeAdapter> = {
  binance: BinanceAdapter,
  bybit:   BybitAdapter,
  okx:     OKXAdapter,
};

export function getAdapter(id: ExchangeId): ExchangeAdapter {
  return EXCHANGE_ADAPTERS[id];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared TF options (intersection of all exchanges)
// ─────────────────────────────────────────────────────────────────────────────

export const TF_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type TfOption = typeof TF_OPTIONS[number];