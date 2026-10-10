import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActivateFrameworkDto, P } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { CatalogService } from './catalog.service';

@ApiTags('frameworks')
@Controller('frameworks')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission(P.SOA_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.catalog.listFrameworks(ctx.tenantId);
  }

  @Post('activate')
  @RequirePermission(P.FRAMEWORK_ACTIVATE)
  activate(
    @TenantCtx() ctx: TenantAuthContext,
    @Body(new ZodPipe(ActivateFrameworkDto)) dto: ActivateFrameworkDto,
  ) {
    return this.catalog.activate(ctx.tenantId, dto);
  }

  @Delete(':key/activate')
  @HttpCode(204)
  @RequirePermission(P.FRAMEWORK_ACTIVATE)
  async deactivate(@TenantCtx() ctx: TenantAuthContext, @Param('key') key: string) {
    await this.catalog.deactivate(ctx.tenantId, key);
  }

  @Get(':key/requirements')
  @RequirePermission(P.SOA_READ)
  requirements(@TenantCtx() ctx: TenantAuthContext, @Param('key') key: string) {
    return this.catalog.requirements(ctx.tenantId, key);
  }

  @Get('requirements/:id')
  @RequirePermission(P.SOA_READ)
  requirement(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.requirement(id);
  }
}
