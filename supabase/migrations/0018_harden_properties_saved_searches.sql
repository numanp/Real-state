-- =====================================================================
-- 0018_harden_properties_saved_searches.sql — Reel Estate
-- Two integrity/paywall gaps found in the health audit:
--
--  1. properties_update_own (0012) lets an owner UPDATE their own row, but only
--     scopes by owner_id — so via the raw anon key an owner could inflate
--     like_count/save_count (breaking the single-writer counter design) or set
--     published_at to the future to pin themselves to the top of the feed.
--  2. saved_searches had NO server-side quota — the ONLY quota entitlement
--     unenforced — so a free user (max_saved_searches: enabled=false, limit 0 in
--     0009) could insert unlimited rows via the anon key, bypassing the paid
--     alert-fan-out gate.
-- =====================================================================

-- ---------------------------------------------------------------------
-- guard_property_immutables — BEFORE UPDATE on properties. Reverts the
-- system-managed columns on DIRECT client updates. A row-level RLS WITH
-- CHECK cannot reference OLD, so column immutability is enforced here
-- (mass-assignment defense, A01) — mirrors guard_profile_immutables (0007).
--
-- CRITICAL: gate on pg_trigger_depth() = 1. The counter/cover SECURITY
-- DEFINER triggers (trg_like_count, trg_save_count, recompute_cover_image)
-- legitimately UPDATE these same columns, but they run NESTED (depth >= 2)
-- inside their own triggers. A direct client UPDATE fires this guard at
-- depth 1. Gating on depth 1 reverts only client tampering and never the
-- trigger-maintained counters — a column-level REVOKE cannot do this
-- (a table-level UPDATE grant still covers every column).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_property_immutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN  -- direct client UPDATE, not a nested counter/cover trigger
    NEW.owner_id         := OLD.owner_id;
    NEW.like_count       := OLD.like_count;
    NEW.save_count       := OLD.save_count;
    NEW.created_at       := OLD.created_at;
    NEW.published_at     := OLD.published_at;
    NEW.cover_image_path := OLD.cover_image_path;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_property_immutables() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS properties_guard_immutables ON public.properties;
CREATE TRIGGER properties_guard_immutables
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_immutables();


-- ---------------------------------------------------------------------
-- trg_limit_saved_searches — BEFORE INSERT quota, mirrors trg_limit_folders
-- (0007:558-579). enforce_quota fails CLOSED on enabled=false / limit 0, so a
-- free user's first insert is rejected with quota_exceeded:max_saved_searches.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_limit_saved_searches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 3));  -- per-user race guard (slot 3)
  SELECT count(*) INTO v_count
    FROM public.saved_searches s
    WHERE s.user_id = NEW.user_id;
  PERFORM public.enforce_quota(NEW.user_id, 'max_saved_searches', v_count);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_limit_saved_searches() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS limit_saved_searches ON public.saved_searches;
CREATE TRIGGER limit_saved_searches
  BEFORE INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.trg_limit_saved_searches();
