/*
  Probes the membership RPCs to learn their shapes:
  get_my_entitlements (free), start_ultimate_trial, get_my_entitlements (after).
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/membership-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const c = createClient(URL, ANON, { auth: { persistSession: false } });

const email = `mem_${Date.now()}@example.com`;
const { error: se } = await c.auth.signUp({ email, password: 'password1234' });
if (se) {
  console.log('signup FAIL:', se.message);
  process.exit(1);
}

const show = (label, { data, error }) =>
  console.log(`\n${label}:`, error ? `ERROR ${error.message}` : JSON.stringify(data)?.slice(0, 700));

show('get_my_entitlements (free)', await c.rpc('get_my_entitlements'));
show('start_ultimate_trial', await c.rpc('start_ultimate_trial'));
show('get_my_entitlements (after trial)', await c.rpc('get_my_entitlements'));
show('tier_entitlements reference (public read)', await c.from('tier_entitlements').select('tier,entitlement_key,enabled,limit_int,is_unlimited,level_value').limit(60));
