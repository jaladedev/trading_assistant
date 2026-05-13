'use strict';

// ── Minimal Fibonacci (mirrors indicators2.ts) ────────────────────────────────

const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIBO_LABELS = ['0', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'];

function calcAutoFibo(candles, lookback) {
  const n     = Math.min(lookback ?? 50, candles.length);
  const slice = candles.slice(-n);
  if (slice.length < 5) return null;

  const swingHigh = Math.max(...slice.map(c => c.h));
  const swingLow  = Math.min(...slice.map(c => c.l));
  const range     = swingHigh - swingLow;
  if (range === 0) return null;

  const half   = Math.floor(slice.length / 2);
  const avg1   = slice.slice(0, half).reduce((s, c) => s + c.c, 0) / half;
  const avg2   = slice.slice(half).reduce((s, c) => s + c.c, 0) / (slice.length - half);
  const dir    = avg2 > avg1 ? 'up' : 'down';

  const levels = FIBO_LEVELS.map((ratio, i) => ({
    ratio,
    label: FIBO_LABELS[i],
    price: dir === 'up' ? swingHigh - ratio * range : swingLow + ratio * range,
  }));

  return { swingHigh, swingLow, dir, levels };
}

// ── Core indicator engine ─────────────────────────────────────────────────────

function ema(prev, val, k) {
  return prev === null ? val : val * k + prev * (1 - k);
}

function computeIndicators(candles, nBar) {
  nBar = nBar ?? 20;
  if (candles.length < 2) return null;

  const k9 = 2 / 10, k20 = 2 / 21, k50 = 2 / 51;
  const kF = 2 / 13, kS  = 2 / 27, kSig = 2 / 10;

  let e9 = null, e20 = null, e50 = null;
  let ef = null, es  = null, esig = null;
  let prevClose = null;
  let gains = 0, losses = 0, rsiCount = 0;
  let atrSum = 0, atrCount = 0;
  const bbCloses = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    e9  = ema(e9,  c.c, k9);
    e20 = ema(e20, c.c, k20);
    e50 = ema(e50, c.c, k50);

    ef   = ema(ef,  c.c, kF);
    es   = ema(es,  c.c, kS);
    const ml = (ef ?? c.c) - (es ?? c.c);
    esig = ema(esig, ml, kSig);

    if (prevClose !== null) {
      const ch = c.c - prevClose;
      if (ch > 0) gains += ch; else losses -= ch;
      rsiCount++;
      const tr = Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
      atrSum += tr; atrCount++;
    }
    bbCloses.push(c.c);
    if (bbCloses.length > 20) bbCloses.shift();
    prevClose = c.c;
  }

  // RSI
  const rsi = rsiCount > 0 && losses + gains > 0
    ? Math.round(100 - 100 / (1 + gains / Math.max(losses, 1e-9)))
    : null;

  // MACD current + prev
  const macdLine = ef !== null && es !== null ? ef - es : null;
  const macdSig  = esig;
  const macdHist = macdLine !== null && macdSig !== null ? macdLine - macdSig : null;

  let prevMacdLine = null, prevMacdSig = null;
  if (candles.length >= 2) {
    let ef2 = null, es2 = null, esig2 = null;
    for (let i = 0; i < candles.length - 1; i++) {
      const c = candles[i];
      ef2 = ema(ef2, c.c, kF); es2 = ema(es2, c.c, kS);
      esig2 = ema(esig2, (ef2 ?? c.c) - (es2 ?? c.c), kSig);
    }
    prevMacdLine = ef2 !== null && es2 !== null ? ef2 - es2 : null;
    prevMacdSig  = esig2;
  }

  // ATR
  const atr = atrCount > 0 ? atrSum / atrCount : null;

  // Bollinger width
  const bbMean  = bbCloses.length ? bbCloses.reduce((a, b) => a + b, 0) / bbCloses.length : 0;
  const bbStd   = bbCloses.length
    ? Math.sqrt(bbCloses.reduce((a, b) => a + (b - bbMean) ** 2, 0) / bbCloses.length)
    : 0;
  const bbWidth = bbMean > 0 ? (bbStd * 4) / bbMean : null;

  // SuperTrend (simple)
  const last  = candles[candles.length - 1];
  const hl2   = (last.h + last.l) / 2;
  const stDn  = atr !== null ? hl2 - 3 * atr : hl2;
  const stBull = last.c > stDn;

  // N-bar range
  const nSlice = candles.slice(-nBar);
  const highN  = Math.max(...nSlice.map(c => c.h));
  const lowN   = Math.min(...nSlice.map(c => c.l));

  // Volume 20-bar avg
  const volAvg20 = candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, candles.length);

  // ADX (simplified)
  let adx = null;
  if (candles.length >= 14) {
    let smPlus = 0, smMinus = 0, smTr = 0;
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prv = candles[i - 1];
      const up  = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  += up > dn && up > 0 ? up : 0;
      smMinus += dn > up && dn > 0 ? dn : 0;
      smTr    += Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));
    }
    if (smTr > 0) {
      const pDI = 100 * smPlus / smTr;
      const mDI = 100 * smMinus / smTr;
      adx = Math.abs(pDI - mDI) / (pDI + mDI + 1e-9) * 100;
    }
  }

  // Fib proximity
  let nearFib = null;
  try {
    const fibo = calcAutoFibo(candles, Math.min(50, candles.length));
    if (fibo) {
      for (const lv of fibo.levels) {
        if (Math.abs(lv.price - last.c) / last.c < 0.005) { nearFib = lv.label; break; }
      }
    }
  } catch { /* skip */ }

  return {
    price: last.c, e9, e20, e50,
    rsi, macdLine, macdSig, macdHist,
    prevMacdLine, prevMacdSig,
    atr, bbWidth, stBull,
    highN, lowN, volAvg20, lastVol: last.v,
    adx, nearFib,
  };
}

