-- =====================================================================
-- 0022_agency_reviews_rls.sql — Reel Estate
-- RLS policies + GRANTs for the agency-reviews layer. Mirrors 0008/0016.
--
-- agencies      — PUBLIC read directory (name, logo, aggregate rating). Write
--                 privileges are REVOKE'd at the GRANT layer; rating_count/
--                 rating_sum are owned by the trg_agency_rating definer trigger.
-- agency_reviews — RPC-ONLY. It carries reviewer_id, so any table-level access
--                 would leak who reviewed whom. All client privileges REVOKE'd;
--                 access is exclusively via the 0021 definer functions.
--
-- NOTE: Supabase auto-grants full CRUD to anon/authenticated on every new
-- public table (auto_expose_new_tables). RLS alone would block the ROWS, but we
-- REVOKE the grants explicitly so access is denied at the GRANT layer too —
-- defense-in-depth, mirroring 0017_verification_harden.
-- =====================================================================

-- =====================================================================
-- agencies — public, read-only directory. REVOKE the auto-granted CRUD, then
-- re-grant ONLY SELECT.
-- =====================================================================
REVOKE ALL ON public.agencies FROM anon, authenticated;
GRANT SELECT ON public.agencies TO anon, authenticated;

CREATE POLICY agencies_select_public ON public.agencies
  FOR SELECT TO anon, authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE grant or policy → agencies are immutable to clients;
-- the only writer of rating_count/rating_sum is trg_agency_rating (definer).


-- =====================================================================
-- agency_reviews — RPC-ONLY. REVOKE ALL from every client role so the table is
-- unreachable at the GRANT layer (42501), with FORCE RLS + no policy as the
-- second layer. Reads go through get_agency_rating()/get_agency_reviews()/
-- get_my_agency_review() (none expose reviewer_id); writes through
-- submit_agency_review()/delete_agency_review() (definer, bound to auth.uid()).
-- =====================================================================
REVOKE ALL ON public.agency_reviews FROM anon, authenticated, public;
-- No GRANT, no CREATE POLICY → a client cannot read reviewer_id, insert a
-- review as someone else, or flip/delete another user's row.
