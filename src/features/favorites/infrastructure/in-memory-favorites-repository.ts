import type { FavoritesRepository } from '@/features/favorites/domain/ports/favorites-repository';

export class InMemoryFavoritesRepository implements FavoritesRepository {
  private readonly byUser = new Map<string, Set<string>>();

  private setFor(userId: string): Set<string> {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set<string>();
      this.byUser.set(userId, set);
    }
    return set;
  }

  async isLiked(userId: string, propertyId: string): Promise<boolean> {
    return this.byUser.get(userId)?.has(propertyId) ?? false;
  }

  async listLikedIds(userId: string): Promise<string[]> {
    return [...(this.byUser.get(userId) ?? [])];
  }

  async like(userId: string, propertyId: string): Promise<void> {
    this.setFor(userId).add(propertyId);
  }

  async unlike(userId: string, propertyId: string): Promise<void> {
    this.byUser.get(userId)?.delete(propertyId);
  }
}
