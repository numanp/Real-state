import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type { ReceivedLead, SentLead } from '@/features/leads/domain/entities/lead';

/** Loads both sides of the lead loop (received inbox + sent outbox). load() is
 *  lazy — call it on screen mount. markRead flips a received lead and refetches.
 *  Mirrors use-agency-reviews (parallel load, load() doubles as refetch). */
export function useLeads() {
  const [received, setReceived] = useState<ReceivedLead[]>([]);
  const [sent, setSent] = useState<SentLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, s] = await Promise.all([
        container.leads.getReceivedLeads(),
        container.leads.getSentLeads(),
      ]);
      setReceived(r);
      setSent(s);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  return { received, sent, loading, error, load };
}
