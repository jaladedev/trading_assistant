import type { Candle } from './indicators';

const CG_MAP: Record<string, string> = {
  BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana',
  XRPUSDT: 'ripple',  TONUSDT: 'the-open-network', BNBUSDT: 'binancecoin',
};

// Bybit uses different interval strings than Binance
const BYBIT_TF: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
};

// OKX uses different bar strings than Binance
const OKX_TF: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
  '1d': '1D', '1w': '1W', '1M': '1M',
};

interface ApiDef {
  name: string;
  klines: (sym: string, tf: string, limit?: number, endTime?: number) => string;
  ticker: (sym: string) => string;
  parseKlines: (data: unknown) => Candle[];
  parseTicker: (data: unknown, sym: string) => number;
}

const APIS: ApiDef[] = [
  {
    name: 'Binance',
    klines: (s, t, limit = 200, endTime?: number) => `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${t}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`,
    ticker: (s) =>    `https://api.binance.com/api/v3/ticker/price?symbol=${s}`,
    parseKlines: (d) =>
      (d as string[][]).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] })),
    parseTicker: (d) => +(d as { price: string }).price,
  },
  {
    name: 'Bybit',
    // Bybit V5 market klines — category=spot for spot pairs
    klines: (s, t, limit = 200, endTime?: number) => {
      const interval = BYBIT_TF[t] ?? '5';
      return `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`;
    },
    ticker: (s) =>
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`,
    parseKlines: (d) => {
      // Bybit returns { result: { list: [ [startTime, open, high, low, close, volume, turnover], ... ] } }
      // List is newest-first, so reverse to get chronological order.
      const list = (d as { result: { list: string[][] } }).result?.list ?? [];
      return list
        .slice()
        .reverse()
        .map(k => ({
          t: +k[0],
          o: +k[1],
          h: +k[2],
          l: +k[3],
          c: +k[4],
          v: +k[5],
        }));
    },
    parseTicker: (d) => {
      const list = (d as { result: { list: { lastPrice: string }[] } }).result?.list ?? [];
      return list.length > 0 ? +list[0].lastPrice : 0;
    },
  },
  {
    name: 'OKX',
    // OKX uses instId format with a hyphen: BTC-USDT instead of BTCUSDT
    klines: (s, t, limit = 200, endTime?: number) => {
      const instId = s.replace(/^([A-Z]+)(USDT)$/, '$1-USDT');
      const bar = OKX_TF[t] ?? '5m';
      return `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`;
    },
    ticker: (s) => {
      const instId = s.replace(/^([A-Z]+)(USDT)$/, '$1-USDT');
      return `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
    },
    parseKlines: (d) => {
      // OKX returns { data: [ [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm], ... ] }
      // List is newest-first, so reverse to get chronological order.
      const list = (d as { data: string[][] }).data ?? [];
      return list
        .slice()
        .reverse()
        .map(k => ({
          t: +k[0],
          o: +k[1],
          h: +k[2],
          l: +k[3],
          c: +k[4],
          v: +k[5],
        }));
    },
    parseTicker: (d) => {
      const list = (d as { data: { last: string }[] }).data ?? [];
      return list.length > 0 ? +list[0].last : 0;
    },
  },
  {
    name: 'MEXC',
    klines: (s, t, limit = 200, endTime?: number) => `https://api.mexc.com/api/v3/klines?symbol=${s}&interval=${t}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`,
    ticker: (s) =>    `https://api.mexc.com/api/v3/ticker/price?symbol=${s}`,
    parseKlines: (d) =>
      // MEXC kline format mirrors Binance: [openTime, open, high, low, close, volume, ...]
      (d as string[][]).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] })),
    parseTicker: (d) => +(d as { price: string }).price,
  },
  {
    name: 'Binance US',
    klines: (s, t, limit = 200, endTime?: number) => `https://api.binance.us/api/v3/klines?symbol=${s}&interval=${t}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`,
    ticker: (s) =>    `https://api.binance.us/api/v3/ticker/price?symbol=${s}`,
    parseKlines: (d) =>
      (d as string[][]).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] })),
    parseTicker: (d) => +(d as { price: string }).price,
  },
  {
    name: 'CoinGecko',
    klines: (s) => {
      const id = CG_MAP[s] || 'bitcoin';
      return `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`;
    },
    ticker: (s) => {
      const id = CG_MAP[s] || 'bitcoin';
      return `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
    },
    parseKlines: (d) =>
      (d as number[][]).slice(-100).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:1000, t:+k[0] })),
    parseTicker: (d, s) => {
      const id = CG_MAP[s] || 'bitcoin';
      return (d as Record<string, { usd: number }>)[id]?.usd || 0;
    },
  },
];

async function tryFetch(url: string): Promise<unknown> {
  const ctrl    = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

let activeApiIdx = 0;

export async function fetchKlines(
  symbol: string,
  timeframe: string,
  limit = 200,
  endTime?: number,
): Promise<Candle[] | null> {
  for (let i = 0; i < APIS.length; i++) {
    const api = APIS[(activeApiIdx + i) % APIS.length];
    try {
      const url  = api.klines(symbol, timeframe, limit, endTime);
      const data = await tryFetch(url);
      activeApiIdx = (activeApiIdx + i) % APIS.length;
      const candles = api.parseKlines(data);
      if (candles.length === 0 || candles.some(c => isNaN(c.c) || c.c <= 0)) throw new Error('bad data');
      return candles;
    } catch { /* try next */ }
  }
  return null;
}

export async function fetchTicker(symbol: string): Promise<{ price: number; api: string } | null> {
  for (let i = 0; i < APIS.length; i++) {
    const api = APIS[(activeApiIdx + i) % APIS.length];
    try {
      const data  = await tryFetch(api.ticker(symbol));
      const price = api.parseTicker(data, symbol);
      if (price > 0) {
        activeApiIdx = (activeApiIdx + i) % APIS.length;
        return { price, api: api.name };
      }
    } catch { /* try next */ }
  }
  return null;
}

export const TF_MS: Record<string, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};