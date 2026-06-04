import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import type { ContactReveal } from '@/features/contact/domain/entities/contact-reveal';

/** Lazily resolves the gated contact reveal. load() is called on tap (not on
 *  mount) so contact is never fetched just by viewing a card. */
export function useListingContact(propertyId: string) {
  const [reveal, setReveal] = useState<ContactReveal | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReveal(await container.contact.reveal(propertyId));
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  return { reveal, loading, load };
}
