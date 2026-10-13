import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@isms/shared';
import { ALLOW_OWN, PUBLIC_ROUTE, REQUIRE_PERMISSION, type RequestWithCtx } from './auth.types';

/**
 * Prüft @RequirePermission(). Mandantenrouten (alle außer platform.*) verlangen zusätzlich einen
 * aktiven Mandantenkontext. `*_own` lässt der Guard nur an Endpunkten mit `allowOwn` durch; das
 * Eigentum am Datensatz prüft dort der Service mit assertCan(). Ohne `allowOwn` reicht `_own` nie,
 * sonst erreicht ein Risk-Owner jeden Endpunkt, dessen Service kein Eigentum kennt.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ec: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      ec.getHandler(),
      ec.getClass(),
    ]);
    if (isPublic) return true;
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRE_PERMISSION, [
      ec.getHandler(),
      ec.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const ctx = ec.switchToHttp().getRequest<RequestWithCtx>().ctx;
    if (!ctx) throw new ForbiddenException();

    const platformOnly = required.every((p) => p.startsWith('platform.'));
    if (!platformOnly && !ctx.tenantId) {
      throw new ForbiddenException({
        title: 'Kein Mandant gewählt',
        detail: 'Bitte zuerst einen Mandanten auswählen (POST /auth/switch-tenant).',
      });
    }
    const allowOwn =
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_OWN, [ec.getHandler(), ec.getClass()]) ===
      true;
    const ok = required.some(
      (p) => ctx.permissions.has(p) || (allowOwn && ctx.permissions.has(`${p}_own` as Permission)),
    );
    if (!ok) {
      throw new ForbiddenException({
        title: 'Keine Berechtigung',
        detail: `Erforderlich: ${required.join(' oder ')}`,
      });
    }
    return true;
  }
}
