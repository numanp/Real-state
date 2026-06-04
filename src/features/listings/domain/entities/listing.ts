export type ListingOperation = 'buy' | 'rent';
export type ListingKind = 'house' | 'apartment' | 'studio' | 'land' | 'commercial';

export interface CreateListingInput {
  title: string;
  operation: ListingOperation;
  kind: ListingKind;
  priceCents: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  areaSqm?: number;
  city: string;
  region?: string;
  description?: string;
}

export interface ListingSummary {
  id: string;
  title: string;
  operation: ListingOperation;
  priceCents: number;
  currency: string;
  city: string;
  status: string;
}
