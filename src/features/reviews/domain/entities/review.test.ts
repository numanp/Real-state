import { describe, expect, it } from 'vitest';
import {
  mapAgencyRating,
  mapMyReview,
  mapReview,
  mapReviews,
  summarizeRatings,
} from '@/features/reviews/domain/entities/review';

describe('mapAgencyRating', () => {
  it('maps the get_agency_rating jsonb (snake_case) to the domain shape', () => {
    const r = mapAgencyRating({
      agency_id: 'ag-1',
      name: 'Inmobiliaria Horizonte',
      logo_path: 'agencies/h/logo.webp',
      review_count: 3,
      average: 4.33,
    });
    expect(r).toEqual({
      agencyId: 'ag-1',
      name: 'Inmobiliaria Horizonte',
      logoPath: 'agencies/h/logo.webp',
      reviewCount: 3,
      average: 4.33,
    });
  });

  it('coerces a numeric-string average (Postgres numeric over JSON)', () => {
    expect(mapAgencyRating({ agency_id: 'ag-1', review_count: 2, average: '4.50' }).average).toBe(4.5);
  });

  it('fails closed: no reviews → count 0, average null', () => {
    const r = mapAgencyRating({ agency_id: 'ag-1', review_count: 0, average: null });
    expect(r.reviewCount).toBe(0);
    expect(r.average).toBeNull();
  });

  it('fails closed on null/garbage input', () => {
    expect(mapAgencyRating(null).reviewCount).toBe(0);
    expect(mapAgencyRating(undefined).average).toBeNull();
  });
});

describe('mapReview / mapReviews', () => {
  it('maps a public review row and never expects reviewer_id', () => {
    const r = mapReview({
      id: 'rv-1',
      rating: 5,
      comment: 'Excelente',
      created_at: '2026-06-04T00:00:00Z',
      reviewer_name: 'Numa',
    });
    expect(r).toEqual({
      id: 'rv-1',
      rating: 5,
      comment: 'Excelente',
      createdAt: '2026-06-04T00:00:00Z',
      reviewerName: 'Numa',
    });
  });

  it('defaults a missing reviewer_name to "Usuario"', () => {
    expect(mapReview({ id: 'rv-1', rating: 4 }).reviewerName).toBe('Usuario');
  });

  it('mapReviews maps an array and tolerates non-arrays', () => {
    expect(mapReviews([{ id: 'a', rating: 3, reviewer_name: 'X' }])).toHaveLength(1);
    expect(mapReviews(null)).toEqual([]);
    expect(mapReviews(undefined)).toEqual([]);
  });
});

describe('mapMyReview', () => {
  it('returns null when the caller has no review', () => {
    expect(mapMyReview(null)).toBeNull();
    expect(mapMyReview(undefined)).toBeNull();
    expect(mapMyReview({})).toBeNull();
  });

  it('maps the caller own review', () => {
    const r = mapMyReview({
      id: 'rv-1',
      agency_id: 'ag-1',
      rating: 2,
      comment: 'meh',
      created_at: '2026-06-04T00:00:00Z',
      updated_at: '2026-06-04T01:00:00Z',
    });
    expect(r).toEqual({
      id: 'rv-1',
      agencyId: 'ag-1',
      rating: 2,
      comment: 'meh',
      createdAt: '2026-06-04T00:00:00Z',
      updatedAt: '2026-06-04T01:00:00Z',
    });
  });
});

describe('summarizeRatings', () => {
  it('empty → count 0, average null, all-zero histogram', () => {
    expect(summarizeRatings([])).toEqual({ count: 0, average: null, histogram: [0, 0, 0, 0, 0] });
  });

  it('computes count, average (2-decimal) and a 1..5 histogram', () => {
    const s = summarizeRatings([5, 5, 2]);
    expect(s.count).toBe(3);
    expect(s.average).toBe(4); // (5+5+2)/3 = 4
    expect(s.histogram).toEqual([0, 1, 0, 0, 2]); // one ★2, two ★5
  });

  it('rounds the average to two decimals', () => {
    expect(summarizeRatings([5, 4, 4]).average).toBe(4.33);
  });

  it('ignores out-of-range and non-integer ratings (fail-closed)', () => {
    const s = summarizeRatings([0, 6, 3.5, -1, 4, 4]);
    expect(s.count).toBe(2);
    expect(s.average).toBe(4);
    expect(s.histogram).toEqual([0, 0, 0, 2, 0]);
  });
});
