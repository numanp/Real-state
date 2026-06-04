import type { PushRepository } from '@/features/push/domain/ports/push-repository';

/** Offline no-op: there is no push backend without Supabase, and Expo push
 *  tokens require a native dev build anyway. */
export class InMemoryPushRepository implements PushRepository {
  async register(): Promise<void> {}
  async unregister(): Promise<void> {}
}
