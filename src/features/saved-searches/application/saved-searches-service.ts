import { z } from 'zod';

import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';
import type { SavedSearchesRepository } from '@/features/saved-searches/domain/ports/saved-searches-repository';

const nameSchema = z.string().trim().min(1).max(60);

export class SavedSearchesService {
  constructor(private readonly repo: SavedSearchesRepository) {}

  list(userId: string): Promise<SavedSearch[]> {
    return this.repo.list(userId);
  }

  async create(userId: string, name: string, filters: FeedFilters): Promise<SavedSearch> {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) throw new Error('invalid_name');
    return this.repo.create(userId, parsed.data, filters);
  }

  remove(userId: string, id: string): Promise<void> {
    return this.repo.remove(userId, id);
  }
}
