/** The advertiser contact reveal — its SHAPE depends on the caller's
 *  premium_agent_data level, resolved SERVER-SIDE by get_listing_contact (0007).
 *  The client renders whatever level comes back; it never decides the gate. */

export type ContactLevel = 'none' | 'limited' | 'full';

export interface ContactReveal {
  level: ContactLevel;
  agencyName?: string;
  advertiserType?: string;
  brokerName?: string;
  brokerLicense?: string;
  brokerLicenseAuthority?: string;
  whatsapp?: string; // full only
  whatsappMasked?: string; // limited only
  phone?: string; // full only
  email?: string; // full only
  contactFormEnabled?: boolean;
  agentPerfSummary?: string;
  upgradeRequired?: boolean; // none only
  rateLimited?: boolean; // daily contact-reveal cap reached — no PII in this payload (0033)
}

/** Maps the get_listing_contact jsonb (snake_case, null-stripped) to the domain
 *  shape. Pure — no Supabase import — so it's unit-testable on its own. */
export function mapReveal(json: Record<string, unknown> | null | undefined): ContactReveal {
  const j = (json ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : undefined);
  const bool = (k: string) => (typeof j[k] === 'boolean' ? (j[k] as boolean) : undefined);
  return {
    level: (str('level') as ContactLevel) ?? 'none',
    agencyName: str('agency_name'),
    advertiserType: str('advertiser_type'),
    brokerName: str('broker_name'),
    brokerLicense: str('broker_license'),
    brokerLicenseAuthority: str('broker_license_authority'),
    whatsapp: str('contact_whatsapp'),
    whatsappMasked: str('contact_whatsapp_masked'),
    phone: str('contact_phone'),
    email: str('contact_email'),
    contactFormEnabled: bool('contact_form_enabled'),
    agentPerfSummary: str('agent_perf_summary'),
    upgradeRequired: bool('upgrade_required'),
    rateLimited: bool('rate_limited'),
  };
}
