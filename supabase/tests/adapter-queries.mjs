/*
  Verifies the SQL the Supabase adapters rely on actually works against the DB:
  the feed keyset query (.or cursor) + filters, and the ficha nested embedding.

  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/adapter-queries.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY');
  process.exit(2);
}
const c = createClient(URL, ANON);

const FEED = 'id,title,listing_type,price_cents,currency,bedrooms,bathrooms,area_sqm,city,like_count,save_count,published_at';
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const { data: p1, error: e1 } = await c
  .from('properties')
  .select(FEED)
  .order('published_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(5);
ok('feed page 1', !e1 && (p1?.length ?? 0) > 0, e1?.message ?? `${p1?.length} rows, first="${p1?.[0]?.title}"`);

if (p1?.length) {
  const last = p1[p1.length - 1];
  const { data: p2, error: e2 } = await c
    .from('properties')
    .select(FEED)
    .or(`published_at.lt.${last.published_at},and(published_at.eq.${last.published_at},id.lt.${last.id})`)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(5);
  const overlap = p2?.some((r) => p1.some((a) => a.id === r.id));
  ok('feed keyset page 2 (no overlap)', !e2 && !overlap, e2?.message ?? `${p2?.length} rows, overlap=${overlap}`);
}

const { data: rent, error: e3 } = await c.from('properties').select('id,listing_type').eq('listing_type', 'rent').limit(50);
ok('filter listing_type=rent', !e3 && (rent ?? []).every((r) => r.listing_type === 'rent'), e3?.message ?? `${rent?.length} rows`);

const propId = p1?.[0]?.id;
const SELECT = `id,title,property_kind,price_cents,currency,
  property_costs(cost_type,amount_cents,currency,period,label),
  property_terms(is_furnished,pets_allowed),
  listing_details(advertiser_type,agency_name),
  property_amenities(available,amenities_catalog(label_es,label_pt,scope))`;
const { data: d, error: e4 } = await c.from('properties').select(SELECT).eq('id', propId).maybeSingle();
ok(
  'ficha nested embedding (costs + amenities + advertiser)',
  !e4 && !!d && Array.isArray(d.property_costs),
  e4?.message ?? `costs=${d?.property_costs?.length}, amenities=${d?.property_amenities?.length}, advertiser=${d?.listing_details?.advertiser_type ?? d?.listing_details?.[0]?.advertiser_type}`,
);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
