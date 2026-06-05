/**
 * Unit tests for the pure feed-mapper: row → FeedItem (storage paths, no live client).
 * TDD RED phase: these fail until feed-mappers.ts is created and rowToFeedItem exported.
 */
import { describe, expect, it } from 'vitest';

import { rowToFeedItem } from '@/features/feed/infrastructure/feed-mappers';

/** Minimal DB row shape that rowToFeedItem accepts. */
function makeVideoRow(overrides: Partial<Parameters<typeof rowToFeedItem>[0]> = {}) {
  return {
    id: 'prop-01',
    title: 'Penthouse Palermo',
    listing_type: 'buy' as const,
    price_cents: 350_000_00,
    currency: 'USD',
    bedrooms: 3,
    bathrooms: 2,
    area_sqm: 120,
    city: 'Buenos Aires',
    like_count: 5,
    save_count: 2,
    published_at: '2026-06-01T12:00:00.000Z',
    // reel fields
    reel_id: 'reel-abc',
    media_type: 'video' as const,
    video_path: 'prop-01/reel-abc/source.mp4',
    poster_path: 'prop-01/reel-abc/poster.webp',
    image_paths: null as string[] | null,
    thumbnail_blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    duration_ms: 12000,
    aspect_ratio: 0.5625,
    caption: 'Luminoso penthouse con terraza',
    ...overrides,
  };
}

function makeImageSetRow(overrides: Partial<Parameters<typeof rowToFeedItem>[0]> = {}) {
  return makeVideoRow({
    media_type: 'image_set' as const,
    video_path: null,
    image_paths: [
      'prop-01/reel-abc/img_0.webp',
      'prop-01/reel-abc/img_1.webp',
      'prop-01/reel-abc/img_2.webp',
    ],
    ...overrides,
  });
}

describe('rowToFeedItem — video reel', () => {
  it('sets mediaType to video', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.mediaType).toBe('video');
  });

  it('sets sources to [video_path]', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.sources).toEqual(['prop-01/reel-abc/source.mp4']);
  });

  it('sets posterUrl to poster_path (storage path, not URL)', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.posterUrl).toBe('prop-01/reel-abc/poster.webp');
  });

  it('sets reel id from reel_id', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.id).toBe('reel-abc');
  });

  it('sets blurhash from thumbnail_blurhash', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.blurhash).toBe('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
  });

  it('sets durationMs from duration_ms', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.durationMs).toBe(12000);
  });

  it('sets aspectRatio from aspect_ratio', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.aspectRatio).toBe(0.5625);
  });

  it('sets caption from caption', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.primaryReel.caption).toBe('Luminoso penthouse con terraza');
  });

  it('does NOT include null poster when poster_path is null', () => {
    const item = rowToFeedItem(makeVideoRow({ poster_path: null }));
    expect(item.primaryReel.posterUrl).toBeUndefined();
  });

  it('does NOT include null caption when caption is null', () => {
    const item = rowToFeedItem(makeVideoRow({ caption: null }));
    expect(item.primaryReel.caption).toBeUndefined();
  });
});

describe('rowToFeedItem — image_set reel', () => {
  it('sets mediaType to image_set', () => {
    const item = rowToFeedItem(makeImageSetRow());
    expect(item.primaryReel.mediaType).toBe('image_set');
  });

  it('sets sources to image_paths array', () => {
    const item = rowToFeedItem(makeImageSetRow());
    expect(item.primaryReel.sources).toEqual([
      'prop-01/reel-abc/img_0.webp',
      'prop-01/reel-abc/img_1.webp',
      'prop-01/reel-abc/img_2.webp',
    ]);
  });

  it('falls back to empty sources when image_paths is null', () => {
    const item = rowToFeedItem(makeImageSetRow({ image_paths: null }));
    expect(item.primaryReel.sources).toEqual([]);
  });
});

describe('rowToFeedItem — property fields', () => {
  it('maps property scalars correctly', () => {
    const item = rowToFeedItem(makeVideoRow());
    expect(item.id).toBe('prop-01');
    expect(item.title).toBe('Penthouse Palermo');
    expect(item.operation).toBe('buy');
    expect(item.price.amountCents).toBe(350_000_00);
    expect(item.price.currency).toBe('USD');
    expect(item.price.period).toBe('once');
    expect(item.location.city).toBe('Buenos Aires');
    expect(item.specs.bedrooms).toBe(3);
    expect(item.specs.bathrooms).toBe(2);
    expect(item.specs.areaSqm).toBe(120);
    expect(item.counts.likes).toBe(5);
    expect(item.counts.saves).toBe(2);
    expect(item.publishedAt).toBe('2026-06-01T12:00:00.000Z');
  });
});
