import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { P, UpsertTenantRequirementDto } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { SoaService } from './soa.service';

@ApiTags('soa')
@Controller('soa')
export class SoaController {
  constructor(private readonly soa: SoaService) {}

  @Get()
  @ApiQuery({ name: 'framework', example: 'ISO27001' })
  @RequirePermission(P.SOA_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('framework') framework: string,
    @Query('kind') kind?: string,
  ) {
    return this.soa.list(ctx.tenantId, framework, { kind });
  }

  @Get('by-chapter')
  @ApiQuery({ name: 'framework', example: 'ISO27001' })
  @RequirePermission(P.SOA_READ)
  byChapter(@TenantCtx() ctx: TenantAuthContext, @Query('framework') framework: string) {
    return this.soa.byChapter(ctx.tenantId, framework);
  }

  @Patch(':requirementId')
  @RequirePermission(P.SOA_WRITE)
  upsert(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body(new ZodPipe(UpsertTenantRequirementDto)) dto: UpsertTenantRequirementDto,
  ) {
    return this.soa.upsert(ctx.tenantId, ctx.userId, requirementId, dto);
  }
}
