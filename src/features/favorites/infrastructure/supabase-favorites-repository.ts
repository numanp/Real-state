import { supabase } from '@/core/supabase/client';
import type { FavoritesRepository } from '@/features/favorites/domain/ports/favorites-repository';

/** Likes via the `likes` table. RLS scopes every read to the current user, so
 *  the userId is needed only to satisfy the NOT NULL column on insert. */
export class SupabaseFavoritesRepository implements FavoritesRepository {
  async isLiked(_userId: string, propertyId: string): Promise<boolean> {
    const { data } = await supabase
      .from('likes')
      .select('property_id')
      .eq('property_id', propertyId)
      .maybeSingle();
    return Boolean(data);
  }

  async listLikedIds(_userId: string): Promise<string[]> {
    const { data, error } = await supabase.from('likes').select('property_id');
    if (error) throw new Error(`favorites.list: ${error.message}`);
    return (data ?? []).map((r: { property_id: string }) => r.property_id);
  }

  async like(userId: string, propertyId: string): Promise<void> {
    const { error } = await supabase
      .from('likes')
      .upsert({ user_id: userId, property_id: propertyId }, { onConflict: 'user_id,property_id', ignoreDuplicates: true });
    if (error) throw new Error(`favorites.like: ${error.message}`);
  }

  async unlike(_userId: string, propertyId: string): Promise<void> {
    const { error } = await supabase.from('likes').delete().eq('property_id', propertyId);
    if (error) throw new Error(`favorites.unlike: ${error.message}`);
  }
}
