/*
  Strict-TDD integration check for the HIGH "trial-farming → contact-PII harvest"
  chain fix (audit finding #1). Proves, against the live local stack:

    1. Email signup no longer yields an instant session — confirmation required
       (link 1 of the chain: enable_confirmations).
    2. start_ultimate_trial() takes NO client fingerprint and derives identity
       server-side from the VERIFIED email (link 2).
    3. The same verified email cannot farm a second trial after full account
       deletion + re-signup (trial_grants dedupe on the email hash).
    4. The old client-supplied 2-arg signature is gone.

  Requires a service_role key for admin user provisioning (email_confirm state).
  Run (keys come from `npx supabase status`):
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
    node supabase/tests/trial-harden-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) {
  console.error('Need SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = () => createClient(URL, ANON, { auth: { persistSession: false } });
const stamp = process.env.TEST_STAMP ?? String(Date.now());
const PW = 'password1234';
const rowOf = (r) => (Array.isArray(r) ? r[0] : r);

async function verifiedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error('admin.createUser: ' + error.message);
  const client = userClient();
  const { error: se } = await client.auth.signInWithPassword({ email, password: PW });
  if (se) throw new Error('signIn: ' + se.message);
  return { client, id: data.user.id };
}

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

// 1 — confirmation required: email signup yields NO session, sign-in refused until confirmed.
await check('email signup requires confirmation (no instant session)', async () => {
  const email = `harden_c_${stamp}@example.com`;
  const c = userClient();
  const { data, error } = await c.auth.signUp({ email, password: PW });
  assert.ok(!error, error?.message);
  assert.equal(data.session, null, 'expected NO session until the email is confirmed');
  const { error: se } = await c.auth.signInWithPassword({ email, password: PW });
  assert.ok(se && /confirm/i.test(se.message), 'expected "Email not confirmed" on sign-in');
});

// 2 — verified user starts the trial with NO client-supplied fingerprint, and lands on Ultimate.
await check('verified user starts trial via zero-arg RPC and reaches premium_agent_data=full', async () => {
  const email = `harden_a_${stamp}@example.com`;
  const { client } = await verifiedUser(email);
  const { data, error } = await client.rpc('start_ultimate_trial');
  assert.ok(!error, 'RPC error: ' + error?.message);
  const row = rowOf(data);
  assert.equal(row.eligible, true);
  assert.equal(row.reason, 'granted');
  const { data: ents } = await client.rpc('get_my_entitlements');
  const pad = (ents ?? []).find((e) => e.key === 'premium_agent_data');
  assert.equal(pad?.level_value, 'full', 'trial must confer full agent-data level');
});

// 3 — anti-farming: same verified email cannot re-trial after delete + re-signup (new uid).
await check('same verified email cannot re-trial after account deletion', async () => {
  const email = `harden_b_${stamp}@example.com`;
  const u1 = await verifiedUser(email);
  const r1 = rowOf((await u1.client.rpc('start_ultimate_trial')).data);
  assert.equal(r1.eligible, true, 'first trial should be granted');
  const { error: de } = await admin.auth.admin.deleteUser(u1.id);
  assert.ok(!de, 'deleteUser: ' + de?.message);
  const u2 = await verifiedUser(email); // brand-new uid, same email
  const r2 = rowOf((await u2.client.rpc('start_ultimate_trial')).data);
  assert.equal(r2.eligible, false, 'second trial on same email must be refused');
  assert.equal(r2.reason, 'identity_already_used');
});

// 4 — the client-supplied fingerprint signature is gone (cannot be called by an attacker).
await check('legacy client-fingerprint signature no longer callable', async () => {
  const email = `harden_d_${stamp}@example.com`;
  const { client } = await verifiedUser(email);
  const { error } = await client.rpc('start_ultimate_trial', {
    p_identity_fingerprint: 'attacker-controlled',
    p_device_fingerprint: 'x',
  });
  assert.ok(error, 'expected the removed 2-arg signature to be un-callable');
});

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
