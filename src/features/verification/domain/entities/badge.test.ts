import { describe, expect, it } from 'vitest';

import { badgeForKind, badgeMatchesKind } from '@/features/verification/domain/entities/badge';

describe('badgeForKind', () => {
  it('agency accounts request the agency badge', () => {
    expect(badgeForKind('agency')).toBe('agency');
  });
  it('person accounts request the identity badge', () => {
    expect(badgeForKind('person')).toBe('identity');
  });
});

describe('badgeMatchesKind', () => {
  it('identity is only valid for a person', () => {
    expect(badgeMatchesKind('identity', 'person')).toBe(true);
    expect(badgeMatchesKind('identity', 'agency')).toBe(false);
  });
  it('agency is only valid for an agency', () => {
    expect(badgeMatchesKind('agency', 'agency')).toBe(true);
    expect(badgeMatchesKind('agency', 'person')).toBe(false);
  });
  it('agrees with badgeForKind for every kind', () => {
    for (const kind of ['person', 'agency'] as const) {
      expect(badgeMatchesKind(badgeForKind(kind), kind)).toBe(true);
    }
  });
});
