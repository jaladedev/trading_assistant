'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
  Strategy, Rule, EntryCondition, StopConfig, TakeProfitConfig, SizingConfig,
  Operand, Condition, IndicatorId, PRESET_STRATEGIES,
} from '@/lib/strategy';
import { fmtPrice } from '@/lib/indicators';

// ── Label maps ────────────────────────────────────────────────────────────────
const INDICATOR_LABELS: Record<IndicatorId, string> = {
  price_close: 'Price (Close)', price_open: 'Price (Open)',
  price_high:  'Price (High)',  price_low:  'Price (Low)',
  ema9: 'EMA 9', ema20: 'EMA 20', ema50: 'EMA 50',
  rsi: 'RSI', stoch_rsi_k: 'Stoch RSI K', stoch_rsi_d: 'Stoch RSI D',
  macd_line: 'MACD Line', macd_signal: 'MACD Signal', macd_hist: 'MACD Hist',
  bb_upper: 'BB Upper', bb_middle: 'BB Middle', bb_lower: 'BB Lower',
  bb_pct: 'BB %B', bb_width: 'BB Width',
  atr: 'ATR',
  supertrend_dir: 'SuperTrend Dir', adx: 'ADX',
  plus_di: '+DI', minus_di: '-DI',
  obv: 'OBV', williams_r: 'Williams %R', cci: 'CCI',
  psar_dir: 'PSAR Dir', vwap: 'VWAP',
  cvd_cum: 'CVD (Cum)', volume: 'Volume',
};

const CONDITION_LABELS: Record<Condition, string> = {
  crosses_above: 'crosses above', crosses_below: 'crosses below',
  greater_than: '>', less_than: '<',
  greater_equal: '≥', less_equal: '≤',
  equals: '=', is_true: 'is true',
};

const INDICATOR_IDS = Object.keys(INDICATOR_LABELS) as IndicatorId[];

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function makeRule(): Rule {
  return {
    id: uid(),
    left:      { type: 'indicator', id: 'rsi' },
    condition: 'greater_than',
    right:     { type: 'fixed', value: 50 },
    lookback:  1,
  };
}

function makeEntryCondition(): EntryCondition {
  return {
    rules: [makeRule()],
    logic: 'AND',
    filters: { minADX: 0, sessionOnly: false },
  };
}

const defaultStop: StopConfig = {
  type: 'atr_multiple', value: 2,
  breakEvenAt: 1, trailAfter: 2,
  trailType: 'atr_multiple', trailValue: 1.5,
};

const defaultTP: TakeProfitConfig = {
  targets: [
    { rrMultiple: 1.5, sizePercent: 50 },
    { rrMultiple: 3,   sizePercent: 50 },
  ],
};

const defaultSizing: SizingConfig = {
  method: 'risk_pct', value: 1,
  maxPerTrade: 500, maxOpen: 1, maxDailyLoss: 0,
};

function makeStrategy(name = 'New Strategy'): Strategy {
  return {
    id: uid(), name, description: '',
    createdAt: Date.now(), updatedAt: Date.now(), enabled: true,
    longEntry:  makeEntryCondition(),
    shortEntry: null,
    exitRules:  null,
    stop:       { ...defaultStop },
    takeProfit: { targets: [...defaultTP.targets.map(t => ({ ...t })) ] },
    sizing:     { ...defaultSizing },
  };
}

// ── Shared input styles ───────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)',
  background: 'var(--bg3)', color: 'var(--text)',
  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none',
};

const selectStyle: React.CSSProperties = { ...inputBase, cursor: 'pointer' };
const numStyle: React.CSSProperties    = { ...inputBase, width: 72 };

