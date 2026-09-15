import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { P } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('coverage')
  @RequirePermission(P.SOA_READ)
  coverage(@TenantCtx() ctx: TenantAuthContext) {
    return this.dashboard.coverage(ctx.tenantId);
  }

  @Get('summary')
  @RequirePermission(P.CONTEXT_READ)
  summary(@TenantCtx() ctx: TenantAuthContext) {
    return this.dashboard.summary(ctx.tenantId);
  }

  @Get('traceability/asset/:id')
  @RequirePermission(P.ASSET_READ)
  traceability(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.dashboard.assetTraceability(ctx.tenantId, id);
  }
}
