import { describe, expect, it } from 'vitest';
import { P } from './permissions';
import { can, type AuthContext } from './policy';

const ctx = (perms: string[], personId = 'p1'): AuthContext => ({
  userId: 'u1',
  tenantId: 't1',
  membershipId: 'm1',
  personId,
  permissions: new Set(perms as never[]),
  isPlatformAdmin: false,
});

describe('can()', () => {
  it('grants direct permission', () => {
    expect(can(ctx([P.RISK_WRITE]), P.RISK_WRITE)).toBe(true);
  });
  it('grants write_own only for own resource', () => {
    const c = ctx([P.RISK_WRITE_OWN]);
    expect(can(c, P.RISK_WRITE, { ownerPersonId: 'p1' })).toBe(true);
    expect(can(c, P.RISK_WRITE, { ownerPersonId: 'p2' })).toBe(false);
    expect(can(c, P.RISK_WRITE)).toBe(false);
  });
  it('never widens non-write permissions via ownership', () => {
    expect(can(ctx([P.RISK_WRITE_OWN]), P.RISK_ACCEPT, { ownerPersonId: 'p1' })).toBe(false);
  });
});
