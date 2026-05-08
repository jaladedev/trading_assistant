'use client';

import { useState } from 'react';
import { useStore, TradeJournalEntry } from '@/lib/store';
import { fmtPrice, fmtSymDisplay } from '@/lib/indicators';
import { Card, ActionBtn, Badge } from '../ui';

const OUTCOME_COLORS: Record<string, { color: string; bg: string }> = {
  win:  { color: 'var(--green)', bg: 'var(--green-bg)' },
  loss: { color: 'var(--red)',   bg: 'var(--red-bg)'   },
  be:   { color: 'var(--amber)', bg: 'rgba(255,184,46,0.08)' },
  open: { color: 'var(--blue)',  bg: 'rgba(77,166,255,0.08)' },
};

export default function TradeLog() {
  const { trades, addTrade, updateTrade, deleteTrade, sym, livePrice, entryPrice, stopPrice, suggestion, currentDir } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TradeJournalEntry>>({});
  const [showForm, setShowForm] = useState(false);
  const [newTrade, setNewTrade] = useState<Partial<Omit<TradeJournalEntry,'id'>>>({
    symbol: sym, dir: currentDir, outcome: 'open',
    entry: parseFloat(entryPrice) || livePrice,
    stop: parseFloat(stopPrice) || 0,
    target: suggestion?.target || 0,
    pnl: 0, notes: '',
    date: new Date().toISOString().slice(0,10),
  });

  const stats = {
    total:  trades.length,
    wins:   trades.filter(t => t.outcome === 'win').length,
    losses: trades.filter(t => t.outcome === 'loss').length,
    pnl:    trades.reduce((a, t) => a + (t.pnl || 0), 0),
  };
  const wr = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(0) : '—';

  const handleAdd = () => {
    if (!newTrade.entry) return;
    addTrade({
      date: newTrade.date ?? new Date().toISOString().slice(0,10),
      symbol: newTrade.symbol ?? sym,
      dir: newTrade.dir ?? 'long',
      entry: newTrade.entry ?? 0,
      stop: newTrade.stop ?? 0,
      target: newTrade.target ?? 0,
      outcome: newTrade.outcome ?? 'open',
      pnl: newTrade.pnl ?? 0,
      notes: newTrade.notes ?? '',
    });
    setShowForm(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)',
    background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', outline: 'none', width: '100%',
  };

  return (
    <div>
      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
        {[
          { label: 'Total Trades', val: stats.total, col: 'var(--text)' },
          { label: 'Win Rate',     val: wr + (wr !== '—' ? '%' : ''), col: 'var(--green)' },
          { label: 'Wins / Losses', val: `${stats.wins} / ${stats.losses}`, col: 'var(--text2)' },
          { label: 'Net P&L',      val: (stats.pnl >= 0 ? '+' : '') + '$' + stats.pnl.toFixed(2), col: stats.pnl >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 700, color: s.col }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Add trade form */}
      {showForm ? (
        <Card>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, marginBottom: 10 }}>📝 Log New Trade</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Date</label>
              <input type="date" value={newTrade.date} onChange={e => setNewTrade(p => ({...p, date: e.target.value}))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Symbol</label>
              <input value={newTrade.symbol} onChange={e => setNewTrade(p => ({...p, symbol: e.target.value.toUpperCase()}))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Direction</label>
              <select value={newTrade.dir} onChange={e => setNewTrade(p => ({...p, dir: e.target.value as 'long'|'short'}))} style={inputStyle}>
                <option value="long">Long</option><option value="short">Short</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Outcome</label>
              <select value={newTrade.outcome} onChange={e => setNewTrade(p => ({...p, outcome: e.target.value as 'win'|'loss'|'be'|'open'}))} style={inputStyle}>
                <option value="open">Open</option><option value="win">Win</option><option value="loss">Loss</option><option value="be">Break-even</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Entry</label>
              <input type="number" step="0.01" value={newTrade.entry || ''} onChange={e => setNewTrade(p => ({...p, entry: parseFloat(e.target.value)||0}))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>P&L ($)</label>
              <input type="number" step="0.01" value={newTrade.pnl || ''} onChange={e => setNewTrade(p => ({...p, pnl: parseFloat(e.target.value)||0}))} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Notes</label>
            <textarea value={newTrade.notes} onChange={e => setNewTrade(p => ({...p, notes: e.target.value}))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn variant="green" onClick={handleAdd}>Save Trade</ActionBtn>
            <ActionBtn onClick={() => setShowForm(false)}>Cancel</ActionBtn>
          </div>
        </Card>
      ) : (
        <ActionBtn variant="green" onClick={() => {
          setNewTrade({ symbol: sym, dir: currentDir, outcome: 'open', entry: parseFloat(entryPrice)||livePrice, stop: parseFloat(stopPrice)||0, target: suggestion?.target||0, pnl: 0, notes: '', date: new Date().toISOString().slice(0,10) });
          setShowForm(true);
        }} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          + Log Trade
        </ActionBtn>
      )}

      {/* Trade list */}
      {!trades.length ? (
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>
          No trades logged yet. Use the calculator and log your first trade.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...trades].reverse().map(trade => {
            const oc = OUTCOME_COLORS[trade.outcome];
            const isEdit = editing === trade.id;
            return (
              <div key={trade.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                {isEdit ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                      <div>
                        <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Outcome</label>
                        <select value={draft.outcome ?? trade.outcome} onChange={e => setDraft(p => ({...p, outcome: e.target.value as 'win'|'loss'|'be'|'open'}))} style={inputStyle}>
                          <option value="open">Open</option><option value="win">Win</option><option value="loss">Loss</option><option value="be">Break-even</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>P&L ($)</label>
                        <input type="number" step="0.01" value={draft.pnl ?? trade.pnl} onChange={e => setDraft(p => ({...p, pnl: parseFloat(e.target.value)||0}))} style={inputStyle} />
                      </div>
                    </div>
                    <textarea value={draft.notes ?? trade.notes} onChange={e => setDraft(p => ({...p, notes: e.target.value}))} rows={2} style={{ ...inputStyle, marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn variant="green" onClick={() => { updateTrade(trade.id, draft); setEditing(null); setDraft({}); }}>Save</ActionBtn>
                      <ActionBtn onClick={() => { setEditing(null); setDraft({}); }}>Cancel</ActionBtn>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{trade.date}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtSymDisplay(trade.symbol)}</span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: trade.dir === 'long' ? 'var(--green)' : 'var(--red)', background: trade.dir === 'long' ? 'var(--green-bg)' : 'var(--red-bg)' }}>
                      {trade.dir === 'long' ? '▲ L' : '▼ S'}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>@ {fmtPrice(trade.entry)}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 7px', borderRadius: 4, color: oc.color, background: oc.bg }}>
                      {trade.outcome.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: (trade.pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 'auto' }}>
                      {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                    </span>
                    {trade.notes && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', width: '100%', marginTop: 2 }}>{trade.notes}</span>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                      <button onClick={() => { setEditing(trade.id); setDraft({}); }} style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' }}>Edit</button>
                      <button onClick={() => deleteTrade(trade.id)} style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,61,90,0.3)', background: 'rgba(255,61,90,0.07)', color: 'var(--red)' }}>×</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}