'use client';

import { useState, useRef, useCallback } from 'react';
import { useStore }  from '@/lib/store';
import { useTheme }  from '@/components/ui/ThemeToggle';
import { toast }     from '@/components/ui/Toast';
import { resetOnboarding } from '@/components/ui/Onboarding';
import {
  downloadStateJSON,
  openImportFilePicker,
  type ParseResult,
} from '@/lib/stateIO';
import { SUPABASE_ENABLED, getCurrentUser, signInWithEmail, signOut, pushStateToCloud, pullStateFromCloud } from '@/lib/supabase';

// ── Sub-section ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
        color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em',
        marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        background: on ? 'var(--accent)' : 'var(--bg4)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`,
        cursor: 'pointer', position: 'relative', transition: 'all .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: on ? 17 : 3,
        width: 12, height: 12, borderRadius: '50%',
        background: on ? '#000' : 'var(--text3)',
        transition: 'left .2s',
      }} />
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '5px 9px', fontSize: 11, fontFamily: 'var(--mono)',
  background: 'var(--bg3)', color: 'var(--text)',
  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
  outline: 'none', width: 110,
};

const dangerBtn: React.CSSProperties = {
  padding: '6px 14px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
  border: '1px solid rgba(255,61,90,0.35)',
  background: 'rgba(255,61,90,0.08)', color: 'var(--red)', transition: 'all .15s',
};

const accentBtn: React.CSSProperties = {
  padding: '6px 14px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
  border: '1px solid var(--accent)',
  background: 'rgba(0,229,160,0.1)', color: 'var(--accent)', transition: 'all .15s',
};

