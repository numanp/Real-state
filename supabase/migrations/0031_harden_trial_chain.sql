-- =====================================================================
-- 0031_harden_trial_chain.sql — Reel Estate
-- Closes the HIGH "free-trial farming → contact-PII harvest" chain
-- (security audit finding #1). The trial identity is now derived
-- SERVER-SIDE from the caller's VERIFIED email and is never supplied by
-- the client. Combined with enable_confirmations = true (config.toml),
-- a fresh signup can no longer self-issue unlimited Ultimate trials and
-- thereby reach premium_agent_data = 'full' to scrape advertiser PII.
--
-- Changes vs 0007 §H:
--   * start_ultimate_trial() takes NO parameters (was (text, text) with a
--     client-supplied p_identity_fingerprint — the attack vector).
--   * Requires a CONFIRMED email (auth.users.email_confirmed_at IS NOT NULL).
--   * identity_fingerprint = sha256(lower(trim(verified email))) — exactly
--     the "hash of normalized verified email/phone" trial_grants was
--     designed to hold (0006:131).
-- =====================================================================

-- Remove the client-supplied 2-arg signature entirely so an attacker can no
-- longer call it with a forged, ever-unique fingerprint.
DROP FUNCTION IF EXISTS public.start_ultimate_trial(text, text);

CREATE OR REPLACE FUNCTION public.start_ultimate_trial()
RETURNS TABLE(eligible boolean, trial_ends_at timestamptz, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user      uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_fp        text;
  v_used      boolean;
  v_ends      timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;

  -- Server-trusted identity: the verified email from auth.users (definer-only read).
  SELECT u.email, u.email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users u WHERE u.id = v_user;

  -- Hard gate: NO trial without a confirmed email. With enable_confirmations on,
  -- a freshly-signed-up (unverified) account has email_confirmed_at = NULL and is
  -- refused here — defeating delete+resignup and disposable-email trial farming.
  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'email_unverified'::text; RETURN;
  END IF;

  -- Identity fingerprint is DERIVED, never client-supplied: sha256 of the
  -- normalized verified email. Same email ⇒ same fingerprint ⇒ one trial ever.
  -- Normalization is lower(trim(...)) only: gmail "+alias"/dot variants are
  -- intentionally NOT collapsed. The catastrophic per-account farming is gone;
  -- the residual cost is one VERIFIED inbox per alias. If alias-farming ever
  -- shows up in metrics, tighten with real device attestation (device_fingerprint).
  v_fp := encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 2));  -- per-user double-trial guard

  -- 1. trial_used latch on this profile
  SELECT trial_used INTO v_used FROM public.subscriptions WHERE profile_id = v_user;
  IF COALESCE(v_used, false) THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'trial_already_used'::text; RETURN;
  END IF;

  -- 2. identity fingerprint must be absent from trial_grants (defeats delete+resignup farming)
  IF EXISTS (SELECT 1 FROM public.trial_grants g WHERE g.identity_fingerprint = v_fp) THEN
    -- still latch the profile so it can't keep retrying cheaply
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

  -- 4. bind the DERIVED identity. device_fingerprint stays NULL: there is no
  --    server-trusted device signal yet (add real attestation later if needed).
  INSERT INTO public.trial_grants (profile_id, identity_fingerprint)
  VALUES (v_user, v_fp)
  ON CONFLICT (identity_fingerprint) DO NOTHING;

  RETURN QUERY SELECT true, v_ends, 'granted'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.start_ultimate_trial() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_ultimate_trial() TO authenticated;
