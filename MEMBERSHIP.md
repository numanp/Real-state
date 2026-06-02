# Reel Estate — Membership Layer Design

This section specifies the complete membership/entitlement layer, designed **additively** on top of the existing core schema (`profiles`, `properties`, `property_images`, `likes`, `folders`, `folder_items`). It is **schema-first**: every table, RLS policy, trigger, and RPC ships in Milestone 1 with manual dev writers, while RevenueCat integration lands in a later, dedicated billing milestone. The same resolution path serves both, so dev state and prod state are structurally identical.

The through-line is **OWASP A01 (Broken Access Control)**: the client is NEVER authoritative. Row ownership is enforced by RLS; quantitative limits by `BEFORE INSERT` triggers and `SECURITY DEFINER` RPCs; entitlement state is written ONLY by the service role via signed webhooks. A client-only gate IS the vulnerability this design removes.

---

## Entitlements Model

**Gates check ENTITLEMENTS (capabilities), never tier strings.** This is the locked principle, enforced in *data*, not code.

The resolution chain is fully data-driven:

```
subscriptions (billing state, written ONLY by service_role)
        │
        ▼  effective-tier resolution (precedence + time validity)
   effective_tier  ∈ {free, pro, ultimate, top}
        │
        ▼  JOIN tier_entitlements × entitlements_catalog
   entitlement set: { key → enabled, limit_int, is_unlimited, level_value }
```

**Why `top` and `ultimate` are interchangeable:** they map to BYTE-IDENTICAL rows in `tier_entitlements`. They diverge ONLY upstream in `subscriptions` billing columns (`is_lifetime`, `product_id`, `current_period_end`). **No gate, RLS policy, trigger, or RPC anywhere in the system branches on `tier='top'` vs `tier='ultimate'`.** The only `top`-specific artifact is a cosmetic Founder badge, which lives entirely outside gate logic.

**Three kinds of entitlement** (the resolver/gate interprets each differently):
- `quota` — integer limit or unlimited (swipes/day, max favorites, max folders, saved searches)
- `boolean` — on/off (rewind, no-ads, saved-search alerts, instant alerts, priority support, fresh-listings-first)
- `level` — graded access enum (geo+amenity filters: none/some/all; agent data: none/limited/full)

**Single source of resolution truth:** one `SECURITY DEFINER` resolver definition is reused by the client read API (`get_my_entitlements()`), the limit triggers, and the swipe RPC — so the UX gate and the security gate can NEVER disagree. Re-pricing or re-bundling a tier is a **data edit** to `tier_entitlements`, zero code changes.

---

## Data Model (new tables + RLS)

All new user-scoped tables follow the core convention: **RLS ENABLED + FORCED, deny-by-default, per-owner SELECT via `(select auth.uid())`, NO client write policy** (so the only writer of entitlement state is the service-role edge function, which bypasses RLS). Index every column referenced by an RLS policy or a limit check.

### Enums

```sql
CREATE TYPE app_tier          AS ENUM ('free','pro','ultimate','top');
CREATE TYPE sub_status        AS ENUM ('active','in_grace','past_due','paused','canceled','expired','inactive');
CREATE TYPE sub_store         AS ENUM ('app_store','play_store','stripe','paddle','promotional');
CREATE TYPE entitlement_kind  AS ENUM ('quota','boolean','level');
CREATE TYPE entitlement_key   AS ENUM (
  'swipes_per_day','max_favorites','max_folders','max_saved_searches',
  'filters_geo_amenity','rewind','no_ads','premium_agent_data',
  'saved_search_alerts','instant_listing_alerts','fresh_listings_first','priority_support'
);
CREATE TYPE usage_metric      AS ENUM ('swipe');
```

> Enums (not free text) make tier/status/key typos impossible at the DB level and keep gates honest.

### `subscriptions` — single source of billing truth (service_role-only writer)

One row per user holding the CURRENT subscription state synced from RevenueCat. `tier` is a denormalized convenience derived from RevenueCat entitlement IDs; gates NEVER read it directly — resolution always goes through `tier_entitlements`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `profile_id` | uuid NOT NULL UNIQUE | `REFERENCES profiles(id) ON DELETE CASCADE` |
| `tier` | `app_tier` NOT NULL | `DEFAULT 'free'` |
| `status` | `sub_status` NOT NULL | `DEFAULT 'inactive'` |
| `store` | `sub_store` NULL | origin store |
| `rc_app_user_id` | text | equals `profiles.id`; cross-check webhook payloads |
| `rc_original_app_user_id` | text | survives TRANSFER (alias merges) |
| `entitlement_ids` | text[] NOT NULL | `DEFAULT '{}'`; raw RC ids, audit only |
| `product_id` | text | `pro_monthly` \| `ultimate_monthly` \| `top_lifetime` |
| `current_period_end` | timestamptz NULL | **NULL = lifetime/non-expiring** (top); future = active; past = expired |
| `will_renew` | boolean NOT NULL | `DEFAULT false` |
| `is_lifetime` | boolean NOT NULL | `DEFAULT false`; true for `top` — makes NULL-period semantics queryable |
| `is_trial` | boolean NOT NULL | `DEFAULT false`; this active period is the Ultimate trial |
| `trial_started_at` | timestamptz NULL | |
| `trial_ends_at` | timestamptz NULL | |
| `trial_used` | boolean NOT NULL | `DEFAULT false`; **one-way latch**, never reset → once-per-user anti-abuse |
| `last_event_id` | text | RC event id; idempotency guard |
| `last_event_at` | timestamptz NULL | event ts; drop out-of-order/older events |
| `environment` | text | `SANDBOX` \| `PRODUCTION` — sandbox never grants prod access |
| `created_at` / `updated_at` | timestamptz NOT NULL | `DEFAULT now()` |

