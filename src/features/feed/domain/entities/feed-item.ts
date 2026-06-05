/**
 * A single property as it appears in the vertical feed: its key facts plus the
 * PRIMARY reel shown in the viewport. The full "knowledge library" lives in the
 * ficha (loaded on tap), not here — the feed item stays light for 60fps.
 */
export type Operation = 'buy' | 'rent';

export type ReelMediaType = 'video' | 'image_set';

export interface ReelMedia {
  id: string;
  mediaType: ReelMediaType;
  /** Poster/thumbnail shown instantly (blurhash-backed) before media loads. */
  posterUrl?: string;
  /** Video source(s), or the ordered images of an image-set reel. */
  sources: string[];
  blurhash?: string;
  durationMs?: number;
  /** width/height ratio (e.g. 0.5625 = 9:16). Required for CLS-free layout. */
  aspectRatio?: number;
  /** Short author caption shown over the reel (optional). */
  caption?: string;
}

export interface FeedItemPrice {
  amountCents: number;
  currency: string;
  period: 'once' | 'monthly';
}

export interface FeedItem {
  id: string;
  title: string;
  operation: Operation;
  price: FeedItemPrice;
  location: { neighborhood?: string; city: string };
  specs: { bedrooms: number; bathrooms: number; areaSqm?: number; parking?: number };
  primaryReel: ReelMedia;
  counts: { likes: number; saves: number };
  /** Ordering key for keyset pagination (ISO 8601); also powers "published Xh ago". */
  publishedAt: string;
}
