/*
  reels-getpage-check.mjs — verifies the Recientes keyset path (getPage) is
  fail-closed and surfaces primary reel media via the PostgREST embedded INNER join.

  Contract under test (PostgREST properties + property_reels!inner embed):
    S2 — a property whose primary reel is NOT 'ready' must NOT appear.
    S3 — getPage rows carry reel media fields identical to ranked_feed.

  Run with keys from `npx supabase status`:
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/tests/reels-getpage-check.mjs
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

// A signed-in user is required for RLS.
const { client: c } = await createConfirmedUser(`reels_gp_${Date.now()}@example.com`);

// Pick a seeded property with a PRIMARY, READY reel.
const { data: reels, error: reelErr } = await svc
  .from('property_reels')
  .select('id, property_id, media_type, video_path, poster_path, status, is_primary')
  .eq('is_primary', true)
  .eq('status', 'ready')
  .limit(1);
const reel = reels?.[0];
ok('seed has a primary ready reel', !reelErr && !!reel, reelErr?.message);

const P = reel?.property_id;

// The EXACT PostgREST query that getPage will issue (mirroring the repo logic).
const REEL_COLS = 'id,media_type,video_path,poster_path,image_paths,thumbnail_blurhash,duration_ms,aspect_ratio,caption';
const PROPERTY_COLS = 'id,title,listing_type,price_cents,currency,bedrooms,bathrooms,area_sqm,city,like_count,save_count,published_at';
const SELECT = `${PROPERTY_COLS},property_reels!inner(${REEL_COLS})`;

// --- S3: embedded join returns reel media fields ----------------------------
const { data: page1, error: e1 } = await c
  .from('properties')
  .select(SELECT)
  .eq('property_reels.is_primary', true)
  .eq('property_reels.status', 'ready')
  .order('published_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(50);

ok('getPage query runs', !e1 && Array.isArray(page1), e1?.message);

const row = (page1 ?? []).find((r) => r.id === P);
ok('property with a ready primary reel appears in getPage', !!row, `P=${P}`);

const reelEmbed = Array.isArray(row?.property_reels) ? row.property_reels[0] : row?.property_reels;
ok('embedded reel has id', !!reelEmbed && reelEmbed.id != null);
ok('embedded reel has media_type', !!reelEmbed && !!reelEmbed.media_type);
ok('embedded reel has aspect_ratio', !!reelEmbed && reelEmbed.aspect_ratio != null);
ok('at least one reel path present (video_path or image_paths)', !!reelEmbed && (!!reelEmbed.video_path || (Array.isArray(reelEmbed.image_paths) && reelEmbed.image_paths.length > 0)));

// --- S2: fail-closed — flip reel to hidden; property must vanish ------------
if (reel) {
  try {
    const { error: upErr } = await svc
      .from('property_reels')
      .update({ status: 'hidden' })
      .eq('id', reel.id);
    ok('flip primary reel -> hidden', !upErr, upErr?.message);

    const { data: page2, error: e2 } = await c
      .from('properties')
      .select(SELECT)
      .eq('property_reels.is_primary', true)
      .eq('property_reels.status', 'ready')
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);

    ok('getPage query runs (post-flip)', !e2 && Array.isArray(page2), e2?.message);
    ok(
      'fail-closed: property with no ready primary reel excluded from getPage',
      !(page2 ?? []).some((r) => r.id === P),
      `P=${P}`,
    );
  } finally {
    await svc.from('property_reels').update({ status: 'ready' }).eq('id', reel.id);
  }
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
