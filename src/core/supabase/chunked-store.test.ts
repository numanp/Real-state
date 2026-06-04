import { beforeEach, describe, expect, it } from 'vitest';

import { createChunkedStore, type KvStore, splitIntoChunks } from '@/core/supabase/chunked-store';

function memStore(): KvStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async setItem(k, v) {
      map.set(k, v);
    },
    async removeItem(k) {
      map.delete(k);
    },
  };
}

describe('splitIntoChunks', () => {
  it('returns a single chunk when it fits', () => {
    expect(splitIntoChunks('abc', 1800)).toEqual(['abc']);
  });
  it('splits into ceil(len/size) pieces of the right size', () => {
    const chunks = splitIntoChunks('a'.repeat(4001), 1800);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1800);
    expect(chunks[2]).toHaveLength(401);
    expect(chunks.join('')).toHaveLength(4001);
  });
});

describe('createChunkedStore', () => {
  let base: ReturnType<typeof memStore>;
  let store: KvStore;
  beforeEach(() => {
    base = memStore();
    store = createChunkedStore(base);
  });

  it('round-trips a value larger than one chunk', async () => {
    const big = 'x'.repeat(5000);
    await store.setItem('sb-auth', big);
    expect(await store.getItem('sb-auth')).toBe(big);
    // Stored as a "c:<count>:<len>" manifest + chunks, not one oversized value.
    expect(base.map.get('sb-auth')).toBe('c:3:5000');
    expect(base.map.has('sb-auth.0')).toBe(true);
  });

  it('round-trips a small value (single chunk)', async () => {
    await store.setItem('k', 'tiny');
    expect(await store.getItem('k')).toBe('tiny');
  });

  it('cleans up stale chunks when overwritten with a smaller value', async () => {
    await store.setItem('k', 'y'.repeat(5000)); // 3 chunks
    await store.setItem('k', 'small'); // 1 chunk
    expect(await store.getItem('k')).toBe('small');
    expect(base.map.has('k.1')).toBe(false);
    expect(base.map.has('k.2')).toBe(false);
  });

  it('removeItem deletes every chunk and the manifest', async () => {
    await store.setItem('k', 'z'.repeat(5000));
    await store.removeItem('k');
    expect(await store.getItem('k')).toBeNull();
    expect([...base.map.keys()]).toEqual([]);
  });

  it('returns null for an absent key', async () => {
    expect(await store.getItem('missing')).toBeNull();
  });

  it('fails safe to null on a missing chunk or inconsistent length (no truncated token)', async () => {
    await store.setItem('k', 'q'.repeat(5000)); // manifest c:3:5000
    base.map.delete('k.2'); // a chunk went missing (interrupted write)
    expect(await store.getItem('k')).toBeNull();

    await store.setItem('k', 'q'.repeat(5000));
    base.map.set('k.2', 'short'); // tampered → reassembled length != manifest len
    expect(await store.getItem('k')).toBeNull();
  });

  it('reads a legacy un-chunked value (raw JWT at the key) and re-chunks on write', async () => {
    base.map.set('k', 'legacy.jwt.value'); // not an integer count → raw value
    expect(await store.getItem('k')).toBe('legacy.jwt.value');
    await store.setItem('k', 'legacy.jwt.value');
    expect(base.map.get('k')).toBe('c:1:16');
    expect(await store.getItem('k')).toBe('legacy.jwt.value');
  });
});
