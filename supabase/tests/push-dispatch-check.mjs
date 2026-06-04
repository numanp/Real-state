/*
  Verifies the push fan-out (0027): dispatch_saved_search_alerts() notifies
  searches whose owner has a device token and advances their watermark, while a
  token-less owner's search is NOT advanced (no alerts lost). The real Expo
  delivery is fire-and-forget (pg_net) and out of scope here.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/push-dispatch-check.mjs
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

const CITY = `dispcity_${Math.floor(Math.random() * 1e9)}`;

async function savedSearchWithMatch(prefix, withToken) {
  const u = await signUp(prefix);
  await svc.rpc('dev_grant_entitlement', { p_user: u.id, p_tier: 'pro' });
  if (withToken) {
    await u.c.rpc('register_push_token', { p_token: `ExponentPushToken[${prefix}_${Math.floor(Math.random() * 1e9)}]`, p_platform: 'ios' });
  }
  const { data: s } = await u.c
    .from('saved_searches')
    .insert({ user_id: u.id, name: `${prefix} rent`, filters: { operation: 'rent', city: CITY } })
    .select('id')
    .single();
  await svc.from('saved_searches').update({ last_notified_at: new Date(Date.now() - 86400_000).toISOString() }).eq('id', s.id);
  return { ...u, sid: s.id };
}

const insertMatch = async () => {
  const { error } = await svc.from('properties').insert({
    title: 'Dispatch test',
    listing_type: 'rent',
    property_kind: 'apartment',
    price_cents: 100000,
    currency: 'USD',
    status: 'active',
    city: CITY,
    published_at: new Date().toISOString(),
  });
  if (error) throw new Error(`prop insert: ${error.message}`);
};

const pendingFor = async (id) => {
  const { data } = await svc.rpc('pending_push_alerts');
  return (data ?? []).find((r) => r.saved_search_id === id)?.new_count ?? 0;
};

const withTok = await savedSearchWithMatch('disp_tok', true);
const noTok = await savedSearchWithMatch('disp_notok', false);
await insertMatch(); // one new matching listing → would match both searches

const watermarkOf = async (id) => {
  const { data } = await svc.from('saved_searches').select('last_notified_at').eq('id', id).single();
  return data?.last_notified_at;
};

ok('search WITH token is pending pre-dispatch', (await pendingFor(withTok.sid)) >= 1);
ok('token-less owner is excluded from pending_push_alerts (perf filter)', (await pendingFor(noTok.sid)) === 0);

const noTokBefore = await watermarkOf(noTok.sid);
const { data: count, error: dErr } = await svc.rpc('dispatch_saved_search_alerts');
ok('dispatch runs and reports messages enqueued', !dErr && (count ?? 0) >= 1, dErr?.message ?? `count=${count}`);

ok('search WITH token advanced (no longer pending)', (await pendingFor(withTok.sid)) === 0);
ok('token-less search watermark NOT advanced (no alert lost)', (await watermarkOf(noTok.sid)) === noTokBefore);

// A brand-new listing after dispatch re-arms the token'd search.
await insertMatch();
ok('a new listing after dispatch re-arms the alert', (await pendingFor(withTok.sid)) >= 1);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
