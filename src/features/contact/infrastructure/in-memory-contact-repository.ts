import type { ContactReveal } from '@/features/contact/domain/entities/contact-reveal';
import type { ContactRepository } from '@/features/contact/domain/ports/contact-repository';

/**
 * In-memory contact reveal — runs the feature with NO database. Returns the
 * FREE experience ('none') so the paywall (the headline of this feature) is
 * visible offline. The real per-tier levels (limited/full) come from
 * get_listing_contact server-side, proven by supabase/tests/contact-check.mjs.
 */
export class InMemoryContactRepository implements ContactRepository {
  async reveal(): Promise<ContactReveal> {
    return {
      level: 'none',
      agencyName: 'Inmobiliaria Demo',
      advertiserType: 'agency',
      upgradeRequired: true,
    };
  }
}
