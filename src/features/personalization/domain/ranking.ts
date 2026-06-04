import type { FeedItem } from '@/features/feed/domain/entities/feed-item';

/**
 * A lightweight content-based taste profile built from the user's positive
 * (like/save/super-like) and negative (pass) signals. No ML model — affinity
 * over the structured features we already have. The Supabase/pgvector path can
 * replace this later behind the same `rankFeed` boundary.
 */
export interface TasteProfile {
  operation: Record<'buy' | 'rent', number>;
  cities: Record<string, number>;
  bedroomsMean: number | null;
  priceMeanByCurrency: Record<string, number>;
  sampleSize: number;
}

const WEIGHTS = { operation: 0.3, city: 0.35, bedrooms: 0.15, price: 0.2 };

export function buildTasteProfile(positives: FeedItem[], negatives: FeedItem[]): TasteProfile {
  const operation: Record<'buy' | 'rent', number> = { buy: 0, rent: 0 };
  const cities: Record<string, number> = {};

  const accumulate = (items: FeedItem[], sign: number) => {
    for (const it of items) {
      operation[it.operation] += sign;
      const city = it.location.city;
      if (city) cities[city] = (cities[city] ?? 0) + sign;
    }
  };
  accumulate(positives, 1);
  accumulate(negatives, -1);

  const beds = positives.map((p) => p.specs.bedrooms);
  const bedroomsMean = beds.length ? beds.reduce((a, b) => a + b, 0) / beds.length : null;

  const priceAgg: Record<string, { sum: number; n: number }> = {};
  for (const p of positives) {
    const cur = p.price.currency;
    const agg = (priceAgg[cur] ??= { sum: 0, n: 0 });
    agg.sum += p.price.amountCents;
    agg.n += 1;
  }
  const priceMeanByCurrency: Record<string, number> = {};
  for (const [cur, { sum, n }] of Object.entries(priceAgg)) priceMeanByCurrency[cur] = sum / n;

  return {
    operation,
    cities,
    bedroomsMean,
    priceMeanByCurrency,
    sampleSize: positives.length + negatives.length,
  };
}

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

/** Affinity score for a candidate. 0 = neutral (no signal); higher = better match. */
export function scoreItem(profile: TasteProfile, item: FeedItem): number {
  if (profile.sampleSize === 0) return 0;
  const denom = Math.max(1, profile.sampleSize);

  const opAffinity = clampUnit(profile.operation[item.operation] / denom);
  const cityAffinity = clampUnit((profile.cities[item.location.city] ?? 0) / denom);

  let bedProximity = 0;
  if (profile.bedroomsMean != null) {
    bedProximity = 1 - Math.min(1, Math.abs(item.specs.bedrooms - profile.bedroomsMean) / 3);
  }

  let priceProximity = 0;
  const mean = profile.priceMeanByCurrency[item.price.currency];
  if (mean && mean > 0) {
    priceProximity = 1 - Math.min(1, Math.abs(item.price.amountCents - mean) / mean);
  }

  return (
    WEIGHTS.operation * opAffinity +
    WEIGHTS.city * cityAffinity +
    WEIGHTS.bedrooms * bedProximity +
    WEIGHTS.price * priceProximity
  );
}

/** Stable sort by descending affinity. No-op (preserves order) without signals. */
export function rankFeed(items: FeedItem[], profile: TasteProfile): FeedItem[] {
  if (profile.sampleSize === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreItem(profile, item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}
