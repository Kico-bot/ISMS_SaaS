import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext, Permission } from '@isms/shared';
import { PUBLIC_ROUTE, REQUIRE_PERMISSION, type RequestWithCtx } from './auth.types';

/** Route erfordert mindestens eine der genannten Permissions (OR). Ohne Angabe: nur gültiges Login. */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION, permissions);

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
