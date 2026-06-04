import { supabase } from '@/core/supabase/client';
import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';
import type { SavedSearchesRepository } from '@/features/saved-searches/domain/ports/saved-searches-repository';

interface Row {
  id: string;
  name: string;
  filters: FeedFilters | null;
  created_at: string;
}

const COLUMNS = 'id,name,filters,created_at';

function toSearch(r: Row): SavedSearch {
  return { id: r.id, name: r.name, filters: r.filters ?? {}, createdAt: r.created_at };
}

export class SupabaseSavedSearchesRepository implements SavedSearchesRepository {
  async list(_userId: string): Promise<SavedSearch[]> {
    const { data, error } = await supabase
      .from('saved_searches')
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`savedSearches.list: ${error.message}`);
    return (data ?? []).map((r) => toSearch(r as Row));
  }

  async create(userId: string, name: string, filters: FeedFilters): Promise<SavedSearch> {
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({ user_id: userId, name, filters })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`savedSearches.create: ${error.message}`);
    return toSearch(data as Row);
  }

  async remove(_userId: string, id: string): Promise<void> {
    const { error } = await supabase.from('saved_searches').delete().eq('id', id);
    if (error) throw new Error(`savedSearches.remove: ${error.message}`);
  }

  async alertCounts(_userId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('my_saved_search_alerts');
    if (error) throw new Error(`savedSearches.alertCounts: ${error.message}`);
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { saved_search_id: string; new_count: number }[]) {
      out[r.saved_search_id] = r.new_count;
    }
    return out;
  }

  async markSeen(_userId: string, id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_saved_search_seen', { p_saved_search_id: id });
    if (error) throw new Error(`savedSearches.markSeen: ${error.message}`);
  }
}
