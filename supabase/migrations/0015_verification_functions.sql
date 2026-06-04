-- =====================================================================
-- 0015_verification_functions.sql — Reel Estate
-- Verification functions. Every definer fn is SECURITY DEFINER, STABLE/
-- VOLATILE as appropriate, SET search_path = '', fully-qualifies objects,
-- REVOKE'd from public/anon and GRANT'd narrowly — exactly like 0007.
--
-- Write paths, by privilege:
--   client (authenticated): start_kyc_verification, request_badge
--                           (write ONLY attempts/requests, NEVER badges)
--   service_role only:      grant_badge, revoke_badge (write granted_badges)
-- Read paths:
--   get_my_badges()  — self-scoped (auth.uid())
--   get_badges_for() — public, verified-only (renders a badge by a name)
-- =====================================================================

-- ---------------------------------------------------------------------
-- handle_new_user — EXTENDED to set profiles.account_kind from signup
-- metadata (raw_user_meta_data.account_kind = 'agency' → agency, else
-- person). Re-declared verbatim plus the account_kind column.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_anon boolean := COALESCE((NEW.raw_app_meta_data ->> 'is_anonymous')::boolean, NEW.is_anonymous, false);
  v_kind public.account_kind := CASE
    WHEN (NEW.raw_user_meta_data ->> 'account_kind') = 'agency' THEN 'agency'::public.account_kind
    ELSE 'person'::public.account_kind
  END;
BEGIN
  INSERT INTO public.profiles (id, is_anonymous, account_kind)
  VALUES (NEW.id, v_is_anon, v_kind)
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

-- ---------------------------------------------------------------------
-- guard_profile_immutables — EXTENDED to also revert account_kind. A
-- row-level RLS WITH CHECK cannot see OLD, so immutability of id /
-- is_anonymous / account_kind is enforced here (mass-assignment defense).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_immutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.is_anonymous := OLD.is_anonymous;
  NEW.account_kind := OLD.account_kind;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_immutables() FROM public, anon, authenticated;


-- ---------------------------------------------------------------------
-- badge_matches_kind — pure eligibility rule (IMMUTABLE). identity↔person,
-- agency↔agency. Re-checked inside request_badge; safe to expose.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.badge_matches_kind(p_badge public.badge_type, p_kind public.account_kind)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (p_badge = 'identity' AND p_kind = 'person')
      OR (p_badge = 'agency'   AND p_kind = 'agency');
$$;
REVOKE ALL ON FUNCTION public.badge_matches_kind(public.badge_type, public.account_kind) FROM public;
GRANT EXECUTE ON FUNCTION public.badge_matches_kind(public.badge_type, public.account_kind) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- get_my_badges() — what the app hydrates. Self-scoped to auth.uid().
-- Returns { badges: ['identity'|'agency', ...], request: {...}|null }.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_badges()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'badges', COALESCE((
      SELECT jsonb_agg(g.badge_type ORDER BY g.granted_at)
      FROM public.granted_badges g
      WHERE g.subject_id = (select auth.uid())
        AND g.status = 'verified'
        AND g.revoked_at IS NULL
    ), '[]'::jsonb),
    'request', (
      SELECT to_jsonb(r) FROM (
        SELECT br.badge_type, br.status, br.created_at, br.decided_at, br.reason
        FROM public.badge_requests br
        WHERE br.subject_id = (select auth.uid())
        ORDER BY br.created_at DESC
        LIMIT 1
      ) r
    )
  );
$$;
REVOKE ALL ON FUNCTION public.get_my_badges() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_badges() TO authenticated;

