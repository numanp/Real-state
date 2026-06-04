import { describe, expect, it } from 'vitest';

import { buildComparison } from '@/features/compare/domain/comparison';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

function prop(over: Partial<PropertyDetail>): PropertyDetail {
  return {
    id: 'p',
    title: 'Depto',
    description: '',
    operation: 'rent',
    kind: 'Departamento',
    price: { amountCents: 100_000_00, currency: 'ARS', period: 'monthly' },
    costs: [],
    area: {},
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    parking: 0,
    amenities: [],
    location: { city: 'CABA' },
    gallery: [],
    advertiser: { type: 'owner' },
    publishedAt: '2026-01-01',
    ...over,
  };
}

const row = (rows: ReturnType<typeof buildComparison>, label: string) =>
  rows.find((r) => r.label === label)!;

describe('buildComparison', () => {
  it('marks the cheaper property as best on price (same currency)', () => {
    const rows = buildComparison([
      prop({ price: { amountCents: 200_000_00, currency: 'ARS', period: 'monthly' } }),
      prop({ price: { amountCents: 120_000_00, currency: 'ARS', period: 'monthly' } }),
    ]);
    expect(row(rows, 'Precio').bestIndex).toBe(1);
  });

  it('does NOT pick a best price across mixed currencies', () => {
    const rows = buildComparison([
      prop({ price: { amountCents: 1000_00, currency: 'USD', period: 'once' } }),
      prop({ price: { amountCents: 120_000_00, currency: 'ARS', period: 'monthly' } }),
    ]);
    expect(row(rows, 'Precio').bestIndex).toBeNull();
  });

  it('marks the largest total area as best', () => {
    const rows = buildComparison([
      prop({ area: { totalSqm: 50 } }),
      prop({ area: { totalSqm: 85 } }),
    ]);
    expect(row(rows, 'Sup. total').bestIndex).toBe(1);
  });

  it('renders — for missing values and no best when <2 comparable', () => {
    const rows = buildComparison([prop({ area: { totalSqm: 50 } }), prop({ area: {} })]);
    expect(row(rows, 'Sup. total').values[1]).toBe('—');
    expect(row(rows, 'Sup. total').bestIndex).toBeNull();
  });

  it('leaves subjective rows (bedrooms) without a best', () => {
    const rows = buildComparison([prop({ bedrooms: 2 }), prop({ bedrooms: 3 })]);
    expect(row(rows, 'Dormitorios').bestIndex).toBeNull();
    expect(row(rows, 'Dormitorios').values).toEqual(['2', '3']);
  });
});
