import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ASSET_RELATIONS, AssetDto, AssetPatchDto, type AuthContext, ListQuery, P } from '@isms/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { AssetsService } from './assets.service';

const LinkAssetDto = z.object({ toAssetId: z.string().uuid(), relation: z.enum(ASSET_RELATIONS) });

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission(P.ASSET_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('category') category?: string,
    @Query('classification') classification?: string,
    @Query('status') status?: string,
  ) {
    return this.assets.list(ctx.tenantId, { ...q, category, classification, status });
  }

  @Get(':id')
  @RequirePermission(P.ASSET_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.ASSET_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(AssetDto)) dto: AssetDto) {
    return this.assets.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.ASSET_WRITE)
  update(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AssetPatchDto)) dto: AssetPatchDto) {
    return this.assets.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.ASSET_WRITE)
  async remove(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.assets.remove(ctx, id);
  }

  @Post(':id/relations')
  @HttpCode(204)
  @RequirePermission(P.ASSET_WRITE)
  async link(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(LinkAssetDto)) dto: z.infer<typeof LinkAssetDto>) {
    await this.assets.link(ctx, id, dto.toAssetId, dto.relation);
  }
}
