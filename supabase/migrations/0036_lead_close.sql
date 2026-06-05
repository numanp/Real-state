-- =====================================================================
-- 0036_lead_close.sql — Reel Estate
-- Lead-loop lifecycle: a participant (buyer or owner) closes/archives a
-- resolved lead. Mirrors the RPC-only, participant-scoped pattern of the other
-- lead RPCs. There is no separate reopen — a new reply_to_lead (0035) already
-- flips a 'closed' lead back to 'replied', so a fresh message reopens it.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.close_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  uuid := (select auth.uid());
  v_buyer uuid;
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT buyer_id, owner_id INTO v_buyer, v_owner
  FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Only the two participants may close. (buyer_id is NOT NULL; owner_id may be
  -- NULL — IS DISTINCT FROM keeps a stranger out in that case.)
  IF v_user <> v_buyer AND v_user IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.leads SET status = 'closed' WHERE id = p_lead_id;
END;
$$;
REVOKE ALL ON FUNCTION public.close_lead(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_lead(uuid) TO authenticated;
