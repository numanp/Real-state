import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

export interface PropertyRepository {
  getById(id: string): Promise<PropertyDetail | null>;
}