// ── Filter application ────────────────────────────────────────────────────────

function applyFilters(ind, activeFilters) {
  const matched = [];
  const { price, e9, e20, e50, rsi, macdLine, macdSig, prevMacdLine, prevMacdSig,
    adx, bbWidth, stBull, volAvg20, lastVol, highN, lowN, nearFib } = ind;

  for (const f of activeFilters) {
    switch (f) {
      case 'ema_stack_bull':
        if (e9 && e20 && e50 && e9 > e20 && e20 > e50) matched.push(f); break;
      case 'ema_stack_bear':
        if (e9 && e20 && e50 && e9 < e20 && e20 < e50) matched.push(f); break;
      case 'rsi_oversold':
        if (rsi !== null && rsi < 30) matched.push(f); break;
      case 'rsi_overbought':
        if (rsi !== null && rsi > 70) matched.push(f); break;
      case 'macd_cross_bull':
        if (macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine <= prevMacdSig && macdLine > macdSig) matched.push(f); break;
      case 'macd_cross_bear':
        if (macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine >= prevMacdSig && macdLine < macdSig) matched.push(f); break;
      case 'supertrend_bull':
        if (stBull === true)  matched.push(f); break;
      case 'supertrend_bear':
        if (stBull === false) matched.push(f); break;
      case 'bb_squeeze':
        if (bbWidth !== null && bbWidth < 0.03) matched.push(f); break;
      case 'volume_spike':
        if (volAvg20 && lastVol > volAvg20 * 2) matched.push(f); break;
      case 'price_near_ema9':
        if (e9 && Math.abs(price - e9) / price < 0.003) matched.push(f); break;
      case 'price_near_ema20':
        if (e20 && Math.abs(price - e20) / price < 0.003) matched.push(f); break;
      case 'price_near_ema50':
        if (e50 && Math.abs(price - e50) / price < 0.005) matched.push(f); break;
      case 'n_bar_high':
        if (highN !== null && price >= highN * 0.998) matched.push(f); break;
      case 'n_bar_low':
        if (lowN !== null && price <= lowN * 1.002) matched.push(f); break;
      case 'adx_trending':
        if (adx !== null && adx > 25) matched.push(f); break;
      case 'fib_level':
        if (nearFib !== null) matched.push(f); break;
    }
  }
  return matched;
}

// ── Worker message handler ────────────────────────────────────────────────────

self.addEventListener('message', (e) => {
  const { type, items } = e.data;

  if (type !== 'COMPUTE_BATCH') {
    self.postMessage({ type: 'ERROR', error: `Unknown message type: ${type}` });
    return;
  }

  try {
    const results = [];

    for (const item of items) {
      const { sym, candles, activeFilters, open24, volume24h } = item;
      if (!candles || candles.length < 2) continue;

      const ind = computeIndicators(candles, 20);
      if (!ind) continue;

      const filters = applyFilters(ind, activeFilters ?? []);

      const change24h = open24 > 0 ? (ind.price - open24) / open24 * 100 : 0;

      results.push({
        sym,
        price:     ind.price,
        change24h,
        volume24h: volume24h ?? 0,
        ema9:      ind.e9,
        ema20:     ind.e20,
        ema50:     ind.e50,
        rsi:       ind.rsi,
        macdLine:  ind.macdLine,
        macdSig:   ind.macdSig,
        macdHist:  ind.macdHist,
        adx:       ind.adx,
        bbWidth:   ind.bbWidth,
        atr:       ind.atr,
        stBull:    ind.stBull,
        volAvg20:  ind.volAvg20,
        highN:     ind.highN,
        lowN:      ind.lowN,
        nearFib:   ind.nearFib,
        filters,
        score:     filters.length,
        fetchedAt: Date.now(),
      });
    }

    self.postMessage({ type: 'BATCH_RESULT', results });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: String(err) });
  }
});