'use client';

import React from 'react';

// ── Card ──────────────────────────────────────────────────
export function Card({ children, className = '', style }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px',
      marginBottom: '10px', position: 'relative', overflow: 'hidden',
      ...style,
    }} className={className}>
      {children}
    </div>
  );
}

// ── AccentCard (with top gradient stripe) ─────────────────
export function AccentCard({ children, colors, style }: {
  children: React.ReactNode;
  colors?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card style={style}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: colors ?? 'linear-gradient(90deg, var(--green), var(--blue), var(--purple))',
      }} />
      {children}
    </Card>
  );
}

// ── MetricBox ─────────────────────────────────────────────
export function MetricBox({ label, value, sub, valueColor, danger, warn, good }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  valueColor?: string; danger?: boolean; warn?: boolean; good?: boolean;
}) {
  const border = danger ? 'rgba(255,61,90,0.3)' : warn ? 'rgba(255,184,46,0.25)' : good ? 'rgba(0,229,160,0.25)' : 'var(--border)';
  const bg     = danger ? 'rgba(255,61,90,0.05)' : warn ? 'rgba(255,184,46,0.04)' : good ? 'rgba(0,229,160,0.04)' : 'var(--bg3)';
  return (
    <div style={{ background: bg, borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: `1px solid ${border}`, flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 700, color: valueColor }}>{value}</div>
      {sub && <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────
export function Badge({ children, color, bg, border }: {
  children: React.ReactNode; color?: string; bg?: string; border?: string;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
      padding: '2px 9px', borderRadius: 10, letterSpacing: '.04em',
      color: color ?? 'var(--text2)',
      background: bg ?? 'var(--bg3)',
      border: `1px solid ${border ?? 'var(--border)'}`,
    }}>
      {children}
    </span>
  );
}

// ── PillGroup ─────────────────────────────────────────────
export function PillGroup({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      display: 'flex', gap: 3, background: 'var(--bg2)',
      border: '1px solid var(--border)', borderRadius: 20, padding: 3,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function PillBtn({ children, active, symActive, onClick, style }: {
  children: React.ReactNode; active?: boolean; symActive?: boolean;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
    padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
    border: '1px solid transparent', background: 'transparent',
    color: 'var(--text2)', letterSpacing: '.04em', whiteSpace: 'nowrap',
    transition: 'all .15s',
    ...(active && !symActive ? {
      background: 'var(--bg4)', color: 'var(--text)', borderColor: 'var(--border2)',
    } : {}),
    ...(symActive && active ? {
      background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)',
    } : {}),
    ...style,
  };
  return <button onClick={onClick} style={baseStyle}>{children}</button>;
}

// ── TextInput ─────────────────────────────────────────────
export function NumInput({ value, onChange, placeholder, step, min, max, style }: {
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; step?: number | string; min?: number; max?: number;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, padding: '7px 10px', fontSize: 12, fontFamily: 'var(--mono)',
        background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)',
        borderRadius: 'var(--radius-sm)', outline: 'none',
        ...style,
      }}
    />
  );
}

// ── InputRow ──────────────────────────────────────────────
export function InputRow({ label, children, style }: {
  label: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, ...style }}>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 88, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

// ── SectionTitle ──────────────────────────────────────────
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ── ActionBtn ─────────────────────────────────────────────
export function ActionBtn({ children, onClick, variant = 'default', style }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'default' | 'green' | 'red' | 'amber';
  style?: React.CSSProperties;
}) {
  const colorMap = {
    default: { color: 'var(--text2)', border: 'var(--border2)', bg: 'var(--bg3)' },
    green:   { color: 'var(--green)', border: 'var(--green)',   bg: 'var(--green-bg)' },
    red:     { color: 'var(--red)',   border: 'var(--red)',     bg: 'var(--red-bg)' },
    amber:   { color: 'var(--amber)', border: 'var(--amber)',   bg: 'rgba(255,184,46,0.08)' },
  }[variant];
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
      borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
      border: `1px solid ${colorMap.border}`, background: colorMap.bg, color: colorMap.color,
      transition: 'all .15s', ...style,
    }}>
      {children}
    </button>
  );
}

// ── DirBtns ───────────────────────────────────────────────
export function DirBtns({ dir, onChange }: { dir: 'long' | 'short'; onChange: (d: 'long' | 'short') => void }) {
  const btnStyle = (active: boolean, type: 'long' | 'short'): React.CSSProperties => ({
    flex: 1, padding: '6px 14px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em', transition: 'all .15s',
    border: `1px solid ${active ? (type === 'long' ? 'var(--green)' : 'var(--red)') : 'var(--border2)'}`,
    background: active ? (type === 'long' ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)',
    color: active ? (type === 'long' ? 'var(--green)' : 'var(--red)') : 'var(--text2)',
  });
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button style={btnStyle(dir === 'long',  'long')}  onClick={() => onChange('long')}>▲ Long</button>
      <button style={btnStyle(dir === 'short', 'short')} onClick={() => onChange('short')}>▼ Short</button>
    </div>
  );
}