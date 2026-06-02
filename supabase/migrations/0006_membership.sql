-- =====================================================================
-- 0006_membership.sql — Reel Estate
-- Entitlements / membership layer (MEMBERSHIP.md). Additive over core.
-- RLS enabled here; policies in 0008. Resolver/enforcement fns in 0007.
-- Reference rows (entitlements_catalog, tier_entitlements) in 0009.
--
-- A01 control: entitlement state is written ONLY by service_role (webhook).
-- No client write policy exists anywhere on these tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- subscriptions — single source of billing truth (service_role writer)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  profile_id               uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  tier                     public.app_tier   NOT NULL DEFAULT 'free',
  status                   public.sub_status NOT NULL DEFAULT 'inactive',
  store                    public.sub_store,
  rc_app_user_id           text,
  rc_original_app_user_id  text,
  entitlement_ids          text[] NOT NULL DEFAULT '{}',
  product_id               text,                          -- pro_monthly | ultimate_monthly | top_lifetime
  current_period_end       timestamptz,                   -- NULL = lifetime/non-expiring (top)
  will_renew               boolean NOT NULL DEFAULT false,
  is_lifetime              boolean NOT NULL DEFAULT false,
  is_trial                 boolean NOT NULL DEFAULT false,
  trial_started_at         timestamptz,
  trial_ends_at            timestamptz,
  trial_used               boolean NOT NULL DEFAULT false, -- one-way latch, never reset
  last_event_id            text,
  last_event_at            timestamptz,
  environment              text,                          -- SANDBOX | PRODUCTION
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- profile_id is declared UNIQUE above, which already creates a unique btree
-- index serving every profile_id lookup (RLS SELECT scoped by profile_id +
-- resolver lookups). No separate non-unique index — it would be redundant.

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- entitlements_catalog — the capability dictionary (public read)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entitlements_catalog (
  key         public.entitlement_key  PRIMARY KEY,
  kind        public.entitlement_kind NOT NULL,
  description text NOT NULL,
  unit        text,                                       -- per_day | count; null for boolean/level
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlements_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements_catalog FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- tier_entitlements — tier→entitlement resolution map (public read)
-- PROOF of the locked principle: top rows IDENTICAL to ultimate rows.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tier_entitlements (
  tier            public.app_tier        NOT NULL,
  entitlement_key public.entitlement_key NOT NULL REFERENCES public.entitlements_catalog (key) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  limit_int       integer,                                -- quota cap; NULL + is_unlimited=false ⇒ none/0
  is_unlimited    boolean NOT NULL DEFAULT false,
  level_value     text,                                   -- level: none|some|all (or none|limited|full)
  PRIMARY KEY (tier, entitlement_key)
);

-- Resolver JOINs on entitlement_key; the resolver filters te.tier = effective tier.
CREATE INDEX IF NOT EXISTS tier_entitlements_key_idx ON public.tier_entitlements (entitlement_key);

ALTER TABLE public.tier_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_entitlements FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- daily_usage_counters — per-user-per-UTC-day atomic counter (RPC writer)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_usage_counters (
  profile_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  usage_date  date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  metric      public.usage_metric NOT NULL DEFAULT 'swipe',
  count       integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, usage_date, metric)
);

-- PK leads with profile_id → already serves the RLS SELECT (profile_id =
-- auth.uid()) and the upsert probe. No separate index: an explicit
-- (profile_id, usage_date, metric) index would be byte-identical to the PK
-- and only add write/storage overhead.

ALTER TABLE public.daily_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage_counters FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- webhook_events — append-only audit + idempotency ledger
-- NO client policy → invisible/immutable to clients; service_role only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  rc_event_id  text UNIQUE NOT NULL,                      -- dedupe key — PK-conflict = duplicate
  event_type   text NOT NULL,
  app_user_id  text NOT NULL,
  event_ts     bigint,                                    -- event_timestamp_ms
  status       text,                                      -- processed | duplicate | unlinked | invalid
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_app_user_idx ON public.webhook_events (app_user_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- trial_grants — identity-fingerprint ledger (anti-abuse)
-- NO client policy → definer functions / service_role only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_grants (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  profile_id           uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  identity_fingerprint text UNIQUE NOT NULL,              -- hash of normalized verified email/phone
  device_fingerprint   text,                              -- coarse per-install token; SOFT signal only
  granted_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_grants_profile_idx ON public.trial_grants (profile_id);

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_grants FORCE  ROW LEVEL SECURITY;
