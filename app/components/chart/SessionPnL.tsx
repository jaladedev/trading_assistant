'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { Card, ActionBtn } from '../ui';
import type { SessionTrade } from '@/lib/store';

export default function SessionPnL() {
  const {
    sessionTrades, addSessionTrade, clearSessionTrades, sessionPnL,
    maxDailyLossUsd, setMaxDailyLossUsd,
    dailyLossBannerDismissed, setDailyLossBannerDismissed,
    sym, livePrice, entryPrice, stopPrice, sizeUsd, currentDir,
  } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Partial<Omit<SessionTrade, 'id' | 'time'>>>({
    sym, dir: currentDir,
    entry: parseFloat(entryPrice) || livePrice,
    exit: livePrice,
    size: parseFloat(sizeUsd) || 100,
    note: '',
  });

  // ── Computed ────────────────────────────────────────────────────────────
  const dailyLossHit   = maxDailyLossUsd > 0 && -sessionPnL >= maxDailyLossUsd;
  const dailyLossWarn  = maxDailyLossUsd > 0 && -sessionPnL >= maxDailyLossUsd * 0.75;
  const pnlColor       = sessionPnL >= 0 ? 'var(--green)' : 'var(--red)';
  const lossUsedPct    = maxDailyLossUsd > 0 ? Math.min(100, (-sessionPnL / maxDailyLossUsd) * 100) : 0;

  const wins   = sessionTrades.filter(t => t.pnl > 0).length;
  const losses = sessionTrades.filter(t => t.pnl <= 0).length;

  const handleAdd = () => {
    const entry = parseFloat(String(draft.entry)) || 0;
    const exit  = parseFloat(String(draft.exit))  || 0;
    const size  = parseFloat(String(draft.size))  || 100;
    if (!entry || !exit) return;

    const units = size / entry;
    const pnl   = draft.dir === 'long'
      ? (exit - entry) * units
      : (entry - exit) * units;

    addSessionTrade({
      sym:   draft.sym || sym,
      dir:   draft.dir || 'long',
      entry, exit, size, pnl,
      note:  draft.note,
    });
    setShowForm(false);
    setDraft({ sym, dir: currentDir, entry: livePrice, exit: livePrice, size, note: '' });
  };

  return (
    <>
      {/* ── Max Daily Loss Banner ─────────────────────────────────────────── */}
      {dailyLossHit && !dailyLossBannerDismissed && (
        <div style={{
          position:   'sticky', top: 0, zIndex: 500,
          padding:    '10px 16px',
          background: 'rgba(255,61,90,0.18)',
          border:     '1px solid var(--red)',
          borderRadius: 0,
          display:    'flex', alignItems: 'center', gap: 12,
          animation:  'flashRed 1s ease infinite',
        }}>
          <span style={{ fontSize: 18 }}>🛑</span>
          <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>
            DAILY LOSS LIMIT HIT — ${(-sessionPnL).toFixed(2)} lost · limit ${maxDailyLossUsd}
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
            Stop trading for today.
          </span>
          <button
            onClick={() => setDailyLossBannerDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}
          >×</button>
        </div>
      )}

      {/* ── P&L Card ─────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 10 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '.04em' }}>📊 Session P&amp;L</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowForm(f => !f)} style={smBtn(showForm ? 'var(--accent)' : 'var(--border2)')}>
              {showForm ? '✕ Cancel' : '+ Add Trade'}
            </button>
            {sessionTrades.length > 0 && (
              <button onClick={clearSessionTrades} style={smBtn('var(--red)')}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 10 }}>
          {[
            { label: 'Net P&L',   val: (sessionPnL >= 0 ? '+' : '') + '$' + sessionPnL.toFixed(2), col: pnlColor },
            { label: 'Trades',    val: String(sessionTrades.length), col: 'var(--text)' },
            { label: 'Wins',      val: String(wins),   col: 'var(--green)' },
            { label: 'Losses',    val: String(losses), col: 'var(--red)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '9px 10px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 700, color: s.col }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Max daily loss control + progress */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', flexShrink: 0 }}>Max Daily Loss $</span>
            <input
              type="number"
              value={maxDailyLossUsd || ''}
              placeholder="0 = off"
              min={0}
              step={10}
              onChange={e => { setMaxDailyLossUsd(parseFloat(e.target.value) || 0); setDailyLossBannerDismissed(false); }}
              style={{
                width: 90, padding: '4px 7px', fontSize: 11, fontFamily: 'var(--mono)',
                background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)',
                borderRadius: 'var(--radius-sm)', outline: 'none',
              }}
            />
            {maxDailyLossUsd > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: dailyLossHit ? 'var(--red)' : dailyLossWarn ? 'var(--amber)' : 'var(--text3)', marginLeft: 'auto' }}>
                {lossUsedPct.toFixed(0)}% used
              </span>
            )}
          </div>
          {maxDailyLossUsd > 0 && (
            <div style={{ height: 5, borderRadius: 3, background: 'var(--bg3)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: lossUsedPct + '%',
                background: dailyLossHit ? 'var(--red)' : dailyLossWarn ? 'var(--amber)' : 'var(--green)',
                transition: 'width .4s, background .4s',
              }} />
            </div>
          )}
        </div>

        {/* Add trade form */}
        {showForm && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 7 }}>
              {[
                { label: 'Entry',   key: 'entry',  val: draft.entry  },
                { label: 'Exit',    key: 'exit',   val: draft.exit   },
                { label: 'Size $',  key: 'size',   val: draft.size   },
                { label: 'Symbol',  key: 'sym',    val: draft.sym, text: true },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{f.label}</div>
                  <input
                    type={f.text ? 'text' : 'number'}
                    value={String(f.val ?? '')}
                    step={0.01}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: f.text ? e.target.value : e.target.value }))}
                    style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
              {(['long', 'short'] as const).map(d => (
                <button key={d} onClick={() => setDraft(x => ({ ...x, dir: d }))} style={{
                  flex: 1, padding: '5px 10px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)', border: `1px solid ${draft.dir === d ? (d === 'long' ? 'var(--green)' : 'var(--red)') : 'var(--border2)'}`,
                  background: draft.dir === d ? (d === 'long' ? 'var(--green-bg)' : 'var(--red-bg)') : 'transparent',
                  color: draft.dir === d ? (d === 'long' ? 'var(--green)' : 'var(--red)') : 'var(--text2)',
                }}>
                  {d === 'long' ? '▲ Long' : '▼ Short'}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={draft.note ?? ''}
              onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none', marginBottom: 8 }}
            />
            <ActionBtn variant="green" onClick={handleAdd} style={{ width: '100%', justifyContent: 'center' }}>
              Add Trade
            </ActionBtn>
          </div>
        )}

        {/* Trade rows */}
        {sessionTrades.length === 0 ? (
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
            No trades yet — click "+ Add Trade" to log one
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...sessionTrades].reverse().map(t => {
              const bull = t.pnl >= 0;
              const pct  = t.size > 0 ? (t.pnl / t.size * 100) : 0;
              return (
                <div key={t.id} style={{
                  display: 'grid', gridTemplateColumns: '50px 64px 1fr 1fr 72px',
                  gap: 6, alignItems: 'center',
                  padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  background: bull ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: `1px solid ${bull ? 'rgba(0,229,160,0.15)' : 'rgba(255,61,90,0.15)'}`,
                }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, color: bull ? 'var(--green)' : 'var(--red)' }}>
                    {t.dir === 'long' ? '▲ L' : '▼ S'}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                    {fmtSymDisplay(t.sym)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                    {fmtPrice(t.entry)} → {fmtPrice(t.exit)}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    ${t.size.toFixed(0)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: bull ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                    {bull ? '+' : ''}{t.pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// Helper
function smBtn(borderColor: string): React.CSSProperties {
  return {
    padding: '3px 9px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
    border: `1px solid ${borderColor}`, background: 'transparent',
    color: 'var(--text2)', transition: 'all .15s',
  };
}