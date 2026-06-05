-- =====================================================================
-- 0035_lead_messages.sql — Reel Estate
-- Lead-loop Phase 2: a two-way message thread on a lead. Mirrors the RPC-only
-- hardening of 0034_leads — lead_messages carries sender ids, so it is
-- unreachable at the GRANT layer (REVOKE ALL + FORCE RLS + no policy); every
-- path is a SECURITY DEFINER RPC bound to auth.uid() and scoped to the lead's
-- two participants (buyer + owner). Messages are immutable (no updated_at).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lead_messages (
  id         uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_messages_lead_idx
  ON public.lead_messages (lead_id, created_at);

ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_messages FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_messages FROM anon, authenticated, public;
-- No GRANT, no CREATE POLICY — all access is via the definer RPCs below.


-- =====================================================================
-- reply_to_lead — the lead's buyer OR owner posts a message. VOLATILE.
-- Flips the lead to 'replied' and fires a fire-and-forget push to the OTHER
-- participant. Returns { id, created_at }.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reply_to_lead(
  p_lead_id uuid,
  p_body    text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid := (select auth.uid());
  v_body    text := btrim(coalesce(p_body, ''));
  v_buyer   uuid;
  v_owner   uuid;
  v_title   text;
  v_other   uuid;
  v_id      uuid;
  v_created timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'invalid_message' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.buyer_id, l.owner_id, p.title
    INTO v_buyer, v_owner, v_title
  FROM public.leads l
  JOIN public.properties p ON p.id = l.property_id
  WHERE l.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Only the two participants may post. (buyer_id is NOT NULL; owner_id may be
  -- NULL on seed listings — IS DISTINCT FROM keeps a stranger out in that case.)
  IF v_user <> v_buyer AND v_user IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lead_messages (lead_id, sender_id, body)
  VALUES (p_lead_id, v_user, v_body)
  RETURNING id, created_at INTO v_id, v_created;

  -- An active thread: mark the lead replied (no-op if already).
  UPDATE public.leads SET status = 'replied'
  WHERE id = p_lead_id AND status <> 'replied';

  -- Notify the OTHER participant (fire-and-forget; never blocks the reply).
  v_other := CASE WHEN v_user = v_buyer THEN v_owner ELSE v_buyer END;
  IF v_other IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := (SELECT jsonb_agg(jsonb_build_object(
                    'to',    t.token,
                    'title', 'Nuevo mensaje',
                    'body',  'Tenés un mensaje nuevo sobre "' || coalesce(v_title, 'una propiedad') || '"',
                    'data',  jsonb_build_object('lead_id', p_lead_id)))
                  FROM public.device_push_tokens t
                  WHERE t.user_id = v_other),
      headers := jsonb_build_object('Content-Type', 'application/json'))
    WHERE EXISTS (SELECT 1 FROM public.device_push_tokens t WHERE t.user_id = v_other);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'created_at', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.reply_to_lead(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_lead(uuid, text) TO authenticated;


-- =====================================================================
-- get_lead_thread — the full thread (original inquiry + replies) for a lead,
-- oldest-first. STABLE. Participant-only (buyer or owner). Returns is_mine
-- relative to the caller and NEVER a sender_id. A non-participant gets nothing.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_lead_thread(
  p_lead_id uuid,
  p_limit   integer DEFAULT 100,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  id         uuid,
  body       text,
  is_mine    boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH lead AS (
    -- Participant gate: empty (→ empty thread) for anyone but buyer/owner.
    SELECT l.id, l.buyer_id, l.message, l.created_at
    FROM public.leads l
    WHERE l.id = p_lead_id
      AND ((select auth.uid()) = l.buyer_id OR (select auth.uid()) = l.owner_id)
  ),
  thread AS (
    -- the original inquiry, authored by the buyer
    SELECT lead.id, lead.message AS body,
           (lead.buyer_id = (select auth.uid())) AS is_mine, lead.created_at
    FROM lead
    UNION ALL
    -- the replies
    SELECT m.id, m.body,
           (m.sender_id = (select auth.uid())) AS is_mine, m.created_at
    FROM public.lead_messages m
    WHERE m.lead_id = (SELECT lead.id FROM lead)
  )
  SELECT id, body, is_mine, created_at
  FROM thread
  ORDER BY created_at ASC
  LIMIT  greatest(0, least(coalesce(p_limit, 100), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;
REVOKE ALL ON FUNCTION public.get_lead_thread(uuid, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_thread(uuid, integer, integer) TO authenticated;
