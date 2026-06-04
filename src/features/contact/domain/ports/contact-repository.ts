import type { ContactReveal } from '@/features/contact/domain/entities/contact-reveal';

/** Domain PORT. The UI calls reveal() lazily (on tap) — never on mount, since the
 *  reveal is gated and we don't want to resolve contact for every card view. */
export interface ContactRepository {
  reveal(propertyId: string): Promise<ContactReveal>;
}
