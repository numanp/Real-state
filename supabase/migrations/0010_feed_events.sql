-- =====================================================================
-- 0010_feed_events.sql — Reel Estate
-- Implicit + explicit feed signals (the substrate for ranking, daily picks,
-- similar-properties, alerts). Append-only, per-owner. Written from the client
-- in batches by the FeedTracker.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.feed_event_type AS ENUM
    ('view', 'detail', 'like', 'unlike', 'pass', 'save', 'unsave', 'super_like', 'rewind', 'share');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.feed_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties (id) ON DELETE SET NULL,
  event_type  public.feed_event_type NOT NULL,
  dwell_ms    integer CHECK (dwell_ms IS NULL OR dwell_ms >= 0),
  position    integer,
  context     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- "my recent signals" + per-property aggregation for ranking.
CREATE INDEX IF NOT EXISTS feed_events_user_created
  ON public.feed_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_property_idx
  ON public.feed_events (property_id) WHERE property_id IS NOT NULL;

ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_events FORCE  ROW LEVEL SECURITY;

-- Append-only, per-owner (auto_expose_new_tables is false → explicit GRANT).
GRANT SELECT, INSERT ON public.feed_events TO authenticated;

CREATE POLICY feed_events_select_own ON public.feed_events
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY feed_events_insert_own ON public.feed_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
-- No UPDATE/DELETE policy → events are immutable from the client.