**RLS:** `SELECT USING (profile_id = (select auth.uid()))`. **No INSERT/UPDATE/DELETE policy** for `anon`/`authenticated` → all client writes denied. The webhook edge function (service_role, bypasses RLS) is the ONLY writer. **This is the concrete A01 control: the client has no write path, so it physically cannot escalate its own entitlements.**

### `entitlements_catalog` — the capability dictionary (public read)

The stable list of every gate-able capability, decoupled from any tier. Seeded once.

| Column | Type | Notes |
|---|---|---|
| `key` | `entitlement_key` PK | stable id |
| `kind` | `entitlement_kind` NOT NULL | `quota` \| `boolean` \| `level` |
| `description` | text NOT NULL | |
| `unit` | text NULL | `per_day` \| `count`; null for boolean/level |
| `created_at` | timestamptz NOT NULL | `DEFAULT now()` |

**RLS:** `SELECT USING (true)` (authenticated/anon) — public reference data needed to render gates/paywalls. No client write policy; seeded via migration/service_role only.

### `tier_entitlements` — the tier→entitlement resolution map (public read)

Which capability each tier grants and at what limit/level. **PROOF of the locked principle:** `top` and `ultimate` rows are identical for every key.

| Column | Type | Notes |
|---|---|---|
| `tier` | `app_tier` NOT NULL | |
| `entitlement_key` | `entitlement_key` NOT NULL | `REFERENCES entitlements_catalog(key)` |
| `enabled` | boolean NOT NULL | `DEFAULT false`; for boolean kind; also gates whether quota/level applies |
| `limit_int` | integer NULL | for `quota`: the cap (30, 150). NULL + `is_unlimited=false` ⇒ none/0 |
| `is_unlimited` | boolean NOT NULL | `DEFAULT false`; for `quota`: true ⇒ no cap |
| `level_value` | text NULL | for `level`: `none`\|`some`\|`all` (or `none`\|`limited`\|`full`) |
| **PK** | `(tier, entitlement_key)` | |

**RLS:** `SELECT USING (true)` — public so the client renders accurate paywalls/upsell (show what pro vs ultimate unlocks) WITHOUT being authoritative. No client write policy; service_role/migration only.

### `daily_usage_counters` — per-user-per-UTC-day atomic counter (RPC-only writer)

For quantitative rate limits not persisted as their own rows — primarily the daily swipe cap (swipes are ephemeral; no row-per-swipe).

| Column | Type | Notes |
|---|---|---|
| `profile_id` | uuid NOT NULL | `REFERENCES profiles(id) ON DELETE CASCADE` |
| `usage_date` | date NOT NULL | `DEFAULT (now() AT TIME ZONE 'utc')::date` |
| `metric` | `usage_metric` NOT NULL | `DEFAULT 'swipe'`; extensible |
| `count` | integer NOT NULL | `DEFAULT 0` |
| `updated_at` | timestamptz NOT NULL | `DEFAULT now()` |
| **PK** | `(profile_id, usage_date, metric)` | |

**RLS:** `SELECT USING (profile_id = (select auth.uid()))` — user reads own row to render "X swipes left today". **No client INSERT/UPDATE/DELETE** → the only mutation path is `record_swipe()` (SECURITY DEFINER), which enforces the cap atomically. Client cannot zero/decrement its own counter. Per-UTC-day reset is implicit (a new day = a fresh PK row at 0); no cron needed for correctness.

### `webhook_events` — append-only audit + idempotency ledger (service_role-only, invisible to clients)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `rc_event_id` | text UNIQUE NOT NULL | **dedupe key** — PK-conflict = duplicate |
| `event_type` | text NOT NULL | `INITIAL_PURCHASE` \| `RENEWAL` \| … |
| `app_user_id` | text NOT NULL | |
| `event_ts` | bigint | `event_timestamp_ms` — replay/out-of-order guard |
| `status` | text | `processed` \| `duplicate` \| `unlinked` \| `invalid` |
| `payload` | jsonb NOT NULL | scrubbed of PII/secrets |
| `received_at` | timestamptz NOT NULL | `DEFAULT now()` |

