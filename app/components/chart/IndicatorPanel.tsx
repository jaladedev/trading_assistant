'use client';

import { useState } from 'react';
import { useStore, ActiveIndicators, IndicatorParams } from '@/lib/store';

// ── Types ─────────────────────────────────────────────────
interface IndicatorDef {
  key:     keyof ActiveIndicators;
  label:   string;
  group:   'price' | 'oscillator' | 'volume' | 'pattern';
  params?: Array<{
    key:   keyof IndicatorParams;
    label: string;
    min:   number;
    max:   number;
    step:  number;
  }>;
}

const INDICATORS: IndicatorDef[] = [
  // Price pane overlays
  { key: 'ema9',       label: 'EMA 9',         group: 'price',
    params: [{ key: 'ema9Period',  label: 'Period', min: 1, max: 200, step: 1 }] },
  { key: 'ema20',      label: 'EMA 20',        group: 'price',
    params: [{ key: 'ema20Period', label: 'Period', min: 1, max: 200, step: 1 }] },
  { key: 'ema50',      label: 'EMA 50',        group: 'price',
    params: [{ key: 'ema50Period', label: 'Period', min: 1, max: 500, step: 1 }] },
  { key: 'vwap',       label: 'VWAP',          group: 'price' },
  { key: 'vwapBands',  label: 'VWAP Bands ±1σ ±2σ', group: 'price' },
  { key: 'bb',         label: 'Bollinger Bands', group: 'price',
    params: [
      { key: 'bbPeriod', label: 'Period', min: 5, max: 100, step: 1 },
      { key: 'bbStdDev', label: 'Std Dev', min: 0.5, max: 4, step: 0.1 },
    ] },
  { key: 'superTrend', label: 'SuperTrend',    group: 'price',
    params: [
      { key: 'stPeriod',     label: 'ATR Period', min: 3, max: 50,  step: 1 },
      { key: 'stMultiplier', label: 'Multiplier', min: 1, max: 10,  step: 0.1 },
    ] },
  { key: 'psar',       label: 'Parabolic SAR', group: 'price',
    params: [
      { key: 'psarStep', label: 'Step', min: 0.001, max: 0.1,  step: 0.001 },
      { key: 'psarMax',  label: 'Max',  min: 0.1,   max: 0.5,  step: 0.01 },
    ] },

  // Oscillators (separate panes)
  { key: 'rsi',        label: 'RSI',           group: 'oscillator',
    params: [{ key: 'rsiPeriod', label: 'Period', min: 2, max: 50, step: 1 }] },
  { key: 'stochRsi',   label: 'Stoch RSI',     group: 'oscillator',
    params: [{ key: 'stochRsiPeriod', label: 'Period', min: 5, max: 50, step: 1 }] },
  { key: 'macd',       label: 'MACD',          group: 'oscillator',
    params: [
      { key: 'macdFast',   label: 'Fast',   min: 3,  max: 50,  step: 1 },
      { key: 'macdSlow',   label: 'Slow',   min: 5,  max: 200, step: 1 },
      { key: 'macdSignal', label: 'Signal', min: 2,  max: 50,  step: 1 },
    ] },
  { key: 'adx',        label: 'ADX',           group: 'oscillator',
    params: [{ key: 'adxPeriod', label: 'Period', min: 5, max: 50, step: 1 }] },
  { key: 'williamsR',  label: 'Williams %R',   group: 'oscillator',
    params: [{ key: 'williamsRPeriod', label: 'Period', min: 5, max: 50, step: 1 }] },
  { key: 'cci',        label: 'CCI',           group: 'oscillator',
    params: [{ key: 'cciPeriod', label: 'Period', min: 5, max: 50, step: 1 }] },

  // Volume
  { key: 'volume',     label: 'Volume',        group: 'volume' },
  { key: 'cvd',        label: 'CVD',           group: 'volume' },
  { key: 'obv',        label: 'OBV',           group: 'volume' },

  // Patterns
  { key: 'patterns',   label: 'Candle Patterns', group: 'pattern' },
];

const GROUP_LABELS: Record<string, string> = {
  price:      '📈 Price Pane',
  oscillator: '〰 Oscillators',
  volume:     '📊 Volume',
  pattern:    '🕯 Patterns',
};

const GROUP_COLORS: Record<string, string> = {
  price:      'var(--blue)',
  oscillator: 'var(--amber)',
  volume:     'var(--green)',
  pattern:    'var(--purple)',
};

