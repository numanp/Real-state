import type { CreateListingInput, ListingSummary } from '@/features/listings/domain/entities/listing';

export interface ListingsRepository {
  /** Create a property owned by the user; returns the new property id. */
  create(userId: string, input: CreateListingInput): Promise<string>;
  listMine(userId: string): Promise<ListingSummary[]>;
}
