-- =====================================================================
-- 0030_property_media_host_allowlist.sql — Reel Estate
-- Security (OWASP A10 SSRF/open-redirect): property_media.external_url (0004)
-- holds 3D-tour / virtual-tour links. The schema comment promised a host
-- allow-list but none was enforced. Add a CHECK so only https Matterport URLs
-- can be stored — the app must never render an arbitrary attacker URL.
-- NOT VALID: guards new writes without re-validating legacy rows (the seed's
-- my.matterport.com URL already conforms; storage-hosted media has a NULL
-- external_url and is unaffected). Extend the regex when new providers land.
-- =====================================================================

ALTER TABLE public.property_media
  DROP CONSTRAINT IF EXISTS property_media_external_url_host;

ALTER TABLE public.property_media
  ADD CONSTRAINT property_media_external_url_host CHECK (
    external_url IS NULL
    OR external_url ~ '^https://([a-z0-9-]+\.)*matterport\.com/'
  ) NOT VALID;
