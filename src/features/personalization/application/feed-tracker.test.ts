import { describe, expect, it, vi } from 'vitest';

import { FeedTracker } from '@/features/personalization/application/feed-tracker';
import type { FeedEvent } from '@/features/personalization/domain/entities/feed-event';
import type { FeedEventsRepository } from '@/features/personalization/domain/ports/feed-events-repository';
import { InMemoryFeedEventsRepository } from '@/features/personalization/infrastructure/in-memory-feed-events-repository';

function event(type: FeedEvent['type'], id = 'p1'): FeedEvent {
  return { userId: 'u1', propertyId: id, type, at: '2026-06-01T00:00:00.000Z' };
}

describe('FeedTracker', () => {
  it('buffers events without flushing below the threshold', async () => {
    const repo = new InMemoryFeedEventsRepository();
    const tracker = new FeedTracker(repo, 3);
    tracker.track(event('view'));
    tracker.track(event('like'));
    expect(repo.events).toHaveLength(0);
    expect(tracker.pending()).toBe(2);
  });

  it('auto-flushes when the buffer reaches the threshold', async () => {
    const repo = new InMemoryFeedEventsRepository();
    const tracker = new FeedTracker(repo, 3);
    tracker.track(event('view'));
    tracker.track(event('pass'));
    tracker.track(event('like'));
    await tracker.flush(); // settle any in-flight auto-flush
    expect(repo.events).toHaveLength(3);
    expect(tracker.pending()).toBe(0);
  });

  it('flushes the buffer on demand and clears it', async () => {
    const repo = new InMemoryFeedEventsRepository();
    const tracker = new FeedTracker(repo, 100);
    tracker.track(event('save'));
    await tracker.flush();
    expect(repo.events).toHaveLength(1);
    expect(tracker.pending()).toBe(0);
  });

  it('does nothing when flushing an empty buffer', async () => {
    const repo = new InMemoryFeedEventsRepository();
    const spy = vi.spyOn(repo, 'record');
    const tracker = new FeedTracker(repo, 10);
    await tracker.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('never throws if the repository fails, and clears the buffer', async () => {
    const repo: FeedEventsRepository = {
      record: vi.fn().mockRejectedValue(new Error('network')),
    };
    const tracker = new FeedTracker(repo, 100);
    tracker.track(event('view'));
    await expect(tracker.flush()).resolves.toBeUndefined();
    expect(tracker.pending()).toBe(0);
  });
});
