import type {
  EntitlementSnapshot,
  TrialResult,
} from '@/features/membership/domain/entities/entitlements';

export interface EntitlementsRepository {
  /** The resolved entitlement set for the current user (server-authoritative). */
  getMine(userId: string): Promise<EntitlementSnapshot>;
  /** Open the 15-day Ultimate trial. The server derives the anti-abuse identity
   *  from the caller's verified email — no client-supplied fingerprint. */
  startUltimateTrial(): Promise<TrialResult>;
}
