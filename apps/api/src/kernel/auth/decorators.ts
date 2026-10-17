import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext, Permission } from '@isms/shared';
import {
  ALLOW_OWN,
  PUBLIC_ROUTE,
  REQUIRE_ALL_PERMISSIONS,
  REQUIRE_PERMISSION,
  type RequestWithCtx,
} from './auth.types';

export interface RequirePermissionOptions {
  /**
   * Auch die `_own`-Variante der Rechte lässt der Guard durch. Nur setzen, wo der Service das
   * Eigentum am Datensatz mit `assertCan(ctx, P.X_WRITE, datensatz)` prüft: der Guard kennt den
   * Datensatz noch nicht.
   */
  allowOwn?: boolean;
}

/**
 * Route erfordert mindestens eine der genannten Permissions (OR). Ohne Angabe: nur gültiges Login.
 * `_own` zählt nur mit `{ allowOwn: true }` als letztem Argument.
 */
export function RequirePermission(
  ...args: [...Permission[], RequirePermissionOptions] | Permission[]
): MethodDecorator & ClassDecorator {
  const last = args[args.length - 1];
  const options: RequirePermissionOptions = typeof last === 'object' && last !== null ? last : {};
  const permissions = args.filter((a): a is Permission => typeof a === 'string');
  return applyDecorators(
    SetMetadata(REQUIRE_PERMISSION, permissions),
    SetMetadata(ALLOW_OWN, options.allowOwn === true),
  );
}

/**
 * Route erfordert jede der genannten Permissions (AND), etwa Export und Leserecht des Registers.
 * `_own` zählt hier nie. Lässt sich mit @RequirePermission kombinieren; dann gilt beides.
 */
export const RequireAllPermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_ALL_PERMISSIONS, permissions);

/** Route ohne Login (Login, Registrierung, Health). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** Injiziert den AuthContext des Aufrufers. */
export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): AuthContext => {
  const req = ec.switchToHttp().getRequest<RequestWithCtx>();
  if (!req.ctx) throw new Error('AuthContext fehlt — JwtGuard nicht aktiv?');
  return req.ctx;
});

/** Wie Ctx, aber garantiert einen Mandantenkontext (tenantId, membershipId gesetzt). */
export interface TenantAuthContext extends AuthContext {
  tenantId: string;
  membershipId: string;
}
export const TenantCtx = createParamDecorator((_: unknown, ec: ExecutionContext): TenantAuthContext => {
  const req = ec.switchToHttp().getRequest<RequestWithCtx>();
  const ctx = req.ctx;
  if (!ctx?.tenantId || !ctx.membershipId) {
    // wird vom PermissionGuard bereits abgefangen; hier nur Typsicherheit
    throw new Error('Kein Mandantenkontext');
  }
  return ctx as TenantAuthContext;
});
