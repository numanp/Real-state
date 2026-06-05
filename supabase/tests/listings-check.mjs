/*
  Verifies owner-listing RLS: an owner can create their own property and it
  shows in the public feed; another user cannot edit or delete it.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/listings-check.mjs
*/
import { createConfirmedUser, anonClient } from './_helpers.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const newUser = () => createConfirmedUser(`lst_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

const A = await newUser();
const { data: created, error: ce } = await A.client
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

const anon = anonClient();
const { data: feed } = await anon.from('properties').select('id').eq('id', pid);
ok('listing appears in the public feed (anon read)', (feed?.length ?? 0) === 1);

const B = await newUser();
const { data: bUpd } = await B.client.from('properties').update({ title: 'hacked' }).eq('id', pid).select('id');
ok('user B CANNOT edit A listing', (bUpd?.length ?? 0) === 0, `affected=${bUpd?.length}`);

const { data: bDel } = await B.client.from('properties').delete().eq('id', pid).select('id');
ok('user B CANNOT delete A listing', (bDel?.length ?? 0) === 0, `affected=${bDel?.length}`);

const { data: mine } = await A.client.from('properties').select('id').eq('owner_id', A.id);
ok('owner A sees their own listing', (mine?.length ?? 0) >= 1, `count=${mine?.length}`);

// --- 0018: owner cannot tamper system-managed columns on their OWN row ---
await A.client.from('properties').update({ like_count: 999 }).eq('id', pid).select('id');
const { data: afterLike } = await A.client
  .from('properties')
  .select('like_count')
  .eq('id', pid)
  .single();
ok('owner CANNOT inflate like_count (reverted by guard)', (afterLike?.like_count ?? -1) === 0, `like_count=${afterLike?.like_count}`);

await A.client.from('properties').update({ published_at: '2999-01-01T00:00:00Z' }).eq('id', pid).select('id');
const { data: afterPub } = await A.client.from('properties').select('published_at').eq('id', pid).single();
ok(
  'owner CANNOT pin published_at to the future (reverted)',
  new Date(afterPub.published_at).getFullYear() < 2999,
  afterPub?.published_at,
);

// The depth-1 guard must NOT block the depth-2 counter trigger: a real like
// still increments like_count (the invariant the guard's pg_trigger_depth gate exists for).
await A.client.from('likes').insert({ user_id: A.id, property_id: pid });
const { data: afterCounter } = await A.client.from('properties').select('like_count').eq('id', pid).single();
ok(
  'counter trigger STILL increments like_count despite the immutability guard',
  (afterCounter?.like_count ?? -1) === 1,
  `like_count=${afterCounter?.like_count}`,
);

await A.client.from('properties').update({ title: 'Título editado' }).eq('id', pid).select('id');
const { data: afterTitle } = await A.client.from('properties').select('title').eq('id', pid).single();
ok('owner CAN still edit a legit column (title)', afterTitle?.title === 'Título editado', afterTitle?.title);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
