/*
  Verifies the property geo exposure (0023): PostgREST surfaces the IMMUTABLE
  latitude(properties)/longitude(properties) computed columns as selectable
  virtual columns, so the client gets plain lat/lng for the map mini-view
  without ever serializing the PostGIS geography.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/geo-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('SUPABASE_ANON_KEY is required');
  process.exit(2);
}
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const { data, error } = await anon
  .from('properties')
  .select('id, city, latitude, longitude')
  .eq('status', 'active')
  .not('location', 'is', null) // ignore geo-less test rows other suites may have inserted
  .limit(1)
  .maybeSingle();

ok('PostgREST exposes computed latitude/longitude columns', !error, error?.message);
ok(
  'lat/lng are numbers',
  typeof data?.latitude === 'number' && typeof data?.longitude === 'number',
  JSON.stringify(data),
);
ok('latitude within [-90, 90]', data != null && data.latitude >= -90 && data.latitude <= 90, String(data?.latitude));
ok('longitude within [-180, 180]', data != null && data.longitude >= -180 && data.longitude <= 180, String(data?.longitude));

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
