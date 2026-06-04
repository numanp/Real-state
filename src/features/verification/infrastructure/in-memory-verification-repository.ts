import type {
  BadgeRequest,
  BadgeState,
  BadgeType,
} from '@/features/verification/domain/entities/badge';
import type { VerificationRepository } from '@/features/verification/domain/ports/verification-repository';

/**
 * In-memory verification — runs the whole feature with NO database. Because
 * there is no service_role offline, requestBadge AUTO-APPROVES so the badge is
 * visible in the demo. This deliberately MASKS RLS: the real no-self-grant
 * guarantee is proven against Postgres by supabase/tests/verification-check.mjs,
 * which is the authoritative security gate.
 */
export class InMemoryVerificationRepository implements VerificationRepository {
  private badges: BadgeType[] = [];
  private request: BadgeRequest | null = null;

  async getMyState(): Promise<BadgeState> {
    return { badges: [...this.badges], request: this.request };
  }

  async getFor(): Promise<BadgeType[]> {
    return [...this.badges];
  }

  async startKyc(): Promise<{ providerRef: string }> {
    return { providerRef: `stub_${Math.random().toString(36).slice(2)}` };
  }

  async requestBadge(badgeType: BadgeType): Promise<BadgeRequest> {
    const now = new Date().toISOString();
    this.request = { badgeType, status: 'approved', createdAt: now, decidedAt: now, reason: null };
    if (!this.badges.includes(badgeType)) this.badges.push(badgeType);
    return this.request;
  }
}