// ── Component ──────────────────────────────────────────────
export default function IndicatorPanel({ onClose }: { onClose: () => void }) {
  const { activeIndicators, indicatorParams, toggleIndicator, setIndicatorParam, resetIndicatorParams } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  const groups = ['price', 'oscillator', 'volume', 'pattern'] as const;

  const filtered = INDICATORS.filter(ind =>
    search === '' || ind.label.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = Object.values(activeIndicators).filter(Boolean).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 320, height: '100vh',
        background: 'var(--bg2)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg3)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
              Indicators
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
              {activeCount} active
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={resetIndicatorParams}
              style={{
                fontSize: 10, fontFamily: 'var(--mono)', padding: '4px 9px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'var(--bg4)',
                color: 'var(--text3)', transition: 'all .15s',
              }}
            >
              Reset
            </button>
            <button
              onClick={onClose}
              style={{
                fontSize: 14, fontFamily: 'var(--mono)', padding: '4px 9px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'var(--bg4)',
                color: 'var(--text2)', lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search indicators…"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 11,
              fontFamily: 'var(--mono)', background: 'var(--bg3)',
              color: 'var(--text)', border: '1px solid var(--border2)',
              borderRadius: 'var(--radius-sm)', outline: 'none',
            }}
          />
        </div>

        {/* Groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {groups.map(group => {
            const items = filtered.filter(i => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                {/* Group header */}
                <div style={{
                  fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
                  color: GROUP_COLORS[group],
                  textTransform: 'uppercase', letterSpacing: '.1em',
                  padding: '8px 16px 4px',
                }}>
                  {GROUP_LABELS[group]}
                </div>

                {items.map(ind => {
                  const isOn    = activeIndicators[ind.key];
                  const isExp   = expanded === ind.key;
                  const hasParams = ind.params && ind.params.length > 0;

                  return (
                    <div key={ind.key}>
                      {/* Row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 16px',
                        background: isExp ? 'var(--bg3)' : 'transparent',
                        borderLeft: isOn ? `2px solid ${GROUP_COLORS[group]}` : '2px solid transparent',
                        transition: 'all .12s',
                      }}>
                        {/* Toggle */}
                        <div
                          onClick={() => toggleIndicator(ind.key)}
                          style={{
                            width: 32, height: 18, borderRadius: 9, flexShrink: 0,
                            background: isOn ? 'var(--accent)' : 'var(--bg4)',
                            border: `1px solid ${isOn ? 'var(--accent)' : 'var(--border2)'}`,
                            cursor: 'pointer', position: 'relative',
                            transition: 'all .2s',
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 2,
                            left: isOn ? 15 : 2,
                            width: 12, height: 12, borderRadius: '50%',
                            background: isOn ? '#000' : 'var(--text3)',
                            transition: 'left .2s',
                          }} />
                        </div>

                        {/* Label */}
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--mono)', flex: 1,
                          color: isOn ? 'var(--text)' : 'var(--text2)',
                          fontWeight: isOn ? 600 : 400,
                          transition: 'color .15s',
                        }}>
                          {ind.label}
                        </span>

                        {/* Expand params button */}
                        {hasParams && isOn && (
                          <button
                            onClick={() => setExpanded(isExp ? null : ind.key)}
                            style={{
                              fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 7px',
                              borderRadius: 4, cursor: 'pointer',
                              border: `1px solid ${isExp ? 'var(--accent)' : 'var(--border2)'}`,
                              background: isExp ? 'rgba(0,229,160,0.08)' : 'var(--bg4)',
                              color: isExp ? 'var(--accent)' : 'var(--text3)',
                              transition: 'all .15s', flexShrink: 0,
                            }}
                          >
                            {isExp ? '▲' : '▼'} params
                          </button>
                        )}
                      </div>

                      {/* Params panel */}
                      {isExp && hasParams && isOn && (
                        <div style={{
                          padding: '8px 16px 12px 52px',
                          background: 'var(--bg3)',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {ind.params!.map(param => (
                            <div key={param.key} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
                                width: 70, flexShrink: 0,
                              }}>
                                {param.label}
                              </span>
                              <input
                                type="number"
                                value={indicatorParams[param.key]}
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                onChange={e => setIndicatorParam(param.key, parseFloat(e.target.value) || param.min)}
                                style={{
                                  width: 72, padding: '4px 7px', fontSize: 11,
                                  fontFamily: 'var(--mono)', background: 'var(--bg4)',
                                  color: 'var(--text)', border: '1px solid var(--border2)',
                                  borderRadius: 'var(--radius-sm)', outline: 'none',
                                }}
                              />
                              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                                {param.min}–{param.max}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
          lineHeight: 1.5, flexShrink: 0, background: 'var(--bg3)',
        }}>
          Changes apply immediately · Params are saved between sessions
        </div>
      </div>
    </div>
  );
}