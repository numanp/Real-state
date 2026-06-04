import { describe, expect, it } from 'vitest';

import { CreateListingService } from '@/features/listings/application/create-listing-service';
import type { CreateListingInput } from '@/features/listings/domain/entities/listing';
import { InMemoryListingsRepository } from '@/features/listings/infrastructure/in-memory-listings-repository';

const USER = 'u1';

function valid(): CreateListingInput {
  return {
    title: 'Depto 2 amb en Palermo',
    operation: 'rent',
    kind: 'apartment',
    priceCents: 450000 * 100,
    currency: 'ARS',
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 48,
    city: 'Buenos Aires',
  };
}

function setup() {
  const repo = new InMemoryListingsRepository();
  return { repo, service: new CreateListingService(repo) };
}

describe('CreateListingService', () => {
  it('creates a listing and lists it for the owner', async () => {
    const { service } = setup();
    const id = await service.create(USER, valid());
    expect(id).toBeTruthy();
    const mine = await service.listMine(USER);
    expect(mine.map((l) => l.id)).toContain(id);
    expect(mine[0]?.title).toBe('Depto 2 amb en Palermo');
  });

  it('rejects an invalid listing (short title / negative price)', async () => {
    const { service } = setup();
    await expect(service.create(USER, { ...valid(), title: 'x' })).rejects.toThrow();
    await expect(service.create(USER, { ...valid(), priceCents: -1 })).rejects.toThrow();
    await expect(service.create(USER, { ...valid(), operation: 'lease' })).rejects.toThrow();
  });

  it('isolates listings per owner', async () => {
    const { service } = setup();
    await service.create('a', valid());
    expect(await service.listMine('b')).toEqual([]);
  });
});
