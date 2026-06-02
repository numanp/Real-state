-- =====================================================================
-- 0007_functions_triggers.sql — Reel Estate
-- ALL functions + triggers. SECURITY DEFINER fns are STABLE/VOLATILE as
-- appropriate, SET search_path = '', fully-qualify every object, are
-- REVOKE'd from public/anon and GRANT'd narrowly.
--
-- Sections:
--   A. Shared trigger helpers (set_updated_at, handle_new_user)
--   B. Authorization helpers (owns_folder, is_property_visible, owns_property)
--   C. Denormalized counters (like_count, save_count, folders.item_count)
--   D. cover_image_path sync (primary reel poster → image[0] fallback)
--   E. Entitlement resolver (resolve_entitlement, get_my_entitlements)
--   F. Quota enforcement (enforce_quota + limit triggers)
--   G. Swipe RPC (record_swipe)
--   H. Trial RPC (start_ultimate_trial) + dev grant (dev_grant_entitlement)
--   I. Gated contact reveal (get_listing_contact)
-- =====================================================================


-- =====================================================================
-- A. Shared trigger helpers
-- =====================================================================

-- set_updated_at — BEFORE UPDATE; never trust client timestamps.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;

-- handle_new_user — AFTER INSERT on auth.users. Provisions:
--   1. profiles row (clients have no INSERT policy on profiles)
--   2. default 'free' subscriptions row (resolver always finds a row)
--   3. default "Favoritos" folder (is_default = true)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_anon boolean := COALESCE((NEW.raw_app_meta_data ->> 'is_anonymous')::boolean, NEW.is_anonymous, false);
BEGIN
  INSERT INTO public.profiles (id, is_anonymous)
  VALUES (NEW.id, v_is_anon)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (profile_id, tier, status)
  VALUES (NEW.id, 'free', 'inactive')
  ON CONFLICT (profile_id) DO NOTHING;

  INSERT INTO public.folders (user_id, name, is_default)
  VALUES (NEW.id, 'Favoritos', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- Trigger on auth.users (the definer fn owns the inserts into public.*).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- guard_profile_immutables — BEFORE UPDATE on profiles. A row-level RLS
-- WITH CHECK cannot reference OLD values, so the immutability of id and
-- is_anonymous is enforced here: any client attempt to change them is
-- silently reverted to the stored value (mass-assignment defense, A01).
CREATE OR REPLACE FUNCTION public.guard_profile_immutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.is_anonymous := OLD.is_anonymous;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_immutables() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_immutables ON public.profiles;
CREATE TRIGGER profiles_guard_immutables
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_immutables();


-- =====================================================================
-- B. Authorization helpers (STABLE, definer, wrapped in (select ...) by callers)
-- =====================================================================

-- is_property_visible — single source of truth for property visibility.
-- Reused by every child-table SELECT policy + storage policies.
CREATE OR REPLACE FUNCTION public.is_property_visible(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = p_property_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_property_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_property_visible(uuid) TO anon, authenticated;

-- owns_folder — used in folder_items INSERT WITH CHECK (IDOR/A01/A03 defense).
CREATE OR REPLACE FUNCTION public.owns_folder(p_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = p_folder_id
      AND f.user_id = (select auth.uid())
      AND f.deleted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.owns_folder(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_folder(uuid) TO authenticated;

-- is_storage_object_visible — robust visibility check for storage.objects
-- SELECT policies. The first path segment is the property uuid, but the object
-- key is attacker-influenceable: an object whose first segment is not a valid
-- uuid would make a raw `::uuid` cast raise 22P02 DURING RLS evaluation, which
-- can error the whole storage listing/sign query (availability / error-oracle,
-- OWASP A05). We catch the malformed cast and DENY instead of erroring.
CREATE OR REPLACE FUNCTION public.is_storage_object_visible(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := split_part(p_name, '/', 1)::uuid;
  RETURN public.is_property_visible(v_id);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.is_storage_object_visible(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_storage_object_visible(text) TO anon, authenticated;

-- owns_property — reserved for later owner uploads (storage WITH CHECK).
CREATE OR REPLACE FUNCTION public.owns_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = p_property_id
      AND p.owner_id = (select auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.owns_property(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_property(uuid) TO authenticated;


-- =====================================================================
-- C. Denormalized counters (transactional, table-owner rights)
-- =====================================================================

-- properties.like_count maintenance
CREATE OR REPLACE FUNCTION public.trg_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.properties SET like_count = like_count + 1 WHERE id = NEW.property_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.properties SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.property_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_like_count() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS likes_count_ins ON public.likes;
CREATE TRIGGER likes_count_ins
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_like_count();

DROP TRIGGER IF EXISTS likes_count_del ON public.likes;
CREATE TRIGGER likes_count_del
  AFTER DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_like_count();

-- properties.save_count maintenance — DISTINCT property-per-user.
-- On INSERT: increment only if this is the user's FIRST save of the property.
-- On DELETE: decrement only if this was the user's LAST save of the property.
CREATE OR REPLACE FUNCTION public.trg_save_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- count rows for (user, property) including this NEW one
    SELECT count(*) INTO v_remaining
      FROM public.folder_items fi
      WHERE fi.user_id = NEW.user_id AND fi.property_id = NEW.property_id;
    IF v_remaining = 1 THEN  -- first save of this property by this user
      UPDATE public.properties SET save_count = save_count + 1 WHERE id = NEW.property_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT count(*) INTO v_remaining
      FROM public.folder_items fi
      WHERE fi.user_id = OLD.user_id AND fi.property_id = OLD.property_id;
    IF v_remaining = 0 THEN  -- removed the last save of this property by this user
      UPDATE public.properties SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.property_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_save_count() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS folder_items_save_count_ins ON public.folder_items;
CREATE TRIGGER folder_items_save_count_ins
  AFTER INSERT ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_save_count();

DROP TRIGGER IF EXISTS folder_items_save_count_del ON public.folder_items;
CREATE TRIGGER folder_items_save_count_del
  AFTER DELETE ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_save_count();

-- folders.item_count maintenance
CREATE OR REPLACE FUNCTION public.trg_folder_item_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.folders SET item_count = item_count + 1 WHERE id = NEW.folder_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.folders SET item_count = GREATEST(item_count - 1, 0) WHERE id = OLD.folder_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_folder_item_count() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS folder_items_count_ins ON public.folder_items;
CREATE TRIGGER folder_items_count_ins
  AFTER INSERT ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_folder_item_count();

DROP TRIGGER IF EXISTS folder_items_count_del ON public.folder_items;
CREATE TRIGGER folder_items_count_del
  AFTER DELETE ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_folder_item_count();


-- =====================================================================
-- D. cover_image_path sync — PRIMARY reel poster → image[0] fallback (§2.4)
-- =====================================================================

-- Recompute properties.cover_image_path for a single property.
-- Precedence: primary ready reel poster_path → property_images position 0 → NULL.
CREATE OR REPLACE FUNCTION public.recompute_cover_image(p_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cover text;
BEGIN
  SELECT r.poster_path INTO v_cover
    FROM public.property_reels r
    WHERE r.property_id = p_property_id
      AND r.is_primary
      AND r.status = 'ready'
    LIMIT 1;

  IF v_cover IS NULL THEN
    SELECT i.storage_path INTO v_cover
      FROM public.property_images i
      WHERE i.property_id = p_property_id
      ORDER BY i.position ASC, i.created_at ASC
      LIMIT 1;
  END IF;

  UPDATE public.properties
    SET cover_image_path = v_cover
    WHERE id = p_property_id
      AND cover_image_path IS DISTINCT FROM v_cover;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_cover_image(uuid) FROM public, anon, authenticated;

-- Trigger fn for property_reels changes
CREATE OR REPLACE FUNCTION public.trg_cover_from_reels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_cover_image(OLD.property_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_cover_image(NEW.property_id);
  IF TG_OP = 'UPDATE' AND OLD.property_id IS DISTINCT FROM NEW.property_id THEN
    PERFORM public.recompute_cover_image(OLD.property_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_cover_from_reels() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS reels_cover_sync ON public.property_reels;
CREATE TRIGGER reels_cover_sync
  AFTER INSERT OR UPDATE OF poster_path, is_primary, status, property_id OR DELETE
  ON public.property_reels
  FOR EACH ROW EXECUTE FUNCTION public.trg_cover_from_reels();

-- Trigger fn for property_images changes (fallback source)
CREATE OR REPLACE FUNCTION public.trg_cover_from_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_cover_image(OLD.property_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_cover_image(NEW.property_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_cover_from_images() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS images_cover_sync ON public.property_images;
CREATE TRIGGER images_cover_sync
  AFTER INSERT OR UPDATE OF storage_path, position OR DELETE
  ON public.property_images
  FOR EACH ROW EXECUTE FUNCTION public.trg_cover_from_images();


-- =====================================================================
-- Shared set_updated_at wiring (BEFORE UPDATE)
-- =====================================================================
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS properties_set_updated_at ON public.properties;
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS folders_set_updated_at ON public.folders;
CREATE TRIGGER folders_set_updated_at BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS property_reels_set_updated_at ON public.property_reels;
CREATE TRIGGER property_reels_set_updated_at BEFORE UPDATE ON public.property_reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS property_terms_set_updated_at ON public.property_terms;
CREATE TRIGGER property_terms_set_updated_at BEFORE UPDATE ON public.property_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS listing_details_set_updated_at ON public.listing_details;
CREATE TRIGGER listing_details_set_updated_at BEFORE UPDATE ON public.listing_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS listing_contacts_set_updated_at ON public.listing_contacts;
CREATE TRIGGER listing_contacts_set_updated_at BEFORE UPDATE ON public.listing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================================
-- E. Entitlement resolver — the SINGLE resolution definition
-- =====================================================================

-- resolve_entitlement(p_user, p_key) — read-API logic narrowed to one
-- user + one key. Shared by enforce_quota / record_swipe / get_listing_contact
-- so enforcement and the read API can NEVER disagree.
CREATE OR REPLACE FUNCTION public.resolve_entitlement(p_user uuid, p_key public.entitlement_key)
RETURNS TABLE(enabled boolean, limit_int integer, is_unlimited boolean, level_value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eff AS (
    SELECT CASE
      WHEN s.tier = 'top' AND s.status = 'active' AND s.is_lifetime THEN 'top'::public.app_tier
      WHEN s.is_trial AND s.status = 'active' AND s.trial_ends_at IS NOT NULL AND now() < s.trial_ends_at
        THEN 'ultimate'::public.app_tier
      WHEN s.status IN ('active', 'in_grace')
        AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN s.tier
      ELSE 'free'::public.app_tier
    END AS tier
    FROM public.subscriptions s
    WHERE s.profile_id = p_user
  )
  SELECT te.enabled, te.limit_int, te.is_unlimited, te.level_value
  FROM public.tier_entitlements te
  WHERE te.entitlement_key = p_key
    AND te.tier = COALESCE((SELECT tier FROM eff), 'free'::public.app_tier);
$$;
-- NO client grant: resolve_entitlement accepts an ARBITRARY p_user, so granting
-- it to authenticated would let any caller infer another user's billing tier and
-- entitlement flags (information disclosure, OWASP A01). The internal definer
-- callers (enforce_quota / record_swipe / get_listing_contact) invoke it as the
-- function OWNER and do not need a client grant. Clients use the self-scoped
-- get_my_entitlements() only.
REVOKE ALL ON FUNCTION public.resolve_entitlement(uuid, public.entitlement_key) FROM public, anon, authenticated;

-- get_my_entitlements() — what the app calls to hydrate gates. Scoped to
-- (select auth.uid()); cannot be asked about another user.
CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(key public.entitlement_key, kind public.entitlement_kind, enabled boolean,
              limit_int integer, is_unlimited boolean, level_value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eff AS (
    SELECT CASE
      WHEN s.tier = 'top' AND s.status = 'active' AND s.is_lifetime THEN 'top'::public.app_tier
      WHEN s.is_trial AND s.status = 'active' AND s.trial_ends_at IS NOT NULL AND now() < s.trial_ends_at
        THEN 'ultimate'::public.app_tier
      WHEN s.status IN ('active', 'in_grace')
        AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN s.tier
      ELSE 'free'::public.app_tier
    END AS tier
    FROM public.subscriptions s
    WHERE s.profile_id = (select auth.uid())
  )
  SELECT te.entitlement_key, c.kind, te.enabled, te.limit_int, te.is_unlimited, te.level_value
  FROM public.tier_entitlements te
  JOIN public.entitlements_catalog c ON c.key = te.entitlement_key
  WHERE te.tier = COALESCE((SELECT tier FROM eff), 'free'::public.app_tier);
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;


-- =====================================================================
-- F. Quota enforcement — BEFORE INSERT triggers (synchronous, race-safe)
--
-- NOTE: FORCE ROW LEVEL SECURITY does NOT disable triggers. These BEFORE
-- INSERT quota triggers therefore fire for EVERY writer, including
-- service_role/seed/webhook bulk inserts. The current seed inserts no
-- folder_items and only the auto-created default folder, so nothing trips
-- today. If a future trusted path must bulk-insert favorites/folders past a
-- free-tier cap, gate the trigger body on a GUC the trusted path sets, e.g.
--   IF current_setting('app.bypass_quota', true) = 'on' THEN RETURN NEW; END IF;
-- and SET app.bypass_quota = 'on' within that transaction only.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_quota(p_user uuid, p_key public.entitlement_key, p_current integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE e record;
BEGIN
  SELECT enabled, limit_int, is_unlimited INTO e
    FROM public.resolve_entitlement(p_user, p_key);
  -- Fail CLOSED: a missing tier_entitlements row (e.g. a new entitlement_key
  -- shipped without a complete 4-tier matrix) must DENY, not slip through on
  -- NULL handling. Without this, e.* stays NULL and the check below would only
  -- block by accident (e.limit_int IS NULL).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quota_unresolved:%', p_key USING ERRCODE = 'P0001';
  END IF;
  IF e.is_unlimited IS TRUE THEN RETURN; END IF;          -- ultimate/top: no cap
  IF COALESCE(e.enabled, false) = false OR e.limit_int IS NULL OR p_current >= e.limit_int THEN
    RAISE EXCEPTION 'quota_exceeded:%', p_key USING ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_quota(uuid, public.entitlement_key, integer) FROM public, anon, authenticated;

-- max_favorites: total saved properties across folders (folder_items count).
-- Derive owner from folder (folder_items.user_id is denormalized but we lock
-- on the authoritative folders.user_id to be safe).
CREATE OR REPLACE FUNCTION public.trg_limit_favorites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid; v_count integer;
BEGIN
  SELECT user_id INTO v_user FROM public.folders WHERE id = NEW.folder_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'folder_not_found' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));  -- per-user race guard
  SELECT count(*) INTO v_count
    FROM public.folder_items fi JOIN public.folders f ON f.id = fi.folder_id
    WHERE f.user_id = v_user;
  PERFORM public.enforce_quota(v_user, 'max_favorites', v_count);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_limit_favorites() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS limit_favorites ON public.folder_items;
CREATE TRIGGER limit_favorites
  BEFORE INSERT ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_limit_favorites();

-- max_folders: count of live folders for the owner. Free tier = 1 means only
-- the auto-created is_default folder exists; no second can be created.
CREATE OR REPLACE FUNCTION public.trg_limit_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 1));  -- per-user race guard
  SELECT count(*) INTO v_count
    FROM public.folders f
    WHERE f.user_id = NEW.user_id AND f.deleted_at IS NULL;
  PERFORM public.enforce_quota(NEW.user_id, 'max_folders', v_count);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_limit_folders() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS limit_folders ON public.folders;
CREATE TRIGGER limit_folders
  BEFORE INSERT ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.trg_limit_folders();


-- =====================================================================
-- G. Swipe RPC — atomic upsert-and-check (no row-per-swipe)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_swipe()
RETURNS TABLE(allowed boolean, used integer, day_limit integer, unlimited boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (select auth.uid()); e record; v_used integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;

  SELECT enabled, limit_int, is_unlimited INTO e
    FROM public.resolve_entitlement(v_user, 'swipes_per_day');

  -- Fail CLOSED: no resolvable entitlement row → no budget (mirror enforce_quota).
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, false; RETURN;
  END IF;

  IF e.is_unlimited IS TRUE THEN
    RETURN QUERY SELECT true, NULL::integer, NULL::integer, true; RETURN;   -- ultimate/top: don't even count
  END IF;

  IF COALESCE(e.enabled, false) = false OR e.limit_int IS NULL THEN
    -- no swipe budget at all → blocked, report current (0) usage
    RETURN QUERY SELECT false, 0, COALESCE(e.limit_int, 0), false; RETURN;
  END IF;

  -- Zero (or negative) cap: the INSERT path below would otherwise write count=1
  -- on the first swipe of the day (the ON CONFLICT WHERE guard only protects the
  -- UPDATE branch). Block BEFORE inserting so a swipes_per_day limit of 0 grants
  -- exactly zero swipes, not one.
  IF e.limit_int <= 0 THEN
    RETURN QUERY SELECT false, 0, e.limit_int, false; RETURN;
  END IF;

  INSERT INTO public.daily_usage_counters (profile_id, usage_date, metric, count)
    VALUES (v_user, (now() AT TIME ZONE 'utc')::date, 'swipe', 1)
    ON CONFLICT (profile_id, usage_date, metric)
    DO UPDATE SET count = public.daily_usage_counters.count + 1, updated_at = now()
    WHERE public.daily_usage_counters.count < e.limit_int                  -- atomic guard
    RETURNING count INTO v_used;

  IF v_used IS NULL THEN                                                    -- conflict guard failed => at/over cap
    SELECT count INTO v_used FROM public.daily_usage_counters
      WHERE profile_id = v_user
        AND usage_date = (now() AT TIME ZONE 'utc')::date
        AND metric = 'swipe';
    RETURN QUERY SELECT false, COALESCE(v_used, e.limit_int), e.limit_int, false; RETURN;
  END IF;

  RETURN QUERY SELECT true, v_used, e.limit_int, false;
END;
$$;
REVOKE ALL ON FUNCTION public.record_swipe() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_swipe() TO authenticated;


-- =====================================================================
-- H. Trial RPC + dev grant
-- =====================================================================

-- start_ultimate_trial — the ONLY way to open a trial. Atomic latch.
CREATE OR REPLACE FUNCTION public.start_ultimate_trial(p_identity_fingerprint text, p_device_fingerprint text DEFAULT NULL)
RETURNS TABLE(eligible boolean, trial_ends_at timestamptz, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (select auth.uid());
  v_used boolean;
  v_ends timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  IF p_identity_fingerprint IS NULL OR char_length(p_identity_fingerprint) = 0 THEN
    RAISE EXCEPTION 'identity_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 2));  -- per-user double-trial guard

  -- 1. trial_used latch on this profile
  SELECT trial_used INTO v_used FROM public.subscriptions WHERE profile_id = v_user;
  IF COALESCE(v_used, false) THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'trial_already_used'::text; RETURN;
  END IF;

  -- 2. identity fingerprint must be absent from trial_grants (defeats delete+resignup farming)
  IF EXISTS (SELECT 1 FROM public.trial_grants g WHERE g.identity_fingerprint = p_identity_fingerprint) THEN
    -- still latch the profile so it can't keep retrying with new fingerprints cheaply
    UPDATE public.subscriptions SET trial_used = true WHERE profile_id = v_user;
    RETURN QUERY SELECT false, NULL::timestamptz, 'identity_already_used'::text; RETURN;
  END IF;

  v_ends := now() + interval '15 days';

  -- 3. atomic latch + activate trial (resolver maps is_trial+active+now<ends → ultimate)
  UPDATE public.subscriptions
    SET trial_used = true,
        is_trial = true,
        trial_started_at = now(),
        trial_ends_at = v_ends,
        status = 'active',
        tier = 'ultimate',
        current_period_end = v_ends,
        product_id = 'ultimate_monthly',
        environment = COALESCE(environment, 'PRODUCTION')
    WHERE profile_id = v_user;

  -- 4. bind the identity
  INSERT INTO public.trial_grants (profile_id, identity_fingerprint, device_fingerprint)
  VALUES (v_user, p_identity_fingerprint, p_device_fingerprint)
  ON CONFLICT (identity_fingerprint) DO NOTHING;

  RETURN QUERY SELECT true, v_ends, 'granted'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.start_ultimate_trial(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_ultimate_trial(text, text) TO authenticated;

-- dev_grant_entitlement — writes a subscriptions row EXACTLY like a webhook
-- would. Dev/staging ONLY; NOT granted to authenticated/anon by default.
-- service_role calls it (or grant manually in non-prod). Never deployed to prod
-- with a client-facing grant.
CREATE OR REPLACE FUNCTION public.dev_grant_entitlement(p_user uuid, p_tier public.app_tier)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lifetime boolean := (p_tier = 'top');
  v_period   timestamptz;
BEGIN
  IF p_tier = 'free' THEN
    v_period := NULL;
  ELSIF v_lifetime THEN
    v_period := NULL;                                   -- lifetime sentinel
  ELSE
    v_period := now() + interval '30 days';
  END IF;

  INSERT INTO public.subscriptions
    (profile_id, tier, status, is_lifetime, current_period_end, product_id, environment, will_renew)
  VALUES (
    p_user,
    p_tier,
    CASE WHEN p_tier = 'free' THEN 'inactive' ELSE 'active' END::public.sub_status,
    v_lifetime,
    v_period,
    CASE p_tier
      WHEN 'pro' THEN 'pro_monthly'
      WHEN 'ultimate' THEN 'ultimate_monthly'
      WHEN 'top' THEN 'top_lifetime'
      ELSE NULL
    END,
    'SANDBOX',
    CASE WHEN p_tier IN ('pro', 'ultimate') THEN true ELSE false END
  )
  ON CONFLICT (profile_id) DO UPDATE
    SET tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        is_lifetime = EXCLUDED.is_lifetime,
        current_period_end = EXCLUDED.current_period_end,
        product_id = EXCLUDED.product_id,
        environment = EXCLUDED.environment,
        will_renew = EXCLUDED.will_renew,
        updated_at = now();
END;
$$;
-- Default-deny: no GRANT to anon/authenticated. service_role bypasses these checks.
REVOKE ALL ON FUNCTION public.dev_grant_entitlement(uuid, public.app_tier) FROM public, anon, authenticated;


-- =====================================================================
-- I. Gated contact reveal — get_listing_contact() (REELS-FICHA §3.6)
-- =====================================================================

-- Returns a JSON object whose shape depends on the caller's
-- premium_agent_data LEVEL (none | limited | full). A patched client that
-- defeats the UI blur still gets NOTHING beyond its level.
CREATE OR REPLACE FUNCTION public.get_listing_contact(p_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lvl text;
  c   record;
  d   record;
BEGIN
  IF NOT public.is_property_visible(p_property_id) THEN
    RETURN NULL;
  END IF;

  SELECT level_value INTO lvl
    FROM public.resolve_entitlement((select auth.uid()), 'premium_agent_data');
  lvl := COALESCE(lvl, 'none');

  SELECT * INTO d FROM public.listing_details  WHERE property_id = p_property_id;
  SELECT * INTO c FROM public.listing_contacts WHERE property_id = p_property_id;

  IF lvl = 'full' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'full',
      'broker_name', d.broker_name,
      'broker_license', d.broker_license,
      'broker_license_authority', d.broker_license_authority,
      'agency_name', d.agency_name,
      'contact_whatsapp', c.contact_whatsapp,
      'contact_phone', c.contact_phone,
      'contact_email', c.contact_email::text,
      'contact_form_enabled', c.contact_form_enabled,
      'agent_perf_summary', c.agent_perf_summary
    ));
  ELSIF lvl = 'limited' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'limited',
      'broker_name', d.broker_name,
      'agency_name', d.agency_name,
      -- masked WhatsApp: keep country/area visible, mask the rest
      'contact_whatsapp_masked',
        CASE WHEN c.contact_whatsapp IS NULL THEN NULL
             ELSE left(c.contact_whatsapp, 4) || '••••' || right(c.contact_whatsapp, 2) END,
      'contact_form_enabled', c.contact_form_enabled
    ));
  ELSE  -- 'none' (free): identity only, no contact channel
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'none',
      'agency_name', d.agency_name,
      'advertiser_type', d.advertiser_type,
      'broker_license', d.broker_license,
      'upgrade_required', true
    ));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_listing_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_contact(uuid) TO authenticated;


-- =====================================================================
-- J. Maintenance functions + pg_cron jobs (drift mitigation; NOT needed
--    for correctness — counts/visibility are RLS predicates, not these).
--    Scheduling is wrapped so a missing/unschedulable pg_cron never breaks
--    the migration.
-- =====================================================================

-- Reconcile denormalized counters against ground truth (nightly).
CREATE OR REPLACE FUNCTION public.reconcile_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- like_count
  UPDATE public.properties p
    SET like_count = COALESCE(c.n, 0)
    FROM (SELECT property_id, count(*) AS n FROM public.likes GROUP BY property_id) c
    WHERE p.id = c.property_id AND p.like_count IS DISTINCT FROM c.n;
  UPDATE public.properties p SET like_count = 0
    WHERE p.like_count <> 0 AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.property_id = p.id);

  -- save_count (distinct property-per-user across folders)
  UPDATE public.properties p
    SET save_count = COALESCE(c.n, 0)
    FROM (SELECT property_id, count(DISTINCT user_id) AS n FROM public.folder_items GROUP BY property_id) c
    WHERE p.id = c.property_id AND p.save_count IS DISTINCT FROM c.n;
  UPDATE public.properties p SET save_count = 0
    WHERE p.save_count <> 0 AND NOT EXISTS (SELECT 1 FROM public.folder_items fi WHERE fi.property_id = p.id);

  -- folders.item_count
  UPDATE public.folders f
    SET item_count = COALESCE(c.n, 0)
    FROM (SELECT folder_id, count(*) AS n FROM public.folder_items GROUP BY folder_id) c
    WHERE f.id = c.folder_id AND f.item_count IS DISTINCT FROM c.n;
  UPDATE public.folders f SET item_count = 0
    WHERE f.item_count <> 0 AND NOT EXISTS (SELECT 1 FROM public.folder_items fi WHERE fi.folder_id = f.id);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_counters() FROM public, anon, authenticated;

-- Purge soft-deleted properties after a retention window (hard delete).
CREATE OR REPLACE FUNCTION public.purge_soft_deleted(p_retention interval DEFAULT interval '30 days')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.properties
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - p_retention;
  -- Trim ancient daily usage counters (table-size hygiene; not correctness).
  DELETE FROM public.daily_usage_counters
    WHERE usage_date < (now() AT TIME ZONE 'utc')::date - 7;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_soft_deleted(interval) FROM public, anon, authenticated;

-- Schedule the jobs if pg_cron is available; otherwise skip silently.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('reel-estate-reconcile-counters', '17 3 * * *',
                          $job$ SELECT public.reconcile_counters(); $job$);
    PERFORM cron.schedule('reel-estate-purge-soft-deleted', '42 3 * * *',
                          $job$ SELECT public.purge_soft_deleted(); $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron present but not schedulable in this context — non-fatal.
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$cron$;
