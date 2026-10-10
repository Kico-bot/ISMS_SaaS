import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiSystemDto, AiSystemPatchDto, type AuthContext, P } from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { AiSystemsService } from './ai-systems.service';

/** KI-Register (EU AI Act) — nur Betreiberpflichten. Stilllegen statt löschen: Vorfälle hängen daran. */
@ApiTags('ai')
@Controller('ai-systems')
export class AiSystemsController {
  constructor(private readonly ai: AiSystemsService) {}

  @Get()
  @RequirePermission(P.AI_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.ai.list(ctx.tenantId);
  }

  @Get(':id')
  @RequirePermission(P.AI_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.AI_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(AiSystemDto)) dto: AiSystemDto) {
    return this.ai.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.AI_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AiSystemPatchDto)) dto: AiSystemPatchDto,
  ) {
    return this.ai.update(ctx, id, dto);
  }
}
