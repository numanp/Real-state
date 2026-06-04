import { supabase } from '@/core/supabase/client';
import {
  type AgencyRating,
  type AgencyReview,
  mapAgencyRating,
  mapMyReview,
  mapReviews,
  type MyReview,
} from '@/features/reviews/domain/entities/review';
import type { ReviewsRepository } from '@/features/reviews/domain/ports/reviews-repository';

/** Reads/writes agency reviews through the 0021 RPCs. The table is unreachable
 *  directly (0022): reads come from get_agency_rating/get_agency_reviews (which
 *  never return reviewer_id) and writes from submit/delete (bound to auth.uid()
 *  server-side). A patched client cannot read who reviewed or write as someone
 *  else — the RPC contract IS the gate. */
export class SupabaseReviewsRepository implements ReviewsRepository {
  async getRating(agencyId: string): Promise<AgencyRating> {
    const { data, error } = await supabase.rpc('get_agency_rating', { p_agency_id: agencyId });
    if (error) throw new Error(`reviews.getRating: ${error.message}`);
    return mapAgencyRating(data);
  }

  async listReviews(agencyId: string, limit = 20, offset = 0): Promise<AgencyReview[]> {
    const { data, error } = await supabase.rpc('get_agency_reviews', {
      p_agency_id: agencyId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`reviews.listReviews: ${error.message}`);
    return mapReviews(data);
  }

  async getMyReview(agencyId: string): Promise<MyReview | null> {
    const { data, error } = await supabase.rpc('get_my_agency_review', { p_agency_id: agencyId });
    if (error) throw new Error(`reviews.getMyReview: ${error.message}`);
    return mapMyReview(data);
  }

  async submitReview(agencyId: string, rating: number, comment?: string): Promise<MyReview> {
    const { data, error } = await supabase.rpc('submit_agency_review', {
      p_agency_id: agencyId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw new Error(`reviews.submitReview: ${error.message}`);
    // The RPC returns ONLY safe columns (no reviewer_id) as a jsonb object.
    const mine = mapMyReview(data);
    if (!mine) throw new Error('reviews.submitReview: empty response');
    return mine;
  }

  async deleteReview(agencyId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_agency_review', { p_agency_id: agencyId });
    if (error) throw new Error(`reviews.deleteReview: ${error.message}`);
  }
}
