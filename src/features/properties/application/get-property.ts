import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import type { PropertyRepository } from '@/features/properties/domain/ports/property-repository';

export class GetProperty {
  constructor(private readonly repo: PropertyRepository) {}

  execute(id: string): Promise<PropertyDetail | null> {
    return this.repo.getById(id);
  }

  /** Resolve a list of ids in ONE round-trip, preserving input order and
   *  dropping ids that no longer resolve. Replaces Promise.all(ids.map(execute)). */
  async executeMany(ids: string[]): Promise<PropertyDetail[]> {
    if (ids.length === 0) return [];
    const found = await this.repo.getByIds(ids);
    const byId = new Map(found.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is PropertyDetail => p != null);
  }
}
