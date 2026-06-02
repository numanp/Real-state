import { GetFeedPage } from '@/features/feed/application/get-feed-page';
import { InMemoryFeedRepository } from '@/features/feed/infrastructure/in-memory-feed-repository';
import { MOCK_FEED } from '@/features/feed/infrastructure/mock-feed-data';

/*
  Composition root. The UI resolves use-cases from here — it never news up a
  repository itself. To go live, swap InMemoryFeedRepository for
  SupabaseFeedRepository on this ONE line; nothing upstream changes.
*/
const feedRepository = new InMemoryFeedRepository(MOCK_FEED);

export const container = {
  getFeedPage: new GetFeedPage(feedRepository),
} as const;
