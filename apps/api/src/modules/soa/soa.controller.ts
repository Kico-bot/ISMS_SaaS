import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ModuleDto, P, ProtectionVariantDto, UpsertTenantRequirementDto } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { ModelingService } from './modeling.service';
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

/** Modellierung (IT-Grundschutz): Absicherungsvariante und gewählte Bausteine. */
@ApiTags('soa')
@Controller('modeling')
export class ModelingController {
  constructor(private readonly modeling: ModelingService) {}

  @Get()
  @ApiQuery({ name: 'framework', example: 'BSI_GS' })
  @RequirePermission(P.SOA_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Query('framework') framework: string) {
    return this.modeling.get(ctx.tenantId, framework);
  }

  @Patch('variant')
  @RequirePermission(P.SOA_WRITE)
  setVariant(
    @TenantCtx() ctx: TenantAuthContext,
    @Body(new ZodPipe(ProtectionVariantDto)) dto: ProtectionVariantDto,
  ) {
    return this.modeling.setVariant(ctx.tenantId, dto);
  }

  @Post('baseline')
  @ApiQuery({ name: 'framework', example: 'BSI_GS' })
  @RequirePermission(P.SOA_WRITE)
  adoptBaseline(@TenantCtx() ctx: TenantAuthContext, @Query('framework') framework: string) {
    return this.modeling.adoptBaseline(ctx.tenantId, framework);
  }

  @Put('modules/:requirementId')
  @RequirePermission(P.SOA_WRITE)
  model(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body(new ZodPipe(ModuleDto)) dto: ModuleDto,
  ) {
    return this.modeling.model(ctx.tenantId, requirementId, dto);
  }

  @Delete('modules/:requirementId')
  @HttpCode(204)
  @RequirePermission(P.SOA_WRITE)
  async unmodel(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    await this.modeling.unmodel(ctx.tenantId, requirementId);
  }
}
