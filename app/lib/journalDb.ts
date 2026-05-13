import type { TradeJournalEntry } from './store';

const DB_NAME    = 'tradeassist';
const DB_VERSION = 1;
const STORE_NAME = 'trades';

// ── Open (singleton) ──────────────────────────────────────────────────────────
let _db: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date',    'date',    { unique: false });
        store.createIndex('symbol',  'symbol',  { unique: false });
        store.createIndex('outcome', 'outcome', { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function idbGetAllTrades(): Promise<TradeJournalEntry[]> {
  const db = await openDb();
  return wrap<TradeJournalEntry[]>(tx(db, 'readonly').getAll());
}

export async function idbPutTrade(trade: TradeJournalEntry): Promise<void> {
  const db = await openDb();
  await wrap(tx(db, 'readwrite').put(trade));
}

export async function idbPutTrades(trades: TradeJournalEntry[]): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await Promise.all(trades.map(t => wrap(store.put(t))));
}

export async function idbDeleteTrade(id: string): Promise<void> {
  const db = await openDb();
  await wrap(tx(db, 'readwrite').delete(id));
}

export async function idbClearTrades(): Promise<void> {
  const db = await openDb();
  await wrap(tx(db, 'readwrite').clear());
}

export async function idbReplaceTrades(trades: TradeJournalEntry[]): Promise<void> {
  await idbClearTrades();
  await idbPutTrades(trades);
}