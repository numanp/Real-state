/*
  Black-box RLS / OWASP-A01 check against a running Supabase (local by default).
  Creates two real users and an anon client, then asserts that user B can never
  read, mutate, or escalate user A's data — and that anon cannot write.

  Run:
    SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/rls-check.mjs
*/
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const ANON = process.env.SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY (and optionally SUPABASE_URL).');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const signUp = (label) => createConfirmedUser(`rls_${label}_${Date.now()}@example.com`);

async function main() {
  const anon = anonClient();

  const { data: props, error: pErr } = await anon.from('properties').select('id').limit(5);
  const propertyId = props?.[0]?.id;
  check('anon reads public properties (seed loaded)', !pErr && (props?.length ?? 0) > 0, pErr?.message ?? `count=${props?.length}`);

  const { error: anonWrite } = await anon.from('folders').insert({ name: 'hax' });
  check('anon CANNOT insert a folder (auth required)', !!anonWrite, anonWrite ? 'denied' : 'INSERT SUCCEEDED — BAD');

  const A = await signUp('a');
  const B = await signUp('b');

  // handle_new_user() already created A's default 'Favoritos' folder.
  const { data: aFolders } = await A.client.from('folders').select('id');
  const folderAId = aFolders?.[0]?.id;
  check('user A has a default folder from signup', (aFolders?.length ?? 0) >= 1 && !!folderAId, `count=${aFolders?.length}`);

  // Free tier caps folders at 1 → a 2nd must be blocked by the quota trigger.
  const { error: quotaErr } = await A.client.from('folders').insert({ user_id: A.id, name: 'A-second' });
  check('free-tier folder quota enforced server-side', !!quotaErr, quotaErr?.message ?? 'NO ERROR — BAD');

  if (propertyId) {
    const { error: likeErr } = await A.client.from('likes').insert({ user_id: A.id, property_id: propertyId });
    check('user A likes a property', !likeErr, likeErr?.message ?? 'ok');
  }

  const { data: bSeesA } = await B.client.from('folders').select('id').eq('id', folderAId);
  check('B CANNOT see A folder (RLS select)', (bSeesA?.length ?? 0) === 0, `rows=${bSeesA?.length}`);

  const { data: bUpd } = await B.client.from('folders').update({ name: 'hacked' }).eq('id', folderAId).select('id');
  check('B CANNOT update A folder (RLS update)', (bUpd?.length ?? 0) === 0, `affected=${bUpd?.length}`);

  const { data: bDel } = await B.client.from('folders').delete().eq('id', folderAId).select('id');
  check('B CANNOT delete A folder (RLS delete)', (bDel?.length ?? 0) === 0, `affected=${bDel?.length}`);

  if (propertyId) {
    const { error: idor } = await B.client
      .from('folder_items')
      .insert({ folder_id: folderAId, property_id: propertyId, user_id: B.id });
    check('IDOR: B CANNOT save into A folder (owns_folder guard)', !!idor, idor ? 'denied' : 'INSERT SUCCEEDED — BAD');
  }

  const { data: bSubs } = await B.client.from('subscriptions').select('profile_id').eq('profile_id', A.id);
  check('B CANNOT read A subscription', (bSubs?.length ?? 0) === 0, `rows=${bSubs?.length}`);

  await B.client.from('subscriptions').update({ tier: 'top' }).eq('profile_id', B.id);
  const { data: bTier } = await B.client.from('subscriptions').select('tier').eq('profile_id', B.id).single();
  check('B CANNOT self-upgrade tier (no client write to subscriptions)', bTier?.tier === 'free', `tier=${bTier?.tier}`);

  let fail = 0;
  for (const r of results) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? '✓' : '✗ FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(2);
});