-- ---------------------------------------------------------------------
-- get_badges_for(p_subject) — PUBLIC read of a subject's verified badges,
-- for rendering a checkmark next to their name. Returns ONLY verified+
-- active badge_type rows — never pending/rejected/revoked, never PII.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_badges_for(p_subject uuid)
RETURNS TABLE(badge_type public.badge_type)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.badge_type
  FROM public.granted_badges g
  WHERE g.subject_id = p_subject
    AND g.status = 'verified'
    AND g.revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_badges_for(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_badges_for(uuid) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- start_kyc_verification(p_badge_type) — opens a KYC attempt for the
-- caller. Writes ONLY a verification_attempts row (NEVER a badge) and
-- returns a provider session ref. With no KYC key today, the ref is a
-- local stub; when a provider is wired, only this body changes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_kyc_verification(p_badge_type public.badge_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (select auth.uid());
  v_ref  text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  v_ref := 'stub_' || replace(extensions.gen_random_uuid()::text, '-', '');
  INSERT INTO public.verification_attempts (profile_id, badge_type, provider_ref)
  VALUES (v_user, p_badge_type, v_ref);
  RETURN v_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.start_kyc_verification(public.badge_type) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_kyc_verification(public.badge_type) TO authenticated;

-- ---------------------------------------------------------------------
-- request_badge(p_badge_type, p_provider_ref) — the ONLY way a pending
-- request appears. Definer (bypasses RLS as the BYPASSRLS owner), so
-- badge_requests needs NO client write policy. Re-checks badge↔kind, pins
-- status='pending', binds subject to auth.uid() (not a client-supplied id).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_badge(p_badge_type public.badge_type, p_provider_ref text DEFAULT NULL)
RETURNS public.badge_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (select auth.uid());
  v_kind public.account_kind;
  v_row  public.badge_requests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;

  SELECT account_kind INTO v_kind FROM public.profiles WHERE id = v_user;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.badge_matches_kind(p_badge_type, v_kind) THEN
    RAISE EXCEPTION 'badge_kind_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- Already verified? Don't open a redundant request.
  IF EXISTS (
    SELECT 1 FROM public.granted_badges g
    WHERE g.subject_id = v_user AND g.badge_type = p_badge_type
      AND g.status = 'verified' AND g.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_verified' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.badge_requests (subject_id, badge_type, account_kind, provider_ref)
  VALUES (v_user, p_badge_type, v_kind, p_provider_ref)
  ON CONFLICT (subject_id, badge_type) WHERE status = 'pending' DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN  -- an open request already existed; return it
    SELECT * INTO v_row
    FROM public.badge_requests
    WHERE subject_id = v_user AND badge_type = p_badge_type AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.badge_audit (subject_id, badge_type, action, actor, payload)
  VALUES (v_user, p_badge_type, 'request', 'user', jsonb_build_object('provider_ref', p_provider_ref));

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.request_badge(public.badge_type, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_badge(public.badge_type, text) TO authenticated;


-- ---------------------------------------------------------------------
-- grant_badge / revoke_badge — service_role ONLY. The ONLY writers of
-- granted_badges. REVOKE'd from every client role (mirrors dev_grant_-
-- entitlement / resolve_entitlement): they take p_subject as a PARAMETER,
-- so granting EXECUTE to clients would let any caller verify anyone.
-- Called by: the kyc-webhook Edge Function (after HMAC verify + dedupe)
-- and an out-of-band service_role review script (agency license).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_badge(
  p_subject uuid,
  p_badge_type public.badge_type,
  p_method public.verification_method,
  p_provider_ref text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.granted_badges (subject_id, badge_type, status, method, provider_ref)
  VALUES (p_subject, p_badge_type, 'verified', p_method, p_provider_ref)
  ON CONFLICT (subject_id, badge_type) DO UPDATE
    SET status = 'verified',
        method = EXCLUDED.method,
        provider_ref = EXCLUDED.provider_ref,
        granted_at = now(),
        revoked_at = NULL;

  UPDATE public.badge_requests
    SET status = 'approved', decided_at = now()
    WHERE subject_id = p_subject AND badge_type = p_badge_type AND status = 'pending';

  INSERT INTO public.badge_audit (subject_id, badge_type, action, actor, payload)
  VALUES (p_subject, p_badge_type, 'grant', 'service_role',
          jsonb_build_object('method', p_method, 'provider_ref', p_provider_ref));
END;
$$;
REVOKE ALL ON FUNCTION public.grant_badge(uuid, public.badge_type, public.verification_method, text)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_badge(
  p_subject uuid,
  p_badge_type public.badge_type,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.granted_badges
    SET status = 'revoked', revoked_at = now()
    WHERE subject_id = p_subject AND badge_type = p_badge_type;

  INSERT INTO public.badge_audit (subject_id, badge_type, action, actor, payload)
  VALUES (p_subject, p_badge_type, 'revoke', 'service_role', jsonb_build_object('reason', p_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_badge(uuid, public.badge_type, text)
  FROM public, anon, authenticated;
