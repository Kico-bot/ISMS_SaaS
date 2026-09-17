import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActionDto, ActionPatchDto, type AuthContext, ListQuery, P } from '@isms/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { ActionsService } from './actions.service';

const VerifyDto = z.object({ result: z.string().min(5).max(4000) });

@ApiTags('actions')
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  @RequirePermission(P.ACTION_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.actions.list(ctx.tenantId, { ...q, status, kind, overdue: overdue === 'true' });
  }

  @Post()
  @RequirePermission(P.ACTION_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(ActionDto)) dto: ActionDto) {
    return this.actions.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.ACTION_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ActionPatchDto)) dto: ActionPatchDto,
  ) {
    return this.actions.update(ctx, id, dto);
  }

  @Post(':id/verify')
  @RequirePermission(P.ACTION_VERIFY)
  verify(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(VerifyDto)) dto: z.infer<typeof VerifyDto>,
  ) {
    return this.actions.verify(ctx, id, dto.result);
  }
}
