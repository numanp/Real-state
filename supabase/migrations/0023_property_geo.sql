-- =====================================================================
-- 0023_property_geo.sql — Reel Estate
-- Expose the property's PostGIS point as plain latitude/longitude for the
-- client (the map mini-view). properties.location is geography(Point,4326);
-- PostgREST cannot serialize geography, so we add two IMMUTABLE "computed
-- column" functions (functions of the row type) that PostgREST surfaces as
-- selectable virtual columns: select=...,latitude,longitude.
-- ADDITIVE + read-only: no schema change, no new stored data.
-- =====================================================================

-- latitude(properties) — ST_Y of the point (NULL when location is unset).
CREATE OR REPLACE FUNCTION public.latitude(public.properties)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT extensions.ST_Y($1.location::extensions.geometry);
$$;
REVOKE ALL ON FUNCTION public.latitude(public.properties) FROM public;
GRANT EXECUTE ON FUNCTION public.latitude(public.properties) TO anon, authenticated;

-- longitude(properties) — ST_X of the point.
CREATE OR REPLACE FUNCTION public.longitude(public.properties)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT extensions.ST_X($1.location::extensions.geometry);
$$;
REVOKE ALL ON FUNCTION public.longitude(public.properties) FROM public;
GRANT EXECUTE ON FUNCTION public.longitude(public.properties) TO anon, authenticated;
