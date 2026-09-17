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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthContext,
  BcExerciseDto,
  BiaDto,
  BiaImpactDto,
  BiaResourceDto,
  BusinessProcessDto,
  BusinessProcessPatchDto,
  ContinuityPlanDto,
  ContinuityPlanPatchDto,
  ContinuityStepDto,
  P,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { BiaService } from './bia.service';
import { PlansService } from './plans.service';
import { ProcessesService } from './processes.service';

@ApiTags('continuity')
@Controller('processes')
export class ProcessesController {
  constructor(
    private readonly processes: ProcessesService,
    private readonly bia: BiaService,
    private readonly plans: PlansService,
  ) {}

  @Get()
  @RequirePermission(P.CONTINUITY_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.processes.list(ctx.tenantId);
  }

  /** Prozesse mit BIA-Kennzahlen und Übungsstand — der Einstieg in die Notfallplanung. */
  @Get('overview')
  @RequirePermission(P.CONTINUITY_READ)
  overview(@TenantCtx() ctx: TenantAuthContext) {
    return this.bia.overview(ctx.tenantId);
  }

  @Post()
  @RequirePermission(P.CONTINUITY_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(BusinessProcessDto)) dto: BusinessProcessDto) {
    return this.processes.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.CONTINUITY_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BusinessProcessPatchDto)) dto: BusinessProcessPatchDto,
  ) {
    return this.processes.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.CONTINUITY_WRITE)
  async remove(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.processes.remove(ctx, id);
  }

  // --- Business-Impact-Analyse ------------------------------------------------------------
  @Get(':id/bia')
  @RequirePermission(P.CONTINUITY_READ)
  getBia(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bia.get(ctx.tenantId, id);
  }

  @Put(':id/bia')
  @RequirePermission(P.CONTINUITY_WRITE)
  upsertBia(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BiaDto)) dto: BiaDto,
  ) {
    return this.bia.upsert(ctx, id, dto);
  }

  @Put(':id/bia/impacts')
  @RequirePermission(P.CONTINUITY_WRITE)
  setImpact(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BiaImpactDto)) dto: BiaImpactDto,
  ) {
    return this.bia.setImpact(ctx, id, dto);
  }

  @Put(':id/bia/resources')
  @RequirePermission(P.CONTINUITY_WRITE)
  setResource(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BiaResourceDto)) dto: BiaResourceDto,
  ) {
    return this.bia.setResource(ctx, id, dto);
  }

  @Delete(':id/bia/resources/:assetId')
  @RequirePermission(P.CONTINUITY_WRITE)
  removeResource(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.bia.removeResource(ctx, id, assetId);
  }

  /** Freigabe im Vier-Augen-Prinzip — nicht durch die verantwortliche Person des Prozesses. */
  @Post(':id/bia/approve')
  @RequirePermission(P.CONTINUITY_WRITE)
  approveBia(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bia.approve(ctx, id);
  }

  @Post(':id/plans')
  @RequirePermission(P.CONTINUITY_WRITE)
  createPlan(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ContinuityPlanDto)) dto: ContinuityPlanDto,
  ) {
    return this.plans.create(ctx, id, dto);
  }
}

@ApiTags('continuity')
@Controller('continuity-plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermission(P.CONTINUITY_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.plans.list(ctx.tenantId);
  }

  /** Was in den nächsten 90 Tagen zu üben ist — inklusive des Überfälligen. */
  @Get('due')
  @RequirePermission(P.CONTINUITY_READ)
  due(@TenantCtx() ctx: TenantAuthContext) {
    return this.plans.dueExercises(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.CONTINUITY_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(ctx.tenantId, id);
  }

  @Patch(':id')
  @RequirePermission(P.CONTINUITY_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ContinuityPlanPatchDto)) dto: ContinuityPlanPatchDto,
  ) {
    return this.plans.update(ctx, id, dto);
  }

  @Put(':id/steps')
  @RequirePermission(P.CONTINUITY_WRITE)
  setStep(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ContinuityStepDto)) dto: ContinuityStepDto,
  ) {
    return this.plans.setStep(ctx, id, dto);
  }

  @Delete(':id/steps/:stepId')
  @RequirePermission(P.CONTINUITY_WRITE)
  removeStep(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ) {
    return this.plans.removeStep(ctx, id, stepId);
  }

  @Post(':id/exercises')
  @RequirePermission(P.CONTINUITY_WRITE)
  exercise(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BcExerciseDto)) dto: BcExerciseDto,
  ) {
    return this.plans.recordExercise(ctx, id, dto);
  }
}
