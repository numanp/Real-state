import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';

export interface SavedSearch {
  id: string;
  name: string;
  filters: FeedFilters;
  createdAt: string;
}
