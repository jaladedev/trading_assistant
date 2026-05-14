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

// ── Constants ─────────────────────────────────────────────────────────────────

const WILDER_PERIOD = 14;
const BB_PERIOD     = 20;

// ── EMA helper ────────────────────────────────────────────────────────────────

function ema(prev, val, k) {
  return prev === null ? val : val * k + prev * (1 - k);
}

// ── Core indicator engine ─────────────────────────────────────────────────────

function computeIndicators(candles, nBar) {
  nBar   = nBar ?? 20;
  const n = candles.length;
  if (n < 2) return null;

  // ── EMAs + MACD (single pass, PERF-5) ────────────────────────────────────
  const k9 = 2/10, k20 = 2/21, k50 = 2/51;
  const kF = 2/13, kS  = 2/27, kSig = 2/10;

  let e9 = null, e20 = null, e50 = null;
  let ef = null, es  = null, esig = null;

  // ring-buffer for BB — O(1) window instead of O(n) shift()
  const bbBuf  = new Float64Array(BB_PERIOD);
  let   bbHead  = 0;
  let   bbCount = 0;

  // track previous-bar MACD inside single loop (no second pass)
  let prevEf = null, prevEs = null, prevSig = null;

  for (let i = 0; i < n; i++) {
    const c = candles[i];

    prevEf  = ef;
    prevEs  = es;
    prevSig = esig;

    e9   = ema(e9,  c.c, k9);
    e20  = ema(e20, c.c, k20);
    e50  = ema(e50, c.c, k50);
    ef   = ema(ef,  c.c, kF);
    es   = ema(es,  c.c, kS);
    esig = ema(esig, (ef ?? c.c) - (es ?? c.c), kSig);

    // ring-buffer write
    bbBuf[bbHead % BB_PERIOD] = c.c;
    bbHead++;
    if (bbCount < BB_PERIOD) bbCount++;
  }

  const macdLine     = ef !== null && es !== null ? ef - es : null;
  const macdSig      = esig;
  const macdHist     = macdLine !== null && macdSig !== null ? macdLine - macdSig : null;
  const prevMacdLine = prevEf  !== null && prevEs  !== null ? prevEf  - prevEs  : null;
  const prevMacdSig  = prevSig;

  // ── SuperTrend — FIX SIGNAL-2: dedicated loop, band carry-forward ─────────
  // Run separately so band state is never entangled with EMA warm-up.
  let stDir = 1; // 1 = bull, -1 = bear
  {
    let atrRun      = null;
    let upperBand   = null;
    let lowerBand   = null;

    for (let i = 1; i < n; i++) {
      const c = candles[i], p = candles[i - 1];
      const tr = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
      atrRun   = atrRun === null ? tr : (atrRun * (WILDER_PERIOD - 1) + tr) / WILDER_PERIOD;

      const hl2      = (c.h + c.l) / 2;
      const rawUpper = hl2 + 3 * atrRun;
      const rawLower = hl2 - 3 * atrRun;

      // Tighten only — never widen carried bands
      const newUpper = upperBand !== null && rawUpper < upperBand ? rawUpper : upperBand ?? rawUpper;
      const newLower = lowerBand !== null && rawLower > lowerBand ? rawLower : lowerBand ?? rawLower;

      if      (stDir ===  1 && c.c < newLower) stDir = -1;
      else if (stDir === -1 && c.c > newUpper) stDir =  1;

      upperBand = newUpper;
      lowerBand = newLower;
    }
  }
  const stBull = stDir === 1;

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

  // ── ADX — Wilder's 14-period ──────────────────────────────────────────────
  let adx = null;
  if (n > WILDER_PERIOD * 2) {
    let smPlus = 0, smMinus = 0, smTR = 0;
    for (let i = 1; i <= WILDER_PERIOD; i++) {
      const cur = candles[i], prv = candles[i - 1];
      const up = cur.h - prv.h, dn = prv.l - cur.l;
      smPlus  += (up > dn && up > 0) ? up : 0;
      smMinus += (dn > up && dn > 0) ? dn : 0;
      smTR    += Math.max(cur.h - cur.l, Math.abs(cur.h - prv.c), Math.abs(cur.l - prv.c));
    }
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
    if (dxBuf.length >= WILDER_PERIOD) {
      let adxVal = dxBuf.slice(0, WILDER_PERIOD).reduce((a, b) => a + b, 0) / WILDER_PERIOD;
      for (let i = WILDER_PERIOD; i < dxBuf.length; i++) {
        adxVal = (adxVal * (WILDER_PERIOD - 1) + dxBuf[i]) / WILDER_PERIOD;
      }
      adx = adxVal;
    }
  }

  // ── Bollinger Band width from ring-buffer ────────────────────────
  let bbWidth = null;
  if (bbCount > 0) {
    let bbSum = 0;
    for (let i = 0; i < bbCount; i++) bbSum += bbBuf[i];
    const bbMean = bbSum / bbCount;
    let bbSumSq = 0;
    for (let i = 0; i < bbCount; i++) bbSumSq += (bbBuf[i] - bbMean) ** 2;
    const bbStd = Math.sqrt(bbSumSq / bbCount);
    bbWidth = bbMean > 0 ? (bbStd * 4) / bbMean : null;
  }

  // ── N-bar high / low, volume avg ──────────────────────────────────────────
  const last     = candles[n - 1];
  const nSlice   = candles.slice(-nBar);
  const highN    = Math.max(...nSlice.map(c => c.h));
  const lowN     = Math.min(...nSlice.map(c => c.l));
  const volAvg20 = candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, n);

  // ATR as % of price for cross-symbol comparison
  const atrPct = atr !== null && last.c > 0 ? atr / last.c * 100 : null;

  // ATR-relative Fib proximity 
  let nearFib = null;
  try {
    const fibo = calcAutoFibo(candles, Math.min(50, n));
    if (fibo) {
      const fibThreshold = atr !== null ? (atr * 0.3) / last.c : 0.005;
      for (const lv of fibo.levels) {
        if (Math.abs(lv.price - last.c) / last.c < fibThreshold) { nearFib = lv.label; break; }
      }
    }
  } catch { /* skip */ }

  return {
    price: last.c, e9, e20, e50,
    rsi,
    macdLine, macdSig, macdHist,
    prevMacdLine, prevMacdSig,
    atr, atrPct, bbWidth, stBull,
    highN, lowN, volAvg20, lastVol: last.v,
    adx, nearFib,
  };
}

