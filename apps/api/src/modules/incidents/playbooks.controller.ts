import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuthContext, P, PLAYBOOK_SCENARIOS, PLAYBOOK_STATUS } from '@isms/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { PlaybooksService } from './playbooks.service';

const CreatePlaybookDto = z.object({
  scenario: z.enum(PLAYBOOK_SCENARIOS),
  title: z.string().min(3).max(200).optional(),
  assetId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
});
const SetStatusDto = z.object({ status: z.enum(PLAYBOOK_STATUS) });

@ApiTags('playbooks')
@Controller('playbooks')
export class PlaybooksController {
  constructor(private readonly playbooks: PlaybooksService) {}

  @Get()
  @RequirePermission(P.CONTINUITY_READ, P.INCIDENT_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.playbooks.list(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.CONTINUITY_READ, P.INCIDENT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.playbooks.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.CONTINUITY_WRITE)
  create(
    @Ctx() ctx: AuthContext,
    @Body(new ZodPipe(CreatePlaybookDto)) dto: z.infer<typeof CreatePlaybookDto>,
  ) {
    return this.playbooks.createFromTemplate(ctx, dto.scenario, dto);
  }

  /** Entwürfe für Assets mit hohem Verfügbarkeitsbedarf, die noch kein Playbook haben. */
  @Post('auto-generate')
  @RequirePermission(P.CONTINUITY_WRITE)
  autoGenerate(@Ctx() ctx: AuthContext) {
    return this.playbooks.autoGenerate(ctx);
  }

  @Put(':id/status')
  @RequirePermission(P.CONTINUITY_WRITE)
  setStatus(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SetStatusDto)) dto: z.infer<typeof SetStatusDto>,
  ) {
    return this.playbooks.setStatus(ctx, id, dto.status);
  }

  @Get('suggest/:incidentId')
  @RequirePermission(P.INCIDENT_READ)
  suggest(@TenantCtx() ctx: TenantAuthContext, @Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.playbooks.suggestFor(ctx.tenantId, incidentId);
  }
}
