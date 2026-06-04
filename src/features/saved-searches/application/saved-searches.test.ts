import { describe, expect, it } from 'vitest';

import { SavedSearchesService } from '@/features/saved-searches/application/saved-searches-service';
import { InMemorySavedSearchesRepository } from '@/features/saved-searches/infrastructure/in-memory-saved-searches-repository';

const USER = 'u1';

function setup() {
  const repo = new InMemorySavedSearchesRepository();
  return { repo, service: new SavedSearchesService(repo) };
}

describe('SavedSearchesService', () => {
  it('creates and lists a saved search with its filters', async () => {
    const { service } = setup();
    const search = await service.create(USER, 'Venta en Palermo', {
      operation: 'buy',
      city: 'Buenos Aires',
    });
    expect(search.name).toBe('Venta en Palermo');
    expect(search.filters.operation).toBe('buy');
    expect((await service.list(USER)).map((s) => s.id)).toContain(search.id);
  });

  it('rejects empty or too-long names', async () => {
    const { service } = setup();
    await expect(service.create(USER, '   ', {})).rejects.toThrow();
    await expect(service.create(USER, 'x'.repeat(61), {})).rejects.toThrow();
  });

  it('removes a saved search', async () => {
    const { service } = setup();
    const search = await service.create(USER, 'temp', {});
    await service.remove(USER, search.id);
    expect(await service.list(USER)).toEqual([]);
  });

  it('isolates saved searches per user', async () => {
    const { service } = setup();
    await service.create('a', 'mine', {});
    expect(await service.list('b')).toEqual([]);
  });
});
