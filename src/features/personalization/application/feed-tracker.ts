import type { FeedEvent } from '@/features/personalization/domain/entities/feed-event';
import type { FeedEventsRepository } from '@/features/personalization/domain/ports/feed-events-repository';

const DEFAULT_FLUSH_AT = 12;

/**
 * Buffers feed signals and flushes them in batches, so the feed makes one write
 * per ~dozen swipes instead of one per swipe. Best-effort: a failed flush never
 * throws and clears the buffer — dropping telemetry is acceptable, blocking the
 * 60fps scroll is not.
 */
export class FeedTracker {
  private buffer: FeedEvent[] = [];

  constructor(
    private readonly repo: FeedEventsRepository,
    private readonly flushAt: number = DEFAULT_FLUSH_AT,
  ) {}

  track(event: FeedEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.flushAt) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await this.repo.record(batch);
    } catch {
      // best-effort telemetry — never surface to the UI
    }
  }

  pending(): number {
    return this.buffer.length;
  }
}
