/*
  Verifies the server-side ranked_feed RPC: after liking some rentals, the
  ranked deck leans to the preferred operation and excludes already-seen items.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/ranking-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const c = createClient(URL, ANON, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

await c.auth.signUp({ email: `rank_${Date.now()}@example.com`, password: 'password1234' });
const me = (await c.auth.getUser()).data.user.id;

const { data: rents } = await c.from('properties').select('id').eq('listing_type', 'rent').limit(2);
for (const r of rents ?? []) {
  await c.from('likes').insert({ user_id: me, property_id: r.id });
  await c.from('feed_events').insert({
    user_id: me,
    property_id: r.id,
    event_type: 'like',
    created_at: new Date().toISOString(),
  });
}

const { data: ranked, error } = await c.rpc('ranked_feed', { p_limit: 8 });
ok('ranked_feed runs', !error && Array.isArray(ranked), error?.message ?? `count=${ranked?.length}`);

const top = (ranked ?? []).slice(0, 5).map((p) => p.listing_type);
const rentFrac = top.filter((o) => o === 'rent').length / Math.max(1, top.length);
ok('ranked deck leans to the liked operation (rent)', rentFrac >= 0.5, `top=[${top.join(',')}]`);

const likedIds = (rents ?? []).map((r) => r.id);
ok(
  'already-seen listings are excluded',
  !(ranked ?? []).some((p) => likedIds.includes(p.id)),
);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
