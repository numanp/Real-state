import { z } from 'zod';

import {
  type AccountKind,
  type BadgeRequest,
  type BadgeType,
  badgeForKind,
  badgeMatchesKind,
} from '@/features/verification/domain/entities/badge';
import type { VerificationRepository } from '@/features/verification/domain/ports/verification-repository';

const kindSchema = z.enum(['person', 'agency']);
const typeSchema = z.enum(['identity', 'agency']);

/**
 * Thin application service: validates the request input (the more-correct local
 * pattern for write-with-validation, like FavoritesService/FoldersService) and
 * delegates. It can NEVER grant a badge — only open a request.
 */
export class VerificationService {
  constructor(private readonly repo: VerificationRepository) {}

  getMyState(userId: string) {
    return this.repo.getMyState(userId);
  }

  getFor(subjectId: string) {
    return this.repo.getFor(subjectId);
  }

  /**
   * Open a verification request for the caller. The badge defaults to the one
   * the account kind is eligible for; an explicit mismatched badge throws
   * 'badge_kind_mismatch' (also re-enforced server-side in request_badge).
   */
  async requestVerification(accountKind: AccountKind, badgeType?: BadgeType): Promise<BadgeRequest> {
    const kind = kindSchema.parse(accountKind);
    const type = typeSchema.parse(badgeType ?? badgeForKind(kind));
    if (!badgeMatchesKind(type, kind)) throw new Error('badge_kind_mismatch');
    const { providerRef } = await this.repo.startKyc(type);
    return this.repo.requestBadge(type, providerRef);
  }
}
