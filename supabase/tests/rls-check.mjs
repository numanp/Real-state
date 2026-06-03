/*
  Black-box RLS / OWASP-A01 check against a running Supabase (local by default).
  Creates two real users and an anon client, then asserts that user B can never
  read, mutate, or escalate user A's data — and that anon cannot write.

  Run:
    SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/rls-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY (and optionally SUPABASE_URL).');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const newClient = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function signUp(label) {
  const c = newClient();
  const email = `rls_${label}_${Date.now()}@example.com`;
  const password = 'password1234';
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(`signUp(${label}): ${error.message}`);
  if (!data.session) {
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(`signIn(${label}): ${e2.message} (email confirmation on?)`);
  }
  const {
    data: { user },
  } = await c.auth.getUser();
  return { c, id: user.id };
}

async function main() {
  const anon = newClient();

  const { data: props, error: pErr } = await anon.from('properties').select('id').limit(5);
  const propertyId = props?.[0]?.id;
  check('anon reads public properties (seed loaded)', !pErr && (props?.length ?? 0) > 0, pErr?.message ?? `count=${props?.length}`);

  const { error: anonWrite } = await anon.from('folders').insert({ name: 'hax' });
  check('anon CANNOT insert a folder (auth required)', !!anonWrite, anonWrite ? 'denied' : 'INSERT SUCCEEDED — BAD');

  const A = await signUp('a');
  const B = await signUp('b');

  // handle_new_user() already created A's default 'Favoritos' folder.
  const { data: aFolders } = await A.c.from('folders').select('id');
  const folderAId = aFolders?.[0]?.id;
  check('user A has a default folder from signup', (aFolders?.length ?? 0) >= 1 && !!folderAId, `count=${aFolders?.length}`);

  // Free tier caps folders at 1 → a 2nd must be blocked by the quota trigger.
  const { error: quotaErr } = await A.c.from('folders').insert({ user_id: A.id, name: 'A-second' });
  check('free-tier folder quota enforced server-side', !!quotaErr, quotaErr?.message ?? 'NO ERROR — BAD');

  if (propertyId) {
    const { error: likeErr } = await A.c.from('likes').insert({ user_id: A.id, property_id: propertyId });
    check('user A likes a property', !likeErr, likeErr?.message ?? 'ok');
  }

  const { data: bSeesA } = await B.c.from('folders').select('id').eq('id', folderAId);
  check('B CANNOT see A folder (RLS select)', (bSeesA?.length ?? 0) === 0, `rows=${bSeesA?.length}`);

  const { data: bUpd } = await B.c.from('folders').update({ name: 'hacked' }).eq('id', folderAId).select('id');
  check('B CANNOT update A folder (RLS update)', (bUpd?.length ?? 0) === 0, `affected=${bUpd?.length}`);

  const { data: bDel } = await B.c.from('folders').delete().eq('id', folderAId).select('id');
  check('B CANNOT delete A folder (RLS delete)', (bDel?.length ?? 0) === 0, `affected=${bDel?.length}`);

  if (propertyId) {
    const { error: idor } = await B.c
      .from('folder_items')
      .insert({ folder_id: folderAId, property_id: propertyId, user_id: B.id });
    check('IDOR: B CANNOT save into A folder (owns_folder guard)', !!idor, idor ? 'denied' : 'INSERT SUCCEEDED — BAD');
  }

  const { data: bSubs } = await B.c.from('subscriptions').select('profile_id').eq('profile_id', A.id);
  check('B CANNOT read A subscription', (bSubs?.length ?? 0) === 0, `rows=${bSubs?.length}`);

  await B.c.from('subscriptions').update({ tier: 'top' }).eq('profile_id', B.id);
  const { data: bTier } = await B.c.from('subscriptions').select('tier').eq('profile_id', B.id).single();
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
