import { describe, expect, it } from 'vitest';

import { DEFAULT_FEED_PAGE_SIZE, GetFeedPage } from '@/features/feed/application/get-feed-page';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { InMemoryFeedRepository } from '@/features/feed/infrastructure/in-memory-feed-repository';

function makeItem(i: number): FeedItem {
  const n = String(i).padStart(2, '0');
  // Item 0 is the NEWEST; each later item is one minute older (stable ids).
  const minute = String(59 - i).padStart(2, '0');
  return {
    id: `prop-${n}`,
    title: `Propiedad ${i}`,
    operation: i % 2 === 0 ? 'buy' : 'rent',
    price: { amountCents: 100_000_00 + i, currency: 'USD', period: 'once' },
    location: { neighborhood: 'Palermo', city: 'Buenos Aires' },
    specs: { bedrooms: 2, bathrooms: 1, areaSqm: 55 },
    primaryReel: { id: `reel-${n}`, mediaType: 'video', posterUrl: 'p', sources: ['s'] },
    counts: { likes: 0, saves: 0 },
    publishedAt: `2026-06-01T10:${minute}:00.000Z`,
  };
}

function feed(n: number) {
  const items = Array.from({ length: n }, (_, i) => makeItem(i));
  return new GetFeedPage(new InMemoryFeedRepository(items));
}

describe('GetFeedPage', () => {
  it('applies the default page size and returns a cursor when more remain', async () => {
    const page = await feed(20).execute();
    expect(page.items).toHaveLength(DEFAULT_FEED_PAGE_SIZE);
    expect(page.nextCursor).not.toBeNull();
  });

  it('orders by publishedAt DESC (newest first)', async () => {
    const page = await feed(20).execute({ pageSize: 3 });
    expect(page.items.map((i) => i.id)).toEqual(['prop-00', 'prop-01', 'prop-02']);
  });

  it('paginates by keyset with no overlap and ends on a null cursor', async () => {
    const useCase = feed(20);
    const p1 = await useCase.execute({ pageSize: 8 });
    const p2 = await useCase.execute({ pageSize: 8, cursor: p1.nextCursor });
    const p3 = await useCase.execute({ pageSize: 8, cursor: p2.nextCursor });

    const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(20); // every item once, no overlap
    expect(p3.items).toHaveLength(4);
    expect(p3.nextCursor).toBeNull();
  });

  it('returns an empty page with a null cursor when there is nothing', async () => {
    const page = await feed(0).execute();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
