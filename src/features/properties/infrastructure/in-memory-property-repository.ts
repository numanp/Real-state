import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import type { PropertyRepository } from '@/features/properties/domain/ports/property-repository';

export class InMemoryPropertyRepository implements PropertyRepository {
  private readonly byId: Map<string, PropertyDetail>;

  constructor(items: PropertyDetail[]) {
    this.byId = new Map(items.map((item) => [item.id, item]));
  }

  async getById(id: string): Promise<PropertyDetail | null> {
    return this.byId.get(id) ?? null;
  }

  async getByIds(ids: string[]): Promise<PropertyDetail[]> {
    return ids.map((id) => this.byId.get(id)).filter((p): p is PropertyDetail => p != null);
  }
}
