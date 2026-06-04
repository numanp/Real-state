import { supabase } from '@/core/supabase/client';
import type { FeedEvent } from '@/features/personalization/domain/entities/feed-event';
import type { FeedEventsRepository } from '@/features/personalization/domain/ports/feed-events-repository';

export class SupabaseFeedEventsRepository implements FeedEventsRepository {
  async record(events: FeedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((e) => ({
      user_id: e.userId,
      property_id: e.propertyId,
      event_type: e.type,
      dwell_ms: e.dwellMs ?? null,
      position: e.position ?? null,
      created_at: e.at,
    }));
    const { error } = await supabase.from('feed_events').insert(rows);
    if (error) throw new Error(`feed_events.record: ${error.message}`);
  }
}
