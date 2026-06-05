# Lead-loop — SDD plan (proposal → spec → tasks)

> Status: **planned, not implemented.** Resume here next session: read this file, then
> implement Phase 1 PR by PR with strict TDD. Branch: `feat/lead-loop`.

## Why

The contact reveal (`get_listing_contact`, hardened in 0031/0033) is one-directional:
owner → buyer. A buyer taps "Contactar", sees a phone, and **nothing routes their
inquiry back to the owner.** We sell access to a dead end. The lead-loop closes the
two-sided loop: a buyer sends an inquiry on a property, the **owner** receives it
(push) and both sides have an inbox.

## Scope

- **MVP (Phase 1):** one-way inquiry + immediate owner push notification + a leads
  inbox on each side (received / sent). One review-per-(buyer,property)-per-day.
- **Phase 2:** two-way messaging thread (`lead_messages` + `reply_to_lead`).
- **Out of scope (later):** masked WhatsApp/Twilio relay, pay-per-lead credit ledger,
  owner lead analytics. None require changing the core `leads` table.

## Key decision — standalone InquirySheet (Option A, chosen)

Add a second **"Consultar"** CTA next to "Contactar" on the ficha that opens a NEW
`InquirySheet` (text field + submit), independent of the entitlement-gated
`ContactSheet`. Rationale: one sheet per intent (screaming architecture), keeps the
reveal/entitlement logic uncoupled from inquiries, and lets us gate "send inquiry"
separately from "see contact" later (pay-per-lead). NOT a tab inside ContactSheet.

## Conventions to mirror (from exploration)

- Hexagonal slice: `domain/{entities,ports}`, `application/{service,test}`,
  `infrastructure/{in-memory,supabase}-repository`, `ui/{hooks,containers,components}`.
- DI: one line in `src/core/di/container.ts` (`leads: new LeadsService(repo)`); repo
  picked by `isSupabaseConfigured`.
- RPC-ONLY table pattern (like `agency_reviews`, `device_push_tokens`): `ENABLE`+`FORCE`
  RLS, `REVOKE ALL ... FROM anon, authenticated, public`, NO policy, all access via
  `SECURITY DEFINER` RPCs with `SET search_path=''`, bound to `auth.uid()`,
  REVOKE/GRANT at the bottom.
- Rate-limit via `daily_usage_counters` + a new `usage_metric` enum value, atomic
  upsert-with-cap (mirror `record_swipe` 0007 §G and `get_listing_contact` 0033).
  **Enum value must be added in its OWN migration** (Postgres forbids using a new enum
  value in the same tx that adds it — same lesson as 0032/0033).
- Push fan-out: reuse the `dispatch_saved_search_alerts` CTE shape (0027) but INLINE
  inside `create_lead` (notify must fire on creation, not on the 5-min cron).

## Spec

### Schema
- Migration `0034_leads_enum.sql`: `ALTER TYPE public.usage_metric ADD VALUE IF NOT EXISTS 'lead_send';`
- Migration `0035_leads.sql`:
  - `CREATE TYPE public.lead_status AS ENUM ('new','read','replied','closed');`
  - `public.leads(id, property_id FK→properties ON DELETE CASCADE, buyer_id FK→profiles,
    owner_id FK→profiles ON DELETE SET NULL [denormalized at insert], message text
    CHECK 1..1000, status lead_status DEFAULT 'new', created_at, updated_at,
    CHECK buyer_id IS DISTINCT FROM owner_id)`.
  - RLS `ENABLE`+`FORCE`; `REVOKE ALL FROM anon, authenticated, public`; **no policy**.
  - Indexes: `(owner_id, created_at DESC) WHERE owner_id IS NOT NULL`,
    `(buyer_id, created_at DESC)`, `(property_id)`.
  - `set_updated_at` BEFORE UPDATE trigger.

