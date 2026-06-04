import type { FeedEvent } from '@/features/personalization/domain/entities/feed-event';

export interface FeedEventsRepository {
  /** Persist a batch of events. Best-effort telemetry — implementations should
   *  be cheap and tolerant. */
  record(events: FeedEvent[]): Promise<void>;
}
