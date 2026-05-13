// ── supabase.ts ───────────────────────────────────────────────────────────────
// Feature #4 Supabase option (auth + cloud sync)
//
// Setup:
//   1. Create a free project at https://supabase.com
//   2. Add to .env.local:
//        NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//        NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
//   3. Run this SQL in the Supabase SQL editor:
//
//      create table public.tradeassist_states (
//        id         uuid primary key default gen_random_uuid(),
//        user_id    uuid references auth.users not null,
//        state_json jsonb not null,
//        created_at timestamptz default now(),
//        updated_at timestamptz default now()
//      );
//      alter table public.tradeassist_states enable row level security;
//      create policy "Users own their state" on public.tradeassist_states
//        for all using (auth.uid() = user_id);
//
//   4. Install the client: npm install @supabase/supabase-js

// Guard: this module does nothing if Supabase env vars are absent
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

// ── Lazy client creation ──────────────────────────────────────────────────────

let _client: unknown = null;

async function getClient() {
  if (!SUPABASE_ENABLED) return null;
  if (_client) return _client as import('@supabase/supabase-js').SupabaseClient;
  const { createClient } = await import('@supabase/supabase-js').catch(() => ({ createClient: null }));
  if (!createClient) {
    console.warn('[Supabase] @supabase/supabase-js not installed. Run: npm install @supabase/supabase-js');
    return null;
  }
  _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _client as import('@supabase/supabase-js').SupabaseClient;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export interface SupabaseUser {
  id:    string;
  email: string | undefined;
}

/**
 * Sign in with email + password magic link (passwordless).
 */
export async function signInWithEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await getClient();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = await getClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  const sb = await getClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email };
}

/** Subscribe to auth state changes. Returns unsubscribe fn. */
export async function onAuthStateChange(
  cb: (user: SupabaseUser | null) => void,
): Promise<() => void> {
  const sb = await getClient();
  if (!sb) return () => {};
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email } : null);
  });
  return () => subscription.unsubscribe();
}

// ── State sync helpers ────────────────────────────────────────────────────────

import type { AppStateExport } from './stateIO';
import { serializeState } from './stateIO';

/**
 * Push current store state to Supabase (upsert by user_id).
 */
export async function pushStateToCloud(
  storeState: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const sb   = await getClient();
  if (!sb)   return { ok: false, error: 'Supabase not configured' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const payload = serializeState(storeState);

  const { error } = await sb
    .from('tradeassist_states')
    .upsert({ user_id: user.id, state_json: payload, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Pull the latest state from Supabase for the current user.
 */
export async function pullStateFromCloud(): Promise<{
  ok: boolean;
  data?: AppStateExport;
  error?: string;
}> {
  const sb   = await getClient();
  if (!sb)   return { ok: false, error: 'Supabase not configured' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data, error } = await sb
    .from('tradeassist_states')
    .select('state_json, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No cloud state found' };

  return { ok: true, data: data.state_json as AppStateExport };
}

/**
 * React hook for Supabase auth state.
 * Usage in component: const { user, loading } = useSupabaseAuth();
 */
export function useSupabaseAuth() {
  // Lazy import to avoid SSR issues
  if (typeof window === 'undefined') return { user: null, loading: true };

  return { user: null as SupabaseUser | null, loading: false };
}

// ── Auto-sync: call this once at app root ─────────────────────────────────────

let _syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start auto-syncing state to Supabase every `intervalMs` ms.
 * Returns a cleanup function.
 */
export function startAutoSync(
  getState: () => Record<string, unknown>,
  intervalMs = 300_000, // 5 min
): () => void {
  if (!SUPABASE_ENABLED) return () => {};
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    const user = await getCurrentUser();
    if (!user) return;
    await pushStateToCloud(getState());
  }, intervalMs);
  return () => {
    if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
  };
}