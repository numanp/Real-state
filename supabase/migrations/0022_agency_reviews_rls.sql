-- =====================================================================
-- 0022_agency_reviews_rls.sql — Reel Estate
-- RLS policies + GRANTs for the agency-reviews layer. Mirrors 0008/0016.
--
-- agencies      — PUBLIC read directory (name, logo, aggregate rating). NO
--                 client write: rating_count/rating_sum are owned by the
--                 trg_agency_rating definer trigger; nothing else writes.
-- agency_reviews — RPC-ONLY. It carries reviewer_id, so exposing it at the
--                 table level would leak who reviewed whom. NO GRANT, NO
--                 policy → unreachable by clients (42501 before RLS even
--                 evaluates). All access via the 0021 definer functions.
-- =====================================================================

-- =====================================================================
-- agencies — public, read-only directory.
-- =====================================================================
GRANT SELECT ON public.agencies TO anon, authenticated;

CREATE POLICY agencies_select_public ON public.agencies
  FOR SELECT TO anon, authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy or grant → agencies are immutable to
-- clients; the only writer of rating_count/rating_sum is trg_agency_rating.


-- =====================================================================
-- agency_reviews — NO grant, NO policy for any client role. Reads go
-- through get_agency_rating()/get_agency_reviews()/get_my_agency_review()
-- and writes through submit_agency_review()/delete_agency_review(), all
-- SECURITY DEFINER. A client cannot SELECT the table (and thus cannot read
-- reviewer_id), cannot INSERT a review for someone else, and cannot flip
-- or delete another user's row.
-- =====================================================================
-- (Intentionally: no GRANT, no CREATE POLICY.)