// ── Filter weights ─────────────────────────────────────────────────

const FILTER_WEIGHTS = {
  macd_cross_bull:  4,
  macd_cross_bear:  4,
  ema_stack_bull:   2,
  ema_stack_bear:   2,
  supertrend_bull:  2,
  supertrend_bear:  2,
  adx_trending:     2,
  rsi_oversold:     2,
  rsi_overbought:   2,
  bb_squeeze:       2,
  volume_spike:     2,
  n_bar_high:       2,
  n_bar_low:        2,
  price_near_ema9:  1,
  price_near_ema20: 1,
  price_near_ema50: 1,
  fib_level:        1,
};

const ALL_FILTER_IDS = Object.keys(FILTER_WEIGHTS);

// ── Single-pass filter evaluation ────────────────────

function evaluateAllFilters(ind, activeFilters, opts) {
  opts = opts ?? {};
  const { price, e9, e20, e50, rsi, macdLine, macdSig, prevMacdLine, prevMacdSig,
    adx, bbWidth, stBull, volAvg20, lastVol, highN, lowN, nearFib } = ind;

  const activeSet = new Set(activeFilters ?? []);
  const matched   = [];
  let   score     = 0;

  const volMult  = opts.volSpikeMultiplier ?? 2.0;  
  const bbThresh = opts.bbWidthP20 ?? 0.03;         

  for (const f of ALL_FILTER_IDS) {
    let fired = false;
    switch (f) {
      case 'ema_stack_bull':   fired = !!(e9 && e20 && e50 && e9 > e20 && e20 > e50); break;
      case 'ema_stack_bear':   fired = !!(e9 && e20 && e50 && e9 < e20 && e20 < e50); break;
      case 'rsi_oversold':     fired = rsi !== null && rsi < 30; break;
      case 'rsi_overbought':   fired = rsi !== null && rsi > 70; break;
      case 'macd_cross_bull':
        fired = macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine <= prevMacdSig && macdLine > macdSig; break;
      case 'macd_cross_bear':
        fired = macdLine !== null && macdSig !== null && prevMacdLine !== null && prevMacdSig !== null
          && prevMacdLine >= prevMacdSig && macdLine < macdSig; break;
      case 'supertrend_bull':  fired = stBull === true;  break;
      case 'supertrend_bear':  fired = stBull === false; break;
      case 'bb_squeeze':       fired = bbWidth !== null && bbWidth < bbThresh; break;
      case 'volume_spike':     fired = !!(volAvg20 && lastVol > volAvg20 * volMult); break;
      case 'price_near_ema9':  fired = !!(e9  && Math.abs(price - e9)  / price < 0.003); break;
      case 'price_near_ema20': fired = !!(e20 && Math.abs(price - e20) / price < 0.003); break;
      case 'price_near_ema50': fired = !!(e50 && Math.abs(price - e50) / price < 0.005); break;
      case 'n_bar_high':       fired = highN !== null && price >= highN * 0.998; break;
      case 'n_bar_low':        fired = lowN  !== null && price <= lowN  * 1.002; break;
      case 'adx_trending':     fired = adx !== null && adx > 25; break;
      case 'fib_level':        fired = nearFib !== null; break;
    }
    if (fired) {
      score += FILTER_WEIGHTS[f];
      if (activeSet.has(f)) matched.push(f);
    }
  }

  return { matched, score };
}

