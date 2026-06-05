/*
  seed-reel-assets.mjs — DEV ONLY. Populates the `reels` storage bucket with
  real bytes for every seeded primary reel, so the feed video player has
  something to play. The seed (seed.sql) inserts reel ROWS with storage paths
  but NO objects; this uploads to those exact paths (read live from the DB, so
  it works regardless of the seed's random reel_ids).

  Content is GENERIC royalty-free placeholder (a small sample clip + per-property
  picsum posters) — swap for real property media later by re-uploading to the
  same paths. Re-runnable (upsert). Run AFTER seeding:

    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/seed-reel-assets.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { URL, SERVICE } from './tests/_helpers.mjs';

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (secret key) — required to write storage.');
  process.exit(2);
}
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// Small, reliable, royalty-free sample clips (first that downloads wins).
const VIDEO_URLS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://download.samplelib.com/mp4/sample-5s.mp4',
];
// Deterministic, distinct 9:16 poster per property.
const posterUrl = (seed) => `https://picsum.photos/seed/${seed}/720/1280.webp`;

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function firstWorking(urls) {
  for (const u of urls) {
    try {
      const bytes = await fetchBytes(u);
      console.log(`• video sample: ${u} (${(bytes.length / 1024).toFixed(0)} KB)`);
      return bytes;
    } catch (e) {
      console.warn(`  skip ${u}: ${e.message}`);
    }
  }
  throw new Error('no sample video URL reachable');
}

async function upload(path, bytes, contentType) {
  const { error } = await svc.storage.from('reels').upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

const videoBytes = await firstWorking(VIDEO_URLS);

const { data: reels, error } = await svc
  .from('property_reels')
  .select('id, property_id, media_type, video_path, poster_path, image_paths')
  .eq('is_primary', true)
  .eq('status', 'ready');
if (error) throw new Error(`query reels: ${error.message}`);

let done = 0;
let failed = 0;
for (const r of reels ?? []) {
  try {
    if (r.media_type === 'video' && r.video_path) {
      await upload(r.video_path, videoBytes, 'video/mp4');
    }
    if (r.poster_path) {
      const poster = await fetchBytes(posterUrl(r.property_id));
      await upload(r.poster_path, poster, 'image/webp');
    }
    // image_set primaries (none in the current seed, but be complete)
    if (r.media_type === 'image_set' && Array.isArray(r.image_paths)) {
      for (const p of r.image_paths) {
        const img = await fetchBytes(posterUrl(`${r.property_id}-${p}`));
        await upload(p, img, 'image/webp');
      }
    }
    done++;
    process.stdout.write('.');
  } catch (e) {
    failed++;
    console.warn(`\n  reel ${r.id}: ${e.message}`);
  }
}

console.log(`\n\nUploaded assets for ${done}/${reels?.length ?? 0} primary reels${failed ? ` (${failed} failed)` : ''}.`);
process.exit(failed === 0 ? 0 : 1);