// ── RuleRow ───────────────────────────────────────────────────────────────────
function RuleRow({
  rule, onChange, onDelete,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onDelete: () => void;
}) {
  const setLeft = (id: IndicatorId) =>
    onChange({ ...rule, left: { type: 'indicator', id } });

  const setCond = (c: Condition) =>
    onChange({ ...rule, condition: c });

  const setRightIndicator = (id: IndicatorId) =>
    onChange({ ...rule, right: { type: 'indicator', id } });

  const setRightFixed = (v: string) =>
    onChange({ ...rule, right: { type: 'fixed', value: parseFloat(v) || 0 } });

  const rightIsFixed = rule.right.type === 'fixed';
  const rightFixed   = rightIsFixed ? (rule.right as { type: 'fixed'; value: number }).value : 0;
  const rightIndId   = !rightIsFixed ? (rule.right as { type: 'indicator'; id: IndicatorId }).id : 'rsi';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '7px 10px', background: 'var(--bg3)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      marginBottom: 5,
    }}>
      {/* Left operand */}
      <select
        value={(rule.left as { type: 'indicator'; id: IndicatorId }).id}
        onChange={e => setLeft(e.target.value as IndicatorId)}
        style={{ ...selectStyle, flex: 1, minWidth: 110 }}
      >
        {INDICATOR_IDS.map(id => (
          <option key={id} value={id}>{INDICATOR_LABELS[id]}</option>
        ))}
      </select>

      {/* Condition */}
      <select
        value={rule.condition}
        onChange={e => setCond(e.target.value as Condition)}
        style={{ ...selectStyle, minWidth: 110 }}
      >
        {(Object.entries(CONDITION_LABELS) as [Condition, string][]).map(([c, lbl]) => (
          <option key={c} value={c}>{lbl}</option>
        ))}
      </select>

      {/* Right operand type toggle */}
      <select
        value={rightIsFixed ? 'fixed' : 'indicator'}
        onChange={e => {
          if (e.target.value === 'fixed') onChange({ ...rule, right: { type: 'fixed', value: 50 } });
          else onChange({ ...rule, right: { type: 'indicator', id: 'ema20' } });
        }}
        style={{ ...selectStyle, width: 80 }}
      >
        <option value="indicator">Indicator</option>
        <option value="fixed">Value</option>
      </select>

      {/* Right operand value */}
      {rightIsFixed ? (
        <input
          type="number" value={rightFixed} step={0.1}
          onChange={e => setRightFixed(e.target.value)}
          style={numStyle}
        />
      ) : (
        <select
          value={rightIndId}
          onChange={e => setRightIndicator(e.target.value as IndicatorId)}
          style={{ ...selectStyle, flex: 1, minWidth: 110 }}
        >
          {INDICATOR_IDS.map(id => (
            <option key={id} value={id}>{INDICATOR_LABELS[id]}</option>
          ))}
        </select>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        style={{
          padding: '4px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)',
          background: 'rgba(255,61,90,0.07)', color: 'var(--red)', flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}

// ── EntryConditionEditor ──────────────────────────────────────────────────────
function EntryConditionEditor({
  label, cond, onChange, onClear,
}: {
  label:    string;
  cond:     EntryCondition | null;
  onChange: (c: EntryCondition | null) => void;
  onClear?: () => void;
}) {
  if (!cond) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          {label}
        </div>
        <button
          onClick={() => onChange(makeEntryCondition())}
          style={{
            padding: '6px 14px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
          }}
        >
          + Enable {label}
        </button>
      </div>
    );
  }

  const updateRule = (idx: number, r: Rule) => {
    const rules = [...cond.rules];
    rules[idx] = r;
    onChange({ ...cond, rules });
  };

  const deleteRule = (idx: number) => {
    const rules = cond.rules.filter((_, i) => i !== idx);
    onChange({ ...cond, rules });
  };

  const addRule = () => onChange({ ...cond, rules: [...cond.rules, makeRule()] });

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label}
        </span>
        {/* AND / OR toggle */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 8 }}>
          {(['AND', 'OR'] as const).map(l => (
            <button
              key={l}
              onClick={() => onChange({ ...cond, logic: l })}
              style={{
                padding: '3px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 4, cursor: 'pointer', transition: 'all .15s',
                border: `1px solid ${cond.logic === l ? 'var(--accent)' : 'var(--border2)'}`,
                background: cond.logic === l ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
                color: cond.logic === l ? 'var(--accent)' : 'var(--text2)',
              }}
            >{l}</button>
          ))}
        </div>
        {onClear && (
          <button
            onClick={() => onChange(null)}
            style={{
              marginLeft: 'auto', padding: '3px 8px', fontSize: 9,
              fontFamily: 'var(--mono)', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text3)',
            }}
          >Remove</button>
        )}
      </div>

      {/* Rules */}
      {cond.rules.map((rule, i) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          onChange={r => updateRule(i, r)}
          onDelete={() => deleteRule(i)}
        />
      ))}

      <button
        onClick={addRule}
        style={{
          padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
          marginBottom: 8,
        }}
      >+ Add Rule</button>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 }}>Filters:</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', cursor: 'pointer' }}>
          <span>Min ADX</span>
          <input
            type="number" value={cond.filters?.minADX ?? 0} min={0} max={100} step={5}
            onChange={e => onChange({ ...cond, filters: { ...cond.filters!, minADX: +e.target.value } })}
            style={{ ...numStyle, width: 50 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cond.filters?.sessionOnly ?? false}
            onChange={e => onChange({ ...cond, filters: { ...cond.filters!, sessionOnly: e.target.checked } })}
          />
          <span>Session only (07–16 UTC)</span>
        </label>
      </div>
    </div>
  );
}

