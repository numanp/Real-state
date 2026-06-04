import type { FeedEvent } from '@/features/personalization/domain/entities/feed-event';
import type { FeedEventsRepository } from '@/features/personalization/domain/ports/feed-events-repository';

export class InMemoryFeedEventsRepository implements FeedEventsRepository {
  readonly events: FeedEvent[] = [];

  async record(events: FeedEvent[]): Promise<void> {
    this.events.push(...events);
  }
}
