import type {
  AgencyRating,
  AgencyReview,
  MyReview,
} from '@/features/reviews/domain/entities/review';

export type ReviewErrorCode =
  | 'invalid_rating'
  | 'comment_too_long'
  | 'agency_not_found'
  | 'auth_required';

export class ReviewError extends Error {
  constructor(
    public readonly code: ReviewErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ReviewError';
  }
}

/**
 * Agency reviews port. Reads are public (rating + list); writes bind to the
 * caller server-side. The in-memory mirror of the RPC-only access model
 * (submit/delete scoped to auth.uid(), list omits reviewer_id — see 0021/0022).
 */
export interface ReviewsRepository {
  /** Public aggregate (avg + count) for the rating badge. */
  getRating(agencyId: string): Promise<AgencyRating>;
  /** Public, newest-first reviews page. Never exposes reviewer ids. */
  listReviews(agencyId: string, limit?: number, offset?: number): Promise<AgencyReview[]>;
  /** The caller's own review, or null. */
  getMyReview(agencyId: string): Promise<MyReview | null>;
  /** Create or EDIT the caller's review (upsert). Returns the stored row. */
  submitReview(agencyId: string, rating: number, comment?: string): Promise<MyReview>;
  /** Remove the caller's own review. Idempotent. */
  deleteReview(agencyId: string): Promise<void>;
}
