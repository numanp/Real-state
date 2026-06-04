import { supabase } from '@/core/supabase/client';
import { galleryFor } from '@/core/supabase/media';
import type {
  Amenity,
  Cost,
  PropertyDetail,
} from '@/features/properties/domain/entities/property-detail';
import type { PropertyRepository } from '@/features/properties/domain/ports/property-repository';

const KIND_LABEL: Record<string, string> = {
  house: 'Casa',
  apartment: 'Departamento',
  ph: 'PH',
  studio: 'Studio',
  land: 'Terreno',
  commercial: 'Local',
  office: 'Oficina',
};

const COST_LABEL: Record<string, string> = {
  price: 'Precio',
  rent: 'Alquiler',
  expensas: 'Expensas',
  condominio: 'Condomínio',
  iptu: 'IPTU',
  abl: 'ABL',
  seguro_incendio: 'Seguro incêndio',
  taxa_servico: 'Taxa de serviço',
  deposito: 'Depósito',
  other: 'Otro',
};

function costPeriod(p: string): Cost['period'] {
  if (/month|mes|mensual|mensal/i.test(p)) return 'monthly';
  if (/year|anual|anu/i.test(p)) return 'yearly';
  return 'once';
}

function one<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

interface Row {
  id: string;
  title: string;
  description: string | null;
  listing_type: 'buy' | 'rent';
  property_kind: string;
  price_cents: number;
  currency: string;
  area_total_sqm: number | null;
  area_covered_sqm: number | null;
  area_land_sqm: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  age_years: number | null;
  orientation: string | null;
  floor_number: number | null;
  condition: string | null;
  locale: string;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  published_at: string | null;
  property_costs: {
    cost_type: string;
    amount_cents: number;
    currency: string;
    period: string;
    label: string | null;
  }[];
  property_terms: { is_furnished: string | null; pets_allowed: boolean | null } | { is_furnished: string | null; pets_allowed: boolean | null }[] | null;
  listing_details:
    | { advertiser_type: string; agency_name: string | null; agency_id: string | null }
    | { advertiser_type: string; agency_name: string | null; agency_id: string | null }[]
    | null;
  property_amenities: {
    available: boolean;
    amenities_catalog: { label_es: string; label_pt: string; scope: 'unit' | 'building' } | null;
  }[];
}

const SELECT = `
  id, title, description, listing_type, property_kind, price_cents, currency,
  area_total_sqm, area_covered_sqm, area_land_sqm, rooms, bedrooms, bathrooms,
  parking_spaces, age_years, orientation, floor_number, condition, locale,
  city, region, country, latitude, longitude, published_at,
  property_costs ( cost_type, amount_cents, currency, period, label ),
  property_terms ( is_furnished, pets_allowed ),
  listing_details ( advertiser_type, agency_name, agency_id ),
  property_amenities ( available, amenities_catalog ( label_es, label_pt, scope ) )
`;

export class SupabasePropertyRepository implements PropertyRepository {
  async getById(id: string): Promise<PropertyDetail | null> {
    const { data, error } = await supabase.from('properties').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(`property.getById: ${error.message}`);
    if (!data) return null;
    return toDetail(data as unknown as Row);
  }

  async getByIds(ids: string[]): Promise<PropertyDetail[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('properties').select(SELECT).in('id', ids);
    if (error) throw new Error(`property.getByIds: ${error.message}`);
    return ((data ?? []) as unknown as Row[]).map(toDetail);
  }
}

function toDetail(r: Row): PropertyDetail {
  const terms = one(r.property_terms);
  const listing = one(r.listing_details);
  const isPt = r.locale === 'pt-BR';

  const costs: Cost[] = (r.property_costs ?? []).map((c) => ({
    label: c.label ?? COST_LABEL[c.cost_type] ?? c.cost_type,
    amountCents: Number(c.amount_cents),
    currency: (c.currency ?? 'ARS').trim(),
    period: costPeriod(c.period),
  }));

  const amenities: Amenity[] = (r.property_amenities ?? [])
    .filter((a) => a.amenities_catalog)
    .map((a) => ({
      label: isPt ? a.amenities_catalog!.label_pt : a.amenities_catalog!.label_es,
      scope: a.amenities_catalog!.scope,
      available: a.available,
    }));

  const furnished =
    terms?.is_furnished == null
      ? undefined
      : terms.is_furnished !== 'none' && terms.is_furnished !== 'unfurnished';

  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    operation: r.listing_type,
    kind: KIND_LABEL[r.property_kind] ?? r.property_kind,
    price: {
      amountCents: Number(r.price_cents),
      currency: (r.currency ?? 'USD').trim(),
      period: r.listing_type === 'rent' ? 'monthly' : 'once',
    },
    costs,
    area: {
      totalSqm: r.area_total_sqm != null ? Number(r.area_total_sqm) : undefined,
      coveredSqm: r.area_covered_sqm != null ? Number(r.area_covered_sqm) : undefined,
      landSqm: r.area_land_sqm != null ? Number(r.area_land_sqm) : undefined,
    },
    rooms: r.rooms ?? r.bedrooms ?? 0,
    bedrooms: r.bedrooms ?? 0,
    bathrooms: Number(r.bathrooms ?? 0),
    parking: r.parking_spaces ?? 0,
    ageYears: r.age_years ?? undefined,
    orientation: r.orientation ?? undefined,
    floor: r.floor_number != null ? `${r.floor_number}°` : undefined,
    condition: r.condition ?? undefined,
    furnished,
    petsAllowed: terms?.pets_allowed ?? undefined,
    amenities,
    location: {
      neighborhood: undefined,
      city: r.city ?? '',
      region: r.region ?? undefined,
      country: r.country ?? undefined,
      lat: r.latitude ?? undefined,
      lng: r.longitude ?? undefined,
    },
    gallery: galleryFor(r.id),
    advertiser: {
      type: (listing?.advertiser_type as PropertyDetail['advertiser']['type']) ?? 'agency',
      name: listing?.agency_name ?? undefined,
      agencyId: listing?.agency_id ?? undefined,
    },
    publishedAt: r.published_at ?? new Date(0).toISOString(),
  };
}
