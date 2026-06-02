import { SignInWithEmail } from '@/features/auth/application/sign-in-with-email';
import { SignOut } from '@/features/auth/application/sign-out';
import { SignUpWithEmail } from '@/features/auth/application/sign-up-with-email';
import { InMemoryAuthRepository } from '@/features/auth/infrastructure/in-memory-auth-repository';
import { GetFeedPage } from '@/features/feed/application/get-feed-page';
import { InMemoryFeedRepository } from '@/features/feed/infrastructure/in-memory-feed-repository';
import { MOCK_FEED } from '@/features/feed/infrastructure/mock-feed-data';

/*
  Composition root. The UI resolves use-cases from here — it never news up a
  repository itself. To go live, swap the In-Memory repositories for the
  Supabase ones on these lines; nothing upstream changes.
*/
const feedRepository = new InMemoryFeedRepository(MOCK_FEED);
const authRepository = new InMemoryAuthRepository();

export const container = {
  getFeedPage: new GetFeedPage(feedRepository),
  auth: {
    repository: authRepository,
    signIn: new SignInWithEmail(authRepository),
    signUp: new SignUpWithEmail(authRepository),
    signOut: new SignOut(authRepository),
  },
} as const;
