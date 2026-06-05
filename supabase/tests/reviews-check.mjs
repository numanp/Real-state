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
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const ANON = process.env.SUPABASE_ANON_KEY;

if (!ANON) {
  console.error('SUPABASE_ANON_KEY is required');
  process.exit(2);
}

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const signUp = (prefix) =>
  createConfirmedUser(`${prefix}_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

const ratingOf = async (client, agencyId) => {
  const { data } = await client.rpc('get_agency_rating', { p_agency_id: agencyId });
  return data ?? {};
};

// --- backfill proof: agencies exist + are publicly readable -----------------
const anon = anonClient();
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

// --- agency_reviews is unreachable at the GRANT layer (not just RLS rows) ----
const { error: leakErr } = await anon.from('agency_reviews').select('reviewer_id').limit(1);
ok('agency_reviews SELECT denied at the grant layer (anon)', !!leakErr, leakErr?.message);
const insLeak = await anon.from('agency_reviews').insert({ agency_id: agencyId, rating: 5 });
ok('agency_reviews INSERT denied at the grant layer (anon)', !!insLeak.error, insLeak.error?.message);

// --- agencies are read-only at the grant layer ------------------------------
const agencyWrite = await anon.from('agencies').update({ name: 'pwned' }).eq('id', agencyId);
ok('agencies UPDATE denied at the grant layer (anon)', !!agencyWrite.error, agencyWrite.error?.message);

// --- submit (free user) -----------------------------------------------------
const before = await ratingOf(anon, agencyId);
const A = await signUp('rev_a');
const { data: rev, error: subErr } = await A.client.rpc('submit_agency_review', {
  p_agency_id: agencyId, p_rating: 5, p_comment: '  Excelente atención  ',
});
ok('free user can submit a review', !subErr && rev?.rating === 5, subErr?.message ?? JSON.stringify(rev));
ok('comment is trimmed server-side', rev?.comment === 'Excelente atención', JSON.stringify(rev?.comment));
ok('submit response omits reviewer_id', !!rev && !('reviewer_id' in rev), Object.keys(rev ?? {}).join(','));

const afterInsert = await ratingOf(anon, agencyId);
ok('review_count incremented by exactly 1',
   afterInsert.review_count === (before.review_count ?? 0) + 1,
   `${before.review_count} -> ${afterInsert.review_count}`);

// --- re-submit EDITS (upsert), does not duplicate ---------------------------
const { data: rev2 } = await A.client.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 2 });
const afterEdit = await ratingOf(anon, agencyId);
ok('re-submit edits the same review (count unchanged)',
   afterEdit.review_count === afterInsert.review_count,
   `${afterInsert.review_count} -> ${afterEdit.review_count}`);
ok('edit lowered the average (5 -> 2)',
   Number(afterEdit.average) < Number(afterInsert.average), `${afterInsert.average} -> ${afterEdit.average}`);
ok('upsert kept a single row id', rev2?.id === rev?.id, `${rev?.id} vs ${rev2?.id}`);

// --- server-side validation: rating must be 1..5 ----------------------------
const tooHigh = await A.client.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 6 });
ok('rating 6 rejected server-side', !!tooHigh.error, tooHigh.error?.message);
const tooLow = await A.client.rpc('submit_agency_review', { p_agency_id: agencyId, p_rating: 0 });
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
const { data: my } = await A.client.rpc('get_my_agency_review', { p_agency_id: agencyId });
ok('get_my_agency_review returns the caller review (rating 2)', my?.rating === 2, JSON.stringify(my));

// --- cross-user delete isolation --------------------------------------------
const B = await signUp('rev_b');
await B.client.rpc('delete_agency_review', { p_agency_id: agencyId }); // B has no review here
const afterBDelete = await ratingOf(anon, agencyId);
ok("a different user's delete cannot remove A's review",
   afterBDelete.review_count === afterEdit.review_count,
   `${afterEdit.review_count} -> ${afterBDelete.review_count}`);

// --- owner delete decrements ------------------------------------------------
await A.client.rpc('delete_agency_review', { p_agency_id: agencyId });
const afterADelete = await ratingOf(anon, agencyId);
ok('owner delete removes the review (count back to baseline)',
   afterADelete.review_count === (before.review_count ?? 0),
   `${afterBDelete.review_count} -> ${afterADelete.review_count}`);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
