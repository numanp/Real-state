import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type { CreatedLead } from '@/features/leads/domain/entities/lead';

/** Sends an inquiry on a property. Mirrors use-listing-contact: loading + error
 *  are local state, errors are captured (not rethrown) so the sheet can branch
 *  on them. `send` returns the created lead, or null on failure. */
export function useSendLead(propertyId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(
    async (message: string): Promise<CreatedLead | null> => {
      setLoading(true);
      setError(null);
      try {
        return await container.leads.createLead(propertyId, message);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [propertyId],
  );

  const reset = useCallback(() => setError(null), []);

  return { send, loading, error, reset };
}
