import { isSupabaseConfigured } from '@/core/config/env';
import { SignInWithEmail } from '@/features/auth/application/sign-in-with-email';
import { SignOut } from '@/features/auth/application/sign-out';
import { SignUpWithEmail } from '@/features/auth/application/sign-up-with-email';
import { InMemoryAuthRepository } from '@/features/auth/infrastructure/in-memory-auth-repository';
import { SupabaseAuthRepository } from '@/features/auth/infrastructure/supabase-auth-repository';
import { FavoritesService } from '@/features/favorites/application/favorites-service';
import { InMemoryFavoritesRepository } from '@/features/favorites/infrastructure/in-memory-favorites-repository';
import { SupabaseFavoritesRepository } from '@/features/favorites/infrastructure/supabase-favorites-repository';
import { GetFeedPage } from '@/features/feed/application/get-feed-page';
import { InMemoryFeedRepository } from '@/features/feed/infrastructure/in-memory-feed-repository';
import { MOCK_FEED } from '@/features/feed/infrastructure/mock-feed-data';
import { SupabaseFeedRepository } from '@/features/feed/infrastructure/supabase-feed-repository';
import { FoldersService } from '@/features/folders/application/folders-service';
import { InMemoryFoldersRepository } from '@/features/folders/infrastructure/in-memory-folders-repository';
import { SupabaseFoldersRepository } from '@/features/folders/infrastructure/supabase-folders-repository';
import { FeedTracker } from '@/features/personalization/application/feed-tracker';
import { InMemoryFeedEventsRepository } from '@/features/personalization/infrastructure/in-memory-feed-events-repository';
import { SupabaseFeedEventsRepository } from '@/features/personalization/infrastructure/supabase-feed-events-repository';
import { GetProperty } from '@/features/properties/application/get-property';
import { SavedSearchesService } from '@/features/saved-searches/application/saved-searches-service';
import { InMemorySavedSearchesRepository } from '@/features/saved-searches/infrastructure/in-memory-saved-searches-repository';
import { SupabaseSavedSearchesRepository } from '@/features/saved-searches/infrastructure/supabase-saved-searches-repository';
import { InMemoryPropertyRepository } from '@/features/properties/infrastructure/in-memory-property-repository';
import { MOCK_PROPERTIES } from '@/features/properties/infrastructure/mock-property-data';
import { SupabasePropertyRepository } from '@/features/properties/infrastructure/supabase-property-repository';

/*
  Composition root — the single place repositories are chosen.
  - With a real .env (isSupabaseConfigured) the app uses the live Supabase backend.
  - Without it, the app runs entirely on in-memory mocks (no DB required).
  Every other layer depends only on the ports, so this switch changes nothing
  upstream.
*/
const useDb = isSupabaseConfigured;

const feedRepository = useDb ? new SupabaseFeedRepository() : new InMemoryFeedRepository(MOCK_FEED);
const propertyRepository = useDb
  ? new SupabasePropertyRepository()
  : new InMemoryPropertyRepository(MOCK_PROPERTIES);
const authRepository = useDb ? new SupabaseAuthRepository() : new InMemoryAuthRepository();
const favoritesRepository = useDb
  ? new SupabaseFavoritesRepository()
  : new InMemoryFavoritesRepository();
const foldersRepository = useDb ? new SupabaseFoldersRepository() : new InMemoryFoldersRepository();
const feedEventsRepository = useDb
  ? new SupabaseFeedEventsRepository()
  : new InMemoryFeedEventsRepository();
const savedSearchesRepository = useDb
  ? new SupabaseSavedSearchesRepository()
  : new InMemorySavedSearchesRepository();

export const container = {
  getFeedPage: new GetFeedPage(feedRepository),
  getProperty: new GetProperty(propertyRepository),
  auth: {
    repository: authRepository,
    signIn: new SignInWithEmail(authRepository),
    signUp: new SignUpWithEmail(authRepository),
    signOut: new SignOut(authRepository),
  },
  favorites: new FavoritesService(favoritesRepository),
  folders: new FoldersService(foldersRepository),
  feedTracker: new FeedTracker(feedEventsRepository),
  savedSearches: new SavedSearchesService(savedSearchesRepository),
} as const;
