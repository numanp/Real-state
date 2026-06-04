-- =====================================================================
-- 0016_verification_rls.sql — Reel Estate
-- RLS policies + GRANTs for the verification layer. Mirrors 0008.
--
-- The whole feature is READ-ONLY for clients: every write goes through a
-- SECURITY DEFINER function (0015) or service_role. No table here gets a
-- client INSERT/UPDATE/DELETE policy or grant — the no-self-verify gate.
-- =====================================================================

-- =====================================================================
-- granted_badges — PUBLIC read of verified+active rows only. NO write
-- policy, NO write GRANT → the badge-truth table is unreachable for client
-- writes (42501 before RLS evaluates). Byte-identical to subscriptions.
-- =====================================================================
GRANT SELECT ON public.granted_badges TO anon, authenticated;

CREATE POLICY granted_badges_select_public ON public.granted_badges
  FOR SELECT TO anon, authenticated
  USING (status = 'verified' AND revoked_at IS NULL);
-- No INSERT/UPDATE/DELETE policy → only grant_badge/revoke_badge (definer)
-- and service_role (webhook) ever write. A user literally cannot say
-- "I am verified".


-- =====================================================================
-- badge_requests — user reads ONLY their own request. NO client write
-- (request_badge() definer creates the 'pending' row). The absence of any
-- UPDATE policy/grant means a client can never flip pending → approved.
-- =====================================================================
GRANT SELECT ON public.badge_requests TO authenticated;

CREATE POLICY badge_requests_select_own ON public.badge_requests
  FOR SELECT TO authenticated
  USING (subject_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE policy → self-approval is impossible.


-- =====================================================================
-- verification_attempts — user reads own attempts. NO client write
-- (start_kyc_verification() definer writes; only the webhook sets outcome).
-- =====================================================================
GRANT SELECT ON public.verification_attempts TO authenticated;

CREATE POLICY verification_attempts_select_own ON public.verification_attempts
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE policy → a client cannot forge an attempt outcome.


-- =====================================================================
-- badge_audit — NO policy for any client role + NO grant → invisible and
-- immutable to clients (mirrors webhook_events / trial_grants). service_role
-- bypasses RLS for the append-only audit trail.
-- =====================================================================
-- (Intentionally: no GRANT, no CREATE POLICY.)
