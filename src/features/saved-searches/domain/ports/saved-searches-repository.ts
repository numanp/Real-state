import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';

export interface SavedSearchesRepository {
  list(userId: string): Promise<SavedSearch[]>;
  create(userId: string, name: string, filters: FeedFilters): Promise<SavedSearch>;
  remove(userId: string, id: string): Promise<void>;
}
