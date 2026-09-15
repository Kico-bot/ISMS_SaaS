import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InviteMemberDto, P, SetMemberRolesDto } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../auth/decorators';
import { ZodPipe } from '../http/zod.pipe';
import { MembersService } from './members.service';

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission(P.TENANT_MEMBERS, P.CONTEXT_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.members.list(ctx.tenantId);
  }

  @Post()
  @RequirePermission(P.TENANT_MEMBERS)
  invite(@TenantCtx() ctx: TenantAuthContext, @Body(new ZodPipe(InviteMemberDto)) dto: InviteMemberDto) {
    return this.members.invite(ctx.tenantId, ctx.userId, dto);
  }

  @Put(':id/roles')
  @RequirePermission(P.TENANT_MEMBERS)
  setRoles(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(SetMemberRolesDto)) dto: SetMemberRolesDto) {
    return this.members.setRoles(ctx.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.TENANT_MEMBERS)
  async remove(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.members.remove(ctx.tenantId, id, ctx.membershipId);
  }
}
