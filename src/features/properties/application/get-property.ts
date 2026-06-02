import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import type { PropertyRepository } from '@/features/properties/domain/ports/property-repository';

export class GetProperty {
  constructor(private readonly repo: PropertyRepository) {}

  execute(id: string): Promise<PropertyDetail | null> {
    return this.repo.getById(id);
  }
}
