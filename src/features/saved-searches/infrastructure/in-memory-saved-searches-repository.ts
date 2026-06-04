import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';
import type { SavedSearchesRepository } from '@/features/saved-searches/domain/ports/saved-searches-repository';

export class InMemorySavedSearchesRepository implements SavedSearchesRepository {
  private readonly byUser = new Map<string, SavedSearch[]>();
  private counter = 0;

  private of(userId: string): SavedSearch[] {
    let list = this.byUser.get(userId);
    if (!list) {
      list = [];
      this.byUser.set(userId, list);
    }
    return list;
  }

  async list(userId: string): Promise<SavedSearch[]> {
    return [...this.of(userId)];
  }

  async create(userId: string, name: string, filters: FeedFilters): Promise<SavedSearch> {
    this.counter += 1;
    const search: SavedSearch = {
      id: `ss-${this.counter}`,
      name,
      filters,
      createdAt: new Date(0).toISOString(),
    };
    this.of(userId).push(search);
    return search;
  }

  async remove(userId: string, id: string): Promise<void> {
    const list = this.of(userId);
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }

  // Offline has no published-after-seen feed, so there are no "new" matches.
  async alertCounts(): Promise<Record<string, number>> {
    return {};
  }

  async markSeen(): Promise<void> {}
}
