import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { P } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ProgrammesService } from './programmes.service';

@ApiTags('programmes')
@Controller('programmes')
export class ProgrammesController {
  constructor(private readonly programmes: ProgrammesService) {}

  @Get()
  @RequirePermission(P.SOA_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.programmes.list(ctx.tenantId);
  }

  @Get('tasks')
  @RequirePermission(P.SOA_READ)
  tasks(@TenantCtx() ctx: TenantAuthContext) {
    return this.programmes.tasks(ctx.tenantId);
  }

  /** Eigene Einträge: keine Rechteprüfung über das Modul hinaus, man sieht nur, was einem gehört. */
  @Get('my-area')
  myArea(@TenantCtx() ctx: TenantAuthContext) {
    return this.programmes.myArea(ctx.tenantId, ctx.personId);
  }
}
