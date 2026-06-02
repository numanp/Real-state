-- =====================================================================
-- 0008_rls.sql — Reel Estate
-- ALL Row-Level Security policies + table GRANTs. This is the ONLY real
-- authorization boundary (FOUNDATION §A01).
--
-- Conventions applied verbatim to EVERY table:
--   - RLS already ENABLE + FORCE (done in table migrations)
--   - DEFAULT DENY: a table is unreachable without an explicit policy
--   - Per-command policies (separate SELECT/INSERT/UPDATE/DELETE), never FOR ALL
--   - Owner checks scope by BOTH role AND owner:
--       TO authenticated USING ((select auth.uid()) = user_id)
--   - WITH CHECK on every INSERT/UPDATE write
--   - Public-read tables: TO anon, authenticated USING (<visibility predicate>)
--
-- GRANT model: with auto_expose_new_tables flipped to false (cloud default
-- from 2026-05-30), new tables are NOT reachable by the API roles without an
-- explicit GRANT. We GRANT exactly the privileges each policy needs — RLS then
-- filters rows. No GRANT == physically unreachable (defense in depth).
-- service_role bypasses RLS and keeps its implicit full access (seed/webhook).
-- =====================================================================

-- =====================================================================
-- profiles — owner-only read/update; no client insert (definer trigger);
--            no client delete (cascades from auth.users).
-- =====================================================================
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
-- Immutability of id / is_anonymous is enforced by the BEFORE UPDATE trigger
-- guard_profile_immutables (0007) — a row-level WITH CHECK cannot see OLD.
-- (No INSERT policy: only handle_new_user() definer trigger creates rows.)
-- (No DELETE policy: deletion flows from auth.users CASCADE.)


-- =====================================================================
-- properties — PUBLIC read of visible rows only; no client write (MVP).
-- =====================================================================
GRANT SELECT ON public.properties TO anon, authenticated;

CREATE POLICY properties_select_visible ON public.properties
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND status = 'active');
-- No INSERT/UPDATE/DELETE policy → all client writes denied (seed/service_role only).


-- =====================================================================
-- property_images — PUBLIC read only for visible parents.
-- =====================================================================
GRANT SELECT ON public.property_images TO anon, authenticated;

CREATE POLICY property_images_select_visible ON public.property_images
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));


-- =====================================================================
-- property_reels — PUBLIC read of ready reels for visible parents.
-- =====================================================================
GRANT SELECT ON public.property_reels TO anon, authenticated;

CREATE POLICY property_reels_select_visible ON public.property_reels
  FOR SELECT TO anon, authenticated
  USING (status = 'ready' AND (select public.is_property_visible(property_id)));


-- =====================================================================
-- property_media / costs / terms / amenities / attributes / price_events
-- / pois / listing_details — PUBLIC read for visible parents only.
-- =====================================================================
GRANT SELECT ON public.property_media        TO anon, authenticated;
GRANT SELECT ON public.property_costs        TO anon, authenticated;
GRANT SELECT ON public.property_terms        TO anon, authenticated;
GRANT SELECT ON public.property_amenities    TO anon, authenticated;
GRANT SELECT ON public.property_attributes   TO anon, authenticated;
GRANT SELECT ON public.property_price_events TO anon, authenticated;
GRANT SELECT ON public.property_pois         TO anon, authenticated;
GRANT SELECT ON public.listing_details       TO anon, authenticated;

CREATE POLICY property_media_select_visible ON public.property_media
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_costs_select_visible ON public.property_costs
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_terms_select_visible ON public.property_terms
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_amenities_select_visible ON public.property_amenities
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_attributes_select_visible ON public.property_attributes
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_price_events_select_visible ON public.property_price_events
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY property_pois_select_visible ON public.property_pois
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));

CREATE POLICY listing_details_select_visible ON public.listing_details
  FOR SELECT TO anon, authenticated
  USING ((select public.is_property_visible(property_id)));


-- =====================================================================
-- amenities_catalog — pure reference data (public read all).
-- =====================================================================
GRANT SELECT ON public.amenities_catalog TO anon, authenticated;

CREATE POLICY amenities_catalog_select_all ON public.amenities_catalog
  FOR SELECT TO anon, authenticated
  USING (true);


-- =====================================================================
-- listing_contacts — NO broad public SELECT. Reveal ONLY via
-- get_listing_contact() SECURITY DEFINER RPC. No table grant, no policy.
-- =====================================================================
-- (Intentionally: no GRANT, no CREATE POLICY → fully unreachable by clients.)


-- =====================================================================
-- likes — authenticated-only, per-owner. No UPDATE.
-- =====================================================================
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;

