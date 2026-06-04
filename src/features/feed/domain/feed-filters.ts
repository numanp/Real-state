import { z } from 'zod';

import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';

// Per-field .catch(undefined) → an invalid field is DROPPED, not the whole set
// (one bad value never wipes the user's other filters). Unknown keys are stripped.
const schema = z.object({
  operation: z.enum(['buy', 'rent']).optional().catch(undefined),
  minBedrooms: z.number().int().nonnegative().optional().catch(undefined),
  city: z.string().trim().min(1).optional().catch(undefined),
  currency: z.string().trim().min(1).optional().catch(undefined),
  maxPriceCents: z.number().int().nonnegative().optional().catch(undefined),
});

/** Coerce/clean a (possibly untrusted) filter object at the feed boundary:
 *  drops invalid fields, trims strings, strips unknown keys. Defense in depth
 *  for filters that arrive as stored jsonb (saved searches) or from the UI. */
export function parseFeedFilters(input: unknown): FeedFilters {
  const result = schema.safeParse(input ?? {});
  return result.success ? result.data : {};
}
