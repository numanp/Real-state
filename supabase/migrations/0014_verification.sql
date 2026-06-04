-- =====================================================================
-- 0014_verification.sql — Reel Estate
-- Verification badges (Meta/X style) for users AND agencies. Additive.
-- RLS enabled here; policies in 0016. Functions in 0015.
--
-- A01 control (no self-verify): badge TRUTH lives on granted_badges, which
-- has NO client write policy and NO write GRANT — byte-identical to the
-- subscriptions lockdown (0006 §A01). The write path is physically
-- unreachable by clients; only service_role / SECURITY DEFINER functions
-- (owned by a BYPASSRLS role) write it. NEVER store raw KYC documents — only
-- an opaque provider_ref + the outcome flag.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums (idempotent; mirrors 0002 DO $$ ... duplicate_object pattern)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.account_kind AS ENUM ('person', 'agency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.badge_type AS ENUM ('identity', 'agency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.badge_status AS ENUM ('pending', 'verified', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.badge_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_method AS ENUM ('kyc', 'license', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------
-- profiles.account_kind — binds WHICH badge a subject may request.
-- Set at signup by handle_new_user (0015), immutable via the extended
-- guard_profile_immutables trigger (a row-level WITH CHECK cannot see OLD).
-- Self-declared (like an X "business account" toggle); it gates only the
-- request TYPE, never whether a badge is granted (that stays service-only).
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_kind public.account_kind NOT NULL DEFAULT 'person';


-- ---------------------------------------------------------------------
-- badge_requests — the request→review record. The user has NO direct
-- write path; request_badge() (definer) creates the 'pending' row. A user
-- can SELECT only their own. The ONLY writer of 'approved' is grant_badge.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_requests (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subject_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_type   public.badge_type NOT NULL,
  account_kind public.account_kind NOT NULL,              -- snapshot of requester kind
  status       public.badge_request_status NOT NULL DEFAULT 'pending',
  provider_ref text,                                       -- opaque KYC session id; NEVER raw docs
  reason       text,                                       -- rejection/notes (service_role)
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);

-- At most one OPEN request per (subject, badge_type). Re-request allowed
-- after a decision (the partial index only covers 'pending').
CREATE UNIQUE INDEX IF NOT EXISTS badge_requests_open_uq
  ON public.badge_requests (subject_id, badge_type) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS badge_requests_subject_idx
  ON public.badge_requests (subject_id);

ALTER TABLE public.badge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_requests FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- verification_attempts — per-attempt KYC session ledger. start_kyc_-
-- verification() (definer) writes the provider session ref here; this
-- table NEVER touches badges. provider_ref UNIQUE = webhook replay defense.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_attempts (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_type   public.badge_type NOT NULL,
  provider_ref text UNIQUE,                                -- opaque vendor session/check id
  outcome      public.badge_status,                        -- set ONLY by the webhook (service_role)
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_attempts_profile_idx
  ON public.verification_attempts (profile_id);

ALTER TABLE public.verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_attempts FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- granted_badges — THE badge (the row that confers trust). Public reads
-- verified+active rows only. ZERO client write policy and ZERO write GRANT
-- (the no-self-escalation gate, byte-identical to subscriptions). Only
-- grant_badge/revoke_badge (definer) + the service_role webhook write here.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.granted_badges (
  subject_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_type        public.badge_type NOT NULL,
  status            public.badge_status NOT NULL DEFAULT 'verified',
  method            public.verification_method NOT NULL,
  provider_ref      text,                                  -- outcome reference only, never documents
  source_request_id uuid REFERENCES public.badge_requests (id) ON DELETE SET NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  PRIMARY KEY (subject_id, badge_type)
);

ALTER TABLE public.granted_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.granted_badges FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- badge_audit — append-only ledger of every request/grant/revoke. NO
-- client policy + NO grant → invisible + immutable to clients (mirrors
-- webhook_events). Provability for revokes + forged-webhook investigation.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_audit (
  id         uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subject_id uuid NOT NULL,
  badge_type public.badge_type,
  action     text NOT NULL,                                -- request | grant | revoke | webhook
  actor      text NOT NULL,                                -- user | service_role | webhook | provider
  payload    jsonb,                                        -- outcome flag + provider_ref ONLY, never docs
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS badge_audit_subject_idx ON public.badge_audit (subject_id);

ALTER TABLE public.badge_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_audit FORCE  ROW LEVEL SECURITY;
