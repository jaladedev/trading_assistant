/// <reference lib="webworker" />
// public/backtest.worker.js
// Plain JS — no imports. Types stripped from backtest.worker.ts.
// Served at /backtest.worker.js by Next.js static file serving.

// ── Minimal EMA ───────────────────────────────────────────────────────────────
function ema(prev, val, k) {
  return prev === null ? val : val * k + prev * (1 - k);
}
const k9  = 2 / 10;
const k20 = 2 / 21;
const k50 = 2 / 51;
const k12 = 2 / 13;
const k26 = 2 / 27;
const k9s = 2 / 10;

// ── ATR ───────────────────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  const atrs = new Array(candles.length).fill(0);
  let atr = null;
  const seed = [];
  let prev = null;
  for (let i = 0; i < candles.length; i++) {
    const c  = candles[i];
    const tr = prev === null
      ? c.h - c.l
      : Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
    prev = c.c;
    if (atr === null) {
      seed.push(tr);
      if (seed.length === period) {
        atr = seed.reduce((a, b) => a + b, 0) / period;
      }
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    atrs[i] = atr ?? tr;
  }
  return atrs;
}

// ── RSI ───────────────────────────────────────────────────────────────────────
function calcRSI(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  let avgGain = null, avgLoss = null;
  const seedG = [], seedL = [];
  for (let i = 1; i < candles.length; i++) {
    const ch   = candles[i].c - candles[i - 1].c;
    const gain = Math.max(0, ch), loss = Math.max(0, -ch);
    if (avgGain === null) {
      seedG.push(gain); seedL.push(loss);
      if (seedG.length === period) {
        avgGain = seedG.reduce((a, b) => a + b, 0) / period;
        avgLoss = seedL.reduce((a, b) => a + b, 0) / period;
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        out[i]   = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss  * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      out[i]   = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
  }
  return out;
}

// ── Backtest engine ───────────────────────────────────────────────────────────
function runBacktest({ candles, strategy, capital }) {
  const n = candles.length;

  const atrs = calcATR(candles, 14);
  const rsis = calcRSI(candles, 14);

  // EMA series
  const e9s = [], e20s = [], e50s = [];
  const mcdL = [], mcdS = [], mcdH = [];
  let e9v = null, e20v = null, e50v = null;
  let ef  = null, es   = null, esig = null;

  for (let i = 0; i < n; i++) {
    const c = candles[i].c;
    e9v  = ema(e9v,  c, k9);
    e20v = ema(e20v, c, k20);
    e50v = ema(e50v, c, k50);
    ef   = ema(ef,   c, k12);
    es   = ema(es,   c, k26);
    e9s.push(e9v);
    e20s.push(e20v);
    e50s.push(e50v);
    const ml = ef - es;
    esig = ema(esig, ml, k9s);
    mcdL.push(ml);
    mcdS.push(esig ?? ml);
    mcdH.push(ml - (esig ?? ml));
  }

  function evalSnap(i) {
    if (i < 30) return null;
    if (!e9s[i] || !e20s[i] || !e50s[i] || rsis[i] === null) return null;

    const atr      = atrs[i];
    const bull     = e9s[i] > e20s[i] && e20s[i] > e50s[i];
    const bear     = e9s[i] < e20s[i] && e20s[i] < e50s[i];
    const rsi      = rsis[i];
    const stopMult = strategy?.stop?.value ?? 2;
    const tp1mult  = strategy?.takeProfit?.targets?.[0]?.rrMultiple ?? 1.5;
    const tp2mult  = strategy?.takeProfit?.targets?.[1]?.rrMultiple ?? 3;

    if (bull && rsi > 45 && rsi < 70) {
      const stopDist = atr * stopMult;
      const entry    = candles[i].c;
      return { dir: 'long',  stop: entry - stopDist, tp: [entry + stopDist * tp1mult, entry + stopDist * tp2mult] };
    }
    if (bear && rsi < 55 && rsi > 30) {
      const stopDist = atr * stopMult;
      const entry    = candles[i].c;
      return { dir: 'short', stop: entry + stopDist, tp: [entry - stopDist * tp1mult, entry - stopDist * tp2mult] };
    }
    return null;
  }

  let equity     = capital;
  const equityCurve = new Array(n).fill(capital);
  const ddCurve     = new Array(n).fill(0);
  let peakEquity    = capital;
  const trades      = [];

  let inTrade = false;
  let tradeDir, tradeEntry, tradeStop, tradeTPs;
  let tradeEntryIdx, tradeSize, tpHits, cumulRisk;
  let mae, mfe, trailStop;

  for (let i = 1; i < n; i++) {
    const c = candles[i];

    if (!inTrade) {
      const signal = evalSnap(i);
      if (signal) {
        const riskDist = Math.abs(c.c - signal.stop);
        const riskAmt  = equity * 0.01;
        const units    = riskDist > 0 ? riskAmt / riskDist : 0;
        tradeSize = units * c.c;
        if (tradeSize < 1) continue;
        inTrade       = true;
        tradeDir      = signal.dir;
        tradeEntry    = c.c;
        tradeStop     = signal.stop;
        tradeTPs      = signal.tp;
        tpHits        = 0;
        tradeEntryIdx = i;
        cumulRisk     = riskDist;
        mae = 0; mfe = 0; trailStop = null;
      }
    } else {
      // MAE / MFE
      const unreal = tradeDir === 'long'
        ? (c.l - tradeEntry) / tradeEntry * 100
        : (tradeEntry - c.h) / tradeEntry * 100;
      const unrFav = tradeDir === 'long'
        ? (c.h - tradeEntry) / tradeEntry * 100
        : (tradeEntry - c.l) / tradeEntry * 100;
      if (unreal < mae) mae = unreal;
      if (unrFav > mfe) mfe = unrFav;

      // ATR trail
      const trailMult = strategy?.stop?.trailValue ?? 1.5;
      const trail = tradeDir === 'long'
        ? c.c - atrs[i] * trailMult
        : c.c + atrs[i] * trailMult;
      trailStop = tradeDir === 'long'
        ? Math.max(trailStop ?? trail, trail)
        : Math.min(trailStop ?? trail, trail);

      let exitPrice  = null;
      let exitReason = 'sl';

      // TP1
      if (tpHits === 0 && tradeTPs[0]) {
        const hit = tradeDir === 'long' ? c.h >= tradeTPs[0] : c.l <= tradeTPs[0];
        if (hit) { exitPrice = tradeTPs[0]; exitReason = 'tp1'; tpHits = 1; }
      }
      // TP2
      if (tpHits === 1 && tradeTPs[1]) {
        const hit = tradeDir === 'long' ? c.h >= tradeTPs[1] : c.l <= tradeTPs[1];
        if (hit) { exitPrice = tradeTPs[1]; exitReason = 'tp2'; }
      }
      // SL
      if (!exitPrice) {
        const slHit = tradeDir === 'long' ? c.l <= tradeStop : c.h >= tradeStop;
        if (slHit) { exitPrice = tradeStop; exitReason = 'sl'; }
      }
      // Trail SL
      if (!exitPrice && trailStop !== null) {
        const trailHit = tradeDir === 'long' ? c.l <= trailStop : c.h >= trailStop;
        if (trailHit) { exitPrice = trailStop; exitReason = 'trail'; }
      }

      if (exitPrice !== null) {
        const units = tradeSize / tradeEntry;
        const pnl   = tradeDir === 'long'
          ? (exitPrice - tradeEntry) * units
          : (tradeEntry - exitPrice) * units;
        const r = cumulRisk > 0 ? pnl / (cumulRisk * units) : 0;

        trades.push({
          dir:        tradeDir,
          entryIdx:   tradeEntryIdx,
          exitIdx:    i,
          entryPrice: tradeEntry,
          exitPrice,
          size:       tradeSize,
          pnl,
          pnlPct:     pnl / equity * 100,
          r,
          exitReason,
          mae,
          mfe,
          entryTime:  candles[tradeEntryIdx].t,
          exitTime:   c.t,
        });

        equity  += pnl;
        inTrade  = false;
        trailStop = null;
      }
    }

    equityCurve[i] = equity;
    if (equity > peakEquity) peakEquity = equity;
    ddCurve[i] = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossW = wins.reduce((s, t)   => s + t.pnl, 0);
  const grossL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const profitFactor = grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0;
  const winRate      = trades.length > 0 ? wins.length / trades.length : 0;
  const expectancy   = trades.length > 0 ? (equity - capital) / trades.length : 0;
  const avgWin       = wins.length   > 0 ? grossW / wins.length   : 0;
  const avgLoss      = losses.length > 0 ? grossL / losses.length : 0;
  const avgR         = trades.length > 0 ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0;
  const maxDD        = Math.max(...ddCurve, 0);
  const maxDDabs     = peakEquity * maxDD / 100;

  // Sharpe / Sortino
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1] > 0) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
  }
  const meanR   = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR    = returns.length > 1
    ? Math.sqrt(returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const downDev = returns.length > 0
    ? Math.sqrt(returns.filter(r => r < 0).reduce((a, b) => a + b ** 2, 0) / returns.length)
    : 0;
  const sharpe  = stdR    > 0 ? (meanR / stdR)    * Math.sqrt(365) : 0;
  const sortino = downDev > 0 ? (meanR / downDev) * Math.sqrt(365) : 0;

  // Monthly breakdown
  const monthMap = new Map();
  for (const t of trades) {
    const d = new Date(t.entryTime);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const m = monthMap.get(k) ?? { month: k, pnl: 0, trades: 0, wins: 0 };
    m.pnl += t.pnl; m.trades++; if (t.pnl > 0) m.wins++;
    monthMap.set(k, m);
  }

  return {
    trades,
    equity:         equityCurve,
    drawdown:       ddCurve,
    totalPnl:       equity - capital,
    totalPnlPct:    (equity - capital) / capital * 100,
    winRate,
    profitFactor,
    sharpe,
    sortino,
    maxDrawdown:    maxDDabs,
    maxDrawdownPct: maxDD,
    expectancy,
    avgWin,
    avgLoss,
    avgR,
    totalTrades:    trades.length,
    wins:           wins.length,
    losses:         losses.length,
    monthly:        [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    maeArr:         trades.map(t => t.mae),
    mfeArr:         trades.map(t => t.mfe),
    rArr:           trades.map(t => t.r),
  };
}

// ── Worker message handler ─────────────────────────────────────────────────────
self.addEventListener('message', (e) => {
  try {
    const result = runBacktest(e.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
});