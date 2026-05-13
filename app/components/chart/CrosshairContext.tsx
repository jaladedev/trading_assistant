'use client';

import React, { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrosshairPosition {
  /** Pixel X in the chart canvas (relative to canvas left) */
  x:      number;
  /** The bar index under the crosshair (0 = oldest visible bar) */
  barIdx: number;
  /** The price value at the crosshair Y position */
  price:  number | null;
}

interface CrosshairContextValue {
  /** Read the current crosshair (null when off-chart) */
  crosshairRef: React.RefObject<CrosshairPosition | null>;
  /** Set position — call from mousemove handler of any pane */
  setCrosshair:   (pos: CrosshairPosition) => void;
  /** Clear position — call from mouseleave of any pane */
  clearCrosshair: () => void;
  /** Subscribe to crosshair changes (calls cb on every update) */
  subscribe:      (cb: () => void) => () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const CrosshairContext = createContext<CrosshairContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function CrosshairProvider({ children }: { children: ReactNode }) {
  const crosshairRef = useRef<CrosshairPosition | null>(null);
  const listeners    = useRef<Set<() => void>>(new Set());

  const notify = useCallback(() => {
    for (const cb of listeners.current) cb();
  }, []);

  const setCrosshair = useCallback((pos: CrosshairPosition) => {
    crosshairRef.current = pos;
    notify();
  }, [notify]);

  const clearCrosshair = useCallback(() => {
    crosshairRef.current = null;
    notify();
  }, [notify]);

  const subscribe = useCallback((cb: () => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  return (
    <CrosshairContext.Provider value={{ crosshairRef, setCrosshair, clearCrosshair, subscribe }}>
      {children}
    </CrosshairContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCrosshair() {
  const ctx = useContext(CrosshairContext);
  if (!ctx) throw new Error('useCrosshair must be used inside <CrosshairProvider>');
  return ctx;
}

// ── Utility: draw crosshair on a canvas ──────────────────────────────────────

export interface DrawCrosshairOptions {
  ctx:         CanvasRenderingContext2D;
  pos:         CrosshairPosition | null;
  width:       number;
  height:      number;
  /** Convert barIdx → pixel X. Provided by the pane's own coordinate mapping. */
  barIdxToX?:  (barIdx: number) => number;
  color?:      string;
  dashPattern?: number[];
}

export function drawCrosshair({
  ctx,
  pos,
  width,
  height,
  barIdxToX,
  color       = 'rgba(255,255,255,0.22)',
  dashPattern = [4, 4],
}: DrawCrosshairOptions): void {
  if (!pos) return;

  const x = barIdxToX ? barIdxToX(pos.barIdx) : pos.x;

  ctx.save();
  ctx.setLineDash(dashPattern);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 0.8;

  // Vertical bar line
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();

  ctx.restore();
}

// ── Utility: attach mouse handlers to a canvas ref ───────────────────────────

/**
 * Returns event-handler props to spread onto a <canvas> element.
 * The `mapEvent` function converts the mouse event to a CrosshairPosition.
 *
 * Example:
 *   const handlers = makeCrosshairHandlers(setCrosshair, clearCrosshair, (e) => ({
 *     x:      e.clientX - rect.left,
 *     barIdx: Math.floor((e.clientX - rect.left) / barWidth) + viewStart,
 *     price:  priceAtY(e.clientY - rect.top),
 *   }));
 *   <canvas {...handlers} />
 */
export function makeCrosshairHandlers(
  setCrosshair:   (pos: CrosshairPosition) => void,
  clearCrosshair: () => void,
  mapEvent: (e: MouseEvent) => CrosshairPosition,
): {
  onMouseMove:  (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
} {
  return {
    onMouseMove: (e) => setCrosshair(mapEvent(e.nativeEvent)),
    onMouseLeave: clearCrosshair,
  };
}