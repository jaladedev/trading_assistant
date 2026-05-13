const EXPORT_VERSION = 2;
const APP_TAG = 'tradeassist';

/**
 * Keys that are safe to round-trip through export/import.
 * Excludes ephemeral runtime state (candles, live price, indicator arrays, etc.)
 */
const SAFE_KEYS = [
  // Symbol & timeframe
  'sym', 'tf',
  // Journal
  'trades',
  // Theme & defaults
  'theme', 'defaultSym', 'defaultTf', 'defaultLeverage',
  'defaultFeeType', 'defaultCapital', 'defaultRR',
  // Calculator
  'capital', 'margin', 'goalPct', 'leverage', 'feeType', 'rrRatio',
  'entryPrice', 'stopPrice', 'sizeUsd', 'tokens', 'currentDir',
  // Indicators
  'activeIndicators', 'indicatorParams',
  // Strategies
  'strategies', 'activeStrategyId',
  // Chart drawings + ATR trail
  'chartDrawings', 'atrTrailMult',
  // Alerts & audio
  'maxDailyLossUsd', 'soundEnabled', 'notifEnabled', 'priceAlerts',
  // Paper account (without open positions — those are ephemeral)
  'paperAccount',
] as const;

export type SafeKey = typeof SAFE_KEYS[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppStateExport {
  version:    number;
  app:        typeof APP_TAG;
  exportedAt: string;
  state:      Partial<Record<SafeKey, unknown>>;
}

export interface ParseResult {
  ok:          boolean;
  error?:      string;
  data?:       Partial<Record<SafeKey, unknown>>;
  version?:    number;
  exportedAt?: string;
  keysFound?:  number;
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Serialize the Zustand store's safe keys into an export blob.
 */
export function serializeState(state: Record<string, unknown>): AppStateExport {
  const out: Partial<Record<SafeKey, unknown>> = {};
  for (const key of SAFE_KEYS) {
    if (key in state) out[key] = state[key];
  }
  // Strip open paper positions — they reference live prices that won't make sense
  if (out.paperAccount && typeof out.paperAccount === 'object') {
    out.paperAccount = { ...(out.paperAccount as object), openPositions: [] };
  }
  // Strip triggered alerts
  if (Array.isArray(out.priceAlerts)) {
    out.priceAlerts = (out.priceAlerts as Array<{ triggered: boolean }>)
      .filter(a => !a.triggered);
  }
  return {
    version:    EXPORT_VERSION,
    app:        APP_TAG,
    exportedAt: new Date().toISOString(),
    state:      out,
  };
}

/**
 * Trigger a JSON download of the current app state.
 */
export function downloadStateJSON(state: Record<string, unknown>): void {
  const payload = serializeState(state);
  const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(blob);
  a.download    = `tradeassist_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate a JSON import string.
 * Returns only the keys in SAFE_KEYS — never pollutes runtime state.
 */
export function parseStateImport(json: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Import must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['app'] !== APP_TAG) {
    return { ok: false, error: 'Not a TradeAssist export file (wrong app tag)' };
  }

  const rawState = obj['state'];
  if (!rawState || typeof rawState !== 'object') {
    return { ok: false, error: 'Missing or invalid state payload' };
  }

  // Allow only known safe keys
  const data: Partial<Record<SafeKey, unknown>> = {};
  for (const key of SAFE_KEYS) {
    if (key in (rawState as object)) {
      data[key] = (rawState as Record<string, unknown>)[key];
    }
  }

  return {
    ok:          true,
    data,
    version:     typeof obj['version'] === 'number' ? obj['version'] : undefined,
    exportedAt:  typeof obj['exportedAt'] === 'string' ? obj['exportedAt'] : undefined,
    keysFound:   Object.keys(data).length,
  };
}

/**
 * Open a file-picker dialog and call onResult with the parsed content.
 */
export function openImportFilePicker(
  onResult: (result: ParseResult) => void,
): void {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onResult(parseStateImport(text));
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ── Strategy URL sharing  (#3) ───────────────────────────────────────────────

/**
 * Encode a strategy object as a base64 URL parameter.
 * Returns the full shareable URL string.
 */
export function encodeStrategyToURL(strategy: object): string {
  try {
    const json = JSON.stringify(strategy);
    // TextEncoder → Uint8Array → base64 (handles non-ASCII strategy names)
    const bytes  = new TextEncoder().encode(json);
    const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
    const b64    = btoa(binary);
    const url    = new URL(window.location.href);
    // Clean path — strip existing ?strategy if any
    url.search = '';
    url.searchParams.set('strategy', b64);
    return url.toString();
  } catch {
    return window.location.href;
  }
}

/**
 * Read and decode a strategy from the current URL's ?strategy= param.
 * Returns null if absent or invalid.
 */
export function decodeStrategyFromURL(): object | null {
  try {
    const b64 = new URLSearchParams(window.location.search).get('strategy');
    if (!b64) return null;
    const binary = atob(b64);
    const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0));
    const json   = new TextDecoder().decode(bytes);
    const obj    = JSON.parse(json);
    // Basic sanity check
    if (typeof obj !== 'object' || !obj || !('name' in obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * Copy the shareable strategy URL to clipboard.
 */
export async function copyStrategyURL(strategy: object): Promise<boolean> {
  try {
    const url = encodeStrategyToURL(strategy);
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the ?strategy= param from the URL without a page reload.
 */
export function clearStrategyURLParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('strategy');
  window.history.replaceState({}, '', url.toString());
}