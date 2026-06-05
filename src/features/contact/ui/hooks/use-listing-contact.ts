import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type { ContactReveal } from '@/features/contact/domain/entities/contact-reveal';

/** Lazily resolves the gated contact reveal. load() is called on tap (not on
 *  mount) so contact is never fetched just by viewing a card. */
export function useListingContact(propertyId: string) {
  const [reveal, setReveal] = useState<ContactReveal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReveal(await container.contact.reveal(propertyId));
      setError(null);
    } catch (e) {
      // Without this the sheet stayed on "Cargando…" forever on any RPC/network
      // failure — surface the error so the UI can offer a retry (mirrors useVerification).
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  return { reveal, loading, error, load };
}
