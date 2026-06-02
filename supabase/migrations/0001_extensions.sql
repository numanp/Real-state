-- =====================================================================
-- 0001_extensions.sql — Reel Estate
-- Enable required extensions in the dedicated `extensions` schema
-- (NOT public — keeps the API surface clean; FOUNDATION §Extensions).
-- Idempotent: CREATE EXTENSION IF NOT EXISTS.
-- =====================================================================

-- The `extensions` schema is provided by Supabase by default; create defensively.
CREATE SCHEMA IF NOT EXISTS extensions;

-- gen_random_uuid(), crypto helpers (UUID PKs everywhere)
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;

-- citext — case-insensitive text (profiles.username, contact_email)
CREATE EXTENSION IF NOT EXISTS citext         WITH SCHEMA extensions;

-- pg_trgm — trigram GIN indexes for fuzzy city/title search
CREATE EXTENSION IF NOT EXISTS pg_trgm        WITH SCHEMA extensions;

-- postgis — geography(Point,4326) for property + POI location, KNN feed sort
CREATE EXTENSION IF NOT EXISTS postgis        WITH SCHEMA extensions;

-- pg_cron — nightly counter reconciliation + soft-delete purge jobs
-- NOTE: pg_cron can only live in one schema and is typically installed by
-- Supabase already. Guarded create; harmless if pre-installed.
CREATE EXTENSION IF NOT EXISTS pg_cron        WITH SCHEMA extensions;
