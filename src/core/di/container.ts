import { SignInWithEmail } from '@/features/auth/application/sign-in-with-email';
import { SignOut } from '@/features/auth/application/sign-out';
import { SignUpWithEmail } from '@/features/auth/application/sign-up-with-email';
import { InMemoryAuthRepository } from '@/features/auth/infrastructure/in-memory-auth-repository';
import { FavoritesService } from '@/features/favorites/application/favorites-service';
import { InMemoryFavoritesRepository } from '@/features/favorites/infrastructure/in-memory-favorites-repository';
import { GetFeedPage } from '@/features/feed/application/get-feed-page';
import { InMemoryFeedRepository } from '@/features/feed/infrastructure/in-memory-feed-repository';
import { MOCK_FEED } from '@/features/feed/infrastructure/mock-feed-data';
import { FoldersService } from '@/features/folders/application/folders-service';
import { InMemoryFoldersRepository } from '@/features/folders/infrastructure/in-memory-folders-repository';
import { GetProperty } from '@/features/properties/application/get-property';
import { InMemoryPropertyRepository } from '@/features/properties/infrastructure/in-memory-property-repository';
import { MOCK_PROPERTIES } from '@/features/properties/infrastructure/mock-property-data';

/*
  Composition root. The UI resolves use-cases/services from here — it never news
  up a repository itself. To go live, swap the In-Memory repositories for the
  Supabase ones on these lines; nothing upstream changes.
*/
const feedRepository = new InMemoryFeedRepository(MOCK_FEED);
const authRepository = new InMemoryAuthRepository();
const favoritesRepository = new InMemoryFavoritesRepository();
const foldersRepository = new InMemoryFoldersRepository();
const propertyRepository = new InMemoryPropertyRepository(MOCK_PROPERTIES);

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
} as const;
