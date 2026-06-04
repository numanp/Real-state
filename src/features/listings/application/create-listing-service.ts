import { z } from 'zod';

import type { ListingSummary } from '@/features/listings/domain/entities/listing';
import type { ListingsRepository } from '@/features/listings/domain/ports/listings-repository';

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  operation: z.enum(['buy', 'rent']),
  kind: z.enum(['house', 'apartment', 'studio', 'land', 'commercial']),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  areaSqm: z.number().positive().optional(),
  city: z.string().trim().min(1),
  region: z.string().trim().optional(),
  description: z.string().trim().max(2000).optional(),
});

export type ValidatedListing = z.infer<typeof schema>;

export class CreateListingService {
  constructor(private readonly repo: ListingsRepository) {}

  async create(userId: string, input: unknown): Promise<string> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error('invalid_listing');
    return this.repo.create(userId, parsed.data);
  }

  listMine(userId: string): Promise<ListingSummary[]> {
    return this.repo.listMine(userId);
  }
}
