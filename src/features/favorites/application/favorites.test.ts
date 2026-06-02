import { describe, expect, it } from 'vitest';

import { FavoritesService } from '@/features/favorites/application/favorites-service';
import { InMemoryFavoritesRepository } from '@/features/favorites/infrastructure/in-memory-favorites-repository';

const USER = 'user-1';

function setup() {
  const repo = new InMemoryFavoritesRepository();
  return { repo, favorites: new FavoritesService(repo) };
}

describe('FavoritesService', () => {
  it('toggles a like on and off', async () => {
    const { favorites } = setup();
    expect(await favorites.toggle(USER, 'p1')).toBe(true);
    expect(await favorites.isLiked(USER, 'p1')).toBe(true);
    expect(await favorites.toggle(USER, 'p1')).toBe(false);
    expect(await favorites.isLiked(USER, 'p1')).toBe(false);
  });

  it('lists the liked property ids', async () => {
    const { favorites } = setup();
    await favorites.toggle(USER, 'p1');
    await favorites.toggle(USER, 'p2');
    expect((await favorites.list(USER)).sort()).toEqual(['p1', 'p2']);
  });

  it('keeps likes isolated per user', async () => {
    const { favorites } = setup();
    await favorites.toggle('a', 'p1');
    expect(await favorites.isLiked('a', 'p1')).toBe(true);
    expect(await favorites.isLiked('b', 'p1')).toBe(false);
  });
});
