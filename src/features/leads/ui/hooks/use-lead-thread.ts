import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type { ThreadMessage } from '@/features/leads/domain/entities/lead';

/** Loads a lead's thread and posts replies. load() is lazy (call on mount);
 *  reply() posts then refetches and returns whether it succeeded so the screen
 *  can clear the draft. markRead is best-effort (owner-only server-side). */
export function useLeadThread(leadId: string) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await container.leads.getLeadThread(leadId));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const reply = useCallback(
    async (body: string): Promise<boolean> => {
      setSending(true);
      setError(null);
      try {
        await container.leads.replyToLead(leadId, body);
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return false;
      } finally {
        setSending(false);
      }
    },
    [leadId, load],
  );

  const markRead = useCallback(async () => {
    try {
      await container.leads.markLeadRead(leadId);
    } catch {
      /* no-op: only the owner with a 'new' lead is affected server-side */
    }
  }, [leadId]);

  return { messages, loading, sending, error, load, reply, markRead };
}
