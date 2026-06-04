export type Operation = 'buy' | 'rent';

export interface Cost {
  label: string; // 'Expensas' | 'IPTU' | 'Condomínio' | …
  amountCents: number;
  currency: string;
  period: 'monthly' | 'yearly' | 'once';
}

export interface Amenity {
  label: string;
  scope: 'unit' | 'building';
  available: boolean;
}

/**
 * The ficha — a property's full "knowledge library" (the tap-through detail).
 * Mirrors the sections researched from Zonaprop / QuintoAndar in REELS-FICHA.md.
 */
export interface PropertyDetail {
  id: string;
  title: string;
  description: string;
  operation: Operation;
  kind: string; // 'Departamento' | 'Casa' | 'PH' | …
  price: { amountCents: number; currency: string; period: 'once' | 'monthly' };
  costs: Cost[];
  area: { totalSqm?: number; coveredSqm?: number; landSqm?: number };
  rooms: number; // ambientes
  bedrooms: number;
  bathrooms: number;
  parking: number;
  ageYears?: number;
  orientation?: string;
  floor?: string;
  condition?: string;
  furnished?: boolean;
  petsAllowed?: boolean;
  amenities: Amenity[];
  location: {
    address?: string;
    neighborhood?: string;
    city: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  gallery: string[];
  advertiser: { type: 'agency' | 'owner' | 'managed'; name?: string; agencyId?: string };
  publishedAt: string;
}
