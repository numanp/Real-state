import type {
  BadgeRequest,
  BadgeState,
  BadgeType,
} from '@/features/verification/domain/entities/badge';

/**
 * Domain PORT. The UI/application depend on this, never on Supabase.
 * NOTE: there is intentionally NO grant/approve method — a client can never
 * grant a badge. Granting is server-only (grant_badge, service_role).
 */
export interface VerificationRepository {
  /** The caller's own badges + latest request. */
  getMyState(userId: string): Promise<BadgeState>;
  /** A subject's PUBLIC verified badges, for rendering next to their name. */
  getFor(subjectId: string): Promise<BadgeType[]>;
  /** Open a KYC attempt; returns an opaque provider session ref. */
  startKyc(badgeType: BadgeType): Promise<{ providerRef: string }>;
  /** Create the pending review request. */
  requestBadge(badgeType: BadgeType, providerRef?: string): Promise<BadgeRequest>;
}