// ── TF-aware helpers ──────────────────────────────────────────────────────────

// aligned with volumeSpikeMultiplier() in screener.ts
const VOL_MULT_BY_TF = {
  '1m':  5.0,
  '3m':  4.0,  
  '5m':  4.0,
  '15m': 3.0,
  '30m': 3.0,  
  '1h':  2.5,
  '2h':  2.0,
  '4h':  2.0,
  '6h':  2.0,  
  '8h':  2.0,  
  '12h': 2.0,  
  '1d':  1.5,
  '3d':  1.5,
  '1w':  1.5,
};

function getVolMultiplier(tf) {
  return VOL_MULT_BY_TF[tf] ?? 2.0;
}

// candles spanning 24h for this TF
const TF_MS = {
  '1m':  60e3,    '3m':  180e3,  '5m':  300e3,  '15m': 900e3,
  '30m': 1800e3,  '1h':  3600e3, '2h':  7200e3,  '4h':  14400e3,
  '6h':  21600e3, '8h':  28800e3,'12h': 43200e3,  '1d':  86400e3,
  '3d':  259200e3,'1w':  604800e3,
};

function candlesIn24h(tf) {
  const ms = TF_MS[tf] ?? 3600e3;
  return Math.max(1, Math.ceil(86400e3 / ms));
}

//  open of the candle closest to 24h ago
function findOpen24h(candles, targetMs) {
  if (!candles.length) return 0;
  let best = candles[0], bestDelta = Math.abs(candles[0].t - targetMs);
  for (let i = 1; i < candles.length; i++) {
    const delta = Math.abs(candles[i].t - targetMs);
    if (delta < bestDelta) { bestDelta = delta; best = candles[i]; }
  }
  return best.o;
}

// rolling 20th-percentile of bbWidth for this symbol
function bbWidthPercentile20(samples) {
  if (!samples || samples.length < 5) return null;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.2)];
}

// ── Per-symbol bbWidth history ────────────────────────────────────────────────

const bbWidthHistory  = new Map(); // sym → number[]
const BB_HISTORY_MAX  = 2_000;
const BB_SAMPLE_MAX   = 50;

function recordBBWidth(sym, width) {
  if (width === null) return;
  let hist = bbWidthHistory.get(sym);
  if (!hist) {
    // Evict oldest entries if at cap before adding a new symbol
    if (bbWidthHistory.size >= BB_HISTORY_MAX) {
      const oldest = bbWidthHistory.keys().next().value;
      bbWidthHistory.delete(oldest);
    }
    hist = [];
    bbWidthHistory.set(sym, hist);
  }
  hist.push(width);
  if (hist.length > BB_SAMPLE_MAX) hist.shift();
}

// ── Worker message handler ─────────────────────────────────────────────────────

self.addEventListener('message', (e) => {
  const { type, items, tf, exchange } = e.data;

  if (type === 'RESET_HISTORY') {
    bbWidthHistory.clear();
    self.postMessage({ type: 'RESET_ACK' });
    return;
  }

  if (type !== 'COMPUTE_BATCH') {
    self.postMessage({ type: 'ERROR', error: `Unknown message type: ${type}` });
    return;
  }

  try {
    const results     = [];
    const volMult     = getVolMultiplier(tf ?? '1h');   
    const n24h        = candlesIn24h(tf ?? '1h');       
    const now         = Date.now();
    const target24hMs = now - 86_400_000;               

    for (const item of items) {
      const { sym, candles, activeFilters } = item;
      if (!candles || candles.length < 2) continue;

      const ind = computeIndicators(candles, 20);
      if (!ind) continue;

      // true 24h-ago open
      const open24    = findOpen24h(candles, target24hMs);
      const change24h = open24 > 0 ? (ind.price - open24) / open24 * 100 : 0;

      // correct candle count for this TF
      const volume24h = candles.slice(-n24h).reduce((a, c) => a + c.v, 0);

      //update per-symbol bbWidth history and derive percentile
      recordBBWidth(sym, ind.bbWidth);
      const bbWidthP20 = bbWidthPercentile20(bbWidthHistory.get(sym));

      const { matched: filters, score } = evaluateAllFilters(ind, activeFilters, {
        volSpikeMultiplier: volMult,
        bbWidthP20,
      });

      results.push({
        sym,
        exchange:  exchange ?? 'binance',  
        price:     ind.price,
        change24h,
        volume24h,
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
        atrPct:    ind.atrPct,             // SIGNAL-4
        stBull:    ind.stBull,
        volAvg20:  ind.volAvg20,
        highN:     ind.highN,
        lowN:      ind.lowN,
        nearFib:   ind.nearFib,
        filters,
        score,
        strategySignal: item.strategySignal ?? null,  
        fetchedAt: now,
      });
    }

    self.postMessage({ type: 'BATCH_RESULT', results });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: String(err) });
  }
});