import { describe, expect, it } from 'vitest';

import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { buildTasteProfile, rankFeed, scoreItem } from '@/features/personalization/domain/ranking';

function item(
  id: string,
  operation: 'buy' | 'rent',
  city: string,
  bedrooms: number,
  price: number,
  currency = 'USD',
): FeedItem {
  return {
    id,
    title: id,
    operation,
    price: { amountCents: price * 100, currency, period: operation === 'rent' ? 'monthly' : 'once' },
    location: { city },
    specs: { bedrooms, bathrooms: 1 },
    primaryReel: { id: `${id}-r`, mediaType: 'image_set', posterUrl: 'p', sources: ['p'] },
    counts: { likes: 0, saves: 0 },
    publishedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('ranking', () => {
  it('gives a neutral score when there are no signals', () => {
    const profile = buildTasteProfile([], []);
    expect(scoreItem(profile, item('a', 'buy', 'BA', 2, 100000))).toBe(0);
  });

  it('scores items matching the liked operation + city higher than mismatches', () => {
    const positives = [
      item('p1', 'buy', 'Buenos Aires', 2, 150000),
      item('p2', 'buy', 'Buenos Aires', 3, 200000),
    ];
    const negatives = [item('n1', 'rent', 'São Paulo', 1, 1000, 'BRL')];
    const profile = buildTasteProfile(positives, negatives);

    const match = item('c1', 'buy', 'Buenos Aires', 2, 160000);
    const mismatch = item('c2', 'rent', 'São Paulo', 1, 900, 'BRL');
    expect(scoreItem(profile, match)).toBeGreaterThan(scoreItem(profile, mismatch));
  });

  it('ranks the feed by descending affinity', () => {
    const profile = buildTasteProfile([item('p1', 'rent', 'Rosario', 1, 300000, 'ARS')], []);
    const items = [
      item('far', 'buy', 'Buenos Aires', 4, 500000),
      item('near', 'rent', 'Rosario', 1, 320000, 'ARS'),
      item('mid', 'rent', 'Córdoba', 2, 310000, 'ARS'),
    ];
    expect(rankFeed(items, profile).map((i) => i.id)).toEqual(['near', 'mid', 'far']);
  });

  it('is a stable no-op when there is no signal', () => {
    const profile = buildTasteProfile([], []);
    const items = [item('a', 'buy', 'X', 1, 1), item('b', 'rent', 'Y', 2, 2)];
    expect(rankFeed(items, profile).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
