import { describe, expect, it } from 'vitest';

import { VerificationService } from '@/features/verification/application/verification-service';
import { NO_BADGES } from '@/features/verification/domain/entities/badge';
import { InMemoryVerificationRepository } from '@/features/verification/infrastructure/in-memory-verification-repository';

const makeService = () => new VerificationService(new InMemoryVerificationRepository());

describe('VerificationService', () => {
  it('starts with no badges and no request', async () => {
    const svc = makeService();
    expect(await svc.getMyState('u1')).toEqual(NO_BADGES);
  });

  it('a person can request the identity badge', async () => {
    const req = await makeService().requestVerification('person');
    expect(req.badgeType).toBe('identity');
  });

  it('an agency can request the agency badge', async () => {
    const req = await makeService().requestVerification('agency');
    expect(req.badgeType).toBe('agency');
  });

  it('a person cannot request the agency badge', async () => {
    await expect(makeService().requestVerification('person', 'agency')).rejects.toThrow(
      'badge_kind_mismatch',
    );
  });

  it('an agency cannot request the identity badge', async () => {
    await expect(makeService().requestVerification('agency', 'identity')).rejects.toThrow(
      'badge_kind_mismatch',
    );
  });

  it('reflects the granted badge in the state (offline demo)', async () => {
    const svc = makeService();
    await svc.requestVerification('person');
    const state = await svc.getMyState('u1');
    expect(state.badges).toContain('identity');
  });
});