**RLS:** NO policy for any client role → fully invisible and immutable to clients. service_role only. Pure server-side audit surface.

### `trial_grants` — identity-fingerprint ledger (anti-abuse, service_role/definer-only)

Defeats "delete account + re-signup" trial farming by binding eligibility to a hashed verified identity, not just `profiles.id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `profile_id` | uuid NOT NULL | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `identity_fingerprint` | text UNIQUE NOT NULL | hash of normalized verified email/phone |
| `device_fingerprint` | text NULL | coarse per-install token; SOFT signal only |
| `granted_at` | timestamptz NOT NULL | `DEFAULT now()` |

**RLS:** NO client policy → definer functions / service_role only.

---

## Server-Side Limit Enforcement

**SERVER-SIDE, ALWAYS.** Three quantitative limits, two enforcement shapes. The client is NEVER authoritative.

Every enforcement function is `SECURITY DEFINER` with **`SET search_path = ''`** (blocks the real Postgres `search_path`-hijack privilege-escalation vector), uses fully-qualified object names, is `REVOKE`d from `public`/`anon`, and `GRANT EXECUTE` only to `authenticated`. Each reads the user's limit through the SAME `resolve_entitlement` resolver as the read API.

### Single-key resolver (reused everywhere)

```sql
-- resolve_entitlement(p_user, p_key): the read API logic narrowed to one user + one key.
-- Returns one row {enabled, limit_int, is_unlimited, level_value}.
-- Used by enforce_quota / record_swipe so enforcement and the read API can NEVER disagree.
```

### A) `max_favorites` and `max_folders` — BEFORE INSERT triggers (synchronous, atomic, race-safe)

```sql
CREATE OR REPLACE FUNCTION enforce_quota(p_user uuid, p_key entitlement_key, p_current int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e record;
BEGIN
  SELECT enabled, limit_int, is_unlimited INTO e
    FROM public.resolve_entitlement(p_user, p_key);
  IF e.is_unlimited THEN RETURN; END IF;                 -- ultimate/top: no cap
  IF NOT e.enabled OR e.limit_int IS NULL OR p_current >= e.limit_int THEN
    RAISE EXCEPTION 'quota_exceeded:%', p_key USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trg_limit_favorites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_count int;
BEGIN
  -- folder_items has no user_id; derive owner from the folder
  SELECT user_id INTO v_user FROM public.folders WHERE id = NEW.folder_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));  -- race guard
  SELECT count(*) INTO v_count
    FROM public.folder_items fi JOIN public.folders f ON f.id = fi.folder_id
    WHERE f.user_id = v_user;
  PERFORM public.enforce_quota(v_user, 'max_favorites', v_count);    -- >= limit blocks (limit+1)th
  RETURN NEW;
END $$;

CREATE TRIGGER limit_favorites BEFORE INSERT ON public.folder_items
  FOR EACH ROW EXECUTE FUNCTION trg_limit_favorites();
