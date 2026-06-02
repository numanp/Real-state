/**
 * Likes are a per-user set of property ids (the "swipe right"). Keyed by userId
 * everywhere so no user can ever see or mutate another's likes (the in-memory
 * mirror of the RLS rule).
 */
export interface FavoritesRepository {
  isLiked(userId: string, propertyId: string): Promise<boolean>;
  listLikedIds(userId: string): Promise<string[]>;
  like(userId: string, propertyId: string): Promise<void>;
  unlike(userId: string, propertyId: string): Promise<void>;
}
