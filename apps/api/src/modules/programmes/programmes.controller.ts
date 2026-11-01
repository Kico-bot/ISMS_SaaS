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
}
