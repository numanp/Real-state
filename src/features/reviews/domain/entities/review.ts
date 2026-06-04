/** Agency reviews domain — pure value objects + mappers + aggregation.
 *  No Supabase import: every function here is unit-testable on plain data.
 *  The server (get_agency_rating/get_agency_reviews, 0021) is the source of
 *  truth for the aggregate and NEVER returns reviewer_id — these shapes
 *  mirror that contract. */

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const COMMENT_MAX = 1000;

/** Aggregate rating for an agency (get_agency_rating). */
export interface AgencyRating {
  agencyId: string;
  name?: string;
  logoPath?: string;
  reviewCount: number;
  average: number | null; // null when there are no reviews — never a fake 0
}

/** A single PUBLIC review (get_agency_reviews). Carries the reviewer's public
 *  display name, never reviewer_id. */
export interface AgencyReview {
  id: string;
  rating: number;
  comment?: string;
  createdAt?: string;
  reviewerName: string;
}

/** The caller's OWN review (get_my_agency_review), for edit prefill. */
export interface MyReview {
  id: string;
  agencyId: string;
  rating: number;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Distribution over a loaded set of reviews. histogram[0] → ★1 … [4] → ★5. */
export interface RatingSummary {
  count: number;
  average: number | null;
  histogram: [number, number, number, number, number];
}

const asRecord = (json: unknown): Record<string, unknown> =>
  json && typeof json === 'object' ? (json as Record<string, unknown>) : {};

const str = (j: Record<string, unknown>, k: string): string | undefined =>
  typeof j[k] === 'string' ? (j[k] as string) : undefined;

/** Tolerant numeric read: accepts a JS number or a Postgres numeric-as-string. */
const num = (j: Record<string, unknown>, k: string): number | undefined => {
  const v = j[k];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

export function mapAgencyRating(json: unknown): AgencyRating {
  const j = asRecord(json);
  return {
    agencyId: str(j, 'agency_id') ?? '',
    name: str(j, 'name'),
    logoPath: str(j, 'logo_path'),
    reviewCount: num(j, 'review_count') ?? 0,
    average: num(j, 'average') ?? null,
  };
}

export function mapReview(json: unknown): AgencyReview {
  const j = asRecord(json);
  return {
    id: str(j, 'id') ?? '',
    rating: num(j, 'rating') ?? 0,
    comment: str(j, 'comment'),
    createdAt: str(j, 'created_at'),
    reviewerName: str(j, 'reviewer_name') ?? 'Usuario',
  };
}

export function mapReviews(rows: unknown): AgencyReview[] {
  return Array.isArray(rows) ? rows.map(mapReview) : [];
}

export function mapMyReview(json: unknown): MyReview | null {
  if (json == null) return null;
  const j = asRecord(json);
  const id = str(j, 'id');
  if (!id) return null;
  return {
    id,
    agencyId: str(j, 'agency_id') ?? '',
    rating: num(j, 'rating') ?? 0,
    comment: str(j, 'comment'),
    createdAt: str(j, 'created_at'),
    updatedAt: str(j, 'updated_at'),
  };
}

/** Pure distribution over a loaded page of ratings. Ignores anything that is
 *  not an integer in [1,5] (fail-closed); average is rounded to 2 decimals to
 *  match the server's round(sum/count, 2). */
export function summarizeRatings(ratings: readonly number[]): RatingSummary {
  const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const r of ratings) {
    if (!Number.isInteger(r) || r < MIN_RATING || r > MAX_RATING) continue;
    histogram[r - 1] += 1;
    sum += r;
    count += 1;
  }
  return { count, average: count ? Math.round((sum / count) * 100) / 100 : null, histogram };
}
