/*
  Verifies the entitlement-gated contact reveal (get_listing_contact, 0007): a
  free user gets level 'none' (paywall, NO channel), and an Ultimate user gets
  level 'full' with an actionable WhatsApp. Proves a patched client can't reveal
  more than its tier — the RPC shape IS the gate.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_ROLE_KEY=...] \
       node supabase/tests/contact-check.mjs
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
    email: `ctc_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`,
    password: 'password1234',
  });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const { data: anyProp } = await newClient()
  .from('properties')
  .select('id')
  .eq('status', 'active')
  .limit(1)
  .single();
ok('found a visible property to query', !!anyProp?.id);

const A = await signUp();
const free = await A.c.rpc('get_listing_contact', { p_property_id: anyProp.id });
ok('free user → level none (paywall)', free.data?.level === 'none' && free.data?.upgrade_required === true, JSON.stringify(free.data));
ok('free user → NO whatsapp/phone exposed', !free.data?.contact_whatsapp && !free.data?.contact_phone);

if (SERVICE) {
  const svc = newClient(SERVICE);
  // Find a visible property that actually has a seeded contact (listing_contacts
  // is unreachable by clients, so locate one with the service role).
  const { data: contacts } = await svc.from('listing_contacts').select('property_id').limit(20);
  let pid = anyProp.id;
  for (const c of contacts ?? []) {
    const { data: p } = await svc
      .from('properties')
      .select('id')
      .eq('id', c.property_id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();
    if (p) {
      pid = p.id;
      break;
    }
  }

  await svc.rpc('dev_grant_entitlement', { p_user: A.id, p_tier: 'ultimate' });
  const full = await A.c.rpc('get_listing_contact', { p_property_id: pid });
  ok('ultimate user → level full', full.data?.level === 'full', JSON.stringify(full.data).slice(0, 160));
  ok(
    'ultimate user → actionable whatsapp present',
    typeof full.data?.contact_whatsapp === 'string' && full.data.contact_whatsapp.length > 0,
    full.data?.contact_whatsapp,
  );
} else {
  console.log('\n(set SUPABASE_SERVICE_ROLE_KEY to also test the Ultimate full reveal)');
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
