-- =====================================================================
-- 0032_contact_reveal_metric.sql — Reel Estate
-- Adds the 'contact_reveal' usage metric consumed by the get_listing_contact
-- daily rate-limit (0033). This MUST be a SEPARATE migration from the function
-- that uses it: Postgres forbids using a newly-added enum value in the same
-- transaction that adds it.
-- =====================================================================
ALTER TYPE public.usage_metric ADD VALUE IF NOT EXISTS 'contact_reveal';