CREATE POLICY likes_select_own ON public.likes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY likes_insert_own ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY likes_delete_own ON public.likes
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);


-- =====================================================================
-- folders — authenticated-only, full per-owner CRUD.
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;

CREATE POLICY folders_select_own ON public.folders
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY folders_insert_own ON public.folders
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY folders_update_own ON public.folders
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY folders_delete_own ON public.folders
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);


-- =====================================================================
-- folder_items — authenticated-only. Flat RLS via denormalized user_id.
-- INSERT WITH CHECK additionally calls owns_folder() — the critical IDOR
-- defense (a guessed folder_id belonging to another user is rejected).
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_items TO authenticated;

CREATE POLICY folder_items_select_own ON public.folder_items
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY folder_items_insert_own ON public.folder_items
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (select public.owns_folder(folder_id))
  );

CREATE POLICY folder_items_update_own ON public.folder_items
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND (select public.owns_folder(folder_id))
  );

CREATE POLICY folder_items_delete_own ON public.folder_items
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));


-- =====================================================================
-- subscriptions — user reads ONLY their own. NO client write path.
-- =====================================================================
GRANT SELECT ON public.subscriptions TO authenticated;

CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE policy → only service_role (webhook) writes.


-- =====================================================================
-- entitlements_catalog / tier_entitlements — public reference data.
-- =====================================================================
GRANT SELECT ON public.entitlements_catalog TO anon, authenticated;
GRANT SELECT ON public.tier_entitlements    TO anon, authenticated;

CREATE POLICY entitlements_catalog_select_all ON public.entitlements_catalog
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY tier_entitlements_select_all ON public.tier_entitlements
  FOR SELECT TO anon, authenticated
  USING (true);


-- =====================================================================
-- daily_usage_counters — user reads own row only. NO client write
-- (only record_swipe() definer RPC mutates).
-- =====================================================================
GRANT SELECT ON public.daily_usage_counters TO authenticated;

CREATE POLICY daily_usage_counters_select_own ON public.daily_usage_counters
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE policy → client cannot zero/decrement its counter.


-- =====================================================================
-- webhook_events — NO policy for any client role → invisible + immutable.
-- trial_grants — NO policy → definer functions / service_role only.
-- (No GRANT, no CREATE POLICY for either. service_role bypasses RLS.)
-- =====================================================================


-- =====================================================================
-- STORAGE — private buckets + SELECT policies on storage.objects.
-- (FOUNDATION §Storage policies + REELS-FICHA §6.) PRIVATE buckets only;
-- reads via signed URLs. Read policies reuse is_property_visible() so
-- hidden/soft-deleted listings can never have their media signed.
-- Writes are service_role/seed only in MVP (NO client write policy).
-- =====================================================================

-- --- Buckets (idempotent) ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('property-images', 'property-images', false, 5242880,   -- 5 MB
     ARRAY['image/webp','image/avif','image/jpeg','image/png']),
  ('reels', 'reels', false, 52428800,                      -- 50 MB
     ARRAY['video/mp4','video/quicktime','video/webm','image/webp','image/avif','image/jpeg','image/png']),
  ('property-media', 'property-media', false, 52428800,    -- 50 MB (floor plan / drone / 3D poster)
     ARRAY['image/webp','image/avif','image/jpeg','image/png','video/mp4']),
  ('avatars', 'avatars', false, 2097152,                   -- 2 MB
     ARRAY['image/webp','image/avif','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- --- property-images: signed read only for visible parents ---
-- Path convention {property_id}/...  → first segment is the property uuid.
-- is_storage_object_visible() does the split+cast and DENIES on a malformed
-- (non-uuid) first segment instead of raising 22P02 mid-policy (A05 hardening).
CREATE POLICY property_images_read_visible ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'property-images'
    AND (select public.is_storage_object_visible(name))
  );

-- --- reels: signed read only for visible parents ---
CREATE POLICY reels_read_visible ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'reels'
    AND (select public.is_storage_object_visible(name))
  );

-- --- property-media: signed read only for visible parents ---
CREATE POLICY property_media_read_visible ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'property-media'
    AND (select public.is_storage_object_visible(name))
  );

-- --- avatars: a user may read ONLY their own avatar (path prefix = uid) ---
CREATE POLICY avatars_read_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (split_part(name, '/', 1)) = (select auth.uid())::text
  );

-- (No client INSERT/UPDATE/DELETE policy on storage.objects for these buckets
--  in MVP → uploads are service_role/seed only. Later owner uploads guard with
--  owns_property((split_part(name,'/',1))::uuid).)
