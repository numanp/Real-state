/*
  Authoritative no-self-verify proof for the verification layer (black-box,
  ANON_KEY only). Proves a user can request a badge but can NEVER grant/forge
  one. If SUPABASE_SERVICE_ROLE_KEY is set, also proves the service_role grant
  loop end-to-end (badge becomes publicly visible).
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_ROLE_KEY=...] \
       node supabase/tests/verification-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newClient = (key = ANON) => createClient(URL, key, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

// account_kind is set by handle_new_user() from signup metadata and is then
// IMMUTABLE (guard_profile_immutables reverts it). The shared helper does not
// pass metadata, so the agency case provisions a confirmed user inline with the
// admin API, seeding raw_user_meta_data.account_kind = 'agency' at creation.
async function signUp(kind) {
  const email = `vrf_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`;
  if (!kind) {
    const { client, id } = await createConfirmedUser(email);
    return { c: client, id };
  }
  if (!SERVICE) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required to provision an account_kind=agency user');
  }
  const password = 'password1234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_kind: kind },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const c = anonClient();
  const { error: se } = await c.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`signIn(${email}): ${se.message}`);
  return { c, id: data.user.id };
}

// --- person account ---------------------------------------------------
const A = await signUp(); // defaults to 'person'

const st0 = await A.c.rpc('get_my_badges');
ok(
  'new user starts with no badges + no request',
  !st0.error && (st0.data?.badges?.length ?? -1) === 0 && (st0.data?.request ?? null) === null,
  st0.error?.message ?? JSON.stringify(st0.data),
);

const r1 = await A.c.rpc('request_badge', { p_badge_type: 'identity', p_provider_ref: 'stub_x' });
ok('person CAN request the identity badge (pending)', !r1.error && r1.data?.status === 'pending', r1.error?.message);

const r2 = await A.c.rpc('request_badge', { p_badge_type: 'agency' });
ok('person CANNOT request the agency badge', !!r2.error, r2.error?.message ?? 'no error!');

// --- the three lockdown layers (ANON, the real guarantee) -------------
const w1 = await A.c
  .from('granted_badges')
  .insert({ subject_id: A.id, badge_type: 'identity', status: 'verified', method: 'manual' })
  .select('subject_id');
ok('client CANNOT INSERT into granted_badges (the badge-truth table)', !!w1.error, w1.error?.message ?? 'no error!');

// UPDATE matches 0 rows under RLS (no UPDATE policy → nothing updatable), so it
// may return "no error, 0 rows" rather than 42501 — both are safe. The real
// proof is the OUTCOME: no verified badge ever appears.
await A.c.from('granted_badges').update({ status: 'verified' }).eq('subject_id', A.id).select('subject_id');
const afterUpd = await A.c.rpc('get_badges_for', { p_subject: A.id });
ok('UPDATE attempt on granted_badges produced NO verified badge', (afterUpd.data?.length ?? -1) === 0);

const w3 = await A.c
  .from('badge_requests')
  .insert({ subject_id: A.id, badge_type: 'identity', account_kind: 'person', status: 'approved' })
  .select('id');
ok('client CANNOT INSERT badge_requests directly', !!w3.error, w3.error?.message ?? 'no error!');

// Self-approve attempt: assert the request stays 'pending' (the security property),
// regardless of whether the UPDATE errors or silently affects 0 rows.
await A.c.from('badge_requests').update({ status: 'approved' }).eq('subject_id', A.id).select('id');
const afterSelf = await A.c.rpc('get_my_badges');
ok(
  'self-approve attempt left the request NOT approved',
  afterSelf.data?.request?.status === 'pending',
  JSON.stringify(afterSelf.data?.request),
);

const g = await A.c.rpc('grant_badge', { p_subject: A.id, p_badge_type: 'identity', p_method: 'manual' });
ok('client CANNOT EXECUTE grant_badge (REVOKED)', !!g.error, g.error?.message ?? 'no error!');

const bf0 = await A.c.rpc('get_badges_for', { p_subject: A.id });
ok('un-granted subject exposes no public badge', !bf0.error && (bf0.data?.length ?? -1) === 0);

// --- read confidentiality (0017): granted_badges is RPC-only, no table read ---
const leakAuth = await A.c.from('granted_badges').select('subject_id, provider_ref, method');
ok(
  'authenticated CANNOT read granted_badges directly (no table grant)',
  !!leakAuth.error,
  leakAuth.error?.message ?? `leaked ${leakAuth.data?.length} rows!`,
);
const leakAnon = await newClient().from('granted_badges').select('subject_id, provider_ref');
ok(
  'anon CANNOT read granted_badges directly (no provider_ref enumeration)',
  !!leakAnon.error,
  leakAnon.error?.message ?? `leaked ${leakAnon.data?.length} rows!`,
);

const kycMismatch = await A.c.rpc('start_kyc_verification', { p_badge_type: 'agency' });
ok('person CANNOT open an agency KYC attempt', !!kycMismatch.error, kycMismatch.error?.message ?? 'no error!');

// --- agency account ---------------------------------------------------
const B = await signUp('agency');
const rb = await B.c.rpc('request_badge', { p_badge_type: 'agency' });
ok('agency CAN request the agency badge', !rb.error && rb.data?.status === 'pending', rb.error?.message);
const rbi = await B.c.rpc('request_badge', { p_badge_type: 'identity' });
ok('agency CANNOT request the identity badge', !!rbi.error, rbi.error?.message ?? 'no error!');

// --- service_role grant loop (optional, the positive path) ------------
if (SERVICE) {
  const svc = newClient(SERVICE);
  const gr = await svc.rpc('grant_badge', {
    p_subject: A.id,
    p_badge_type: 'identity',
    p_method: 'manual',
    p_provider_ref: 'svc',
  });
  ok('service_role CAN grant a badge', !gr.error, gr.error?.message);

  const bf = await A.c.rpc('get_badges_for', { p_subject: A.id });
  ok('granted badge is now publicly visible', (bf.data ?? []).some((x) => x.badge_type === 'identity'));

  const st = await A.c.rpc('get_my_badges');
  ok('granted badge appears in get_my_badges', (st.data?.badges ?? []).includes('identity'));
  ok('grant flipped the request to approved', st.data?.request?.status === 'approved', JSON.stringify(st.data?.request));
} else {
  console.log('\n(skipping service_role grant loop — set SUPABASE_SERVICE_ROLE_KEY to run it)');
}

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
