/*
  Verifies the push-alerts foundation (0026): device_push_tokens is RPC-only and
  per-owner; register/delete bind to auth.uid(); and pending_push_alerts() matches
  a saved search's jsonb filters against NEW active listings past the watermark.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/push-alerts-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newClient = (key) => createClient(URL, key, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

if (!ANON || !SERVICE) {
  console.error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
const anon = newClient(ANON);
const svc = newClient(SERVICE);

async function signUp(prefix) {
  const c = newClient(ANON);
  const { data, error } = await c.auth.signUp({
    email: `${prefix}_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`,
    password: 'password1234',
  });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const tokenUser = async (token) => {
  const { data } = await svc.from('device_push_tokens').select('user_id').eq('token', token).maybeSingle();
  return data?.user_id ?? null;
};

// --- token registration + binding ------------------------------------------
const A = await signUp('push_a');
const TOKEN_A = `ExponentPushToken[A_${Math.floor(Math.random() * 1e9)}]`;
const reg = await A.c.rpc('register_push_token', { p_token: TOKEN_A, p_platform: 'ios' });
ok('authenticated user registers a token', !reg.error, reg.error?.message);
ok('token is bound to the caller', (await tokenUser(TOKEN_A)) === A.id);

// --- RPC-only: table unreachable + anon cannot register --------------------
const leak = await anon.from('device_push_tokens').select('token').limit(1);
ok('device_push_tokens unreachable at the grant layer', !!leak.error, leak.error?.message);
const anonReg = await anon.rpc('register_push_token', { p_token: 'ExponentPushToken[ANON]' });
ok('anon cannot register a token', !!anonReg.error, anonReg.error?.message);

// --- upsert reassigns a device token to the new signer ---------------------
const B = await signUp('push_b');
await B.c.rpc('register_push_token', { p_token: TOKEN_A, p_platform: 'android' });
ok('re-registering a token reassigns it to the new user', (await tokenUser(TOKEN_A)) === B.id);

// --- cross-user delete isolation -------------------------------------------
const TOKEN_B = `ExponentPushToken[B_${Math.floor(Math.random() * 1e9)}]`;
await B.c.rpc('register_push_token', { p_token: TOKEN_B });
await A.c.rpc('delete_push_token', { p_token: TOKEN_B }); // A is not the owner
ok("a different user's delete cannot remove B's token", (await tokenUser(TOKEN_B)) === B.id);
await B.c.rpc('delete_push_token', { p_token: TOKEN_B });
ok('owner delete removes the token', (await tokenUser(TOKEN_B)) === null);

// --- matching engine: pending_push_alerts ----------------------------------
// Saved searches are quota-gated (free=0); grant A a paid tier so it can save.
await svc.rpc('dev_grant_entitlement', { p_user: A.id, p_tier: 'pro' });
const CITY = `pushcity_${Math.floor(Math.random() * 1e9)}`;
const { data: search, error: sErr } = await A.c
  .from('saved_searches')
  .insert({ user_id: A.id, name: 'Rent alert', filters: { operation: 'rent', city: CITY } })
  .select('id')
  .single();
ok('saved search created', !sErr && !!search?.id, sErr?.message);
const sid = search.id;
// Move the watermark to the past so "now()" listings count as new.
await svc.from('saved_searches').update({ last_notified_at: new Date(Date.now() - 86400_000).toISOString() }).eq('id', sid);

const prop = async (over) => {
  const { data, error } = await svc
    .from('properties')
    .insert({
      title: 'Push test',
      listing_type: 'rent',
      property_kind: 'apartment',
      price_cents: 100000,
      currency: 'USD',
      status: 'active',
      city: CITY,
      published_at: new Date().toISOString(),
      ...over,
    })
    .select('id')
    .single();
  if (error) throw new Error(`prop insert: ${error.message}`);
  return data.id;
};

const pendingFor = async (id) => {
  const { data, error } = await svc.rpc('pending_push_alerts');
  if (error) throw new Error(`pending: ${error.message}`);
  return (data ?? []).find((r) => r.saved_search_id === id)?.new_count ?? 0;
};

ok('no pending alerts before any matching listing', (await pendingFor(sid)) === 0);

await prop({}); // matching: rent + CITY + recent
const afterMatch = await pendingFor(sid);
ok('a new matching listing produces a pending alert', afterMatch >= 1, `count=${afterMatch}`);

await prop({ listing_type: 'buy' }); // non-matching: wrong operation
ok('a non-matching listing does not add to the alert', (await pendingFor(sid)) === afterMatch);

await prop({ published_at: new Date(Date.now() - 2 * 86400_000).toISOString() }); // before watermark
ok('a listing older than the watermark is not counted', (await pendingFor(sid)) === afterMatch);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
