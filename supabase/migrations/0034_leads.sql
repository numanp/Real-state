-- =====================================================================
-- 0034_leads.sql — Reel Estate
-- The lead-loop (Phase 1): a buyer sends an inquiry on a property; the owner
-- receives it (push) and both sides get an inbox. Closes the two-sided loop the
-- one-directional contact reveal (0031/0033) left open.
--
-- `leads` is RPC-ONLY (mirrors agency_reviews 0020-0022 and device_push_tokens
-- 0026): it carries buyer/owner ids, so it is unreachable at the GRANT layer
-- (REVOKE ALL + FORCE RLS + no policy) and every path is a SECURITY DEFINER RPC
-- bound to auth.uid().
--
-- Anti-spam: ONE lead per (buyer, property) per UTC day, enforced atomically by
-- a UNIQUE constraint on (buyer_id, property_id, sent_on). daily_usage_counters
-- is deliberately NOT used — it is keyed (profile, day, metric) with no property
-- dimension, so it can only express a global per-user cap, not per-property.
-- A buyer may still inquire on OTHER properties the same day.
-- =====================================================================

-- Lead lifecycle. 'replied'/'closed' are reserved for Phase 2 (lead_messages +
-- reply_to_lead); declaring them now avoids a later enum-add migration.
CREATE TYPE public.lead_status AS ENUM ('new', 'read', 'replied', 'closed');

CREATE TABLE IF NOT EXISTS public.leads (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  buyer_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- The owner is DENORMALIZED at insert: properties.owner_id is nullable and is
  -- ON DELETE SET NULL, so it cannot be trusted (or joined) at read time.
  owner_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  message     text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  status      public.lead_status NOT NULL DEFAULT 'new',
  -- UTC day the lead was sent — drives the per-(buyer, property)/day dedup.
  sent_on     date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A user can never be both sides of a lead (defense-in-depth vs the RPC guard).
  CHECK (buyer_id IS DISTINCT FROM owner_id),
  -- One inquiry per (buyer, property) per day.
  UNIQUE (buyer_id, property_id, sent_on)
);

