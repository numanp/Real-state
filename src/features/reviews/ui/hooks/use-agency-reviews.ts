import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type {
  AgencyRating,
  AgencyReview,
  MyReview,
} from '@/features/reviews/domain/entities/review';

/** Wires the reviews port to the UI for a single agency. load() is lazy (call
 *  on sheet open). getMyReview is best-effort — anon callers get a permission
 *  error from the RPC, which we treat as "no review". */
export function useAgencyReviews(agencyId: string | undefined) {
  const [rating, setRating] = useState<AgencyRating | null>(null);
  const [reviews, setReviews] = useState<AgencyReview[]>([]);
  const [myReview, setMyReview] = useState<MyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, list, mine] = await Promise.all([
        container.reviews.getRating(agencyId),
        container.reviews.listReviews(agencyId),
        container.reviews.getMyReview(agencyId).catch(() => null),
      ]);
      setRating(r);
      setReviews(list);
      setMyReview(mine);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  const submit = useCallback(
    async (ratingValue: number, comment?: string) => {
      if (!agencyId) return;
      await container.reviews.submitReview(agencyId, ratingValue, comment);
      await load();
    },
    [agencyId, load],
  );

  const remove = useCallback(async () => {
    if (!agencyId) return;
    await container.reviews.deleteReview(agencyId);
    await load();
  }, [agencyId, load]);

  return { rating, reviews, myReview, loading, error, load, submit, remove };
}
