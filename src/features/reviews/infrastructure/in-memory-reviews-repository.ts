import {
  type AgencyRating,
  type AgencyReview,
  type MyReview,
  summarizeRatings,
} from '@/features/reviews/domain/entities/review';
import type { ReviewsRepository } from '@/features/reviews/domain/ports/reviews-repository';

/** Offline test double for the agency-reviews port. Models a SINGLE current
 *  user ('me') — the in-memory mirror of submit/delete being bound to
 *  auth.uid() server-side. Upsert + counter semantics match 0021 so the UI
 *  behaves identically with or without a backend. */
const SELF = 'me';

interface Stored {
  id: string;
  agencyId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryReviewsRepository implements ReviewsRepository {
  private rows: Stored[] = [];
  private seq = 0;

  async getRating(agencyId: string): Promise<AgencyRating> {
    const s = summarizeRatings(this.forAgency(agencyId).map((r) => r.rating));
    return { agencyId, reviewCount: s.count, average: s.average };
  }

  async listReviews(agencyId: string, limit = 20, offset = 0): Promise<AgencyReview[]> {
    return this.forAgency(agencyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: r.reviewerName,
      }));
  }

  async getMyReview(agencyId: string): Promise<MyReview | null> {
    const r = this.mine(agencyId);
    return r
      ? {
          id: r.id,
          agencyId,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      : null;
  }

  async submitReview(agencyId: string, rating: number, comment?: string): Promise<MyReview> {
    const trimmed = comment?.trim() ? comment.trim() : undefined;
    const now = new Date().toISOString();
    const existing = this.mine(agencyId);
    if (existing) {
      existing.rating = rating;
      existing.comment = trimmed;
      existing.updatedAt = now;
      return this.toMine(existing);
    }
    const row: Stored = {
      id: `rv-${++this.seq}`,
      agencyId,
      reviewerId: SELF,
      reviewerName: 'Vos',
      rating,
      comment: trimmed,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return this.toMine(row);
  }

  async deleteReview(agencyId: string): Promise<void> {
    this.rows = this.rows.filter((r) => !(r.agencyId === agencyId && r.reviewerId === SELF));
  }

  private forAgency(agencyId: string): Stored[] {
    return this.rows.filter((r) => r.agencyId === agencyId);
  }

  private mine(agencyId: string): Stored | undefined {
    return this.rows.find((r) => r.agencyId === agencyId && r.reviewerId === SELF);
  }

  private toMine(r: Stored): MyReview {
    return {
      id: r.id,
      agencyId: r.agencyId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
