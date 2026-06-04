import { describe, expect, it } from 'vitest';

import { parseFeedFilters } from '@/features/feed/domain/feed-filters';

describe('parseFeedFilters', () => {
  it('passes through a fully valid filter set', () => {
    const f = { operation: 'rent', minBedrooms: 2, city: 'Palermo', currency: 'USD', maxPriceCents: 500_000 };
    expect(parseFeedFilters(f)).toEqual(f);
  });

  it('drops invalid fields per-field, not all-or-nothing', () => {
    expect(
      parseFeedFilters({ operation: 'lease', minBedrooms: 'abc', city: 'CABA', maxPriceCents: -5 }),
    ).toEqual({ city: 'CABA' });
  });

  it('trims strings and drops empty/whitespace ones', () => {
    expect(parseFeedFilters({ city: '  Recoleta  ', currency: '   ' })).toEqual({ city: 'Recoleta' });
  });

  it('strips unknown keys', () => {
    expect(parseFeedFilters({ operation: 'buy', injected: 'x' })).toEqual({ operation: 'buy' });
  });

  it('returns {} for nullish or non-object input', () => {
    expect(parseFeedFilters(null)).toEqual({});
    expect(parseFeedFilters(undefined)).toEqual({});
    expect(parseFeedFilters('nope')).toEqual({});
  });
});