const neutralBtn: React.CSSProperties = {
  padding: '6px 14px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', letterSpacing: '.04em',
  border: '1px solid var(--border2)',
  background: 'var(--bg3)', color: 'var(--text2)', transition: 'all .15s',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const store = useStore();
  const { theme, toggle: toggleTheme } = useTheme();

  // ── Cloud sync state ─────────────────────────────────────────────────────
  const [cloudEmail,   setCloudEmail]   = useState('');
  const [cloudUser,    setCloudUser]    = useState<string | null>(null);
  const [cloudStatus,  setCloudStatus]  = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);

  // ── Import state ─────────────────────────────────────────────────────────
  const [importMsg, setImportMsg] = useState('');

  // ── Supabase actions ─────────────────────────────────────────────────────
  const handleCloudSignIn = async () => {
    setCloudLoading(true);
    const res = await signInWithEmail(cloudEmail);
    setCloudLoading(false);
    if (res.ok) {
      setCloudStatus(`Magic link sent to ${cloudEmail}. Check your inbox.`);
    } else {
      setCloudStatus(`Error: ${res.error}`);
    }
  };

  const handleCloudSignOut = async () => {
    await signOut();
    setCloudUser(null);
    setCloudStatus('Signed out.');
  };

  const handleCloudPush = async () => {
    setCloudLoading(true);
    const res = await pushStateToCloud(useStore.getState() as Record<string, unknown>);
    setCloudLoading(false);
    setCloudStatus(res.ok ? '✓ State pushed to cloud.' : `Error: ${res.error}`);
    if (res.ok) toast.success('State synced to cloud');
  };

  const handleCloudPull = async () => {
    setCloudLoading(true);
    const res = await pullStateFromCloud();
    setCloudLoading(false);
    if (!res.ok || !res.data) {
      setCloudStatus(`Error: ${res.error}`);
      return;
    }
    const state = res.data.state;
    if (state) {
      useStore.setState(state as Partial<ReturnType<typeof useStore.getState>>);
      setCloudStatus(`✓ Pulled state from ${res.data.exportedAt ?? 'cloud'}`);
      toast.success('State pulled from cloud');
    }
  };

  // ── Export / Import ──────────────────────────────────────────────────────
  const handleExport = () => {
    downloadStateJSON(useStore.getState() as Record<string, unknown>);
    toast.success('State exported as JSON');
  };

  const handleImport = () => {
    openImportFilePicker((result: ParseResult) => {
      if (!result.ok) {
        setImportMsg(`✗ ${result.error}`);
        toast.error(`Import failed: ${result.error}`);
        return;
      }
      if (result.data) {
        useStore.setState(result.data as Partial<ReturnType<typeof useStore.getState>>);
        setImportMsg(`✓ Imported ${result.keysFound} setting groups from ${result.exportedAt ?? 'file'}`);
        toast.success('Settings imported successfully');
      }
      setTimeout(() => setImportMsg(''), 6000);
    });
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleResetAll = () => {
    if (!confirm(
      'Reset ALL app data? This clears your trades journal, strategies, drawings, paper account, and settings. This cannot be undone.'
    )) return;
    localStorage.clear();
    indexedDB.deleteDatabase('tradeassist');
    toast.warn('All data cleared — reloading…');
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleResetOnboarding = () => {
    resetOnboarding();
    toast.info('Onboarding tour reset — it will show on next page load');
  };

  const handleResetIndicators = () => {
    store.resetIndicatorParams();
    toast.success('Indicator params reset to defaults');
  };

  const TIMEFRAMES = ['1m','5m','15m','1h','4h','1d'];

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '4px 0 40px' }}>

      {/* ── Theme ─────────────────────────────────────────────────────────── */}
      <Section title="Appearance">
        <Row label="Theme" hint="Toggle between dark and light mode">
          <button
            onClick={toggleTheme}
            style={{ ...neutralBtn, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {theme === 'dark' ? '☀ Switch to Light' : '☾ Switch to Dark'}
          </button>
        </Row>
      </Section>

      {/* ── Defaults ──────────────────────────────────────────────────────── */}
      <Section title="Default Values">
        <Row label="Default Symbol" hint="Symbol loaded on startup">
          <input
            style={inp}
            value={store.defaultSym}
            onChange={e => store.setSettings({ defaultSym: e.target.value.toUpperCase() })}
          />
        </Row>
        <Row label="Default Timeframe">
          <select
            style={{ ...inp, width: 90 }}
            value={store.defaultTf}
            onChange={e => store.setSettings({ defaultTf: e.target.value })}
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Default Capital ($)">
          <input
            type="number" min={1} style={inp}
            value={store.defaultCapital}
            onChange={e => store.setSettings({ defaultCapital: +e.target.value || 200 })}
          />
        </Row>
        <Row label="Default Leverage">
          <input
            type="number" min={1} max={125} style={inp}
            value={store.defaultLeverage}
            onChange={e => store.setSettings({ defaultLeverage: +e.target.value || 10 })}
          />
        </Row>
        <Row label="Default R:R Ratio">
          <input
            type="number" min={0.5} max={20} step={0.1} style={inp}
            value={store.defaultRR}
            onChange={e => store.setSettings({ defaultRR: +e.target.value || 2 })}
          />
        </Row>
        <Row label="Default Fee Type">
          <select
            style={{ ...inp, width: 90 }}
            value={store.defaultFeeType}
            onChange={e => store.setSettings({ defaultFeeType: e.target.value as 'maker'|'taker' })}
          >
            <option value="maker">Maker (0.02%)</option>
            <option value="taker">Taker (0.05%)</option>
          </select>
        </Row>
      </Section>

      {/* ── Audio & Notifications ─────────────────────────────────────────── */}
      <Section title="Alerts & Notifications">
        <Row label="Alert sounds" hint="Plays beep on price alerts and EMA crossovers">
          <Toggle
            on={store.soundEnabled}
            onChange={v => {
              store.setSoundEnabled(v);
              toast.info(`Sound ${v ? 'enabled' : 'disabled'}`);
            }}
          />
        </Row>
        <Row label="Browser notifications" hint="Shows OS notification when price alert fires">
          <Toggle
            on={store.notifEnabled}
            onChange={async (v) => {
              if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                  toast.warn('Notification permission denied by browser');
                  return;
                }
              }
              store.setNotifEnabled(v);
              toast.info(`Notifications ${v ? 'enabled' : 'disabled'}`);
            }}
          />
        </Row>
      </Section>

      {/* ── Data Import / Export ──────────────────────────────────────────── */}
      <Section title="Data — Import & Export">
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
          Export your entire state (journal, strategies, settings, drawings, paper account) as a single JSON file.
          Import restores all of it on any device.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button style={accentBtn} onClick={handleExport}>
            ⬇ Export state.json
          </button>
          <button style={neutralBtn} onClick={handleImport}>
            ⬆ Import state.json
          </button>
        </div>
        {importMsg && (
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)',
            color: importMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
            marginTop: 6,
          }}>
            {importMsg}
          </div>
        )}
      </Section>

      {/* ── Supabase Cloud Sync ───────────────────────────────────────────── */}
      {SUPABASE_ENABLED ? (
        <Section title="Cloud Sync (Supabase)">
          {!cloudUser ? (
            <div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 10 }}>
                Sign in with your email to sync state across devices.
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={cloudEmail}
                  onChange={e => setCloudEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCloudSignIn(); }}
                  style={{ ...inp, width: 200 }}
                />
                <button
                  style={accentBtn}
                  onClick={handleCloudSignIn}
                  disabled={cloudLoading || !cloudEmail}
                >
                  {cloudLoading ? 'Sending…' : 'Send Magic Link'}
                </button>
              </div>
              {cloudStatus && (
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{cloudStatus}</div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginBottom: 10 }}>
                Signed in as <strong>{cloudUser}</strong>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={accentBtn} onClick={handleCloudPush} disabled={cloudLoading}>
                  ☁ Push to Cloud
                </button>
                <button style={neutralBtn} onClick={handleCloudPull} disabled={cloudLoading}>
                  ☁ Pull from Cloud
                </button>
                <button style={dangerBtn} onClick={handleCloudSignOut}>
                  Sign Out
                </button>
              </div>
              {cloudStatus && (
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: 6 }}>{cloudStatus}</div>
              )}
            </div>
          )}
        </Section>
      ) : (
        <Section title="Cloud Sync (Supabase — not configured)">
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.7 }}>
            To enable cloud sync:<br />
            1. Create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>supabase.com</a><br />
            2. Add <code style={{ color: 'var(--amber)' }}>NEXT_PUBLIC_SUPABASE_URL</code> and <code style={{ color: 'var(--amber)' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to .env.local<br />
            3. Run: <code style={{ color: 'var(--accent)' }}>npm install @supabase/supabase-js</code><br />
            See <code>app/lib/supabase.ts</code> for the SQL schema.
          </div>
        </Section>
      )}

      {/* ── Indicator Defaults ────────────────────────────────────────────── */}
      <Section title="Indicator Defaults">
        <Row label="Reset indicator params" hint="Restores all periods and multipliers to defaults">
          <button style={neutralBtn} onClick={handleResetIndicators}>Reset Params</button>
        </Row>
      </Section>

      {/* ── Danger Zone ───────────────────────────────────────────────────── */}
      <Section title="Danger Zone">
        <Row label="Reset onboarding tour" hint="Tour will show again on next page load">
          <button style={neutralBtn} onClick={handleResetOnboarding}>
            Reset Tour
          </button>
        </Row>
        <Row
          label="Reset ALL data"
          hint="Clears journal, strategies, drawings, settings, paper account. Cannot be undone."
        >
          <button style={dangerBtn} onClick={handleResetAll}>
            ⚠ Reset Everything
          </button>
        </Row>
      </Section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center' }}>
        TradeAssist · All data stored locally in your browser · No telemetry
      </div>
    </div>
  );
}