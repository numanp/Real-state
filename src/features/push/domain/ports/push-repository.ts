export type PushPlatform = 'ios' | 'android' | 'web';

/** Device push-token registration. The server stores tokens (device_push_tokens)
 *  and the dispatch job fans out saved-search alerts to them. */
export interface PushRepository {
  register(token: string, platform: PushPlatform): Promise<void>;
  unregister(token: string): Promise<void>;
}
