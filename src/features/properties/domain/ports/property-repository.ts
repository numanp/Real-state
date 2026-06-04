import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

export interface PropertyRepository {
  getById(id: string): Promise<PropertyDetail | null>;
  /** Batch-resolve many ids in a single round-trip (avoids N+1). Order/missing
   *  ids are reconciled by the caller (GetProperty.executeMany). */
  getByIds(ids: string[]): Promise<PropertyDetail[]>;
}