### RPCs (all SECURITY DEFINER, search_path='', auth.uid()-bound, REVOKE/GRANT)
- `create_lead(p_property_id uuid, p_message text) → jsonb` — VOLATILE.
  Guards: `auth_required`; reject anonymous (`profiles.is_anonymous = false`);
  validate message 1..1000; property must be visible; resolve `owner_id`;
  reject self-inquiry (`owner_id = auth.uid()`); rate-limit 1/(buyer,property)/day via
  `daily_usage_counters` metric `'lead_send'`; insert lead (denormalized owner_id);
  **if owner_id NOT NULL** fan out push to owner's `device_push_tokens` via
  `extensions.net.http_post` to Expo. Return `{id,status,created_at}`.
- `get_received_leads(p_limit, p_offset) → table` — STABLE. `WHERE owner_id = auth.uid()`,
  join properties (title/city/cover) + profiles (buyer display_name only, NO contact).
- `get_sent_leads(p_limit, p_offset) → table` — STABLE. `WHERE buyer_id = auth.uid()`,
  join properties (title/cover), include `status`.
- `mark_lead_read(p_lead_id uuid)` — VOLATILE. `UPDATE ... SET status='read' WHERE
  id=p_lead_id AND owner_id=auth.uid() AND status='new'`.
- Phase 2: `reply_to_lead(p_lead_id, p_body)` → inserts `lead_messages`, sender must be
  the lead's buyer_id or owner_id.

### Client slice `src/features/leads/**`
- `domain/entities/lead.ts` (pure: Lead, mapper), `domain/ports/leads-repository.ts`.
- `application/leads-service.ts` (+ `leads.test.ts` — TDD: send validation, sent/received
  shape, self-inquiry reject, rate-limit) — strict TDD via in-memory repo first.
- `infrastructure/in-memory-leads-repository.ts`, `supabase-leads-repository.ts`.
- `ui/hooks/use-send-lead.ts` (error+loading like use-listing-contact),
  `ui/hooks/use-leads.ts`, `ui/components/inquiry-sheet.tsx`,
  `ui/containers/leads-inbox-screen.tsx`.
- `src/app/leads.tsx` route (received/sent tab toggle); nav entry from SavedScreen.
- `src/features/properties/ui/containers/property-detail-screen.tsx`: add "Consultar" CTA
  (disabled when current user IS the property owner) opening `InquirySheet`.
- `src/core/di/container.ts`: register `leads`.

### Integration test (supabase/tests/leads-check.mjs)
Use `createConfirmedUser` helper. Prove: buyer sends a lead → appears in owner's
`get_received_leads`, NOT in another user's; self-inquiry rejected; 2nd same-day lead to
same property rejected (rate-limit); anonymous cannot send.

## Tasks — chained PRs (~510 lines total → 3 slices, each < 400)

- [ ] **PR 1 — DB** (`0034_leads_enum.sql` + `0035_leads.sql` + `leads-check.mjs`). TDD:
      write the integration probe RED (RPCs absent), apply migrations, GREEN. ~150 lines.
- [ ] **PR 2 — domain/app/infra + DI** (leads slice minus UI + `leads.test.ts` + container).
      Strict TDD: in-memory service tests first. ~220 lines.
- [ ] **PR 3 — UI** (InquirySheet, LeadsInboxScreen, ficha "Consultar" CTA, `app/leads.tsx`,
      Saved nav entry). tsc + manual run. ~160 lines.

## Risks / decisions
- **Most current properties have `owner_id = NULL`** (seed + agency listings — never
  backfilled). Leads still insert; push only fires when owner_id present. The owner-side
  inbox is empty until real owner listings exist. Consider a seed owner for demo.
- ~510 lines → **chained PRs required** (confirm delivery strategy before apply).
- Push is fire-and-forget via pg_net (no receipt) — acceptable for MVP.
- Self-inquiry guarded at BOTH the DB (CHECK + RPC) and the UI (disable CTA).

## Resume checklist (next session)
1. `git checkout feat/lead-loop` (rebase onto latest main if lows/security moved).
2. Read this file. Confirm chained-PR strategy.
3. Start PR 1: write `supabase/tests/leads-check.mjs` (RED), then the two migrations,
   `db reset`, GREEN. Then PR 2 (TDD), then PR 3.
