import type { Candle } from './indicators';

const CG_MAP: Record<string, string> = {
  BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana',
  XRPUSDT: 'ripple',  TONUSDT: 'the-open-network', BNBUSDT: 'binancecoin',
};

interface ApiDef {
  name: string;
  klines: (sym: string, tf: string) => string;
  ticker: (sym: string) => string;
  parseKlines: (data: unknown) => Candle[];
  parseTicker: (data: unknown, sym: string) => number;
}

const APIS: ApiDef[] = [
  {
    name: 'Binance',
    klines: (s, t) => `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${t}&limit=100`,
    ticker: (s) => `https://api.binance.com/api/v3/ticker/price?symbol=${s}`,
    parseKlines: (d) => (d as string[][]).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] })),
    parseTicker: (d) => +(d as { price: string }).price,
  },
  {
    name: 'Binance US',
    klines: (s, t) => `https://api.binance.us/api/v3/klines?symbol=${s}&interval=${t}&limit=100`,
    ticker: (s) => `https://api.binance.us/api/v3/ticker/price?symbol=${s}`,
    parseKlines: (d) => (d as string[][]).map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] })),
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

export async function fetchKlines(symbol: string, timeframe: string): Promise<Candle[] | null> {
  for (let i = 0; i < APIS.length; i++) {
    const api = APIS[(activeApiIdx + i) % APIS.length];
    try {
      const data = await tryFetch(api.klines(symbol, timeframe));
      activeApiIdx = (activeApiIdx + i) % APIS.length;
      return api.parseKlines(data);
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