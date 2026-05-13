import type { Candle } from './indicators';
import type { Strategy, StrategySignal } from './strategy';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaperOrderStatus = 'open' | 'closed_tp' | 'closed_sl' | 'closed_be' | 'closed_trail' | 'closed_manual';

export interface PaperTPLevel {
  price:       number;
  sizePercent: number;   // % of original position
  hit:         boolean;
  hitAt?:      number;   // timestamp
  pnl?:        number;
}

export interface PaperPosition {
  id:            string;
  strategyId:    string;
  strategyName:  string;
  sym:           string;
  dir:           'long' | 'short';
  entryPrice:    number;
  size:          number;     // $ position value
  stopPrice:     number;
  initialStop:   number;     // never moves; used for R calc
  tpLevels:      PaperTPLevel[];
  trailActive:   boolean;
  trailPrice:    number | null;
  breakEvenAt:   number;     // R multiple to move SL to BE (0 = off)
  breakEvenDone: boolean;
  openedAt:      number;     // timestamp
  closedAt?:     number;
  closePrice?:   number;
  status:        PaperOrderStatus;
  realised:      number;     // $ P&L from partial TPs
  unrealised:    number;     // $ P&L live
  notes:         string;
}

export interface PaperAccount {
  balance:       number;     // starting + realised P&L
  startBalance:  number;
  totalPnl:      number;
  winCount:      number;
  lossCount:     number;
  openPositions: PaperPosition[];
  closedPositions: PaperPosition[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function openPaperPosition(
  signal:       StrategySignal,
  strategy:     Strategy,
  sym:          string,
  accountBalance: number,
): PaperPosition {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const tpLevels: PaperTPLevel[] = signal.targets.map((price, i) => ({
    price,
    sizePercent: strategy.takeProfit.targets[i]?.sizePercent ?? Math.round(100 / signal.targets.length),
    hit: false,
  }));

  return {
    id,
    strategyId:   strategy.id,
    strategyName: strategy.name,
    sym,
    dir:          signal.dir,
    entryPrice:   signal.entry,
    size:         signal.size,
    stopPrice:    signal.stop,
    initialStop:  signal.stop,
    tpLevels,
    trailActive:  strategy.stop.trailAfter > 0,
    trailPrice:   null,
    breakEvenAt:  strategy.stop.breakEvenAt,
    breakEvenDone: false,
    openedAt:     Date.now(),
    status:       'open',
    realised:     0,
    unrealised:   0,
    notes:        '',
  };
}

// ── Tick — update one open position against latest price ──────────────────────

export interface TickResult {
  position:   PaperPosition;
  closed:     boolean;
  closeReason?: PaperOrderStatus;
  pnlDelta:   number;   // realised P&L this tick
}

export function tickPosition(pos: PaperPosition, price: number, atr: number | null): TickResult {
  if (pos.status !== 'open') return { position: pos, closed: false, pnlDelta: 0 };

  const p         = { ...pos, tpLevels: pos.tpLevels.map(t => ({ ...t })) };
  const isLong    = p.dir === 'long';
  const riskDist  = Math.abs(p.entryPrice - p.initialStop);
  let   pnlDelta  = 0;

  // Unrealised
  const units      = p.size / p.entryPrice;
  p.unrealised     = isLong
    ? (price - p.entryPrice) * units
    : (p.entryPrice - price) * units;

  // Break-even move
  if (!p.breakEvenDone && p.breakEvenAt > 0 && riskDist > 0) {
    const rMultiple = p.unrealised / (riskDist * units);
    if (rMultiple >= p.breakEvenAt) {
      p.stopPrice    = p.entryPrice;
      p.breakEvenDone = true;
    }
  }

  // Trailing stop advance (ratchet only in favour)
  if (p.trailActive && atr !== null) {
    const trailDist = atr * 1.5;
    const newTrail  = isLong ? price - trailDist : price + trailDist;
    if (p.trailPrice === null) {
      p.trailPrice = newTrail;
    } else {
      p.trailPrice = isLong
        ? Math.max(p.trailPrice, newTrail)
        : Math.min(p.trailPrice, newTrail);
    }
    // Only tighten stop if trailing stop is better
    if (isLong && p.trailPrice > p.stopPrice) p.stopPrice = p.trailPrice;
    if (!isLong && p.trailPrice < p.stopPrice) p.stopPrice = p.trailPrice;
  }

  // Check partial TPs (in order)
  for (const tp of p.tpLevels) {
    if (tp.hit) continue;
    const hit = isLong ? price >= tp.price : price <= tp.price;
    if (hit) {
      const portion = (tp.sizePercent / 100) * units;
      const profit  = isLong
        ? (tp.price - p.entryPrice) * portion
        : (p.entryPrice - tp.price) * portion;
      tp.hit    = true;
      tp.hitAt  = Date.now();
      tp.pnl    = profit;
      p.realised += profit;
      pnlDelta   += profit;
    }
  }

  // All TPs hit → close position
  const allTpHit = p.tpLevels.length > 0 && p.tpLevels.every(t => t.hit);
  if (allTpHit) {
    const remaining = p.tpLevels.filter(t => t.hit).reduce((s, t) => s + t.sizePercent, 0);
    p.closedAt    = Date.now();
    p.closePrice  = price;
    p.status      = 'closed_tp';
    return { position: p, closed: true, closeReason: 'closed_tp', pnlDelta };
  }

  // SL hit
  const slHit = isLong ? price <= p.stopPrice : price >= p.stopPrice;
  if (slHit) {
    // Calc remaining open portion PnL
    const hitPct      = p.tpLevels.filter(t => t.hit).reduce((s, t) => s + t.sizePercent, 0);
    const remainPct   = 100 - hitPct;
    const remainUnits = units * (remainPct / 100);
    const slPnl       = isLong
      ? (p.stopPrice - p.entryPrice) * remainUnits
      : (p.entryPrice - p.stopPrice) * remainUnits;
    p.realised  += slPnl;
    pnlDelta    += slPnl;
    p.closedAt   = Date.now();
    p.closePrice = p.stopPrice;
    const reason: PaperOrderStatus = p.breakEvenDone
      ? 'closed_be'
      : p.trailPrice !== null && p.trailActive
        ? 'closed_trail'
        : 'closed_sl';
    p.status = reason;
    return { position: p, closed: true, closeReason: reason, pnlDelta };
  }

  return { position: p, closed: false, pnlDelta };
}

// ── R-multiple helper ─────────────────────────────────────────────────────────
export function calcRMultiple(pos: PaperPosition): number {
  const riskDist = Math.abs(pos.entryPrice - pos.initialStop);
  if (riskDist === 0) return 0;
  const units = pos.size / pos.entryPrice;
  return pos.realised / (riskDist * units);
}

// ── Status label ──────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<PaperOrderStatus, string> = {
  open:          '● Open',
  closed_tp:     '✓ TP Hit',
  closed_sl:     '✗ SL Hit',
  closed_be:     '◈ Break-even',
  closed_trail:  '⊳ Trailed Out',
  closed_manual: '⊠ Manual Close',
};