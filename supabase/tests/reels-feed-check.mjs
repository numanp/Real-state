/*
  reels-feed-check.mjs — verifies the discovery feed surfaces the property's
  PRIMARY reel media (REELS-FICHA §2.3) and is FAIL-CLOSED.

  Contract under test (ranked_feed RPC, "Para vos" deck):
    S1 — each feed row carries the primary reel's media fields
         (reel_id, media_type, video_path, poster_path, aspect_ratio, ...).
    S2 — a property whose primary reel is NOT 'ready' must NOT appear
         (the feed INNER-JOINs the primary ready reel; no media => not shown).

  Run with keys from `npx supabase status`:
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/tests/reels-feed-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { URL, SERVICE, createConfirmedUser } from './_helpers.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (secret key) — required to flip reel status.');
  process.exit(2);
}
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ranked_feed reads auth.uid(); a signed-in user is required.
const { client: c } = await createConfirmedUser(`reels_${Date.now()}@example.com`);

// A seeded property with a PRIMARY, READY, VIDEO reel (the feed unit).
const { data: reels, error: reelErr } = await svc
  .from('property_reels')
  .select('id, property_id, media_type, video_path, poster_path, status, is_primary')
  .eq('is_primary', true)
  .eq('status', 'ready')
  .eq('media_type', 'video')
  .limit(1);
const reel = reels?.[0];
ok('seed has a primary ready video reel', !reelErr && !!reel, reelErr?.message);

const P = reel?.property_id;

// --- S1: ranked_feed surfaces the primary reel media -----------------------
const { data: feed1, error: e1 } = await c.rpc('ranked_feed', { p_limit: 50 });
ok('ranked_feed runs', !e1 && Array.isArray(feed1), e1?.message);

const row = (feed1 ?? []).find((r) => r.id === P);
ok('property with a ready primary reel appears', !!row, `P=${P}`);
ok('row exposes reel_id', !!row && row.reel_id != null);
ok('row exposes media_type=video', !!row && row.media_type === 'video', `media_type=${row?.media_type}`);
ok('row exposes video_path', !!row && !!row.video_path);
ok('row exposes poster_path', !!row && !!row.poster_path);
ok('row exposes aspect_ratio', !!row && row.aspect_ratio != null);

// --- S2: fail-closed — non-ready primary reel disappears from the feed ------
if (reel) {
  try {
    const { error: upErr } = await svc
      .from('property_reels')
      .update({ status: 'hidden' })
      .eq('id', reel.id);
    ok('flip primary reel -> hidden', !upErr, upErr?.message);

    const { data: feed2, error: e2 } = await c.rpc('ranked_feed', { p_limit: 50 });
    ok('ranked_feed runs (post-flip)', !e2 && Array.isArray(feed2), e2?.message);
    ok(
      'fail-closed: property with no ready primary reel is excluded',
      !(feed2 ?? []).some((r) => r.id === P),
      `P=${P}`,
    );
  } finally {
    // restore the seed state regardless of assertion outcome
    await svc.from('property_reels').update({ status: 'ready' }).eq('id', reel.id);
  }
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
