import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthContext,
  ConfirmBreachDto,
  FulfilObligationDto,
  IncidentDto,
  IncidentPatchDto,
  ListQuery,
  MarkSignificantDto,
  P,
  RcaDto,
  TimelineEntryDto,
} from '@isms/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { IncidentsService } from './incidents.service';

const ActivatePlaybookDto = z.object({ playbookId: z.string().uuid() });
const ToggleStepDto = z.object({ done: z.boolean(), note: z.string().max(2000).optional() });

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermission(P.INCIDENT_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('open') open?: string,
  ) {
    return this.incidents.list(ctx.tenantId, { ...q, status, severity, open: open === 'true' });
  }

  /** Offene Meldefristen über alle Vorfälle — für Dashboard und Fristenmonitor. */
  @Get('obligations')
  @RequirePermission(P.INCIDENT_READ)
  obligations(@TenantCtx() ctx: TenantAuthContext) {
    return this.incidents.openObligations(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.INCIDENT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.get(ctx.tenantId, id);
  }

  /** Melden darf jede Rolle — Vorfälle sollen nicht an Berechtigungen scheitern. */
  @Post()
  @RequirePermission(P.INCIDENT_REPORT, P.INCIDENT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(IncidentDto)) dto: IncidentDto) {
    return this.incidents.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.INCIDENT_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(IncidentPatchDto)) dto: IncidentPatchDto,
  ) {
    return this.incidents.update(ctx, id, dto);
  }

  @Post(':id/confirm-breach')
  @RequirePermission(P.INCIDENT_WRITE)
  confirmBreach(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ConfirmBreachDto)) dto: ConfirmBreachDto,
  ) {
    return this.incidents.confirmBreach(ctx, id, dto);
  }

  @Post(':id/mark-significant')
  @RequirePermission(P.INCIDENT_WRITE)
  markSignificant(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(MarkSignificantDto)) dto: MarkSignificantDto,
  ) {
    return this.incidents.markSignificant(ctx, id, dto);
  }

  @Post(':id/obligations/:obligationId/fulfil')
  @RequirePermission(P.INCIDENT_WRITE)
  fulfil(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @Body(new ZodPipe(FulfilObligationDto)) dto: FulfilObligationDto,
  ) {
    return this.incidents.fulfilObligation(ctx, id, obligationId, dto);
  }

  @Post(':id/timeline')
  @RequirePermission(P.INCIDENT_WRITE)
  timeline(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(TimelineEntryDto)) dto: TimelineEntryDto,
  ) {
    return this.incidents.addTimelineEntry(ctx, id, dto);
  }

  @Post(':id/rca')
  @RequirePermission(P.INCIDENT_WRITE)
  rca(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RcaDto)) dto: RcaDto,
  ) {
    return this.incidents.upsertRca(ctx, id, dto);
  }

  @Post(':id/playbook')
  @RequirePermission(P.INCIDENT_WRITE)
  activatePlaybook(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ActivatePlaybookDto)) dto: { playbookId: string },
  ) {
    return this.incidents.activatePlaybook(ctx, id, dto.playbookId);
  }

  @Post(':id/playbook-steps/:stepId')
  @RequirePermission(P.INCIDENT_WRITE)
  toggleStep(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodPipe(ToggleStepDto)) dto: z.infer<typeof ToggleStepDto>,
  ) {
    return this.incidents.toggleStep(ctx, id, stepId, dto.done, dto.note);
  }
}
