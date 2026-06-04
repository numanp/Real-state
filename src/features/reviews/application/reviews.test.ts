import { describe, expect, it } from 'vitest';
import { ReviewsService } from '@/features/reviews/application/reviews-service';
import { InMemoryReviewsRepository } from '@/features/reviews/infrastructure/in-memory-reviews-repository';

const AGENCY = 'ag-1';

function setup() {
  const repo = new InMemoryReviewsRepository();
  return { repo, reviews: new ReviewsService(repo) };
}

describe('ReviewsService', () => {
  it('submits a valid review and reflects it in rating + my review', async () => {
    const { reviews } = setup();
    const row = await reviews.submitReview(AGENCY, 5, '  Excelente  ');
    expect(row.rating).toBe(5);

    const mine = await reviews.getMyReview(AGENCY);
    expect(mine?.rating).toBe(5);

    const rating = await reviews.getRating(AGENCY);
    expect(rating.reviewCount).toBe(1);
    expect(rating.average).toBe(5);
  });

  it('rejects an out-of-range rating BEFORE touching the repository', async () => {
    const { reviews } = setup();
    await expect(reviews.submitReview(AGENCY, 6)).rejects.toMatchObject({ code: 'invalid_rating' });
    await expect(reviews.submitReview(AGENCY, 0)).rejects.toMatchObject({ code: 'invalid_rating' });
    await expect(reviews.submitReview(AGENCY, 3.5)).rejects.toMatchObject({ code: 'invalid_rating' });
    expect(await reviews.getMyReview(AGENCY)).toBeNull();
  });

  it('rejects a comment longer than the limit', async () => {
    const { reviews } = setup();
    await expect(reviews.submitReview(AGENCY, 4, 'x'.repeat(1001))).rejects.toMatchObject({
      code: 'comment_too_long',
    });
    expect(await reviews.getMyReview(AGENCY)).toBeNull();
  });

  it('re-submitting edits the same review (upsert, no duplicate)', async () => {
    const { reviews } = setup();
    await reviews.submitReview(AGENCY, 5);
    await reviews.submitReview(AGENCY, 3);

    const rating = await reviews.getRating(AGENCY);
    expect(rating.reviewCount).toBe(1);
    expect(rating.average).toBe(3);
  });

  it('lists reviews without exposing any reviewer id', async () => {
    const { reviews } = setup();
    await reviews.submitReview(AGENCY, 4, 'buena');
    const list = await reviews.listReviews(AGENCY);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('reviewerId');
    expect(typeof list[0].reviewerName).toBe('string');
  });

  it('deletes the caller review', async () => {
    const { reviews } = setup();
    await reviews.submitReview(AGENCY, 5);
    await reviews.deleteReview(AGENCY);
    expect(await reviews.getMyReview(AGENCY)).toBeNull();
    const rating = await reviews.getRating(AGENCY);
    expect(rating.reviewCount).toBe(0);
    expect(rating.average).toBeNull();
  });
});
