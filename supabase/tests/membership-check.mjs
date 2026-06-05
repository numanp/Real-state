/*
  Probes the membership RPCs to learn their shapes:
  get_my_entitlements (free), start_ultimate_trial, get_my_entitlements (after).
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/membership-check.mjs
*/
import { createConfirmedUser } from './_helpers.mjs';

const email = `mem_${Date.now()}@example.com`;
const { client: c } = await createConfirmedUser(email);

const show = (label, { data, error }) =>
  console.log(`\n${label}:`, error ? `ERROR ${error.message}` : JSON.stringify(data)?.slice(0, 700));

show('get_my_entitlements (free)', await c.rpc('get_my_entitlements'));
show('start_ultimate_trial', await c.rpc('start_ultimate_trial'));
show('get_my_entitlements (after trial)', await c.rpc('get_my_entitlements'));
show('tier_entitlements reference (public read)', await c.from('tier_entitlements').select('tier,entitlement_key,enabled,limit_int,is_unlimited,level_value').limit(60));
