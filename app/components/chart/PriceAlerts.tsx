'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { Card, ActionBtn } from '../ui';
import { playAlertSound } from '@/lib/store';

export default function PriceAlerts() {
  const {
    priceAlerts, addPriceAlert, removePriceAlert,
    soundEnabled, setSoundEnabled,
    notifEnabled, setNotifEnabled,
    sym, livePrice,
  } = useStore();

  const [newPrice, setNewPrice]   = useState('');
  const [newDir,   setNewDir]     = useState<'above' | 'below'>('above');
  const [newLabel, setNewLabel]   = useState('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

  // Check notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
  }, []);

  const requestNotifPerm = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      setSoundEnabled(true);
      setNotifEnabled(true);
    }
  };

  const handleAdd = () => {
    const price = parseFloat(newPrice);
    if (!price || price <= 0) return;
    addPriceAlert({
      sym,
      price,
      dir: newDir,
      label: newLabel || `${fmtSymDisplay(sym)} ${newDir} ${fmtPrice(price)}`,
    });
    setNewPrice('');
    setNewLabel('');
  };

  const testSound = () => playAlertSound('alert');

  const pending   = priceAlerts.filter(a => !a.triggered);
  const triggered = priceAlerts.filter(a =>  a.triggered);

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>🔔 Price Alerts</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Sound toggle */}
          <button
            onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) testSound(); }}
            title="Toggle alert sound"
            style={pillToggle(soundEnabled)}
          >
            {soundEnabled ? '🔊 Sound' : '🔇 Muted'}
          </button>

          {/* Notification toggle / request */}
          {notifPerm === 'granted' ? (
            <button
              onClick={() => setNotifEnabled(!notifEnabled)}
              style={pillToggle(notifEnabled)}
              title="Toggle browser notifications"
            >
              {notifEnabled ? '🔔 Notifs' : '🔕 Notifs'}
            </button>
          ) : notifPerm === 'denied' ? (
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--red)', padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 10 }}>
              Notifs blocked
            </span>
          ) : (
            <button onClick={requestNotifPerm} style={pillToggle(false)}>
              Enable Notifs
            </button>
          )}
        </div>
      </div>

      {/* Add alert form */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Price</div>
          <input
            type="number"
            value={newPrice}
            placeholder={livePrice > 0 ? fmtPrice(livePrice) : '0.00'}
            onChange={e => setNewPrice(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['above', 'below'] as const).map(d => (
            <button key={d} onClick={() => setNewDir(d)} style={{
              padding: '6px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${newDir === d ? (d === 'above' ? 'var(--green)' : 'var(--red)') : 'var(--border2)'}`,
              background: newDir === d ? (d === 'above' ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)',
              color: newDir === d ? (d === 'above' ? 'var(--green)' : 'var(--red)') : 'var(--text2)',
              transition: 'all .15s',
            }}>
              {d === 'above' ? '▲' : '▼'} {d}
            </button>
          ))}
        </div>
        <div style={{ flex: 2, minWidth: 100 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Label (optional)</div>
          <input
            type="text"
            value={newLabel}
            placeholder="e.g. Resistance level"
            onChange={e => setNewLabel(e.target.value)}
            style={inputStyle}
          />
        </div>
        <ActionBtn variant="green" onClick={handleAdd}>+ Alert</ActionBtn>
      </div>

      {/* Current live price hint */}
      {livePrice > 0 && (
        <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 10 }}>
          {fmtSymDisplay(sym)} live: <span style={{ color: 'var(--text2)', fontWeight: 700 }}>{fmtPrice(livePrice)}</span>
        </div>
      )}

      {/* Pending alerts */}
      {pending.length === 0 && triggered.length === 0 ? (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '10px 0' }}>
          No alerts set. Enter a price above to create one.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                Pending ({pending.length})
              </div>
              {pending.map(a => {
                const dist = livePrice > 0 ? ((a.price - livePrice) / livePrice * 100) : null;
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', marginBottom: 4,
                    background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{a.dir === 'above' ? '▲' : '▼'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: a.dir === 'above' ? 'var(--green)' : 'var(--red)' }}>
                        {fmtPrice(a.price)}
                      </div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                        {a.label} · {fmtSymDisplay(a.sym)}
                        {dist !== null && (
                          <span style={{ marginLeft: 6, color: 'var(--text3)' }}>
                            {(dist >= 0 ? '+' : '')}{dist.toFixed(2)}% away
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removePriceAlert(a.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '2px 4px' }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          {triggered.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                Triggered ({triggered.length})
              </div>
              {triggered.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', marginBottom: 4, opacity: 0.6,
                  background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>✓</span>
                  <div style={{ flex: 1, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textDecoration: 'line-through' }}>
                    {a.label} · {fmtPrice(a.price)}
                  </div>
                  <button
                    onClick={() => removePriceAlert(a.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '2px 4px' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 9px', fontSize: 12, fontFamily: 'var(--mono)',
  background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)',
  borderRadius: 'var(--radius-sm)', outline: 'none',
};

function pillToggle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 9px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`,
    background: active ? 'rgba(0,229,160,0.1)' : 'var(--bg3)',
    color: active ? 'var(--accent)' : 'var(--text2)',
  };
}