import { describe, expect, it } from 'vitest';

import { GetProperty } from '@/features/properties/application/get-property';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { InMemoryPropertyRepository } from '@/features/properties/infrastructure/in-memory-property-repository';

function fixture(id: string): PropertyDetail {
  return {
    id,
    title: 'Test',
    description: 'desc',
    operation: 'buy',
    kind: 'Departamento',
    price: { amountCents: 100, currency: 'USD', period: 'once' },
    costs: [],
    area: { totalSqm: 50 },
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    parking: 0,
    amenities: [],
    location: { city: 'Buenos Aires' },
    gallery: [],
    advertiser: { type: 'owner' },
    publishedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('GetProperty', () => {
  it('returns the property by id', async () => {
    const repo = new InMemoryPropertyRepository([fixture('p1')]);
    const property = await new GetProperty(repo).execute('p1');
    expect(property?.id).toBe('p1');
  });

  it('returns null for an unknown id', async () => {
    const repo = new InMemoryPropertyRepository([fixture('p1')]);
    expect(await new GetProperty(repo).execute('nope')).toBeNull();
  });
});
