/*
  Verifies owner-listing RLS: an owner can create their own property and it
  shows in the public feed; another user cannot edit or delete it.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/listings-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const newClient = () => createClient(URL, ANON, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

async function signUp() {
  const c = newClient();
  const { data, error } = await c.auth.signUp({
    email: `lst_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`,
    password: 'password1234',
  });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const A = await signUp();
const { data: created, error: ce } = await A.c
  .from('properties')
  .insert({
    owner_id: A.id,
    title: 'Mi depto de prueba',
    listing_type: 'rent',
    property_kind: 'apartment',
    status: 'active',
    price_cents: 50_000_000,
    currency: 'ARS',
    bedrooms: 2,
    bathrooms: 1,
    city: 'Buenos Aires',
  })
  .select('id')
  .single();
ok('owner A creates a listing', !ce && !!created, ce?.message ?? created?.id);
const pid = created?.id;

const anon = newClient();
const { data: feed } = await anon.from('properties').select('id').eq('id', pid);
ok('listing appears in the public feed (anon read)', (feed?.length ?? 0) === 1);

const B = await signUp();
const { data: bUpd } = await B.c.from('properties').update({ title: 'hacked' }).eq('id', pid).select('id');
ok('user B CANNOT edit A listing', (bUpd?.length ?? 0) === 0, `affected=${bUpd?.length}`);

const { data: bDel } = await B.c.from('properties').delete().eq('id', pid).select('id');
ok('user B CANNOT delete A listing', (bDel?.length ?? 0) === 0, `affected=${bDel?.length}`);

const { data: mine } = await A.c.from('properties').select('id').eq('owner_id', A.id);
ok('owner A sees their own listing', (mine?.length ?? 0) >= 1, `count=${mine?.length}`);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
