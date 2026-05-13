'use client';

import React, {
  createContext, useContext, useCallback,
  useEffect, useRef, useState, type ReactNode,
} from 'react';

// ── Context ───────────────────────────────────────────────────────────────────

interface FullscreenContextValue {
  isFullscreen: boolean;
  enterFullscreen: () => void;
  exitFullscreen:  () => void;
  toggleFullscreen: () => void;
}

const FullscreenContext = createContext<FullscreenContextValue>({
  isFullscreen:     false,
  enterFullscreen:  () => {},
  exitFullscreen:   () => {},
  toggleFullscreen: () => {},
});

export function useFullscreen() {
  return useContext(FullscreenContext);
}

// ── Wrapper component ─────────────────────────────────────────────────────────

interface FullscreenChartWrapperProps {
  children: ReactNode;
  /** className applied to the wrapper div in normal mode */
  className?: string;
}

export function FullscreenChartWrapper({
  children,
  className = '',
}: FullscreenChartWrapperProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const enterFullscreen = useCallback(() => {
    // Prefer native fullscreen API for true pixel-perfect rendering
    const el = wrapperRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Fallback: CSS-only fullscreen overlay
        setIsFullscreen(true);
      });
    } else {
      setIsFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    isFullscreen ? exitFullscreen() : enterFullscreen();
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Sync CSS state with native fullscreen changes (user pressing F11 / ESC)
  useEffect(() => {
    const onFsChange = () => {
      const inFs = Boolean(document.fullscreenElement);
      setIsFullscreen(inFs);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Listen for the global chart:fullscreen event (fired by CommandPalette + F key)
  useEffect(() => {
    const handler = () => toggleFullscreen();
    window.addEventListener('chart:fullscreen', handler);
    return () => window.removeEventListener('chart:fullscreen', handler);
  }, [toggleFullscreen]);

  // ESC key to exit (when not using native fullscreen)
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  const ctx: FullscreenContextValue = {
    isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen,
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const fsStyle: React.CSSProperties = isFullscreen && !document.fullscreenElement
    ? {
        position:   'fixed',
        inset:      0,
        zIndex:     8500,
        background: 'var(--bg)',
        overflow:   'auto',
        padding:    '8px',
      }
    : {};

  return (
    <FullscreenContext.Provider value={ctx}>
      <div ref={wrapperRef} className={className} style={fsStyle}>
        {/* Toolbar button overlay in fullscreen mode */}
        {isFullscreen && (
          <div style={{
            position:       'absolute',
            top:            8,
            right:          8,
            zIndex:         1,
            display:        'flex',
            gap:            6,
            alignItems:     'center',
          }}>
            <button
              onClick={exitFullscreen}
              title="Exit fullscreen (ESC)"
              style={{
                padding:      '5px 10px',
                fontSize:     11,
                fontFamily:   'var(--mono)',
                fontWeight:   600,
                borderRadius: 'var(--radius-sm)',
                cursor:       'pointer',
                border:       '1px solid var(--border2)',
                background:   'var(--bg3)',
                color:        'var(--text2)',
              }}
            >
              ⛶ Exit fullscreen
            </button>
          </div>
        )}
        {children}
      </div>
    </FullscreenContext.Provider>
  );
}

// ── Fullscreen toggle button (embed in CandleChart toolbar) ───────────────────

export function FullscreenToggleButton() {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <button
      onClick={toggleFullscreen}
      title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Fullscreen chart (F)'}
      style={{
        padding:      '4px 9px',
        fontSize:     13,
        borderRadius: 'var(--radius-sm)',
        cursor:       'pointer',
        border:       '1px solid var(--border2)',
        background:   isFullscreen ? 'var(--bg4)' : 'var(--bg3)',
        color:        isFullscreen ? 'var(--accent)' : 'var(--text3)',
        lineHeight:   1,
        transition:   'all .15s',
      }}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isFullscreen ? '⊠' : '⛶'}
    </button>
  );
}

// ── Canvas sharpness helper ───────────────────────────────────────────────────

export function ensureSharpCanvas(canvas: HTMLCanvasElement): {
  dpr:   number;
  cssW:  number;
  cssH:  number;
  scale: (ctx: CanvasRenderingContext2D) => void;
} {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // Only resize if dimensions actually changed — avoids clearing canvas on every frame
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  return {
    dpr,
    cssW,
    cssH,
    scale: (ctx) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}


export interface VirtualView {
  viewStart:  number;
  viewEnd:    number;
  maxBars:    number;
}

/**
 * Compute the visible window of candles for the current canvas width + bar size.
 * `offset` is the pan position (0 = latest bar at right edge).
 */
export function calcVirtualView(
  totalCandles: number,
  barWidth:     number,
  cssW:         number,
  panOffset:    number = 0,
): VirtualView {
  const maxBars  = Math.max(1, Math.floor(cssW / barWidth));
  const viewEnd  = Math.max(maxBars, totalCandles - panOffset);
  const viewStart = Math.max(0, viewEnd - maxBars);
  return {
    viewStart:  Math.min(viewStart, Math.max(0, totalCandles - maxBars)),
    viewEnd:    Math.min(viewEnd,   totalCandles),
    maxBars,
  };
}