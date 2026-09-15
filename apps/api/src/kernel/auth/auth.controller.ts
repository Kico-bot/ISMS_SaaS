import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcceptInviteDto, LoginDto, RegisterTenantDto, type AuthContext } from '@isms/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../config/env';
import { ZodPipe } from '../http/zod.pipe';
import { AuthService, type Session } from './auth.service';
import { Ctx, Public } from './decorators';

const REFRESH_COOKIE = 'isms_rt';
const SwitchTenantDto = z.object({ tenantSlug: z.string().min(1) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly env = loadEnv();

  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body(new ZodPipe(RegisterTenantDto)) dto: RegisterTenantDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.registerTenant(dto, meta(req)));
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body(new ZodPipe(LoginDto)) dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto, meta(req)));
  }

  @Public()
  @Public()
  @HttpCode(200)
  @Post('accept-invite')
  async acceptInvite(@Body(new ZodPipe(AcceptInviteDto)) dto: AcceptInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.acceptInvite(dto, meta(req)));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE] ?? '';
    return this.respond(res, await this.auth.refresh(raw, meta(req)));
  }

  @HttpCode(200)
  @Post('switch-tenant')
  async switchTenant(@Ctx() ctx: AuthContext, @Body(new ZodPipe(SwitchTenantDto)) dto: { tenantSlug: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.switchTenant(ctx.userId, dto.tenantSlug, meta(req)));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  me(@Ctx() ctx: AuthContext) {
    return {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      membershipId: ctx.membershipId,
      personId: ctx.personId,
      isPlatformAdmin: ctx.isPlatformAdmin,
      permissions: [...ctx.permissions].sort(),
    };
  }

  private respond(res: Response, s: Session) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
      expires: s.refreshExpiresAt,
    });
    const { refreshToken: _omit, refreshExpiresAt: _omit2, ...body } = s;
    return body;
  }
}

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
