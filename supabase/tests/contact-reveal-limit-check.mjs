/*
  Strict-TDD integration check for the contact-reveal daily rate-limit
  (security audit follow-up, defense-in-depth). Proves that even a level-'full'
  account (trial or paid) cannot bulk-scrape the advertiser-contact dataset:
  the first CAP reveals/day return data, the (CAP+1)th is rate-limited and
  exposes NO PII.

  Run (keys from `npx supabase status`):
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
    node supabase/tests/contact-reveal-limit-check.mjs
*/
import assert from 'node:assert/strict';
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const CAP = 60; // MUST match v_cap in migration 0033_rate_limit_contact_reveal.sql
const stamp = String(Date.now());

// A visible property to reveal against (anon read of the public feed).
const { data: props, error: pe } = await anonClient()
  .from('properties')
  .select('id')
  .eq('status', 'active')
  .is('deleted_at', null)
  .limit(1);
if (pe) {
  console.error('property query:', pe.message);
  process.exit(2);
}
assert.ok(props?.length, 'need at least one visible property in the seed');
const propertyId = props[0].id;

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log('PASS  ' + name);
  } catch (e) {
    failures++;
    console.error('FAIL  ' + name + '  —  ' + e.message);
  }
};

await check(`full user: first ${CAP} reveals return data, the next is rate-limited with no PII`, async () => {
  const { client } = await createConfirmedUser(`reveal_${stamp}@example.com`);
  const t = await client.rpc('start_ultimate_trial'); // → Ultimate → premium_agent_data = full
  const trow = Array.isArray(t.data) ? t.data[0] : t.data;
  assert.equal(trow?.eligible, true, 'trial should grant Ultimate');

  for (let i = 1; i <= CAP; i++) {
    const { data, error } = await client.rpc('get_listing_contact', { p_property_id: propertyId });
    assert.ok(!error, `reveal ${i} errored: ${error?.message}`);
    assert.equal(data?.level, 'full', `reveal ${i} should be level full`);
    assert.ok(!data?.rate_limited, `reveal ${i} should NOT be rate-limited (under the cap)`);
    assert.ok(data?.contact_phone, `reveal ${i} should expose the contact phone`);
  }

  const { data: over } = await client.rpc('get_listing_contact', { p_property_id: propertyId });
  assert.equal(over?.rate_limited, true, `reveal ${CAP + 1} must be rate-limited`);
  assert.ok(!over?.contact_phone, 'rate-limited reveal must NOT expose a phone');
  assert.ok(!over?.contact_whatsapp, 'rate-limited reveal must NOT expose whatsapp');
});

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
