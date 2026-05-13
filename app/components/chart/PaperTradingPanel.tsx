'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { Card, ActionBtn, Badge } from '@/components/ui';
import { PRESET_STRATEGIES } from '@/lib/strategy';
import {
  openPaperPosition, tickPosition, calcRMultiple,
  STATUS_LABEL,
  type PaperPosition,
} from '@/lib/paperTrading';

const C = {
  green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)',
  blue: 'var(--blue)', purple: 'var(--purple)', text2: 'var(--text2)', text3: 'var(--text3)',
};

function pnlColor(v: number) { return v > 0 ? C.green : v < 0 ? C.red : C.text2; }

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontFamily: 'var(--mono)', fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default function PaperTradingPanel() {
  const {
    paperAccount, openPaperPos, closePaperPos, tickPaperPositions,
    strategySignal, activeStrategyId, strategies,
    livePrice, sym, atrVals,
    addTrade, backtestResult,
  } = useStore();

  const [showClosed, setShowClosed] = useState(false);
  const [autoOpen,   setAutoOpen]   = useState(false);
  const [editNote,   setEditNote]   = useState<string | null>(null);
  const [noteText,   setNoteText]   = useState('');

  const allStrats  = [...PRESET_STRATEGIES, ...strategies];
  const activeStrat = allStrats.find(s => s.id === activeStrategyId) ?? null;
  const lastAtr     = atrVals.length ? (atrVals[atrVals.length - 1] ?? null) : null;

  // Tick all open positions on each price update
  useEffect(() => {
    if (!livePrice || !paperAccount.openPositions.length) return;
    tickPaperPositions(livePrice, lastAtr);
  }, [livePrice, lastAtr, tickPaperPositions, paperAccount.openPositions.length]);

  // Auto-open on strategy signal
  useEffect(() => {
    if (!autoOpen || !strategySignal || !activeStrat) return;
    const alreadyOpen = paperAccount.openPositions.some(
      p => p.strategyId === activeStrategyId && p.dir === strategySignal.dir
    );
    if (alreadyOpen) return;
    const pos = openPaperPosition(strategySignal, activeStrat, sym, paperAccount.balance);
    openPaperPos(pos);
  }, [strategySignal, autoOpen, activeStrat, activeStrategyId, sym,
      paperAccount.balance, paperAccount.openPositions, openPaperPos]);

  const handleManualOpen = useCallback(() => {
    if (!strategySignal || !activeStrat) return;
    const pos = openPaperPosition(strategySignal, activeStrat, sym, paperAccount.balance);
    openPaperPos(pos);
  }, [strategySignal, activeStrat, sym, paperAccount.balance, openPaperPos]);

  const handleManualClose = useCallback((id: string) => {
    const pos = paperAccount.openPositions.find(p => p.id === id);
    if (!pos || !livePrice) return;
    closePaperPos(id, livePrice, 'closed_manual');
    // Auto-log to journal
    const r = calcRMultiple({ ...pos, realised: pos.realised });
    const units = pos.size / pos.entryPrice;
    const finalPnl = pos.dir === 'long'
      ? (livePrice - pos.entryPrice) * units
      : (pos.entryPrice - livePrice) * units;
    addTrade({
      date:          new Date().toISOString().slice(0, 10),
      symbol:        pos.sym,
      dir:           pos.dir,
      entry:         pos.entryPrice,
      stop:          pos.initialStop,
      target:        pos.tpLevels[0]?.price ?? livePrice,
      outcome:       finalPnl > 0 ? 'win' : finalPnl < 0 ? 'loss' : 'be',
      pnl:           finalPnl,
      notes:         `[Paper] ${pos.strategyName} · ${r.toFixed(2)}R · ${pos.notes}`,
      tags:          [],
      screenshotUrl: '',
    });
  }, [paperAccount.openPositions, livePrice, closePaperPos, addTrade]);

  const acc   = paperAccount;
  const winR  = (acc.winCount + acc.lossCount) > 0
    ? ((acc.winCount / (acc.winCount + acc.lossCount)) * 100).toFixed(0) + '%'
    : '—';
  const balColor = acc.totalPnl >= 0 ? C.green : C.red;

  const posRow = (pos: PaperPosition, isOpen: boolean) => {
    const isLong = pos.dir === 'long';
    const units  = pos.size / pos.entryPrice;
    const livePnl = isOpen && livePrice
      ? (isLong ? (livePrice - pos.entryPrice) : (pos.entryPrice - livePrice)) * units
      : pos.realised;
    const livePnlColor = pnlColor(livePnl);
    const rMult  = isOpen
      ? (() => {
          const rd = Math.abs(pos.entryPrice - pos.initialStop);
          return rd > 0 ? livePnl / (rd * units) : 0;
        })()
      : calcRMultiple(pos);
    const statusColor: Record<string, string> = {
      open: C.blue, closed_tp: C.green, closed_sl: C.red,
      closed_be: C.amber, closed_trail: C.amber, closed_manual: C.text2,
    };

    return (
      <div key={pos.id} style={{
        background: 'var(--bg3)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 6,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: isLong ? C.green : C.red }}>
            {isLong ? '▲' : '▼'} {fmtSymDisplay(pos.sym)}
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: statusColor[pos.status] ?? C.text2,
            padding: '1px 7px', borderRadius: 8, border: `1px solid ${statusColor[pos.status] ?? C.text2}33`,
            background: `${statusColor[pos.status] ?? C.text2}11` }}>
            {STATUS_LABEL[pos.status]}
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3, marginLeft: 'auto' }}>
            {pos.strategyName}
          </span>
        </div>

        {/* Price levels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 6 }}>
          {[
            { label: 'Entry',   val: fmtPrice(pos.entryPrice), color: C.blue  },
            { label: 'Stop',    val: fmtPrice(pos.stopPrice),  color: C.red   },
            { label: 'Live',    val: isOpen && livePrice ? fmtPrice(livePrice) : '—', color: 'var(--text)' },
            { label: isOpen ? 'Unrealised' : 'P&L',
              val: (livePnl >= 0 ? '+' : '') + '$' + livePnl.toFixed(2),
              color: livePnlColor },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'var(--bg2)', borderRadius: 4, padding: '5px 7px' }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: C.text3, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* TP levels */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {pos.tpLevels.map((tp, i) => (
            <div key={i} style={{
              fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 7px',
              borderRadius: 6, border: `1px solid ${tp.hit ? C.green : 'var(--border2)'}`,
              background: tp.hit ? 'rgba(0,229,160,0.08)' : 'transparent',
              color: tp.hit ? C.green : C.text3,
            }}>
              TP{i + 1} {fmtPrice(tp.price)} {tp.sizePercent}%
              {tp.hit && tp.pnl != null && <span style={{ marginLeft: 4, color: C.green }}>+${tp.pnl.toFixed(2)}</span>}
            </div>
          ))}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3 }}>
            Size ${pos.size.toFixed(0)} · {rMult >= 0 ? '+' : ''}{rMult.toFixed(2)}R
          </span>
          {pos.trailActive && pos.trailPrice && (
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.amber }}>
              Trail {fmtPrice(pos.trailPrice)}
            </span>
          )}
          {pos.breakEvenDone && (
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.amber }}>BE ✓</span>
          )}
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3, marginLeft: 'auto' }}>
            {new Date(pos.openedAt).toLocaleTimeString()}
          </span>
        </div>

        {/* Notes */}
        {editNote === pos.id ? (
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add note…"
              style={{ flex: 1, padding: '4px 8px', fontSize: 10, fontFamily: 'var(--mono)', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
            />
            <ActionBtn variant="green" onClick={() => { useStore.getState().updatePaperNote(pos.id, noteText); setEditNote(null); }}>Save</ActionBtn>
            <ActionBtn onClick={() => setEditNote(null)}>Cancel</ActionBtn>
          </div>
        ) : (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            {pos.notes && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: C.text3, fontStyle: 'italic' }}>{pos.notes}</span>}
            {isOpen && (
              <>
                <button onClick={() => { setEditNote(pos.id); setNoteText(pos.notes); }}
                  style={{ fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border2)', background: 'transparent', color: C.text3, marginLeft: pos.notes ? 4 : 0 }}>
                  {pos.notes ? 'Edit note' : '+ Note'}
                </button>
                <button onClick={() => handleManualClose(pos.id)}
                  style={{ fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,61,90,0.35)', background: 'rgba(255,61,90,0.08)', color: C.red, marginLeft: 'auto' }}>
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700 }}>🤖 Paper Trading</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setAutoOpen(a => !a)}
            style={{
              padding: '4px 11px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
              border: `1px solid ${autoOpen ? C.green : 'var(--border2)'}`,
              background: autoOpen ? 'rgba(0,229,160,0.1)' : 'transparent',
              color: autoOpen ? C.green : C.text2,
            }}
          >
            {autoOpen ? '● Auto-Open ON' : '○ Auto-Open'}
          </button>
          <ActionBtn
            variant={strategySignal ? 'green' : 'default'}
            onClick={handleManualOpen}
          >
            + Open Position
          </ActionBtn>
        </div>
      </div>

      {/* Account stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12 }}>
        <StatBox label="Balance"    value={'$' + acc.balance.toFixed(2)}        color={balColor} />
        <StatBox label="Total P&L"  value={(acc.totalPnl >= 0 ? '+' : '') + '$' + acc.totalPnl.toFixed(2)} color={balColor} />
        <StatBox label="Win Rate"   value={winR}                                color={acc.winCount > acc.lossCount ? C.green : C.text2} />
        <StatBox label="Trades"     value={String(acc.winCount + acc.lossCount)} />
      </div>

      {/* Reset balance */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: C.text3 }}>Starting balance</span>
        <input
          type="number"
          defaultValue={acc.startBalance}
          onBlur={e => useStore.getState().resetPaperAccount(parseFloat(e.target.value) || 10000)}
          style={{ width: 90, padding: '4px 7px', fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
        />
        <button
          onClick={() => useStore.getState().resetPaperAccount(acc.startBalance)}
          style={{ padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: C.red }}
        >
          Reset
        </button>
      </div>

      {/* Strategy signal notice */}
      {strategySignal && (
        <div style={{
          padding: '8px 12px', marginBottom: 10, borderRadius: 'var(--radius-sm)',
          background: strategySignal.dir === 'long' ? 'rgba(0,229,160,0.06)' : 'rgba(255,61,90,0.06)',
          border: `1px solid ${strategySignal.dir === 'long' ? 'rgba(0,229,160,0.25)' : 'rgba(255,61,90,0.25)'}`,
          fontSize: 10, fontFamily: 'var(--mono)',
        }}>
          <span style={{ color: strategySignal.dir === 'long' ? C.green : C.red, fontWeight: 700 }}>
            {strategySignal.dir === 'long' ? '▲ LONG' : '▼ SHORT'} signal
          </span>
          <span style={{ color: C.text2, marginLeft: 10 }}>
            Entry {fmtPrice(strategySignal.entry)} · SL {fmtPrice(strategySignal.stop)} · Size ${strategySignal.size.toFixed(0)}
          </span>
        </div>
      )}

      {/* Open positions */}
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
        Open ({acc.openPositions.length})
      </div>
      {acc.openPositions.length === 0 ? (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: C.text3, textAlign: 'center', padding: '12px 0', marginBottom: 8 }}>
          No open positions. {strategySignal ? 'Click "+ Open Position" to paper trade the current signal.' : 'Waiting for strategy signal…'}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {acc.openPositions.map(p => posRow(p, true))}
        </div>
      )}

      {/* Closed positions toggle */}
      {acc.closedPositions.length > 0 && (
        <>
          <button
            onClick={() => setShowClosed(s => !s)}
            style={{ width: '100%', padding: '6px 12px', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: C.text2, display: 'flex', justifyContent: 'space-between', marginBottom: showClosed ? 8 : 0 }}
          >
            <span>Closed ({acc.closedPositions.length})</span>
            <span>{showClosed ? '▲' : '▼'}</span>
          </button>
          {showClosed && acc.closedPositions.slice().reverse().map(p => posRow(p, false))}
        </>
      )}
      {backtestResult && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            vs Backtest
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {[
                { label: 'Win Rate',   paper: winR,  bt: (backtestResult.winRate * 100).toFixed(0) + '%' },
                { label: 'Avg P&L',    paper: (acc.winCount + acc.lossCount) > 0 ? '$' + (acc.totalPnl / (acc.winCount + acc.lossCount)).toFixed(2) : '—',  bt: '$' + backtestResult.expectancy.toFixed(2) },
                { label: 'Total P&L', paper: '$' + acc.totalPnl.toFixed(2), bt: '$' + backtestResult.totalPnl.toFixed(2) },
            ].map(({ label, paper, bt }) => (
                <div key={label} style={{ background: 'var(--bg2)', borderRadius: 4, padding: '6px 8px' }}>
                <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: C.text3, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: C.blue }}>📄 {paper}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: C.purple }}>⚙ {bt}</span>
                </div>
                </div>
            ))}
            </div>
        </div>
        )}
    </Card>
  );
}