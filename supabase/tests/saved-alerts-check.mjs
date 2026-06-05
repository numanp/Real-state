/*
  Verifies the in-app saved-search alert badge (0028): my_saved_search_alerts()
  counts new matches per the caller's searches since last_seen_at, and
  mark_saved_search_seen() resets that watermark — both self-scoped.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/saved-alerts-check.mjs
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

const signUp = (prefix) =>
  createConfirmedUser(`${prefix}_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

const CITY = `inappcity_${Math.floor(Math.random() * 1e9)}`;

const A = await signUp('inapp_a');
await svc.rpc('dev_grant_entitlement', { p_user: A.id, p_tier: 'pro' });
const { data: s } = await A.client
  .from('saved_searches')
  .insert({ user_id: A.id, name: 'Rent in-app', filters: { operation: 'rent', city: CITY } })
  .select('id')
  .single();
const sid = s.id;

const myCount = async (client) => {
  const { data, error } = await client.rpc('my_saved_search_alerts');
  if (error) throw new Error(`my_saved_search_alerts: ${error.message}`);
  return (data ?? []).find((r) => r.saved_search_id === sid)?.new_count ?? null;
};

ok('a fresh search shows 0 new matches', (await myCount(A.client)) === 0);

await svc.from('saved_searches').update({ last_seen_at: new Date(Date.now() - 86400_000).toISOString() }).eq('id', sid);

const prop = async (over) => {
  const { error } = await svc.from('properties').insert({
    title: 'In-app test', listing_type: 'rent', property_kind: 'apartment',
    price_cents: 100000, currency: 'USD', status: 'active', city: CITY,
    published_at: new Date().toISOString(), ...over,
  });
  if (error) throw new Error(`prop insert: ${error.message}`);
};

await prop({});
const afterMatch = await myCount(A.client);
ok('a new matching listing bumps the in-app count', afterMatch >= 1, `count=${afterMatch}`);

await prop({ listing_type: 'buy' });
ok('a non-matching listing does not bump the count', (await myCount(A.client)) === afterMatch);

// isolation: another user does not see A's search, and cannot mark it seen.
const B = await signUp('inapp_b');
const { data: bList } = await B.client.rpc('my_saved_search_alerts');
ok("another user's alerts do not include A's search", !(bList ?? []).some((r) => r.saved_search_id === sid));
await B.client.rpc('mark_saved_search_seen', { p_saved_search_id: sid });
ok("a different user cannot reset A's watermark", (await myCount(A.client)) === afterMatch);

// owner marks seen → count resets to 0.
await A.client.rpc('mark_saved_search_seen', { p_saved_search_id: sid });
ok('marking the search seen resets the count to 0', (await myCount(A.client)) === 0);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
