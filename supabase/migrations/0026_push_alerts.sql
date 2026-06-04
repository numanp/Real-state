-- =====================================================================
-- 0026_push_alerts.sql — Reel Estate
-- Saved-search PUSH alerts, part 1: the foundation the fan-out (0027) rides.
--   * device_push_tokens — one row per Expo push token, RPC-only (no client
--     table access). register/delete bind to auth.uid().
--   * saved_searches.last_notified_at — watermark; "new" = listings published
--     after it. Defaults to now() so a search never back-spams pre-existing
--     listings; it only fires for listings published AFTER it was saved.
--   * pending_push_alerts() — the matching engine: for every saved search with
--     >= 1 NEW active listing matching its stored jsonb filters, return the
--     payload the dispatcher needs. Internal (REVOKE'd from clients).
-- The jsonb filter predicate mirrors the client withFilters() exactly:
--   { operation, minBedrooms, city, currency, maxPriceCents }.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- device_push_tokens — RPC-only. A token is unique per device (PK); if a
-- different user signs in on that device the upsert reassigns it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  platform    text CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx
  ON public.device_push_tokens (user_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_push_tokens FORCE  ROW LEVEL SECURITY;

-- RPC-only: revoke the auto-granted CRUD; no policy. All access via the
-- definer RPCs below (mirrors the agency_reviews hardening lesson).
REVOKE ALL ON public.device_push_tokens FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS device_push_tokens_set_updated_at ON public.device_push_tokens;
CREATE TRIGGER device_push_tokens_set_updated_at BEFORE UPDATE ON public.device_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------
-- register_push_token — upsert the CALLER's device token. Binds user_id to
-- auth.uid(); a token row always belongs to whoever last registered it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (select auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  IF p_token IS NULL OR char_length(btrim(p_token)) = 0 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.device_push_tokens (token, user_id, platform)
  VALUES (btrim(p_token), v_user, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id  = EXCLUDED.user_id,
        platform = EXCLUDED.platform;
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- delete_push_token — remove the caller's own token (sign-out / opt-out).
-- Scoped to auth.uid(): a definer fn that still can't delete another's token.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (select auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.device_push_tokens
    WHERE token = btrim(p_token) AND user_id = v_user;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_push_token(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_token(text) TO authenticated;


-- ---------------------------------------------------------------------
-- saved_searches push watermark — a KEYSET cursor (last_notified_at,
-- last_notified_id) so two listings sharing the exact published_at microsecond
-- on the boundary are never skipped (a plain `published_at >` would drop a tie
-- published after the watermark advanced to that timestamp). last_notified_at
-- defaults to now() → no back-spam; last_notified_id NULL = nothing notified yet.
-- ---------------------------------------------------------------------
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_notified_id uuid;

-- Reject malformed numeric filters at the source (the typed client never sends
-- them, but a hand-crafted REST insert could). NOT VALID so it guards new
-- writes without re-checking any legacy rows; the CASE-guarded predicate above
-- is the in-engine backstop.
ALTER TABLE public.saved_searches
  DROP CONSTRAINT IF EXISTS saved_searches_filters_numeric;
ALTER TABLE public.saved_searches
  ADD CONSTRAINT saved_searches_filters_numeric CHECK (
    (NULLIF(filters->>'minBedrooms', '')  IS NULL OR filters->>'minBedrooms'  ~ '^[0-9]+$')
    AND (NULLIF(filters->>'maxPriceCents', '') IS NULL OR filters->>'maxPriceCents' ~ '^[0-9]+$')
  ) NOT VALID;


-- ---------------------------------------------------------------------
-- saved_search_matches_property — pure predicate mirroring withFilters().
-- 2-arg (NOT a 1-arg row fn) so PostgREST never exposes it as a column.
-- ---------------------------------------------------------------------
-- Numeric filters are CASE-guarded: a malformed value (e.g. {"minBedrooms":"x"})
-- can NEVER reach the ::int / ::bigint cast, so a single bad saved search can
-- never crash pending_push_alerts()/dispatch for everyone (a DoS). A bad value
-- fails closed (matches nothing). currency is btrim'd because the column is
-- char(3) (blank-padded) and a stray trailing space would otherwise never match.
CREATE OR REPLACE FUNCTION public.saved_search_matches_property(p public.properties, f jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    (NULLIF(f->>'operation', '') IS NULL OR p.listing_type::text = f->>'operation')
    AND (NULLIF(f->>'minBedrooms', '') IS NULL
         OR CASE WHEN f->>'minBedrooms' ~ '^[0-9]+$'
                 THEN p.bedrooms >= (f->>'minBedrooms')::int ELSE false END)
    AND (NULLIF(f->>'city', '') IS NULL OR p.city ILIKE '%' || (f->>'city') || '%')
    AND (NULLIF(f->>'currency', '') IS NULL OR p.currency = btrim(f->>'currency'))
    AND (NULLIF(f->>'maxPriceCents', '') IS NULL
         OR CASE WHEN f->>'maxPriceCents' ~ '^[0-9]+$'
                 THEN p.price_cents <= (f->>'maxPriceCents')::bigint ELSE false END);
$$;
REVOKE ALL ON FUNCTION public.saved_search_matches_property(public.properties, jsonb) FROM public, anon, authenticated;


-- ---------------------------------------------------------------------
-- pending_push_alerts() — INTERNAL matching engine for the dispatcher. For
-- every saved search with >= 1 NEW (published_at > last_notified_at) active
-- listing matching its filters, return the search, its owner, the new count
-- and the newest matching published_at (the value the dispatcher advances the
-- watermark to). REVOKE'd from clients — the dispatcher (definer) runs it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pending_push_alerts()
RETURNS TABLE(
  saved_search_id uuid,
  user_id         uuid,
  name            text,
  new_count       integer,
  watermark_at    timestamptz,
  watermark_id    uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- LATERAL per search: each iteration's filter values are CONSTANTS, so the
  -- inlined predicates can use indexes (city ILIKE → trigram GIN on properties.city;
  -- published_at keyset → properties_feed_keyset) instead of the opaque function
  -- call that forced a per-row scan. Numeric casts stay CASE-guarded (DoS-safe).
  -- The EXISTS(token) filter keeps the search set to push-enabled owners.
  SELECT s.id, s.user_id, s.name, m.new_count, m.watermark_at, m.watermark_id
  FROM public.saved_searches s
  CROSS JOIN LATERAL (
    SELECT count(p.id)::integer AS new_count,
           max(p.published_at)  AS watermark_at,
           (array_agg(p.id ORDER BY p.published_at DESC, p.id DESC))[1] AS watermark_id
    FROM public.properties p
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND (p.published_at > s.last_notified_at
           OR (p.published_at = s.last_notified_at
               AND (s.last_notified_id IS NULL OR p.id > s.last_notified_id)))
      AND (NULLIF(s.filters->>'operation', '') IS NULL
           OR p.listing_type::text = s.filters->>'operation')
      AND (NULLIF(s.filters->>'city', '') IS NULL
           OR p.city ILIKE '%' || (s.filters->>'city') || '%')
      AND (NULLIF(s.filters->>'currency', '') IS NULL
           OR p.currency = btrim(s.filters->>'currency'))
      AND (NULLIF(s.filters->>'minBedrooms', '') IS NULL
           OR CASE WHEN s.filters->>'minBedrooms' ~ '^[0-9]+$'
                   THEN p.bedrooms >= (s.filters->>'minBedrooms')::int ELSE false END)
      AND (NULLIF(s.filters->>'maxPriceCents', '') IS NULL
           OR CASE WHEN s.filters->>'maxPriceCents' ~ '^[0-9]+$'
                   THEN p.price_cents <= (s.filters->>'maxPriceCents')::bigint ELSE false END)
  ) m
  WHERE EXISTS (SELECT 1 FROM public.device_push_tokens t WHERE t.user_id = s.user_id)
    AND m.new_count > 0;
$$;
REVOKE ALL ON FUNCTION public.pending_push_alerts() FROM public, anon, authenticated;
