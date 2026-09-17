import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthContext,
  DpiaDto,
  DpoOpinionDto,
  LinkProcessingAssetDto,
  LinkTomDto,
  ListQuery,
  P,
  ProcessingActivityDto,
  ProcessingActivityPatchDto,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { DpiaService } from './dpia.service';
import { ProcessingService } from './processing.service';

@ApiTags('privacy')
@Controller('processing-activities')
export class ProcessingController {
  constructor(
    private readonly processing: ProcessingService,
    private readonly dpia: DpiaService,
  ) {}

  @Get()
  @RequirePermission(P.PRIVACY_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('role') role?: string,
  ) {
    return this.processing.list(ctx.tenantId, { ...q, status, role });
  }

  /** Kennzahlen des Verzeichnisses — Drittlandübermittlungen ohne Garantien zuerst. */
  @Get('summary')
  @RequirePermission(P.PRIVACY_READ)
  summary(@TenantCtx() ctx: TenantAuthContext) {
    return this.processing.summary(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.PRIVACY_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.processing.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.PRIVACY_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(ProcessingActivityDto)) dto: ProcessingActivityDto) {
    return this.processing.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.PRIVACY_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ProcessingActivityPatchDto)) dto: ProcessingActivityPatchDto,
  ) {
    return this.processing.update(ctx, id, dto);
  }

  @Post(':id/toms')
  @RequirePermission(P.PRIVACY_WRITE)
  linkTom(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(LinkTomDto)) dto: LinkTomDto,
  ) {
    return this.processing.linkTom(ctx, id, dto.measureId);
  }

  @Delete(':id/toms/:measureId')
  @RequirePermission(P.PRIVACY_WRITE)
  unlinkTom(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('measureId', ParseUUIDPipe) measureId: string,
  ) {
    return this.processing.unlinkTom(ctx, id, measureId);
  }

  @Post(':id/assets')
  @RequirePermission(P.PRIVACY_WRITE)
  linkAsset(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(LinkProcessingAssetDto)) dto: LinkProcessingAssetDto,
  ) {
    return this.processing.linkAsset(ctx, id, dto.assetId);
  }

  // --- Datenschutz-Folgenabschätzung -----------------------------------------------------
  @Get(':id/dpia')
  @RequirePermission(P.PRIVACY_READ)
  getDpia(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.dpia.get(ctx.tenantId, id);
  }

  @Put(':id/dpia')
  @RequirePermission(P.PRIVACY_WRITE)
  upsertDpia(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(DpiaDto)) dto: DpiaDto,
  ) {
    return this.dpia.upsert(ctx, id, dto);
  }

  @Post(':id/dpia/submit')
  @RequirePermission(P.PRIVACY_WRITE)
  submitDpia(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.dpia.submit(ctx, id);
  }

  /** Stellungnahme nach Art. 35 Abs. 2 — nicht durch die verantwortliche Person. */
  @Post(':id/dpia/opinion')
  @RequirePermission(P.PRIVACY_WRITE)
  opinion(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(DpoOpinionDto)) dto: DpoOpinionDto,
  ) {
    return this.dpia.recordOpinion(ctx, id, dto);
  }
}
