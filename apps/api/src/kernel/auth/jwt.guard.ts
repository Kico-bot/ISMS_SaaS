import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthContext, Permission } from '@isms/shared';
import type { Request } from 'express';
import { type AccessClaims, PUBLIC_ROUTE, type RequestWithCtx } from './auth.types';
import { PermissionCacheService } from './permission-cache.service';

/** Verifiziert das Bearer-Token und baut den AuthContext (inkl. effektiver Permissions) auf. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly perms: PermissionCacheService,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      ec.getHandler(),
      ec.getClass(),
    ]);
    if (isPublic) return true;

    const req = ec.switchToHttp().getRequest<Request & RequestWithCtx>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Kein Zugriffstoken');
    let claims: AccessClaims;
    try {
      claims = this.jwt.verify<AccessClaims>(header.slice(7), { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Zugriffstoken ungültig oder abgelaufen');
    }

    let permissions: ReadonlySet<Permission>;
    if (claims.mid) {
      // Mandant und Konto kommen aus der Mitgliedschaft, nicht aus dem Token: ein Token mit
      // eigener `mid` und fremder `tid` liefe sonst unter dem fremden Mandanten.
      const m = await this.perms.membership(claims.mid);
      if (!m || m.tenantId !== claims.tid || m.userId !== claims.sub || m.status !== 'active')
        throw new UnauthorizedException('Zugriffstoken passt nicht zur Mitgliedschaft');
      permissions = m.permissions;
    } else {
      if (claims.tid) throw new UnauthorizedException('Zugriffstoken passt nicht zur Mitgliedschaft');
      permissions = claims.pa ? this.perms.forPlatformAdmin() : new Set<Permission>();
    }

    const ctx: AuthContext = {
      userId: claims.sub,
      tenantId: claims.tid,
      membershipId: claims.mid,
      personId: claims.pid,
      permissions,
      isPlatformAdmin: claims.pa,
    };
    req.ctx = ctx;
    req.claims = claims;
    return true;
  }
}
