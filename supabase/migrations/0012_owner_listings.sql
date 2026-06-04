-- =====================================================================
-- 0012_owner_listings.sql — Reel Estate
-- The two-sided marketplace: authenticated users may create and manage their
-- OWN properties (owner_id = auth.uid()). Seed listings have owner_id NULL and
-- stay read-only. Active listings remain publicly visible via the existing
-- properties_select_visible policy (0008); owners also see their own drafts.
-- =====================================================================

GRANT INSERT, UPDATE, DELETE ON public.properties TO authenticated;

-- Owners can see their own listings regardless of status (additive to public read).
CREATE POLICY properties_select_own ON public.properties
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

CREATE POLICY properties_insert_own ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY properties_update_own ON public.properties
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY properties_delete_own ON public.properties
  FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));
