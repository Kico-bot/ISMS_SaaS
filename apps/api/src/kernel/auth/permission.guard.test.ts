import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthContext, P, type Permission } from '@isms/shared';
import { describe, expect, it } from 'vitest';
import { RequirePermission } from './decorators';
import { PermissionGuard } from './permission.guard';

class Endpoints {
  @RequirePermission(P.CONTINUITY_WRITE)
  fullOnly() {}

  @RequirePermission(P.CONTINUITY_WRITE, { allowOwn: true })
  ownAllowed() {}

  @RequirePermission(P.MEASURE_WRITE, P.CONTINUITY_WRITE, { allowOwn: true })
  ownAllowedAny() {}
}

function contextFor(handler: keyof Endpoints, permissions: Permission[]): ExecutionContext {
  const ctx: AuthContext = {
    userId: 'u',
    tenantId: 't',
    membershipId: 'm',
    personId: 'p',
    permissions: new Set(permissions),
    isPlatformAdmin: false,
  };
  return {
    getHandler: () => Endpoints.prototype[handler],
    getClass: () => Endpoints,
    switchToHttp: () => ({ getRequest: () => ({ ctx }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard: `_own` nur mit allowOwn', () => {
  const guard = new PermissionGuard(new Reflector());

  it('lehnt `_own` ab, wenn der Endpunkt es nicht ausdrücklich erlaubt', () => {
    expect(() => guard.canActivate(contextFor('fullOnly', [P.CONTINUITY_WRITE_OWN]))).toThrow(
      ForbiddenException,
    );
  });

  it('lässt das volle Recht immer durch', () => {
    expect(guard.canActivate(contextFor('fullOnly', [P.CONTINUITY_WRITE]))).toBe(true);
  });

  it('lässt `_own` durch, wenn der Endpunkt allowOwn setzt; das Eigentum prüft der Service', () => {
    expect(guard.canActivate(contextFor('ownAllowed', [P.CONTINUITY_WRITE_OWN]))).toBe(true);
    expect(guard.canActivate(contextFor('ownAllowedAny', [P.CONTINUITY_WRITE_OWN]))).toBe(true);
  });

  it('lehnt auch mit allowOwn ab, wenn weder Recht noch `_own` vorliegt', () => {
    expect(() => guard.canActivate(contextFor('ownAllowed', [P.RISK_WRITE_OWN]))).toThrow(ForbiddenException);
  });
});
