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

// The chunk manifest stored at `${key}`: "c:<count>:<totalLength>". The length
// lets a read DETECT an inconsistent set of chunks (a write interrupted by a
// crash, a stale orphan) and fail to null → clean re-auth, never a corrupt token.
const MANIFEST_PREFIX = 'c:';
const buildManifest = (count: number, len: number) => `${MANIFEST_PREFIX}${count}:${len}`;

function parseManifest(s: string | null): { count: number; len: number } | null {
  if (s == null || !s.startsWith(MANIFEST_PREFIX)) return null;
  const parts = s.split(':');
  if (parts.length !== 3) return null;
  const count = Number(parts[1]);
  const len = Number(parts[2]);
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(len) || len < 0) return null;
  return { count, len };
}

/**
 * Wraps a KvStore so values over the backend's ~2KB cap round-trip transparently:
 * chunks live at `${key}.0`, `${key}.1`, … and `${key}` holds a "c:<count>:<len>"
 * manifest. A Supabase JWT/session that grows past 2KB would otherwise fail to
 * persist silently (iOS) or crash (Android). Small values store as one chunk.
 *
 * Fail-safe: a missing chunk OR a reassembled length that doesn't match the
 * manifest returns null (→ re-auth), so an interrupted write never yields a
 * truncated/frankenstein token. Backward compatible: a legacy raw value at
 * `${key}` (not a manifest) is returned as-is, then re-saved chunked on next write.
 */
export function createChunkedStore(base: KvStore): KvStore {
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  return {
    async getItem(key) {
      const head = await base.getItem(key);
      if (head == null) return null;
      const manifest = parseManifest(head);
      if (!manifest) return head; // legacy un-chunked value
      const parts: string[] = [];
      for (let i = 0; i < manifest.count; i++) {
        const part = await base.getItem(chunkKey(key, i));
        if (part == null) return null; // missing chunk → inconsistent → re-auth
        parts.push(part);
      }
      const joined = parts.join('');
      return joined.length === manifest.len ? joined : null; // length mismatch → re-auth
    },

    async setItem(key, value) {
      const chunks = splitIntoChunks(value);
      // Drop stale chunks left by a previous, larger value.
      const prevCount = parseManifest(await base.getItem(key))?.count ?? 0;
      for (let i = chunks.length; i < prevCount; i++) await base.removeItem(chunkKey(key, i));
      for (let i = 0; i < chunks.length; i++) await base.setItem(chunkKey(key, i), chunks[i]);
      await base.setItem(key, buildManifest(chunks.length, value.length));
    },

    async removeItem(key) {
      const count = parseManifest(await base.getItem(key))?.count ?? 0;
      for (let i = 0; i < count; i++) await base.removeItem(chunkKey(key, i));
      await base.removeItem(key);
    },
  };
}
