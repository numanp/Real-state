import type { FavoritesRepository } from '@/features/favorites/domain/ports/favorites-repository';

export class FavoritesService {
  constructor(private readonly repo: FavoritesRepository) {}

  /** Toggle the like; returns the resulting liked state. */
  async toggle(userId: string, propertyId: string): Promise<boolean> {
    if (await this.repo.isLiked(userId, propertyId)) {
      await this.repo.unlike(userId, propertyId);
      return false;
    }
    await this.repo.like(userId, propertyId);
    return true;
  }

  isLiked(userId: string, propertyId: string): Promise<boolean> {
    return this.repo.isLiked(userId, propertyId);
  }

  list(userId: string): Promise<string[]> {
    return this.repo.listLikedIds(userId);
  }
}
