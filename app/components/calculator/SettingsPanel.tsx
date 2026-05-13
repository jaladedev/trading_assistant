'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { Card, ActionBtn, SectionTitle } from '@/components/ui';
import { toast } from '@/components/ui/Toast';

// ── helpers ───────────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      onClick={onToggle}
      title={label}
      style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer', border: 'none',
        background: on ? 'var(--green)' : 'var(--bg4)',
        position: 'relative', transition: 'background .2s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, transition: 'left .2s',
        left: on ? 21 : 3,
      }} />
    </button>
  );
}

function NumRow({ label, value, onChange, min, max, step }: {
  label: string; value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <Row label={label}>
      <input
        type="number" value={value} min={min} max={max} step={step ?? 1}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: 80, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right' }}
      />
    </Row>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPanel() {
  const store = useStore();
  const {
    theme, setSettings,
    defaultSym, defaultTf, defaultLeverage, defaultFeeType, defaultCapital, defaultRR,
    soundEnabled, setSoundEnabled, notifEnabled, setNotifEnabled,
    resetPaperAccount,
    exportTradesCsv, importTradesCsv,
    trades,
  } = store;

  const csvRef  = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReset, setConfirmReset] = useState(false);

  // ── 55. Export full app state ─────────────────────────────────────────────
  const handleExportState = () => {
    const state = useStore.getState();
    const exportable = {
      trades:          state.trades,
      strategies:      state.strategies,
      activeStrategyId: state.activeStrategyId,
      chartDrawings:   state.chartDrawings,
      priceAlerts:     state.priceAlerts,
      paperAccount:    { ...state.paperAccount, openPositions: [] },
      settings: {
        theme:            state.theme,
        defaultSym:       state.defaultSym,
        defaultTf:        state.defaultTf,
        defaultLeverage:  state.defaultLeverage,
        defaultFeeType:   state.defaultFeeType,
        defaultCapital:   state.defaultCapital,
        defaultRR:        state.defaultRR,
        activeIndicators: state.activeIndicators,
        indicatorParams:  state.indicatorParams,
        atrTrailMult:     state.atrTrailMult,
        soundEnabled:     state.soundEnabled,
        notifEnabled:     state.notifEnabled,
        maxDailyLossUsd:  state.maxDailyLossUsd,
        rrRatio:          state.rrRatio,
        leverage:         state.leverage,
        feeType:          state.feeType,
        capital:          state.capital,
        margin:           state.margin,
        goalPct:          state.goalPct,
      },
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tradeassist_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success('App state exported');
  };

  // ── 56. Import full app state ─────────────────────────────────────────────
  const handleImportState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const s = data.settings ?? {};
        // Apply settings
        useStore.getState().setSettings({
          theme:            s.theme,
          defaultSym:       s.defaultSym,
          defaultTf:        s.defaultTf,
          defaultLeverage:  s.defaultLeverage,
          defaultFeeType:   s.defaultFeeType,
          defaultCapital:   s.defaultCapital,
          defaultRR:        s.defaultRR,
          activeIndicators: s.activeIndicators,
          indicatorParams:  s.indicatorParams,
          atrTrailMult:     s.atrTrailMult,
          soundEnabled:     s.soundEnabled,
          notifEnabled:     s.notifEnabled,
          maxDailyLossUsd:  s.maxDailyLossUsd,
        });
        if (data.trades)     useStore.setState({ trades: data.trades });
        if (data.strategies) useStore.setState({ strategies: data.strategies, activeStrategyId: data.activeStrategyId ?? null });
        if (data.chartDrawings) useStore.setState({ chartDrawings: data.chartDrawings });
        if (data.priceAlerts)   useStore.setState({ priceAlerts: data.priceAlerts });
        if (data.paperAccount)  useStore.setState({ paperAccount: data.paperAccount });
        toast.success('App state imported');
      } catch {
        toast.error('Invalid backup file');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const csv = ev.target?.result as string;
      const { count, errors } = await importTradesCsv(csv, importMode);
      toast.success(`Imported ${count} trades${errors ? ` (${errors} skipped)` : ''}`);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // ── Onboarding reset ──────────────────────────────────────────────────────
  const resetOnboarding = () => {
    localStorage.removeItem('onboarding_done');
    window.location.reload();
  };

  // ── Full data wipe ────────────────────────────────────────────────────────
  const handleResetAll = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    localStorage.clear();
    window.location.reload();
  };

  const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <Card>
      <SectionTitle>⚙ Settings</SectionTitle>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Appearance</div>

        <Row label="Theme">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['dark', 'light'] as const).map(t => (
              <button key={t} onClick={() => setSettings({ theme: t })} style={{
                padding: '4px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${theme === t ? 'var(--accent)' : 'var(--border2)'}`,
                background: theme === t ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
                color: theme === t ? 'var(--accent)' : 'var(--text2)', transition: 'all .15s',
              }}>{t === 'dark' ? '🌙 Dark' : '☀ Light'}</button>
            ))}
          </div>
        </Row>
      </div>

      {/* ── Defaults ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Defaults</div>

        <Row label="Default Symbol">
          <input
            value={defaultSym} onChange={e => setSettings({ defaultSym: e.target.value.toUpperCase() })}
            style={{ width: 110, padding: '4px 8px', fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
          />
        </Row>

        <Row label="Default Timeframe">
          <div style={{ display: 'flex', gap: 3 }}>
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setSettings({ defaultTf: t })} style={{
                padding: '3px 8px', fontSize: 10, fontFamily: 'var(--mono)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${defaultTf === t ? 'var(--accent)' : 'var(--border2)'}`,
                background: defaultTf === t ? 'rgba(0,229,160,0.1)' : 'transparent',
                color: defaultTf === t ? 'var(--accent)' : 'var(--text2)', transition: 'all .15s',
              }}>{t}</button>
            ))}
          </div>
        </Row>

        <NumRow label="Default Leverage" value={defaultLeverage} onChange={v => setSettings({ defaultLeverage: v })} min={1} max={125} />
        <NumRow label="Default Capital ($)" value={defaultCapital} onChange={v => setSettings({ defaultCapital: v })} min={1} step={10} />
        <NumRow label="Default R:R Ratio" value={defaultRR} onChange={v => setSettings({ defaultRR: v })} min={0.5} max={10} step={0.5} />

        <Row label="Default Fee Type">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['maker', 'taker'] as const).map(f => (
              <button key={f} onClick={() => setSettings({ defaultFeeType: f })} style={{
                padding: '3px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${defaultFeeType === f ? 'var(--amber)' : 'var(--border2)'}`,
                background: defaultFeeType === f ? 'rgba(255,184,46,0.1)' : 'transparent',
                color: defaultFeeType === f ? 'var(--amber)' : 'var(--text2)', transition: 'all .15s',
              }}>{f}</button>
            ))}
          </div>
        </Row>
      </div>

      {/* ── Alerts & Sounds ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Alerts & Sound</div>

        <Row label="Alert Sounds">
          <Toggle on={soundEnabled} onToggle={() => setSoundEnabled(!soundEnabled)} />
        </Row>
        <Row label="Browser Notifications">
          <Toggle on={notifEnabled} onToggle={() => {
            if (!notifEnabled && Notification.permission !== 'granted') {
              Notification.requestPermission().then(p => { if (p === 'granted') setNotifEnabled(true); });
            } else {
              setNotifEnabled(!notifEnabled);
            }
          }} />
        </Row>
      </div>

      {/* ── Paper account ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Paper Trading</div>
        <Row label="Reset Paper Account">
          <ActionBtn variant="red" onClick={() => { resetPaperAccount(10000); toast.info('Paper account reset'); }}>
            Reset to $10,000
          </ActionBtn>
        </Row>
      </div>

      {/* ── Data ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Data</div>

        {/* Full JSON export/import */}
        <Row label="App State Backup">
          <div style={{ display: 'flex', gap: 6 }}>
            <ActionBtn variant="green" onClick={handleExportState}>⬇ Export JSON</ActionBtn>
            <label style={{ cursor: 'pointer' }}>
              <input ref={jsonRef} type="file" accept=".json" onChange={handleImportState} style={{ display: 'none' }} />
              <span onClick={() => jsonRef.current?.click()} style={{
                display: 'inline-block', padding: '7px 14px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', transition: 'all .15s',
              }}>⬆ Import JSON</span>
            </label>
          </div>
        </Row>

        {/* Trade CSV */}
        <Row label="Trade Journal CSV">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <ActionBtn onClick={() => { const csv = exportTradesCsv(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'trades.csv'; a.click(); toast.success('Trades exported'); }}>
              ⬇ Export CSV
            </ActionBtn>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['merge', 'replace'] as const).map(m => (
                <button key={m} onClick={() => setImportMode(m)} style={{
                  padding: '3px 9px', fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600,
                  borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${importMode === m ? 'var(--blue)' : 'var(--border2)'}`,
                  background: importMode === m ? 'rgba(77,166,255,0.1)' : 'transparent',
                  color: importMode === m ? 'var(--blue)' : 'var(--text3)',
                }}>{m}</button>
              ))}
            </div>
            <label style={{ cursor: 'pointer' }}>
              <input ref={csvRef} type="file" accept=".csv" onChange={handleImportCsv} style={{ display: 'none' }} />
              <span onClick={() => csvRef.current?.click()} style={{
                display: 'inline-block', padding: '7px 14px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)',
              }}>⬆ Import CSV</span>
            </label>
          </div>
        </Row>

        <Row label={`Journal (${trades.length} trades)`}>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
            {trades.filter(t => t.outcome === 'win').length}W / {trades.filter(t => t.outcome === 'loss').length}L
          </span>
        </Row>
      </div>

      {/* ── Reset ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Danger Zone</div>

        <Row label="Onboarding">
          <ActionBtn onClick={resetOnboarding}>↺ Show Onboarding Again</ActionBtn>
        </Row>

        <Row label="Reset All Data">
          <ActionBtn variant="red" onClick={handleResetAll}>
            {confirmReset ? '⚠ Click again to confirm' : '✕ Wipe All Data'}
          </ActionBtn>
        </Row>
        {confirmReset && (
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)', marginTop: 6 }}>
            This will clear all trades, strategies, settings, and chart drawings. Export a backup first.
          </div>
        )}
      </div>
    </Card>
  );
}