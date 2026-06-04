/** A minimal async key/value store — the slice of expo-secure-store we use. */
export interface KvStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** expo-secure-store caps a value at ~2KB; chunk under that with margin. */
const CHUNK_SIZE = 1800;

/** Split a string into ≤ size pieces (one piece when it already fits). */
export function splitIntoChunks(value: string, size: number = CHUNK_SIZE): string[] {
  if (value.length <= size) return [value];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size));
  return chunks;
}

const isCount = (s: string | null): s is string =>
  s != null && /^\d+$/.test(s) && Number.isInteger(Number(s));

/**
 * Wraps a KvStore so values over the backend's ~2KB cap round-trip transparently:
 * chunks live at `${key}.0`, `${key}.1`, … and `${key}` holds the chunk count.
 * A Supabase JWT/session that grows past 2KB would otherwise fail to persist
 * silently (iOS) or crash (Android). Small values store as a single chunk.
 *
 * Backward compatible: a legacy raw (un-chunked) value at `${key}` — anything not
 * a bare integer count — is returned as-is, then re-saved chunked on next write.
 */
export function createChunkedStore(base: KvStore): KvStore {
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  return {
    async getItem(key) {
      const manifest = await base.getItem(key);
      if (manifest == null) return null;
      if (!isCount(manifest)) return manifest; // legacy un-chunked value
      const n = Number(manifest);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await base.getItem(chunkKey(key, i));
        if (part == null) return null; // missing chunk → treat as absent
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const chunks = splitIntoChunks(value);
      // Drop stale chunks left by a previous, larger value.
      const prev = await base.getItem(key);
      const prevN = isCount(prev) ? Number(prev) : 0;
      for (let i = chunks.length; i < prevN; i++) await base.removeItem(chunkKey(key, i));
      for (let i = 0; i < chunks.length; i++) await base.setItem(chunkKey(key, i), chunks[i]);
      await base.setItem(key, String(chunks.length));
    },

    async removeItem(key) {
      const manifest = await base.getItem(key);
      const n = isCount(manifest) ? Number(manifest) : 0;
      for (let i = 0; i < n; i++) await base.removeItem(chunkKey(key, i));
      await base.removeItem(key);
    },
  };
}
