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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListQuery, MapRequirementDto, MeasureDto, MeasurePatchDto, P, type AuthContext } from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { MeasuresService } from './measures.service';

@ApiTags('measures')
@Controller('measures')
export class MeasuresController {
  constructor(private readonly measures: MeasuresService) {}

  @Get()
  @RequirePermission(P.MEASURE_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
  ) {
    return this.measures.list(ctx.tenantId, { ...q, status });
  }

  @Get(':id')
  @RequirePermission(P.MEASURE_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.measures.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.MEASURE_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(MeasureDto)) dto: MeasureDto) {
    return this.measures.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.MEASURE_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(MeasurePatchDto)) dto: MeasurePatchDto,
  ) {
    return this.measures.update(ctx, id, dto);
  }

  @Post(':id/verify')
  @RequirePermission(P.MEASURE_VERIFY)
  verify(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.measures.verify(ctx, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.MEASURE_WRITE)
  async remove(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.measures.remove(ctx, id);
  }

  // --- Mapping auf Framework-Anforderungen -----------------------------------------------------

  @Post(':id/requirements')
  @RequirePermission(P.MEASURE_WRITE)
  map(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(MapRequirementDto)) dto: MapRequirementDto,
  ) {
    return this.measures.mapRequirement(ctx, id, dto);
  }

  @Get(':id/requirements/:requirementId/suggestions')
  @RequirePermission(P.MEASURE_READ)
  suggestions(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.measures.suggestionsFor(ctx.tenantId, id, requirementId);
  }

  @Delete(':id/requirements/:requirementId')
  @HttpCode(204)
  @RequirePermission(P.MEASURE_WRITE)
  async unmap(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    await this.measures.unmapRequirement(ctx, id, requirementId);
  }
}
