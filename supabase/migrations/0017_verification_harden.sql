-- =====================================================================
-- 0017_verification_harden.sql — Reel Estate
-- Closes a confidentiality leak found in adversarial review of the
-- verification feature.
--
-- BUG: 0016 granted public.granted_badges a TABLE-WIDE `GRANT SELECT TO
-- anon, authenticated` with a row-only policy. RLS filters ROWS, not
-- COLUMNS, so anon could `select subject_id, provider_ref, method` and
-- (a) enumerate EVERY verified subject and (b) read the opaque KYC
-- provider_ref + method for each — data the design treats as non-public.
-- The "byte-identical to subscriptions" comment was wrong: subscriptions
-- is SELECT-OWN (auth.uid()-scoped), this was public full-row.
--
-- FIX: remove the direct client read entirely. granted_badges is now
-- reachable ONLY via the definer RPCs get_badges_for() (public, badge_type
-- only) and get_my_badges() (self) — the listing_contacts pattern (0008
-- §listing_contacts: no GRANT, no policy, gated definer RPC). The app
-- already reads exclusively through those RPCs, so nothing upstream breaks.
-- =====================================================================

DROP POLICY IF EXISTS granted_badges_select_public ON public.granted_badges;
REVOKE SELECT ON public.granted_badges FROM anon, authenticated;
-- granted_badges now has NO client policy and NO client grant for ANY command
-- (read or write) → fully unreachable by clients; definer RPCs only.


-- ---------------------------------------------------------------------
-- Defense-in-depth: make start_kyc_verification symmetric with
-- request_badge — reject an attempt whose badge_type does not match the
-- caller's account_kind (a person seeding an 'agency' attempt). Harmless
-- before (an orphan attempt grants nothing), but no reason to allow it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_kyc_verification(p_badge_type public.badge_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (select auth.uid());
  v_kind public.account_kind;
  v_ref  text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  SELECT account_kind INTO v_kind FROM public.profiles WHERE id = v_user;
  IF v_kind IS NULL OR NOT public.badge_matches_kind(p_badge_type, v_kind) THEN
    RAISE EXCEPTION 'badge_kind_mismatch' USING ERRCODE = 'P0001';
  END IF;
  v_ref := 'stub_' || replace(extensions.gen_random_uuid()::text, '-', '');
  INSERT INTO public.verification_attempts (profile_id, badge_type, provider_ref)
  VALUES (v_user, p_badge_type, v_ref);
  RETURN v_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.start_kyc_verification(public.badge_type) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_kyc_verification(public.badge_type) TO authenticated;