-- Inbox reads order newest-first; the owner index skips NULL-owner (seed) leads.
CREATE INDEX IF NOT EXISTS leads_owner_idx
  ON public.leads (owner_id, created_at DESC) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_buyer_idx
  ON public.leads (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_property_idx
  ON public.leads (property_id);

-- Never trust client timestamps on update (shared trigger fn from 0007).
DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC-only: revoke the auto-granted CRUD; FORCE RLS + no policy is layer two.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.leads FROM anon, authenticated, public;
-- No GRANT, no CREATE POLICY — all access is via the definer RPCs below.


-- =====================================================================
-- create_lead — a buyer sends an inquiry on a property. VOLATILE.
-- Returns { id, status, created_at }. RAISEs on every guard failure so the
-- client sees a clean PostgREST error (auth_required / invalid_message /
-- property_not_found / self_inquiry / lead_rate_limited).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_lead(
  p_property_id uuid,
  p_message     text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid := (select auth.uid());
  v_msg     text := btrim(coalesce(p_message, ''));
  v_owner   uuid;
  v_title   text;
  v_id      uuid;
  v_status  public.lead_status;
  v_created timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  -- Anonymous (guest) accounts cannot send leads.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.is_anonymous) THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  -- Server-side message validation — the RPC is the gate, not the client.
  IF char_length(v_msg) < 1 OR char_length(v_msg) > 1000 THEN
    RAISE EXCEPTION 'invalid_message' USING ERRCODE = 'P0001';
  END IF;

  -- Property must be publicly visible (single-sourced helper from 0007).
  IF NOT public.is_property_visible(p_property_id) THEN
    RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve + denormalize the owner; grab the title for the push body.
  SELECT p.owner_id, p.title INTO v_owner, v_title
  FROM public.properties p
  WHERE p.id = p_property_id;

  -- A user cannot inquire on their own listing.
  IF v_owner = v_user THEN
    RAISE EXCEPTION 'self_inquiry' USING ERRCODE = 'P0001';
  END IF;

  -- Insert. The UNIQUE (buyer_id, property_id, sent_on) makes a 2nd same-day
  -- lead to the same property an atomic conflict — caught and surfaced as a
  -- clean rate-limit error (no TOCTOU window).
  BEGIN
    INSERT INTO public.leads (property_id, buyer_id, owner_id, message)
    VALUES (p_property_id, v_user, v_owner, v_msg)
    RETURNING id, status, created_at INTO v_id, v_status, v_created;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'lead_rate_limited' USING ERRCODE = 'P0001';
  END;

  -- Fire-and-forget push to the owner's devices (only when there IS an owner
  -- who has >= 1 token). pg_net is async — the lead's success never depends on
  -- the HTTP result. Mirrors the dispatch_saved_search_alerts call (0027).
  IF v_owner IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := (SELECT jsonb_agg(jsonb_build_object(
                    'to',    t.token,
                    'title', 'Nueva consulta',
                    'body',  'Tenés una nueva consulta en "' || coalesce(v_title, 'tu propiedad') || '"',
                    'data',  jsonb_build_object('lead_id', v_id, 'property_id', p_property_id)))
                  FROM public.device_push_tokens t
                  WHERE t.user_id = v_owner),
      headers := jsonb_build_object('Content-Type', 'application/json'))
    WHERE EXISTS (SELECT 1 FROM public.device_push_tokens t WHERE t.user_id = v_owner);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'created_at', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.create_lead(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_lead(uuid, text) TO authenticated;


-- =====================================================================
-- get_received_leads — the OWNER's inbox. STABLE.
-- Joins the property card fields + the buyer's display_name (identity only,
-- NEVER contact details; masked when the buyer is anonymous). owner_id-scoped
-- to auth.uid(), so it can only ever return the caller's own received leads.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_received_leads(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  property_id      uuid,
  title            text,
  city             text,
  cover_image_path text,
  buyer_name       text,
  message          text,
  status           public.lead_status,
  created_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id, l.property_id, p.title, p.city, p.cover_image_path,
         CASE WHEN b.is_anonymous THEN NULL ELSE b.display_name END AS buyer_name,
         l.message, l.status, l.created_at
  FROM public.leads l
  JOIN public.properties p ON p.id = l.property_id
  JOIN public.profiles   b ON b.id = l.buyer_id
  WHERE l.owner_id = (select auth.uid())
  ORDER BY l.created_at DESC
  LIMIT  greatest(0, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;
REVOKE ALL ON FUNCTION public.get_received_leads(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_received_leads(integer, integer) TO authenticated;


-- =====================================================================
-- get_sent_leads — the BUYER's outbox. STABLE. buyer_id-scoped to auth.uid().
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_sent_leads(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  property_id      uuid,
  title            text,
  cover_image_path text,
  message          text,
  status           public.lead_status,
  created_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id, l.property_id, p.title, p.cover_image_path,
         l.message, l.status, l.created_at
  FROM public.leads l
  JOIN public.properties p ON p.id = l.property_id
  WHERE l.buyer_id = (select auth.uid())
  ORDER BY l.created_at DESC
  LIMIT  greatest(0, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;
REVOKE ALL ON FUNCTION public.get_sent_leads(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_sent_leads(integer, integer) TO authenticated;


-- =====================================================================
-- mark_lead_read — the owner flips one of THEIR 'new' leads to 'read'. VOLATILE.
-- owner_id = auth.uid() in the WHERE: a definer fn that still can't touch
-- another user's lead. No-op (0 rows) for non-owners or already-read leads.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mark_lead_read(p_lead_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.leads
  SET status = 'read'
  WHERE id = p_lead_id
    AND owner_id = (select auth.uid())
    AND status = 'new';
$$;
REVOKE ALL ON FUNCTION public.mark_lead_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_lead_read(uuid) TO authenticated;
