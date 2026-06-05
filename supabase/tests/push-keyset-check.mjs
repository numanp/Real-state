/*
  Verifies the keyset (published_at, id) watermark (0026/0027): a listing sharing
  the EXACT published_at of the advanced watermark but with a higher id is still
  caught (a plain `published_at >` would drop it), while one with a lower id is
  correctly excluded. Uses explicit property ids to make the ordering deterministic.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/push-keyset-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { createConfirmedUser } from './_helpers.mjs';

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

const A = await createConfirmedUser(`keyset_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

await svc.rpc('dev_grant_entitlement', { p_user: A.id, p_tier: 'pro' });
await A.client.rpc('register_push_token', { p_token: `ExponentPushToken[K_${Math.floor(Math.random() * 1e9)}]` });

const CITY = `keysetcity_${Math.floor(Math.random() * 1e9)}`;
const { data: s } = await A.client
  .from('saved_searches')
  .insert({ user_id: A.id, name: 'keyset', filters: { operation: 'rent', city: CITY } })
  .select('id')
  .single();
const sid = s.id;
await svc.from('saved_searches').update({ last_notified_at: new Date(Date.now() - 86400_000).toISOString() }).eq('id', sid);

const T = new Date().toISOString(); // the shared exact published_at
// Per-run prefix so the suite is re-runnable; ordering rides the last byte.
const RUN = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
const PID = (suffix) => `${RUN}-0000-0000-0000-0000000000${suffix}`;
const insertAt = async (id) => {
  const { error } = await svc.from('properties').insert({
    id,
    title: 'keyset',
    listing_type: 'rent',
    property_kind: 'apartment',
    price_cents: 100000,
    currency: 'USD',
    status: 'active',
    city: CITY,
    published_at: T,
  });
  if (error) throw new Error(`insert ${id}: ${error.message}`);
};

const pendingFor = async (id) => {
  const { data } = await svc.rpc('pending_push_alerts');
  return (data ?? []).find((r) => r.saved_search_id === id)?.new_count ?? 0;
};

// P1 at T (id ...10). It matches (published_at > the day-old watermark).
await insertAt(PID('10'));
ok('first same-T listing is pending', (await pendingFor(sid)) >= 1);

// Dispatch advances the keyset to (T, ...10).
await svc.rpc('dispatch_saved_search_alerts');
ok('after dispatch the search is no longer pending', (await pendingFor(sid)) === 0);

// P2 at the SAME T but a HIGHER id → keyset (T, ...20) > (T, ...10) → caught.
await insertAt(PID('20'));
ok('same-timestamp listing with a higher id IS caught (keyset)', (await pendingFor(sid)) === 1);

// P3 at the SAME T but a LOWER id → (T, ...05) < (T, ...10) → excluded.
await insertAt(PID('05'));
ok('same-timestamp listing with a lower id is NOT re-notified', (await pendingFor(sid)) === 1);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
