import { supabase } from '@/core/supabase/client';
import type { CreateListingInput, ListingSummary } from '@/features/listings/domain/entities/listing';
import type { ListingsRepository } from '@/features/listings/domain/ports/listings-repository';

interface Row {
  id: string;
  title: string;
  listing_type: 'buy' | 'rent';
  price_cents: number;
  currency: string;
  city: string | null;
  status: string;
}

export class SupabaseListingsRepository implements ListingsRepository {
  async create(userId: string, input: CreateListingInput): Promise<string> {
    const { data, error } = await supabase
      .from('properties')
      .insert({
        owner_id: userId,
        title: input.title,
        listing_type: input.operation,
        property_kind: input.kind,
        status: 'active',
        price_cents: input.priceCents,
        currency: input.currency,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        area_sqm: input.areaSqm ?? null,
        city: input.city,
        region: input.region ?? null,
        description: input.description ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`listings.create: ${error.message}`);
    return data.id as string;
  }

  async listMine(userId: string): Promise<ListingSummary[]> {
    const { data, error } = await supabase
      .from('properties')
      .select('id,title,listing_type,price_cents,currency,city,status')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`listings.listMine: ${error.message}`);
    return (data ?? []).map((r) => {
      const row = r as Row;
      return {
        id: row.id,
        title: row.title,
        operation: row.listing_type,
        priceCents: Number(row.price_cents),
        currency: row.currency,
        city: row.city ?? '',
        status: row.status,
      };
    });
  }
}
