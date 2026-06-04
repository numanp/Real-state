import { describe, expect, it } from 'vitest';

import { mapReveal } from '@/features/contact/domain/entities/contact-reveal';

describe('mapReveal', () => {
  it('maps the free (none) payload — paywall, no channel', () => {
    const r = mapReveal({ level: 'none', agency_name: 'Acme', advertiser_type: 'agency', upgrade_required: true });
    expect(r.level).toBe('none');
    expect(r.upgradeRequired).toBe(true);
    expect(r.agencyName).toBe('Acme');
    expect(r.whatsapp).toBeUndefined();
    expect(r.phone).toBeUndefined();
  });

  it('maps the limited (pro) payload — masked whatsapp only', () => {
    const r = mapReveal({ level: 'limited', broker_name: 'Ana', contact_whatsapp_masked: '+549••••12' });
    expect(r.level).toBe('limited');
    expect(r.whatsappMasked).toBe('+549••••12');
    expect(r.whatsapp).toBeUndefined();
  });

  it('maps the full (ultimate) payload — actionable channels', () => {
    const r = mapReveal({
      level: 'full',
      contact_whatsapp: '+5491122223333',
      contact_phone: '+541144445555',
      contact_email: 'ventas@acme.com',
    });
    expect(r.level).toBe('full');
    expect(r.whatsapp).toBe('+5491122223333');
    expect(r.phone).toBe('+541144445555');
    expect(r.email).toBe('ventas@acme.com');
  });

  it('defaults to none on an empty/garbage payload (fail-closed)', () => {
    expect(mapReveal(null).level).toBe('none');
    expect(mapReveal({}).level).toBe('none');
  });
});
