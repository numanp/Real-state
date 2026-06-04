/*
  Verifies the saved_searches quota is enforced server-side (0018): a free user
  cannot save any search (max_saved_searches: free=0), and a pro user is capped
  at 3. Proves the paywall can't be bypassed via the raw anon key.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_ROLE_KEY=...] \
       node supabase/tests/saved-searches-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newClient = (key = ANON) => createClient(URL, key, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

async function signUp() {
  const c = newClient();
  const { data, error } = await c.auth.signUp({
    email: `ss_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`,
    password: 'password1234',
  });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const A = await signUp();
const ins1 = await A.c
  .from('saved_searches')
  .insert({ user_id: A.id, name: 'Depto 2 amb', filters: {} })
  .select('id');
ok('free user CANNOT save a search (quota enforced server-side)', !!ins1.error, ins1.error?.message ?? 'inserted!');

if (SERVICE) {
  const svc = newClient(SERVICE);
  const grant = await svc.rpc('dev_grant_entitlement', { p_user: A.id, p_tier: 'pro' });
  ok('service_role grants pro', !grant.error, grant.error?.message);

  const ins2 = await A.c.from('saved_searches').insert({ user_id: A.id, name: 's1', filters: {} }).select('id');
  ok('pro user CAN save a search', !ins2.error, ins2.error?.message);

  await A.c.from('saved_searches').insert({ user_id: A.id, name: 's2', filters: {} });
  await A.c.from('saved_searches').insert({ user_id: A.id, name: 's3', filters: {} });
  const ins4 = await A.c.from('saved_searches').insert({ user_id: A.id, name: 's4', filters: {} }).select('id');
  ok('pro user blocked at the 4th saved search (limit 3)', !!ins4.error, ins4.error?.message ?? 'inserted 4th!');
} else {
  console.log('\n(set SUPABASE_SERVICE_ROLE_KEY to also test the pro-tier quota)');
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
