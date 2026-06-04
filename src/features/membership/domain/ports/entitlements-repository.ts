import type {
  EntitlementSnapshot,
  TrialResult,
} from '@/features/membership/domain/entities/entitlements';

export interface EntitlementsRepository {
  /** The resolved entitlement set for the current user (server-authoritative). */
  getMine(userId: string): Promise<EntitlementSnapshot>;
  /** Open the 15-day Ultimate trial. Server enforces once-per-identity anti-abuse. */
  startUltimateTrial(fingerprint: string): Promise<TrialResult>;
}
