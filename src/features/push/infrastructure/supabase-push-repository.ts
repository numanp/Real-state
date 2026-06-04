import { supabase } from '@/core/supabase/client';
import type { PushPlatform, PushRepository } from '@/features/push/domain/ports/push-repository';

/** Registers the device token via the register_push_token / delete_push_token
 *  RPCs (0026). device_push_tokens is RPC-only and bound to auth.uid() server-
 *  side, so a token always belongs to whoever registered it. */
export class SupabasePushRepository implements PushRepository {
  async register(token: string, platform: PushPlatform): Promise<void> {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: platform,
    });
    if (error) throw new Error(`push.register: ${error.message}`);
  }

  async unregister(token: string): Promise<void> {
    const { error } = await supabase.rpc('delete_push_token', { p_token: token });
    if (error) throw new Error(`push.unregister: ${error.message}`);
  }
}
