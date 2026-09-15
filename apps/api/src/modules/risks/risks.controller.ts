import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcceptRiskDto,
  AssessRiskDto,
  type AuthContext,
  LinkRiskMeasureDto,
  ListQuery,
  P,
  QuantifyRiskDto,
  RiskDto,
  RiskPatchDto,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { RisksService } from './risks.service';

@ApiTags('risks')
@Controller('risks')
export class RisksController {
  constructor(private readonly risks: RisksService) {}

  @Get()
  @RequirePermission(P.RISK_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('ownerPersonId') ownerPersonId?: string,
  ) {
    return this.risks.list(ctx.tenantId, { ...q, status, kind, ownerPersonId });
  }

  @Get('matrix')
  @RequirePermission(P.RISK_READ)
  matrix(@TenantCtx() ctx: TenantAuthContext) {
    return this.risks.matrix(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.RISK_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.risks.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.RISK_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(RiskDto)) dto: RiskDto) {
    return this.risks.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.RISK_WRITE)
  update(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(RiskPatchDto)) dto: RiskPatchDto) {
    return this.risks.update(ctx, id, dto);
  }

  @Post(':id/assessments')
  @RequirePermission(P.RISK_WRITE)
  assess(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AssessRiskDto)) dto: AssessRiskDto) {
    return this.risks.assess(ctx, id, dto);
  }

  @Post(':id/accept')
  @RequirePermission(P.RISK_ACCEPT)
  accept(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AcceptRiskDto)) dto: AcceptRiskDto) {
    return this.risks.accept(ctx, id, dto);
  }

  @Patch(':id/quantification')
  @RequirePermission(P.RISK_WRITE)
  quantify(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(QuantifyRiskDto)) dto: QuantifyRiskDto) {
    return this.risks.quantify(ctx, id, dto);
  }

  @Post(':id/measures')
  @HttpCode(204)
  @RequirePermission(P.RISK_WRITE)
  async linkMeasure(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(LinkRiskMeasureDto)) dto: LinkRiskMeasureDto) {
    await this.risks.linkMeasure(ctx, id, dto);
  }

  @Delete(':id/measures/:measureId')
  @HttpCode(204)
  @RequirePermission(P.RISK_WRITE)
  async unlinkMeasure(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('measureId', ParseUUIDPipe) measureId: string) {
    await this.risks.unlinkMeasure(ctx, id, measureId);
  }
}