```

The **folders trigger is analogous**: count `public.folders WHERE user_id = NEW.user_id AND deleted_at IS NULL`, then `enforce_quota(.., 'max_folders', ..)`. Free tier = 1 means only the auto-created `is_default` folder exists and no second folder can be created.

**Race safety:** the per-user `pg_advisory_xact_lock` ensures two concurrent inserts cannot both pass the count check and exceed the cap.

> **Resolved fork — "favorites":** `folder_items` (total saved properties across folders) is the canonical "favorites/saves" count. `likes` stays the lightweight swipe-right signal (uncapped, or capped later via the identical pattern). If the product later redefines favorites as likes, move the trigger to `likes` (where `NEW.user_id` exists, no owner derivation needed) — the `enforce_quota` helper is unchanged.

### B) Daily swipe cap — `record_swipe()` SECURITY DEFINER RPC (no row-per-swipe; atomic upsert-and-check)

```sql
CREATE OR REPLACE FUNCTION record_swipe()
RETURNS TABLE(allowed boolean, used int, day_limit int, unlimited boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := (select auth.uid()); e record; v_used int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;
  SELECT enabled, limit_int, is_unlimited INTO e
    FROM public.resolve_entitlement(v_user, 'swipes_per_day');
  IF e.is_unlimited THEN
    RETURN QUERY SELECT true, NULL::int, NULL::int, true; RETURN;   -- ultimate/top: don't even count
  END IF;
  INSERT INTO public.daily_usage_counters(profile_id, usage_date, metric, count)
    VALUES (v_user, (now() at time zone 'utc')::date, 'swipe', 1)
    ON CONFLICT (profile_id, usage_date, metric)
    DO UPDATE SET count = public.daily_usage_counters.count + 1, updated_at = now()
    WHERE public.daily_usage_counters.count < e.limit_int           -- atomic guard: only increment if under cap
    RETURNING count INTO v_used;
  IF v_used IS NULL THEN                                            -- conflict guard failed => at/over cap
    SELECT count INTO v_used FROM public.daily_usage_counters
      WHERE profile_id=v_user AND usage_date=(now() at time zone 'utc')::date AND metric='swipe';
    RETURN QUERY SELECT false, v_used, e.limit_int, false; RETURN;  -- blocked; client shows paywall
  END IF;
  RETURN QUERY SELECT true, v_used, e.limit_int, false;
END $$;
REVOKE ALL ON FUNCTION record_swipe() FROM public, anon;
GRANT EXECUTE ON FUNCTION record_swipe() TO authenticated;
```

The single `INSERT … ON CONFLICT … DO UPDATE … WHERE count < limit … RETURNING` **is the entire race-safe limiter**: Postgres takes the row lock; the conditional `WHERE` makes the increment atomic; a NULL `RETURNING` means "rejected, cap hit". No read-then-write window. Unlimited tiers short-circuit before touching the table. Optional nightly `pg_cron` `DELETE` of counters older than ~7 days keeps the table tiny (not required for correctness).

### Client contract

The client calls `record_swipe()` / inserts `folder_items` / `folders`. It can NEVER pass its own limit or bypass the count. **The UX gate (`get_my_entitlements()`) and the security gate (triggers/RPC) are independent — defeating the UX gate yields nothing because every consuming WRITE is re-resolved and re-checked server-side.**

### Read API — `get_my_entitlements()` (what the app calls to hydrate gates)

```sql
CREATE OR REPLACE FUNCTION get_my_entitlements()
RETURNS TABLE(key entitlement_key, kind entitlement_kind, enabled boolean,
              limit_int int, is_unlimited boolean, level_value text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  WITH eff AS (  -- effective tier (precedence + validity, see Tier/Entitlement Matrix)
    SELECT CASE
      WHEN s.tier='top' AND s.status='active' AND s.is_lifetime THEN 'top'::app_tier
      WHEN s.is_trial AND s.status='active' AND now() < s.trial_ends_at THEN 'ultimate'::app_tier
      WHEN s.status IN ('active','in_grace')
           AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN s.tier
      ELSE 'free'::app_tier END AS tier
    FROM public.subscriptions s
    WHERE s.profile_id = (select auth.uid())
  )
  SELECT te.entitlement_key, c.kind, te.enabled, te.limit_int, te.is_unlimited, te.level_value
  FROM public.tier_entitlements te
  JOIN public.entitlements_catalog c ON c.key = te.entitlement_key
  WHERE te.tier = COALESCE((SELECT tier FROM eff), 'free'::app_tier);  -- no sub row => free
$$;
REVOKE ALL ON FUNCTION get_my_entitlements() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_entitlements() TO authenticated;
```

`STABLE`, scoped to `(select auth.uid())` (cannot be asked about another user). `resolve_entitlement(p_user, p_key)` is the same logic narrowed to one user + one key — the **single resolution definition** shared by enforcement and the read API.

---

## RevenueCat Billing & Webhook Security

**One RevenueCat project, three platform apps, one unified entitlements system.** `appUserID = profiles.id`.

### Setup

- **Apps:** App Store (iOS, with App Store Server API key), Play Store (Android, with Google Play service-account JSON), Web Billing (Stripe-backed; Paddle alternative) for RN Web. All three feed the same Customer + Entitlement model.
- **API keys (two trust levels, mirroring Supabase):** PUBLIC SDK keys (per platform) are safe in the bundle like the Supabase anon key. The SECRET REST API key (v2) is **server-only**, lives as a Supabase Edge Function secret, used for defense-in-depth customer re-fetch — NEVER in the bundle/EAS Update/RN code (same rule as `service_role`).
- **Entitlements (capabilities, not tiers):** one RC entitlement `premium_access` attached to BOTH `ultimate_monthly` AND `top_lifetime` (identical capabilities = the locked principle), plus `pro_access` on `pro_monthly`. The access layer reads entitlements, never product/tier strings.
- **Products:** `pro_monthly` (auto-renew → `pro_access`), `ultimate_monthly` (auto-renew with 15-day store-level intro free trial → `premium_access`), `top_lifetime` (**non-consumable** one-time → `premium_access`, arrives as `NON_RENEWING_PURCHASE`, no expiry).
- **Offerings/Paywall:** one default Offering with Pro / Ultimate-with-trial / Lifetime packages, remote-configurable without an app release.
- **Client SDK:** single `react-native-purchases` (iOS StoreKit + Google Play Billing + Web Billing) → **requires an Expo Development Build (not Expo Go)**.

### appUserID & alias handling (webhook correctness)

- `appUserID = profiles.id`. Prefer configuring the SDK **only after** a Supabase session exists (no anonymous id ever minted).
- Anonymous browse → sign-in: call `Purchases.logIn(profiles.id)` to **alias** the anonymous id; `Purchases.logOut()` on sign-out. RC keeps `originalAppUserId` as the FIRST id (often anonymous) **by design**.
- **The webhook must be alias-aware:** resolve the owning profile by (1) `app_user_id` if a valid `profiles.id`, else (2) any `aliases[]` value that is a valid `profiles.id`, else (3) the subscription already linked to any alias.
- **Pure-anonymous purchase before login** (no known `profiles.id`): persist as `status='unlinked'` in `webhook_events`, return 200, reconcile later on `TRANSFER`. **Never silently drop.**

### Webhook security (2026 reality: NO body/HMAC signing)

RevenueCat offers **no `x-revenuecat-signature`/body signature** — the ONLY transport auth is a developer-configured **Authorization header shared secret**. Security therefore rests on that secret plus our own idempotency/replay/validation layers.

**Edge function `rc-webhook` (Deno, `verify_jwt=false` — RC can't send a Supabase JWT; auth is in-code):**

1. Read `Authorization` header; **constant-time compare** to `RC_WEBHOOK_SECRET` (Function secret). Mismatch/missing → **401 BEFORE parsing the body** (body is untrusted until the header passes).
2. Parse event; extract `id`, `type`, `event_timestamp_ms`, `app_user_id`, `aliases`, `entitlement_ids`, `expiration_at_ms`, `period_type`, `store`, `environment`, `is_trial_conversion`, `cancel_reason`.
3. **Idempotency:** `INSERT rc_event_id` into `webhook_events`; PK conflict → mark `duplicate`, return **200** (RC retries reuse the same id; at-least-once delivery → dedupe mandatory).
4. **Replay/skew guard:** reject events with `event_timestamp_ms` outside an acceptable skew window.
5. **Out-of-order guard:** skip state apply if `event_timestamp_ms < subscriptions.last_event_at` for that sub (but still record the event) — a late stale RENEWAL can't resurrect an expired/refunded entitlement.
6. Resolve `profiles.id` from `app_user_id`/`aliases` (above). None → `unlinked`, 200.
7. **Validate environment:** `SANDBOX` events never grant production entitlements (tag/segregate).
8. **UPSERT `subscriptions`** by `profile_id` per the event map below; set `last_event_id`/`last_event_at`; recompute transactionally.
9. **(Optional defense-in-depth)** call RC REST `GET customer` to confirm active entitlements match the event before granting — even a forged payload with a leaked secret can't grant what RC doesn't actually report. Recommended for high-value events (lifetime, refund).
10. Return **200** on success; any unhandled error → non-200 so RC retries (**5×: 5/10/20/40/80 min, 60s timeout** — keep the handler well under 60s). Logs scrubbed of secrets/PII (A09). Alert on 401 spikes and refund/chargeback bursts.

### Lifecycle event → state map

| RC Event | Action |
|---|---|
| `INITIAL_PURCHASE` (`period_type=TRIAL`) | Ultimate trial start: set `trial_used=true` **before any grant**, `is_trial=true`, `trial_started_at/ends_at`, `status='active'`, `tier='ultimate'`, `current_period_end`=trial end |
| `INITIAL_PURCHASE` (`NORMAL`, pro) | `tier='pro'`, `status='active'`, set `current_period_end` |
| `RENEWAL` | Extend `current_period_end`, `status='active'`. If `is_trial_conversion=true`: trial → paid Ultimate, `is_trial=false`, keep `tier='ultimate'` |
| `NON_RENEWING_PURCHASE` (`top_lifetime`) | `tier='top'`, `is_lifetime=true`, `current_period_end=NULL`, `status='active'`. No renewals follow; only refund/chargeback revokes |
| `PRODUCT_CHANGE` | Recompute from new product; update `product_id`/`entitlement_ids`/`tier` (timing per store) |
| `CANCELLATION` (auto-renew off) | `will_renew=false`; **keep access until `current_period_end`**; UI shows "cancels on X" |
| `CANCELLATION` (refund) | Revoke immediately: `status='canceled'`/`expired`, tier downgrades (incl. lifetime) |
| `UNCANCELLATION` | Clear pending-cancel, `status='active'`, keep entitlement |
| `BILLING_ISSUE` | `status='in_grace'`; **keep access during store grace** (recommended), notify user; revoke only on eventual `EXPIRATION` |
| `SUBSCRIPTION_PAUSED` | `status='paused'` at period end; access until period ends, then lapsed until resumed |
| `SUBSCRIPTION_EXTENDED` | Push `current_period_end` later, keep access |
| `EXPIRATION` | `status='expired'`, recompute → **Ultimate trial revert-to-free path** / paid downgrade. Never applies to lifetime |
| `REFUND` / chargeback | Revoke immediately incl. LIFETIME (`is_lifetime=false`, `current_period_end=now()`, downgrade). `REFUND_REVERSED` restores |
| `TRANSFER` | Move sub rows source→destination `profiles.id`, re-evaluate BOTH users, reconcile previously `unlinked` events |
| `TEST` | Ack 200, log, no state change |
| `TEMPORARY_ENTITLEMENT_GRANT` | Short-lived grant (`current_period_end ≤ 24h`); real event confirms or it lapses. Not permanent |

### Lifetime vs subscription

Subscriptions (`pro_monthly`, `ultimate_monthly`) are time-bounded (`current_period_end` non-null, driven by RENEWAL/EXPIRATION). Lifetime (`top_lifetime`) is a non-consumable: `is_lifetime=true`, `current_period_end=NULL` (the canonical "never expires" sentinel — resolution treats NULL-period + active as VALID, not missing). **`top` and `ultimate` attach the SAME `premium_access` entitlement ⇒ identical capabilities; they differ ONLY in billing/lifecycle.**

### Store-policy reality (mid-2026)

- Digital goods/subscriptions still **require platform IAP** on Apple + Google. **MVP decision: IAP-only via RevenueCat for ALL regions** (iOS IAP, Play Billing, Web Billing/Stripe on RN Web where store rules don't apply). Simplest compliant path, one unified entitlement system. Web Billing legitimately bypasses store commissions (RN Web isn't store-distributed) — the margin "pressure valve".
- **US** (post Epic v. Apple, Apr 2025): external links allowed, but a Dec 2025 partial reversal lets Apple charge a "reasonable" fee — economics unsettled.
- **EU** (DMA): External Purchase Link entitlement exists but carries fees (Core Technology Commission 5%; per-install CTF sunsets Jan 2026) and you **cannot freely mix IAP + external steering** in one binary without Apple's program.
- **Defer external links** to a later, region-gated milestone — billing-economics optimization, NOT a security/correctness requirement. Out of MVP.

---

## Tier/Entitlement Matrix

Gates check the **entitlement key**, never the tier. `top` ≡ `ultimate` for every key (the only `top`-specific item, the Founder badge, is cosmetic and lives outside gate logic).

| Entitlement key | kind | free | pro | ultimate | top |
|---|---|---|---|---|---|
| `swipes_per_day` | quota | **30/day** | **150/day** | unlimited | unlimited |
| `max_favorites` | quota | **10** | **100** | unlimited | unlimited |
| `max_folders` | quota | **1** (default only) | **5** | unlimited | unlimited |
| `max_saved_searches` | quota | **0** | **3** | unlimited | unlimited |
| `filters_geo_amenity` | level | none (city/price only) | some (radius/draw + curated amenities) | all (commute-time, polygon, school zones, every facet) | all |
| `rewind` | boolean | off | on | on | on |
| `no_ads` | boolean | off (sponsored interstitials) | on | on | on |
| `premium_agent_data` | level | none | limited (name + basic contact) | full (perf history, days-on-market, price-cut history, comps) | full |
| `saved_search_alerts` | boolean | off | on | on | on |
| `instant_listing_alerts` | boolean | off | off (daily digest only) | **on** (sub-minute, beat other buyers) | on |
| `fresh_listings_first` | boolean | off | off | **on** (newest/best-match feed ordering) | on |
| `priority_support` | boolean | off | off | on | on |

**The pro→ultimate "wow" gap (intentional):** Pro is quality-of-life (no ads, rewind, partial filters). Ultimate/Top add what *wins* a competitive housing search — full geo+amenity precision, full agent intel, unlimited saved searches with **instant** new-listing alerts, and **fresh-listings-first** ordering. That speed-to-opportunity ("see and act on the right home before other buyers") is the emotional and practical hook that justifies the jump.

**Effective-tier resolution precedence** (server-side, inside `get_my_entitlements()` / `resolve_entitlement`):
1. **Lifetime `top`** — `tier='top' AND status='active' AND is_lifetime` (NULL period expected/valid)
2. **Trial** — `is_trial AND status='active' AND now() < trial_ends_at` ⇒ effective `ultimate`
3. **Active sub** — `status IN ('active','in_grace') AND (current_period_end IS NULL OR > now())`
4. **else** ⇒ `free` (no row, expired, lapsed, or trial elapsed → reverts automatically; the time check fails, no cron needed for the happy path; `EXPIRATION` webhook is the backstop)

Highest capability wins on any overlap (`top`/`ultimate` > `pro` > `free`).

**`top`-only cosmetic:** `badge.identity` = "Founder / Lifetime" badge — **purely cosmetic, NOT an access entitlement**, so it never leaks into gate logic. (Optional subtle "Ultimate" marker for ultimate.)

---

## Trial & Anti-Abuse

**15-day Ultimate trial, once per user, server-enforced.**

### What it grants

The FULL Ultimate entitlement set for 15 days — every boolean on, all quotas unlimited (swipes, favorites, folders, saved searches), instant alerts, fresh-listings-first, full agent data. The user experiences the complete product so value is *felt*, not described.

### State model & start

Trial state lives on the `subscriptions` row: `is_trial`, `trial_started_at`, `trial_ends_at`, and the one-way latch `trial_used`. A single `SECURITY DEFINER` RPC `start_ultimate_trial()` is the **ONLY** way to open a trial:

1. Verify eligibility: `trial_used = false` for this profile **AND** the `identity_fingerprint` is absent from `trial_grants`.
2. Atomically set `trial_used = true`, `is_trial = true`, `trial_started_at = now()`, `trial_ends_at = now() + interval '15 days'`, effective tier resolves to `ultimate` for the window — all in one statement so concurrent calls can't double-trial.
3. Insert the `identity_fingerprint` into `trial_grants`.

RLS denies direct client writes to `trial_used`/trial fields — only the definer function and service_role write them.

### Anti-abuse (defense in depth)

> **Verified 2026 fact:** RevenueCat's `checkTrialOrIntroductoryEligibility` is **iOS-only**, scoped to the Apple subscription group / device-account — it CANNOT enforce "once per Reel Estate account". `top`-once-per-user MUST be owned in Postgres.

1. **Server-tracked latch:** `trial_used` set atomically inside `start_ultimate_trial()`; re-trial requests rejected by the RPC; client has no write path (RLS).
2. **Identity binding:** gate trial start behind a **verified** signal (verified email minimum, ideally phone/OTP — far costlier to farm). Store a **hashed** `identity_fingerprint` in `trial_grants`; reject a new trial if the fingerprint already consumed one, **even under a fresh `profiles.id`** → defeats delete-and-resignup farming.
3. **Device signal (secondary, soft):** coarse per-install/attestation token feeds a risk score; throttle if one device farms N trials across identities. Never the sole gate (privacy + spoofability).
4. **Payment-method binding (LATER):** Apple/Google block intro-offer reuse on the same store account/payment method — a third backstop only, never primary (doesn't map to your user, doesn't cover Web Billing).
5. **Webhook trust boundary:** the service-role edge function is the only writer of trial/entitlement state; client never authoritative (a client-only gate = OWASP A01).

### Reversion at expiry (non-destructive)

- Resolution reverts automatically: `now() ≥ trial_ends_at` ⇒ effective tier `free` (no cron needed for the happy path; `EXPIRATION` webhook is the backstop). `trial_used` stays `true` **forever**.
- **Never delete user data.** Over-cap rows become read-only/locked: favorites 11..N greyed/read-only, extra folders collapse to read-only — so a later subscribe restores everything. The same triggers enforce the new caps on any NEW insert immediately.

### Rejection UX

Returning user with `trial_used = true` taps "Start free trial" → server returns ineligible (no error) → client shows paid options directly: *"You've already used your Ultimate trial — go Ultimate monthly or grab Top lifetime."*

### Conversion prompts (timed to felt value)

- **Day 11 (T-4):** in-app card + personalized recap ("You saved 23 homes, ran 3 instant alerts, used full agent data 9×") framing exactly what they LOSE.
- **Day 14 (T-1):** push + paywall showing `ultimate_monthly` vs `top_lifetime` side by side, `top` framed as "never pay again".
- **At expiry:** soft downgrade screen showing locked-but-preserved items, single restore CTA, no data deleted.
- **Post-expiry friction moments** (hitting the 30-swipe cap, 11th favorite, now-off instant alert) → contextual "You had this on Ultimate" reactivation prompt (highest-intent).

---

## Paywall UX

### Gate taxonomy

- **SOFT gates (preview + tease)** — boolean/level entitlements. Premium UI is *visible but locked*: advanced filter chips greyed with a lock, agent-data panel blurred with an "Ultimate" overlay, rewind button present but prompts upsell. The user SEES the value before paying.
- **HARD gates (server-enforced, no client bypass)** — quantitative caps (swipes, favorites, folders, saved searches). The block happens in the RPC/trigger; the client just renders the denial. **A patched client cannot exceed them.** The paywall is the friendly face on top of a server NO — this is the security backbone.

### Where the paywall appears (at the friction moment, not randomly)

1. **Daily swipe cap hit** (free 30 / pro 150) → full-screen "out of swipes today" → upsell + trial offer (highest-intent for engaged users).
2. **Favorites cap hit** (free 10 / pro 100) → bottom-sheet on the rejected save tap.
3. **Folder cap hit** (free 1) → on attempting a 2nd folder.
4. **Locked filter chip** tapped (geo/amenity).
5. **Rewind tap** on free.
6. **Saved-search / instant-alert toggle** on free, or exceeding pro's 3 saved searches.
7. **Blurred agent-data panel** on a listing detail.
8. **Dedicated "Membership" tab** for direct plan browsing.

### Plan presentation (entitlement-led, 3 cards)

- **Pro** (monthly) — "more of everything".
- **Ultimate** (monthly) — "everything unlocked" — **Most Popular / Best Value**.
- **Top** (one-time) — "Lifetime — pay once, own it forever", with the cosmetic Founder badge as an emotional sweetener (explicitly NOT an access difference).

Ultimate and Top show the **SAME feature set, two price shapes**: "$X/mo" vs "$Y once, never pay again". Anchor Top against Ultimate's annualized cost ("Top pays for itself in ~N months") to make lifetime feel like the smart-money move.

### Principles

Never punish before showing value (tease soft gates first). One clear primary CTA per paywall. Always surface the trial to trial-eligible users and paid options to `trial_used` users. **Frame LOSS at downgrade** ("keep your unlimited favorites") — loss-aversion converts better than feature lists. The UX gate is hydrated by `get_my_entitlements()`; the security gate is the database — independent layers.

---

## Tasks

### Milestone 1 — Schema & enforcement (NOW, no RevenueCat)

1. **Enums migration:** `app_tier`, `sub_status`, `sub_store`, `entitlement_kind`, `entitlement_key` (12 keys), `usage_metric`.
2. **Tables migration:** `subscriptions`, `entitlements_catalog`, `tier_entitlements`, `daily_usage_counters`, `webhook_events`, `trial_grants` — each with RLS ENABLED + FORCED, per-owner SELECT, deny-by-default writes. Add indexes on `subscriptions.profile_id`, `daily_usage_counters(profile_id, usage_date, metric)`, `folder_items.folder_id`, `folders.user_id`, and every RLS/limit-check column.
3. **Seed migration:** populate `entitlements_catalog` (12 rows) and `tier_entitlements` (4 tiers × 12 keys = 48 rows), with `top` rows IDENTICAL to `ultimate`.
4. **Resolver functions:** `resolve_entitlement(p_user, p_key)` and `get_my_entitlements()` — `SECURITY DEFINER`, `SET search_path=''`, `REVOKE` from public/anon, `GRANT EXECUTE` to authenticated.
5. **Limit triggers:** `enforce_quota()` helper + `trg_limit_favorites` (on `folder_items`) + `trg_limit_folders` (on `folders`), with per-user `pg_advisory_xact_lock`.
6. **Swipe RPC:** `record_swipe()` with the atomic `ON CONFLICT … WHERE count < limit … RETURNING` limiter.
7. **Trial RPC:** `start_ultimate_trial()` — eligibility check (`trial_used=false` + `identity_fingerprint` absent), atomic latch, `trial_grants` insert.
8. **Dev grant RPC:** `dev_grant_entitlement(user, tier)` — writes a `subscriptions` row (`status='active'`, tier, period/NULL) = EXACTLY what a webhook would produce. **Guard to dev/staging only** (env flag / dev role; never deployed to prod).
9. **Tests (TDD):** quota caps block the (limit+1)th insert; concurrent inserts can't exceed cap (advisory lock); swipe RPC blocks at cap and resets per UTC day; unlimited tiers short-circuit; `get_my_entitlements()` returns identical sets for `top` and `ultimate`; trial double-start rejected; RLS denies cross-user reads and all client writes to entitlement tables.

### Milestone 2 — Gated features & paywall UX (client, on top of M1)

10. Client entitlement hydration: call `get_my_entitlements()` on login/app-foreground; cache in app state; render soft gates (greyed/blurred/locked) from it.
11. Wire each gated feature to its server path: swipe → `record_swipe()`; save → `folder_items` insert (handle `quota_exceeded` → paywall); folder create; saved-search create.
12. Build paywall surfaces (8 trigger points), 3-card plan screen (entitlement-led), Membership tab.
13. Trial flow UI: `start_ultimate_trial()` call, eligibility/rejection UX, T-4/T-1/expiry prompts, post-downgrade re-friction prompts.
14. Founder/Lifetime cosmetic badge (UI only — verify it never touches gate logic).

### Milestone 3 — RevenueCat integration (dedicated billing milestone)

15. RC project + 3 apps; products `pro_monthly` / `ultimate_monthly` (store intro trial) / `top_lifetime` (non-consumable); entitlements `pro_access` / `premium_access`; default Offering.
16. Expo Development Build (`expo-dev-client` via EAS); integrate `react-native-purchases`; `appUserID = profiles.id`; `logIn`/`logOut` aliasing.
17. Edge function `rc-webhook` (`verify_jwt=false`): constant-time `Authorization` check → dedupe → replay/out-of-order/environment guards → alias-aware profile resolution → UPSERT `subscriptions` per the lifecycle map → recompute. Store `RC_WEBHOOK_SECRET` + RC secret REST key as Function secrets.
18. (Optional) defense-in-depth RC REST `GET customer` re-fetch for high-value events (lifetime, refund).
19. Sandbox E2E: App Store sandbox/TestFlight + Play license testers + RC sandbox; verify trial→renewal→expiration→refund→transfer; confirm `SANDBOX` events never grant prod access; smoke-test the endpoint with the RC `TEST` event.

### Open decisions to confirm with product/billing

- **Grace-period policy:** keep access during `BILLING_ISSUE` grace (recommended) vs revoke immediately.
- **Trial anti-abuse strength:** `trial_used` + identity fingerprint (recommended) vs also device fingerprinting for multi-account farming.
- **Defense-in-depth re-fetch scope:** every webhook (latency/quota cost) vs high-value events only (lifetime, refund).
- **`likes` cap:** leave uncapped (recommended — lightweight swipe signal) vs cap via the same `enforce_quota` pattern.