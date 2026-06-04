/*
  Verifies the agency-reviews layer (0020-0022). Proves the gate is the RPC,
  not the client:
    - agencies is a PUBLIC read-only directory (backfilled from seed).
    - agency_reviews is UNREACHABLE at the table level (carries reviewer_id).
    - submit_agency_review UPSERTs (one review per user per agency), validates
      rating 1..5 server-side, and bumps the denormalized agencies counters.
    - get_agency_reviews exposes reviewer_name but NEVER reviewer_id.
    - delete_agency_review only ever removes the CALLER's own review.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_ROLE_KEY=...] \
       node supabase/tests/reviews-check.mjs
*/
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const newClient = (key = ANON) => createClient(URL, key, { auth: { persistSession: false } });

if (!ANON) {
  console.error('SUPABASE_ANON_KEY is required');
  process.exit(2);
}

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

async function signUp(prefix) {
  const c = newClient();
  const { data, error } = await c.auth.signUp({
    email: `${prefix}_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`,
    password: 'password1234',
  });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const ratingOf = async (client, agencyId) => {
  const { data } = await client.rpc('get_agency_rating', { p_agency_id: agencyId });
  return data ?? {};
};

// --- backfill proof: agencies exist + are publicly readable -----------------
const anon = newClient();
const { data: agencies, error: agErr } = await anon
  .from('agencies')
  .select('id, name, rating_count')
  .limit(1);
ok('agencies backfilled from seed + public SELECT', !agErr && (agencies?.length ?? 0) > 0, agErr?.message);
const agencyId = agencies?.[0]?.id;
if (!agencyId) {
  console.log('\nNO agency to review — backfill produced nothing. Aborting.');
  process.exit(1);
}

// --- agency_reviews is unreachable at the table level -----------------------
const { data: leak, error: leakErr } = await anon.from('agency_reviews').select('reviewer_id').limit(1);
ok('agency_reviews table is unreachable by anon (no leak of reviewer_id)',
   !!leakErr || (leak?.length ?? 0) === 0, leakErr?.message ?? JSON.stringify(leak));

// --- submit (free user) -----------------------------------------------------
const before = await ratingOf(anon, agencyId);
const A = await signUp('rev_a');
const { data: rev, error: subErr } = await A.c.rpc('submit_agency_review', {
  p_agency_id: agencyId, p_rating: 5, p_comment: '  Excelente atención  ',
});
ok('free user can submit a review', !subErr && rev?.rating === 5, subErr?.message ?? JSON.stringify(rev));
ok('comment is trimmed server-side', rev?.comment === 'Excelente atención', JSON.stringify(rev?.comment));

const afterInsert = await ratingOf(anon, agencyId);
ok('review_count incremented by exactly 1',
   afterInsert.review_count === (before.review_count ?? 0) + 1,
   `${before.review_count} -> ${afterInsert.review_count}`);

// --- re-submit EDITS (upsert), does not duplicate ---------------------------
const { data: rev2 } = await A.c.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 2 });
const afterEdit = await ratingOf(anon, agencyId);
ok('re-submit edits the same review (count unchanged)',
   afterEdit.review_count === afterInsert.review_count,
   `${afterInsert.review_count} -> ${afterEdit.review_count}`);
ok('edit lowered the average (5 -> 2)',
   Number(afterEdit.average) < Number(afterInsert.average), `${afterInsert.average} -> ${afterEdit.average}`);
ok('upsert kept a single row id', rev2?.id === rev?.id, `${rev?.id} vs ${rev2?.id}`);

// --- server-side validation: rating must be 1..5 ----------------------------
const tooHigh = await A.c.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 6 });
ok('rating 6 rejected server-side', !!tooHigh.error, tooHigh.error?.message);
const tooLow = await A.c.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 0 });
ok('rating 0 rejected server-side', !!tooLow.error, tooLow.error?.message);

// --- anon cannot submit -----------------------------------------------------
const anonSubmit = await anon.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 4 });
ok('anonymous user cannot submit a review', !!anonSubmit.error, anonSubmit.error?.message);

// --- public list exposes reviewer_name but NEVER reviewer_id ----------------
const { data: list } = await anon.rpc('get_agency_reviews', { p_agency_id: agencyId, p_limit: 50 });
const mine = (list ?? []).find((r) => r.id === rev?.id);
ok('public reviews list returns the review', !!mine, JSON.stringify(list?.[0]));
ok('list row carries a reviewer_name', typeof mine?.reviewer_name === 'string' && mine.reviewer_name.length > 0, mine?.reviewer_name);
ok('list row NEVER carries reviewer_id', mine != null && !('reviewer_id' in mine), JSON.stringify(Object.keys(mine ?? {})));

// --- self-scoped read -------------------------------------------------------
const { data: my } = await A.c.rpc('get_my_agency_review', { p_agency_id: agencyId });
ok('get_my_agency_review returns the caller review (rating 2)', my?.rating === 2, JSON.stringify(my));

// --- cross-user delete isolation --------------------------------------------
const B = await signUp('rev_b');
await B.c.rpc('delete_agency_review', { p_agency_id: agencyId }); // B has no review here
const afterBDelete = await ratingOf(anon, agencyId);
ok("a different user's delete cannot remove A's review",
   afterBDelete.review_count === afterEdit.review_count,
   `${afterEdit.review_count} -> ${afterBDelete.review_count}`);

// --- owner delete decrements ------------------------------------------------
await A.c.rpc('delete_agency_review', { p_agency_id: agencyId });
const afterADelete = await ratingOf(anon, agencyId);
ok('owner delete removes the review (count back to baseline)',
   afterADelete.review_count === (before.review_count ?? 0),
   `${afterBDelete.review_count} -> ${afterADelete.review_count}`);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
