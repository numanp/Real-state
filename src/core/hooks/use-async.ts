import { type DependencyList, useCallback, useEffect, useState } from 'react';

interface UseAsyncOptions<T> {
  /** Value before the first load resolves (default null). */
  initial?: T | null;
  /** When false the loader does not run — data stays `initial`, loading false.
   *  Use for "no id / no session yet" guards. */
  enabled?: boolean;
}

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Generic data loader for the repeated useState(data)+useState(loading)+useEffect
 * pattern. Runs `fn` on mount and whenever `deps` change, with the active-flag
 * unmount/stale guard — and, crucially, an ERROR state + a guaranteed
 * `loading=false` on failure, so a rejected fetch surfaces instead of leaving the
 * UI stuck on a spinner. `reload()` re-runs on demand.
 *
 * `fn` is intentionally not a dependency: pass its real inputs (session, id, …)
 * via `deps` so re-runs are explicit and a new closure each render doesn't refetch.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
  options: UseAsyncOptions<T> = {},
): UseAsyncResult<T> {
  const { initial = null, enabled = true } = options;
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  return { data, loading, error, reload };
}
