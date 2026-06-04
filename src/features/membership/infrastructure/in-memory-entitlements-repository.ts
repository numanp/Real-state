import {
  type EntitlementSnapshot,
  FREE_ENTITLEMENTS,
  type TrialResult,
  ULTIMATE_ENTITLEMENTS,
} from '@/features/membership/domain/entities/entitlements';
import type { EntitlementsRepository } from '@/features/membership/domain/ports/entitlements-repository';

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export class InMemoryEntitlementsRepository implements EntitlementsRepository {
  private current: EntitlementSnapshot = FREE_ENTITLEMENTS;
  private trialUsed = false;

  async getMine(): Promise<EntitlementSnapshot> {
    return this.current;
  }

  async startUltimateTrial(): Promise<TrialResult> {
    if (this.trialUsed) {
      return { eligible: false, trialEndsAt: null, reason: 'trial_already_used' };
    }
    this.trialUsed = true;
    this.current = ULTIMATE_ENTITLEMENTS;
    return {
      eligible: true,
      trialEndsAt: new Date(Date.now() + FIFTEEN_DAYS_MS).toISOString(),
      reason: null,
    };
  }
}
