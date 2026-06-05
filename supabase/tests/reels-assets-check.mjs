/*
  reels-assets-check.mjs — verifies the `reels` bucket actually CONTAINS the
  bytes that the seeded property_reels rows point at. The seed inserts reel rows
  with storage PATHS but no objects (seed.sql header: "no real bytes here"), so
  signed URLs resolve to 404 and the feed video player has nothing to play.

  Run `supabase/seed-reel-assets.mjs` first to populate the bucket, then this:
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/tests/reels-assets-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { URL, SERVICE } from './_helpers.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (secret key).');
  process.exit(2);
}
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// Every primary, ready reel must have its video + poster objects in the bucket.
const { data: reels, error } = await svc
  .from('property_reels')
  .select('id, video_path, poster_path')
  .eq('is_primary', true)
  .eq('status', 'ready');
ok('primary ready reels found', !error && (reels?.length ?? 0) > 0, error?.message ?? `count=${reels?.length}`);

const paths = [];
for (const r of reels ?? []) {
  if (r.video_path) paths.push(r.video_path);
  if (r.poster_path) paths.push(r.poster_path);
}

const { data: signed, error: signErr } = await svc.storage.from('reels').createSignedUrls(paths, 60);
ok('createSignedUrls runs', !signErr && Array.isArray(signed), signErr?.message);

const missing = (signed ?? []).filter((s) => s.error || !s.signedUrl);
ok(
  'every primary reel object exists (signs without error)',
  missing.length === 0,
  `missing=${missing.length}/${paths.length}${missing[0] ? ` e.g. ${missing[0].path}: ${missing[0].error}` : ''}`,
);

// Prove one signed URL actually serves bytes (object is real, not a stale row).
const first = (signed ?? []).find((s) => s.signedUrl);
if (first) {
  const res = await fetch(first.signedUrl);
  const len = Number(res.headers.get('content-length') ?? 0);
  ok('signed URL serves bytes (HTTP 200, non-empty)', res.status === 200 && len > 0, `status=${res.status} len=${len}`);
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
