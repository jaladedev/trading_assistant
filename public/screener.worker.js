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

  const half = Math.floor(slice.length / 2);
  const avg1 = slice.slice(0, half).reduce((s, c) => s + c.c, 0) / half;
  const avg2 = slice.slice(half).reduce((s, c) => s + c.c, 0) / (slice.length - half);
  const dir  = avg2 > avg1 ? 'up' : 'down';

  const levels = FIBO_LEVELS.map((ratio, i) => ({
    ratio,
    label: FIBO_LABELS[i],
    price: dir === 'up' ? swingHigh - ratio * range : swingLow + ratio * range,
  }));

  return { swingHigh, swingLow, dir, levels };
}

// ── Wilder period shared constant ────────────────────────────────────────────

const WILDER_PERIOD = 14;

// ── EMA helper ───────────────────────────────────────────────────────────────

function ema(prev, val, k) {
  return prev === null ? val : val * k + prev * (1 - k);
}

// ── Core indicator engine — fixed calculations ────────────────────────────────

function computeIndicators(candles, nBar) {
  nBar = nBar ?? 20;
  const n = candles.length;
  if (n < 2) return null;

  // ── EMAs ──────────────────────────────────────────────────────────────────
  const k9 = 2/10, k20 = 2/21, k50 = 2/51;
  const kF = 2/13, kS  = 2/27, kSig = 2/10;

  let e9 = null, e20 = null, e50 = null;
  let ef = null, es  = null, esig = null;
  const bbCloses = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    e9   = ema(e9,  c.c, k9);
    e20  = ema(e20, c.c, k20);
    e50  = ema(e50, c.c, k50);
    ef   = ema(ef,  c.c, kF);
    es   = ema(es,  c.c, kS);
    esig = ema(esig, (ef ?? c.c) - (es ?? c.c), kSig);
    bbCloses.push(c.c);
    if (bbCloses.length > 20) bbCloses.shift();
  }

  const macdLine = ef !== null && es !== null ? ef - es : null;
  const macdSig  = esig;
  const macdHist = macdLine !== null && macdSig !== null ? macdLine - macdSig : null;

  // MACD on previous bar (crossover detection)
  let prevMacdLine = null, prevMacdSig = null;
  if (n >= 2) {
    let ef2 = null, es2 = null, esig2 = null;
    for (let i = 0; i < n - 1; i++) {
      const c = candles[i];
      ef2   = ema(ef2,  c.c, kF);
      es2   = ema(es2,  c.c, kS);
      esig2 = ema(esig2, (ef2 ?? c.c) - (es2 ?? c.c), kSig);
    }
    prevMacdLine = ef2 !== null && es2 !== null ? ef2 - es2 : null;
    prevMacdSig  = esig2;
  }

  // ── RSI — Wilder's smoothed 14-period ─────────────────────────────────────
  let rsi = null;
  if (n > WILDER_PERIOD) {
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      const ch = candles[i].c - candles[i - 1].c;
      if (ch > 0) avgGain += ch; else avgLoss += -ch;
    }
    avgGain /= WILDER_PERIOD;
    avgLoss /= WILDER_PERIOD;

    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const ch = candles[i].c - candles[i - 1].c;
      avgGain = (avgGain * (WILDER_PERIOD - 1) + (ch > 0 ? ch : 0)) / WILDER_PERIOD;
      avgLoss = (avgLoss * (WILDER_PERIOD - 1) + (ch < 0 ? -ch : 0)) / WILDER_PERIOD;
    }
    rsi = avgLoss < 1e-10 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
  }

  // ── ATR — Wilder's smoothed 14-period ─────────────────────────────────────
  let atr = null;
  if (n > WILDER_PERIOD) {
    let atrVal = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      atrVal += Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c),
      );
    }
    atrVal /= WILDER_PERIOD;

    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const tr = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c),
      );
      atrVal = (atrVal * (WILDER_PERIOD - 1) + tr) / WILDER_PERIOD;
    }
    atr = atrVal;
  }

  // ── ADX — Wilder's 14-period (+DI / -DI → DX → smoothed ADX) ─────────────
  let adx = null;
  if (n > WILDER_PERIOD * 2) {
    // Seed phase
    let smPlus = 0, smMinus = 0, smTR = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      const cur = candles[i], prv = candles[i - 1];
      const up = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  += (up > dn && up > 0) ? up : 0;
      smMinus += (dn > up && dn > 0) ? dn : 0;
      smTR    += Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));
    }

    // Collect DX values using Wilder-smoothed directional sums
    const dxBuf = [];
    for (let i = WILDER_PERIOD + 1; i < n; i++) {
      const cur = candles[i], prv = candles[i - 1];
      const up = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  = smPlus  - smPlus  / WILDER_PERIOD + ((up > dn && up > 0) ? up : 0);
      smMinus = smMinus - smMinus / WILDER_PERIOD + ((dn > up && dn > 0) ? dn : 0);
      smTR    = smTR    - smTR    / WILDER_PERIOD +
        Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));

      if (smTR > 0) {
        const pDI  = 100 * smPlus  / smTR;
        const mDI  = 100 * smMinus / smTR;
        const dSum = pDI + mDI;
        dxBuf.push(dSum > 0 ? Math.abs(pDI - mDI) / dSum * 100 : 0);
      }
    }

    // ADX = Wilder's smoothing of DX, seeded with avg of first 14 DX values
    if (dxBuf.length >= WILDER_PERIOD) {
      let adxVal = dxBuf.slice(0, WILDER_PERIOD).reduce((a, b) => a + b, 0) / WILDER_PERIOD;
      for (let i = WILDER_PERIOD; i < dxBuf.length; i++) {
        adxVal = (adxVal * (WILDER_PERIOD - 1) + dxBuf[i]) / WILDER_PERIOD;
      }
      adx = adxVal;
    }
  }

  // ── Bollinger Band width ───────────────────────────────────────────────────
  const bbMean  = bbCloses.reduce((a, b) => a + b, 0) / bbCloses.length;
  const bbStd   = Math.sqrt(bbCloses.reduce((a, b) => a + (b - bbMean) ** 2, 0) / bbCloses.length);
  const bbWidth = bbMean > 0 ? (bbStd * 4) / bbMean : null;

  // ── SuperTrend (last bar, simplified) ─────────────────────────────────────
  const last   = candles[n - 1];
  const hl2    = (last.h + last.l) / 2;
  const stDn   = atr !== null ? hl2 - 3 * atr : hl2;
  const stBull = last.c > stDn;

  // ── N-bar high / low ──────────────────────────────────────────────────────
  const nSlice = candles.slice(-nBar);
  const highN  = Math.max(...nSlice.map(c => c.h));
  const lowN   = Math.min(...nSlice.map(c => c.l));

  // ── Volume 20-bar average ─────────────────────────────────────────────────
  const volAvg20 = candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, n);

  // ── Fibonacci proximity ───────────────────────────────────────────────────
  let nearFib = null;
  try {
    const fibo = calcAutoFibo(candles, Math.min(50, n));
    if (fibo) {
      for (const lv of fibo.levels) {
        if (Math.abs(lv.price - last.c) / last.c < 0.005) { nearFib = lv.label; break; }
      }
    }
  } catch { /* skip */ }

  return {
    price: last.c, e9, e20, e50,
    rsi,
    macdLine, macdSig, macdHist,
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

// ── All defined filter IDs (for always-on scoring) ───────────────────────────

const ALL_FILTER_IDS = [
  'ema_stack_bull','ema_stack_bear',
  'supertrend_bull','supertrend_bear',
  'macd_cross_bull','macd_cross_bear',
  'rsi_oversold','rsi_overbought',
  'adx_trending',
  'bb_squeeze',
  'volume_spike',
  'price_near_ema9','price_near_ema20','price_near_ema50',
  'n_bar_high','n_bar_low',
  'fib_level',
];

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

      // Active-filter matches (what UI highlights)
      const filters = applyFilters(ind, activeFilters ?? []);

      // Always-on score: all 17 filters checked regardless of selection
      const score = applyFilters(ind, ALL_FILTER_IDS).length;

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
        score,   // always 0-17, independent of active filters
        fetchedAt: Date.now(),
      });
    }

    self.postMessage({ type: 'BATCH_RESULT', results });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: String(err) });
  }
});