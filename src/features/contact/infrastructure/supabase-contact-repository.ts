import { supabase } from '@/core/supabase/client';
import { type ContactReveal, mapReveal } from '@/features/contact/domain/entities/contact-reveal';
import type { ContactRepository } from '@/features/contact/domain/ports/contact-repository';

/** Reads the gated contact via get_listing_contact (0007). The RPC resolves the
 *  premium_agent_data level server-side, so a patched client that defeats the UI
 *  still gets NOTHING beyond its tier — the reveal shape IS the gate. */
export class SupabaseContactRepository implements ContactRepository {
  async reveal(propertyId: string): Promise<ContactReveal> {
    const { data, error } = await supabase.rpc('get_listing_contact', { p_property_id: propertyId });
    if (error) throw new Error(`contact.reveal: ${error.message}`);
    return mapReveal(data as Record<string, unknown> | null);
  }
}
