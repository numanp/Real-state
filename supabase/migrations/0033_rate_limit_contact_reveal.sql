-- =====================================================================
-- 0033_rate_limit_contact_reveal.sql — Reel Estate
-- Defense-in-depth (security audit follow-up): cap PII-bearing contact
-- reveals per UTC day. Even after the trial-farming chain was closed (0031),
-- a single level-'full' account (a 15-day Ultimate trial OR a paid sub) could
-- still bulk-scrape the entire advertiser-contact dataset. This meters reveals
-- so a single account cannot harvest more than v_cap agents/day.
--
-- get_listing_contact was STABLE; it now WRITES a counter on each limited/full
-- reveal, so it is VOLATILE (the default — STABLE removed). 'none' (free) carries
-- no contact channel and is NOT metered. Atomic upsert-with-cap mirrors
-- record_swipe (0007 §G).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_listing_contact(p_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lvl    text;
  c      record;
  d      record;
  v_user uuid := (select auth.uid());
  v_cap  constant integer := 60;   -- daily contact-reveal cap (limited+full); anti-scraping ceiling
  v_used integer;
BEGIN
  IF NOT public.is_property_visible(p_property_id) THEN
    RETURN NULL;
  END IF;

  SELECT level_value INTO lvl
    FROM public.resolve_entitlement(v_user, 'premium_agent_data');
  lvl := COALESCE(lvl, 'none');

  -- Meter PII-bearing reveals only. Atomic guard: the UPDATE fires only while
  -- count < cap; at/over the cap the conflict update matches no row, RETURNING
  -- yields NULL, and we refuse WITHOUT touching listing_contacts.
  IF v_user IS NOT NULL AND lvl IN ('limited', 'full') THEN
    INSERT INTO public.daily_usage_counters (profile_id, usage_date, metric, count)
      VALUES (v_user, (now() AT TIME ZONE 'utc')::date, 'contact_reveal', 1)
      ON CONFLICT (profile_id, usage_date, metric)
      DO UPDATE SET count = public.daily_usage_counters.count + 1, updated_at = now()
      WHERE public.daily_usage_counters.count < v_cap
      RETURNING count INTO v_used;
    IF v_used IS NULL THEN
      RETURN jsonb_build_object('level', lvl, 'rate_limited', true);
    END IF;
  END IF;

  SELECT * INTO d FROM public.listing_details  WHERE property_id = p_property_id;
  SELECT * INTO c FROM public.listing_contacts WHERE property_id = p_property_id;

  IF lvl = 'full' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'full',
      'broker_name', d.broker_name,
      'broker_license', d.broker_license,
      'broker_license_authority', d.broker_license_authority,
      'agency_name', d.agency_name,
      'contact_whatsapp', c.contact_whatsapp,
      'contact_phone', c.contact_phone,
      'contact_email', c.contact_email::text,
      'contact_form_enabled', c.contact_form_enabled,
      'agent_perf_summary', c.agent_perf_summary
    ));
  ELSIF lvl = 'limited' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'limited',
      'broker_name', d.broker_name,
      'agency_name', d.agency_name,
      -- masked WhatsApp: keep country/area visible, mask the rest
      'contact_whatsapp_masked',
        CASE WHEN c.contact_whatsapp IS NULL THEN NULL
             ELSE left(c.contact_whatsapp, 4) || '••••' || right(c.contact_whatsapp, 2) END,
      'contact_form_enabled', c.contact_form_enabled
    ));
  ELSE  -- 'none' (free): identity only, no contact channel
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'level', 'none',
      'agency_name', d.agency_name,
      'advertiser_type', d.advertiser_type,
      'broker_license', d.broker_license,
      'upgrade_required', true
    ));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_listing_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_contact(uuid) TO authenticated;
