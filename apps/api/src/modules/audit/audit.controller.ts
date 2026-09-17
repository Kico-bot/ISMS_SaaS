import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuditDto,
  AuditPatchDto,
  type AuthContext,
  CloseReviewDto,
  FindingDto,
  FindingPatchDto,
  KpiDto,
  KpiValueDto,
  ListQuery,
  ManagementReviewDto,
  P,
  VerifyFindingDto,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { AuditsService } from './audits.service';
import { FindingsService } from './findings.service';
import { KpisService } from './kpis.service';
import { ReviewsService } from './reviews.service';

@ApiTags('audits')
@Controller('audits')
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get()
  @RequirePermission(P.AUDIT_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    return this.audits.list(ctx.tenantId, { ...q, status, kind });
  }

  /** Programmabdeckung je Kapitel — „ist im Zyklus alles einmal auditiert worden?“ */
  @Get('programme')
  @RequirePermission(P.AUDIT_READ)
  programme(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('framework') framework: string,
    @Query('cycleMonths') cycleMonths?: string,
  ) {
    const months = Number(cycleMonths);
    return this.audits.programme(
      ctx.tenantId,
      framework,
      Number.isFinite(months) && months > 0 ? Math.min(months, 120) : 36,
    );
  }

  @Get(':id')
  @RequirePermission(P.AUDIT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.audits.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.AUDIT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(AuditDto)) dto: AuditDto) {
    return this.audits.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.AUDIT_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AuditPatchDto)) dto: AuditPatchDto,
  ) {
    return this.audits.update(ctx, id, dto);
  }
}

@ApiTags('findings')
@Controller('findings')
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  @RequirePermission(P.AUDIT_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('auditId') auditId?: string,
    @Query('open') open?: string,
  ) {
    return this.findings.list(ctx.tenantId, { ...q, status, severity, auditId, open: open === 'true' });
  }

  @Get(':id')
  @RequirePermission(P.AUDIT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.findings.get(ctx.tenantId, id);
  }

  /** Feststellungen erhebt der Auditor — nicht, wer das ISMS betreibt. */
  @Post()
  @RequirePermission(P.FINDING_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(FindingDto)) dto: FindingDto) {
    return this.findings.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.FINDING_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(FindingPatchDto)) dto: FindingPatchDto,
  ) {
    return this.findings.update(ctx, id, dto);
  }

  @Post(':id/verify')
  @RequirePermission(P.FINDING_VERIFY)
  verify(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(VerifyFindingDto)) dto: VerifyFindingDto,
  ) {
    return this.findings.verify(ctx, id, dto.result);
  }
}

@ApiTags('management-reviews')
@Controller('management-reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RequirePermission(P.AUDIT_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.reviews.list(ctx.tenantId);
  }

  /** Tagesordnung nach Kap. 9.3.2 aus dem laufenden ISMS — ohne Sitzung anzulegen. */
  @Get('preview')
  @RequirePermission(P.AUDIT_READ)
  preview(@TenantCtx() ctx: TenantAuthContext) {
    return this.reviews.preview(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.AUDIT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.AUDIT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(ManagementReviewDto)) dto: ManagementReviewDto) {
    return this.reviews.create(ctx, dto);
  }

  @Post(':id/close')
  @RequirePermission(P.AUDIT_WRITE)
  close(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CloseReviewDto)) dto: CloseReviewDto,
  ) {
    return this.reviews.close(ctx, id, dto.decisions, dto.minutesFileId);
  }
}

@ApiTags('kpis')
@Controller('kpis')
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get()
  @RequirePermission(P.AUDIT_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.kpis.list(ctx.tenantId);
  }

  @Get(':id/history')
  @RequirePermission(P.AUDIT_READ)
  history(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.kpis.history(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.AUDIT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(KpiDto)) dto: KpiDto) {
    return this.kpis.create(ctx, dto);
  }

  @Post(':id/values')
  @RequirePermission(P.AUDIT_WRITE)
  record(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(KpiValueDto)) dto: KpiValueDto,
  ) {
    return this.kpis.record(ctx, id, dto);
  }

  /** Alle berechneten Kennzahlen fortschreiben — vor der Managementbewertung. */
  @Post('refresh')
  @RequirePermission(P.AUDIT_WRITE)
  refresh(@TenantCtx() ctx: TenantAuthContext) {
    return this.kpis.refresh(ctx.tenantId);
  }
}
