import type { Candle } from './indicators';
import type { Strategy } from './strategy';

export interface BacktestRequest {
  candles:  Candle[];
  strategy: Strategy;
  capital:  number;
}

export interface BacktestTrade {
  dir:        'long' | 'short';
  entryIdx:   number;
  exitIdx:    number;
  entryPrice: number;
  exitPrice:  number;
  size:       number;
  pnl:        number;
  pnlPct:     number;
  r:          number;
  exitReason: 'tp1' | 'tp2' | 'tp3' | 'sl' | 'trail' | 'eod';
  mae:        number;
  mfe:        number;
  entryTime:  number;
  exitTime:   number;
}

export interface MonthlyStats {
  month:  string;
  pnl:    number;
  trades: number;
  wins:   number;
}

export interface BacktestResult {
  trades:          BacktestTrade[];
  equity:          number[];
  drawdown:        number[];
  totalPnl:        number;
  totalPnlPct:     number;
  winRate:         number;
  profitFactor:    number;
  sharpe:          number;
  sortino:         number;
  maxDrawdown:     number;
  maxDrawdownPct:  number;
  expectancy:      number;
  avgWin:          number;
  avgLoss:         number;
  avgR:            number;
  totalTrades:     number;
  wins:            number;
  losses:          number;
  monthly:         MonthlyStats[];
  maeArr:          number[];
  mfeArr:          number[];
  rArr:            number[];
}

export interface WorkerMessage {
  ok:      boolean;
  result?: BacktestResult;
  error?:  string;
}