// ── StopEditor ────────────────────────────────────────────────────────────────
function StopEditor({ stop, onChange }: { stop: StopConfig; onChange: (s: StopConfig) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Stop Loss
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {([
          ['fixed_pct',    'Fixed %'],
          ['atr_multiple', 'ATR ×'],
          ['swing_low',    'Swing'],
          ['bb_band',      'BB Band'],
        ] as const).map(([v, lbl]) => (
          <button
            key={v}
            onClick={() => onChange({ ...stop, type: v })}
            style={{
              padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all .15s',
              border: `1px solid ${stop.type === v ? 'var(--red)' : 'var(--border2)'}`,
              background: stop.type === v ? 'rgba(255,61,90,0.1)' : 'var(--bg3)',
              color: stop.type === v ? 'var(--red)' : 'var(--text2)',
            }}
          >{lbl}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
            {stop.type === 'fixed_pct' ? 'Distance %' : stop.type === 'atr_multiple' ? 'ATR Multiple' : stop.type === 'swing_low' ? 'Lookback Bars' : 'Band'}
          </label>
          <input
            type="number" value={stop.value} min={0.1} step={0.1}
            onChange={e => onChange({ ...stop, value: +e.target.value })}
            style={{ ...numStyle, width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Break-even at (×R)</label>
          <input
            type="number" value={stop.breakEvenAt} min={0} step={0.1}
            onChange={e => onChange({ ...stop, breakEvenAt: +e.target.value })}
            style={{ ...numStyle, width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Trail after (×R, 0=off)</label>
          <input
            type="number" value={stop.trailAfter} min={0} step={0.1}
            onChange={e => onChange({ ...stop, trailAfter: +e.target.value })}
            style={{ ...numStyle, width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Trail distance</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={stop.trailType}
              onChange={e => onChange({ ...stop, trailType: e.target.value as 'fixed_pct' | 'atr_multiple' })}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="fixed_pct">%</option>
              <option value="atr_multiple">ATR×</option>
            </select>
            <input
              type="number" value={stop.trailValue} min={0.1} step={0.1}
              onChange={e => onChange({ ...stop, trailValue: +e.target.value })}
              style={{ ...numStyle, width: 55 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TakeProfitEditor ──────────────────────────────────────────────────────────
function TakeProfitEditor({ tp, onChange }: { tp: TakeProfitConfig; onChange: (t: TakeProfitConfig) => void }) {
  const totalPct = tp.targets.reduce((a, t) => a + t.sizePercent, 0);
  const balanced = Math.abs(totalPct - 100) < 0.1;

  const updateTarget = (i: number, key: 'rrMultiple' | 'sizePercent', v: number) => {
    const targets = tp.targets.map((t, idx) => idx === i ? { ...t, [key]: v } : t);
    onChange({ ...tp, targets });
  };

  const addTarget = () => {
    if (tp.targets.length >= 4) return;
    const existing = tp.targets.reduce((a, t) => a + t.sizePercent, 0);
    const newPct = Math.max(0, 100 - existing);
    onChange({ ...tp, targets: [...tp.targets, { rrMultiple: 3, sizePercent: newPct }] });
  };

  const removeTarget = (i: number) => {
    onChange({ ...tp, targets: tp.targets.filter((_, idx) => idx !== i) });
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Take Profit
      </div>

      {tp.targets.map((t, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
          padding: '7px 10px', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', width: 30, flexShrink: 0 }}>
            TP{i + 1}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>1:</span>
            <input
              type="number" value={t.rrMultiple} min={0.5} step={0.1}
              onChange={e => updateTarget(i, 'rrMultiple', +e.target.value)}
              style={{ ...numStyle, width: 55 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number" value={t.sizePercent} min={1} max={100} step={5}
              onChange={e => updateTarget(i, 'sizePercent', +e.target.value)}
              style={{ ...numStyle, width: 55 }}
            />
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>%</span>
          </div>
          {tp.targets.length > 1 && (
            <button
              onClick={() => removeTarget(i)}
              style={{ padding: '3px 7px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: 'var(--red)' }}
            >×</button>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {tp.targets.length < 4 && (
          <button
            onClick={addTarget}
            style={{
              padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
            }}
          >+ Add Target</button>
        )}
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: balanced ? 'var(--green)' : 'var(--red)' }}>
          Total: {totalPct}% {balanced ? '✓' : '⚠ must equal 100%'}
        </span>
      </div>
    </div>
  );
}

// ── SizingEditor ──────────────────────────────────────────────────────────────
function SizingEditor({ sizing, onChange }: { sizing: SizingConfig; onChange: (s: SizingConfig) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Position Sizing
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {([
          ['fixed_usd',  'Fixed $'],
          ['fixed_pct',  'Fixed %'],
          ['risk_pct',   'Risk %'],
        ] as const).map(([v, lbl]) => (
          <button
            key={v}
            onClick={() => onChange({ ...sizing, method: v })}
            style={{
              padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all .15s',
              border: `1px solid ${sizing.method === v ? 'var(--accent)' : 'var(--border2)'}`,
              background: sizing.method === v ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
              color: sizing.method === v ? 'var(--accent)' : 'var(--text2)',
            }}
          >{lbl}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { key: 'value' as const,        label: sizing.method === 'fixed_usd' ? 'Amount ($)' : sizing.method === 'fixed_pct' ? '% of Capital' : 'Risk %' },
          { key: 'maxPerTrade' as const,  label: 'Max per Trade ($)' },
          { key: 'maxOpen' as const,      label: 'Max Open Positions' },
          { key: 'maxDailyLoss' as const, label: 'Daily Loss Limit ($)' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</label>
            <input
              type="number" value={sizing[key]} min={0} step={key === 'value' ? 0.1 : 1}
              onChange={e => onChange({ ...sizing, [key]: +e.target.value })}
              style={{ ...numStyle, width: '100%' }}
            />
          </div>
        ))}
      </div>
      {sizing.method === 'risk_pct' && (
        <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '6px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', lineHeight: 1.5 }}>
          Risk {sizing.value}% of capital per trade. Position size auto-calculated from SL distance.
        </div>
      )}
    </div>
  );
}

// ── Main StrategyBuilder ──────────────────────────────────────────────────────
export default function StrategyBuilder() {
  const {
    strategies, activeStrategyId,
    addStrategy, updateStrategy, deleteStrategy, setActiveStrategy,
    livePrice, capital,
    strategySignal,
  } = useStore();

  const [editId, setEditId]       = useState<string | null>(null);
  const [showPresets, setPresets] = useState(false);
  const [section, setSection]     = useState<'long' | 'short' | 'exit' | 'stop' | 'tp' | 'sizing'>('long');

  // All strategies = presets + user's
  const allStrategies = [...PRESET_STRATEGIES, ...strategies];
  const editing = allStrategies.find(s => s.id === editId) ?? null;
  // For presets, we edit a local copy that becomes a new user strategy on save
  const [localEdit, setLocalEdit] = useState<Strategy | null>(null);
  const draft = localEdit ?? editing;

  const startEdit = (s: Strategy) => {
    const isPreset = PRESET_STRATEGIES.some(p => p.id === s.id);
    if (isPreset) {
      // Fork the preset into a new user strategy
      setLocalEdit({ ...s, id: uid(), name: s.name + ' (copy)', createdAt: Date.now(), updatedAt: Date.now() });
    } else {
      setLocalEdit(null);
      setEditId(s.id);
    }
    setSection('long');
  };

  const saveDraft = () => {
    if (!draft) return;
    if (localEdit) {
      // Save forked preset as new user strategy
      addStrategy(localEdit);
      setLocalEdit(null);
      setEditId(localEdit.id);
    } else {
      updateStrategy(draft.id, { ...draft, updatedAt: Date.now() });
    }
  };

  const cancelEdit = () => { setEditId(null); setLocalEdit(null); };

  const updateDraft = useCallback((patch: Partial<Strategy>) => {
    if (!draft) return;
    const updated = { ...draft, ...patch };
    if (localEdit) { setLocalEdit(updated); return; }
    setEditId(updated.id);
    // Optimistic update while editing
    useStore.setState(s => ({
      strategies: s.strategies.map(st => st.id === updated.id ? updated : st),
    }));
  }, [draft, localEdit]);

  const sectionBtns: Array<{ key: typeof section; label: string }> = [
    { key: 'long',   label: 'Long Entry' },
    { key: 'short',  label: 'Short Entry' },
    { key: 'exit',   label: 'Exit Rules' },
    { key: 'stop',   label: 'Stop Loss' },
    { key: 'tp',     label: 'Take Profit' },
    { key: 'sizing', label: 'Sizing' },
  ];

  // ── Strategy card ──────────────────────────────────────────────────────────
  const StratCard = ({ s, isPreset }: { s: Strategy; isPreset: boolean }) => {
    const isActive = s.id === activeStrategyId;
    const signal   = isActive ? strategySignal : null;
    return (
      <div style={{
        background: 'var(--bg3)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 6,
        position: 'relative', overflow: 'hidden',
      }}>
        {isActive && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--accent)' }} />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>
                {s.name}
              </span>
              {isPreset && (
                <span style={{ fontSize: 8, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: 3, background: 'rgba(77,166,255,0.1)', color: 'var(--blue)', border: '1px solid rgba(77,166,255,0.2)' }}>
                  PRESET
                </span>
              )}
              {isActive && (
                <span style={{ fontSize: 8, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: 3, background: 'rgba(0,229,160,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,229,160,0.2)' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.4, marginBottom: signal ? 6 : 0 }}>
              {s.description}
            </div>
            {/* Live signal badge */}
            {signal && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                background: signal.dir === 'long' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,90,0.1)',
                border: `1px solid ${signal.dir === 'long' ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)'}`,
                fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                color: signal.dir === 'long' ? 'var(--green)' : 'var(--red)',
              }}>
                {signal.dir === 'long' ? '▲ LONG' : '▼ SHORT'} · Score {signal.score}%
                <span style={{ color: 'var(--text2)', fontWeight: 400 }}>@ {fmtPrice(signal.entry)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {!isActive && (
              <button
                onClick={() => setActiveStrategy(s.id)}
                style={{
                  padding: '4px 10px', fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600,
                  borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--accent)', background: 'rgba(0,229,160,0.08)', color: 'var(--accent)',
                }}
              >Set Active</button>
            )}
            <button
              onClick={() => startEdit(s)}
              style={{
                padding: '4px 10px', fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'var(--bg4)', color: 'var(--text2)',
              }}
            >{isPreset ? 'Fork & Edit' : 'Edit'}</button>
            {!isPreset && (
              <button
                onClick={() => { if (confirm('Delete this strategy?')) deleteStrategy(s.id); }}
                style={{
                  padding: '4px 10px', fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600,
                  borderRadius: 4, cursor: 'pointer',
                  border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: 'var(--red)',
                }}
              >Delete</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Editor panel ───────────────────────────────────────────────────────────
  if (draft) {
    return (
      <div>
        {/* Editor header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button
            onClick={cancelEdit}
            style={{
              padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
            }}
          >← Back</button>
          <input
            value={draft.name}
            onChange={e => updateDraft({ name: e.target.value })}
            style={{ ...inputBase, flex: 1, fontSize: 13, fontWeight: 700 }}
          />
          <button
            onClick={saveDraft}
            style={{
              padding: '6px 16px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: '1px solid var(--accent)', background: 'rgba(0,229,160,0.1)', color: 'var(--accent)',
            }}
          >Save</button>
        </div>

        {/* Description */}
        <textarea
          value={draft.description}
          onChange={e => updateDraft({ description: e.target.value })}
          rows={2}
          placeholder="Strategy description…"
          style={{ ...inputBase, width: '100%', resize: 'vertical', marginBottom: 12 }}
        />

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 14 }}>
          {sectionBtns.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              style={{
                padding: '5px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all .15s',
                border: `1px solid ${section === key ? 'var(--accent)' : 'var(--border2)'}`,
                background: section === key ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
                color: section === key ? 'var(--accent)' : 'var(--text2)',
              }}
            >{label}</button>
          ))}
        </div>

        {/* Section content */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          {section === 'long' && (
            <EntryConditionEditor
              label="Long Entry Rules"
              cond={draft.longEntry}
              onChange={c => updateDraft({ longEntry: c })}
            />
          )}
          {section === 'short' && (
            <EntryConditionEditor
              label="Short Entry Rules"
              cond={draft.shortEntry}
              onChange={c => updateDraft({ shortEntry: c })}
              onClear={() => updateDraft({ shortEntry: null })}
            />
          )}
          {section === 'exit' && (
            <EntryConditionEditor
              label="Indicator Exit Rules (optional)"
              cond={draft.exitRules}
              onChange={c => updateDraft({ exitRules: c })}
              onClear={() => updateDraft({ exitRules: null })}
            />
          )}
          {section === 'stop' && (
            <StopEditor stop={draft.stop} onChange={s => updateDraft({ stop: s })} />
          )}
          {section === 'tp' && (
            <TakeProfitEditor tp={draft.takeProfit} onChange={t => updateDraft({ takeProfit: t })} />
          )}
          {section === 'sizing' && (
            <SizingEditor sizing={draft.sizing} onChange={s => updateDraft({ sizing: s })} />
          )}
        </div>

        {/* Bottom actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={saveDraft}
            style={{
              flex: 1, padding: '8px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: '1px solid var(--accent)', background: 'rgba(0,229,160,0.1)', color: 'var(--accent)',
            }}
          >Save Strategy</button>
          {editing && !localEdit && (
            <button
              onClick={() => { setActiveStrategy(draft.id); saveDraft(); }}
              style={{
                padding: '8px 16px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--blue)', background: 'rgba(77,166,255,0.08)', color: 'var(--blue)',
              }}
            >Save & Set Active</button>
          )}
        </div>
      </div>
    );
  }

  // ── Strategy list ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700 }}>My Strategies</span>
        <button
          onClick={() => { const s = makeStrategy(); addStrategy(s); startEdit(s); }}
          style={{
            marginLeft: 'auto', padding: '6px 14px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: '1px solid var(--accent)', background: 'rgba(0,229,160,0.1)', color: 'var(--accent)',
          }}
        >+ New Strategy</button>
      </div>

      {/* Active signal banner */}
      {strategySignal && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 14,
          background: strategySignal.dir === 'long' ? 'rgba(0,229,160,0.08)' : 'rgba(255,61,90,0.08)',
          border: `1px solid ${strategySignal.dir === 'long' ? 'rgba(0,229,160,0.3)' : 'rgba(255,61,90,0.3)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: strategySignal.dir === 'long' ? 'var(--green)' : 'var(--red)' }}>
              {strategySignal.dir === 'long' ? '▲ LONG SIGNAL' : '▼ SHORT SIGNAL'}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>Score {strategySignal.score}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { label: 'Entry',  val: fmtPrice(strategySignal.entry) },
              { label: 'Stop',   val: fmtPrice(strategySignal.stop)  },
              ...strategySignal.targets.map((t, i) => ({ label: `TP${i + 1}`, val: fmtPrice(t) })),
            ].map(({ label, val }) => (
              <div key={label} style={{ background: 'var(--bg3)', borderRadius: 4, padding: '5px 8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>
          {strategySignal.reasons.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.6 }}>
              {strategySignal.reasons.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Preset strategies */}
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setPresets(p => !p)}
          style={{
            width: '100%', padding: '7px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
            border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: showPresets ? 8 : 0,
          }}
        >
          <span>📚 Built-in Presets ({PRESET_STRATEGIES.length})</span>
          <span>{showPresets ? '▲' : '▼'}</span>
        </button>
        {showPresets && PRESET_STRATEGIES.map(s => (
          <StratCard key={s.id} s={s} isPreset />
        ))}
      </div>

      {/* User strategies */}
      {strategies.length === 0 ? (
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '30px 0', fontStyle: 'italic' }}>
          No custom strategies yet. Fork a preset or create one from scratch.
        </div>
      ) : (
        strategies.map(s => <StratCard key={s.id} s={s} isPreset={false} />)
      )}
    </div>
  );
}