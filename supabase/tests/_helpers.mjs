/*
  Shared test helpers for the Supabase integration probes.

  Email confirmation is ON (config.toml enable_confirmations = true, audit #1/#2),
  so a plain `signUp` no longer returns a usable session. Tests therefore
  provision ALREADY-CONFIRMED users via the admin API and sign them in.

  Run with both keys in env (from `npx supabase status`):
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/tests/<name>.mjs
*/
import { createClient } from '@supabase/supabase-js';

export const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON = process.env.SUPABASE_ANON_KEY;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANON) {
  console.error('Missing SUPABASE_ANON_KEY (publishable key from `supabase status`).');
  process.exit(2);
}

/** A fresh anonymous (unauthenticated) client bound to the anon/publishable key. */
export const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false } });

const adminClient = () => {
  if (!SERVICE) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY (secret key) — required to provision confirmed users.');
    process.exit(2);
  }
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
};

/**
 * Create an already email-confirmed user and return a signed-in anon client.
 * Use this everywhere a test previously did `signUp(...)` then acted on the
 * session — confirmation is now required, so signUp alone yields no session.
 *
 * @returns {Promise<{ client: import('@supabase/supabase-js').SupabaseClient, id: string, email: string }>}
 */
export async function createConfirmedUser(email, password = 'password1234') {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createConfirmedUser(${email}): ${error.message}`);
  const client = anonClient();
  const { error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`signIn(${email}): ${se.message}`);
  return { client, id: data.user.id, email };
}
