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
  const [error, setError] = useState<Error | null>(null); // load failures
  const [replyError, setReplyError] = useState<Error | null>(null); // send failures

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
      setReplyError(null);
      let ok = false;
      try {
        await container.leads.replyToLead(leadId, body);
        ok = true;
      } catch (e) {
        setReplyError(e instanceof Error ? e : new Error(String(e)));
      }
      // The message is already persisted on success — the refetch is
      // best-effort and its failure surfaces via `error`, NOT as a send error
      // (so we never show "send failed" for a message that actually sent).
      if (ok) await load();
      setSending(false);
      return ok;
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

  const close = useCallback(async (): Promise<boolean> => {
    try {
      await container.leads.closeLead(leadId);
      return true;
    } catch (e) {
      setReplyError(e instanceof Error ? e : new Error(String(e)));
      return false;
    }
  }, [leadId]);

  return { messages, loading, sending, error, replyError, load, reply, markRead, close };
}
