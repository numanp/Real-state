import { z } from 'zod';
import {
  type AgencyRating,
  type AgencyReview,
  COMMENT_MAX,
  MAX_RATING,
  MIN_RATING,
  type MyReview,
} from '@/features/reviews/domain/entities/review';
import {
  ReviewError,
  type ReviewsRepository,
} from '@/features/reviews/domain/ports/reviews-repository';

const ratingSchema = z.number().int().min(MIN_RATING).max(MAX_RATING);

/** Thin orchestrator over the reviews port. Validation here is a UX gate
 *  (fail fast, clear errors) — the server RPC re-checks everything and is the
 *  real authority. Reads delegate straight through. */
export class ReviewsService {
  constructor(private readonly repo: ReviewsRepository) {}

  getRating(agencyId: string): Promise<AgencyRating> {
    return this.repo.getRating(agencyId);
  }

  listReviews(agencyId: string, limit?: number, offset?: number): Promise<AgencyReview[]> {
    return this.repo.listReviews(agencyId, limit, offset);
  }

  getMyReview(agencyId: string): Promise<MyReview | null> {
    return this.repo.getMyReview(agencyId);
  }

  async submitReview(agencyId: string, rating: number, comment?: string): Promise<MyReview> {
    if (!ratingSchema.safeParse(rating).success) {
      throw new ReviewError('invalid_rating', `rating must be an integer in [${MIN_RATING}, ${MAX_RATING}]`);
    }
    if (comment != null && comment.length > COMMENT_MAX) {
      throw new ReviewError('comment_too_long', `comment must be <= ${COMMENT_MAX} chars`);
    }
    return this.repo.submitReview(agencyId, rating, comment);
  }

  deleteReview(agencyId: string): Promise<void> {
    return this.repo.deleteReview(agencyId);
  }
}
