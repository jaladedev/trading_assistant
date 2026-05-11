export type DrawingToolKind =
  | 'hline'       // horizontal line
  | 'trendline'   // two-point diagonal line
  | 'fib'         // manual fibonacci retracement (two-point drag)
  | 'rect';       // rectangle / zone box

// ─────────────────────────────────────────────────────────────────────────────
//  Drawing objects
// ─────────────────────────────────────────────────────────────────────────────
interface BaseDrawing {
  id:    string;
  kind:  DrawingToolKind;
  color: string;
  label?: string;
}

export interface HLineDrawing extends BaseDrawing {
  kind:  'hline';
  price: number;
}

export interface TrendLineDrawing extends BaseDrawing {
  kind:  'trendline';
  /** bar indices (0 = leftmost visible bar) */
  x1:    number;
  y1:    number;   // price
  x2:    number;
  y2:    number;
}

export interface FibDrawing extends BaseDrawing {
  kind:    'fib';
  x1:      number;
  y1:      number;   // price at start
  x2:      number;
  y2:      number;   // price at end
  levels:  number[];   // e.g. [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
}

export interface RectDrawing extends BaseDrawing {
  kind:  'rect';
  x1:    number;
  y1:    number;
  x2:    number;
  y2:    number;
  fillOpacity: number;
}

export type Drawing = HLineDrawing | TrendLineDrawing | FibDrawing | RectDrawing;

// ─────────────────────────────────────────────────────────────────────────────
//  Active drawing session (in-progress drag)
// ─────────────────────────────────────────────────────────────────────────────
export interface ActiveDraw {
  kind:      DrawingToolKind;
  startX:    number;   // canvas pixel
  startY:    number;
  startPrice: number;
  startBarIdx: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Factory helpers
// ─────────────────────────────────────────────────────────────────────────────
let _seq = 0;
function uid() { return `d${++_seq}_${Date.now()}`; }

export function makeHLine(price: number, color = 'rgba(255,184,46,0.8)'): HLineDrawing {
  return { id: uid(), kind: 'hline', price, color };
}

export function makeTrendLine(
  x1: number, y1: number, x2: number, y2: number,
  color = 'rgba(77,166,255,0.8)',
): TrendLineDrawing {
  return { id: uid(), kind: 'trendline', x1, y1, x2, y2, color };
}

export function makeFibDrawing(
  x1: number, y1: number, x2: number, y2: number,
  levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
  color  = 'rgba(167,139,255,0.8)',
): FibDrawing {
  return { id: uid(), kind: 'fib', x1, y1, x2, y2, levels, color };
}

export function makeRect(
  x1: number, y1: number, x2: number, y2: number,
  color       = 'rgba(255,184,46,0.5)',
  fillOpacity = 0.06,
): RectDrawing {
  return { id: uid(), kind: 'rect', x1, y1, x2, y2, color, fillOpacity };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Default color per tool
// ─────────────────────────────────────────────────────────────────────────────
export const TOOL_DEFAULTS: Record<DrawingToolKind, { color: string; label: string; icon: string }> = {
  hline:     { color: 'rgba(255,184,46,0.9)',   label: 'H-Line',     icon: '⟵—⟶' },
  trendline: { color: 'rgba(77,166,255,0.9)',   label: 'Trend Line', icon: '↗' },
  fib:       { color: 'rgba(167,139,255,0.9)',  label: 'Fib Retrace',icon: '𝑓' },
  rect:      { color: 'rgba(255,184,46,0.5)',   label: 'Zone Box',   icon: '▭' },
};