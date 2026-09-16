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
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthContext,
  EvidenceDto,
  EvidencePatchDto,
  LinkEvidenceDto,
  MAX_UPLOAD_BYTES,
  P,
} from '@isms/shared';
import type { Response } from 'express';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { EvidenceService } from './evidence.service';
import { FilesService, type UploadInput } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission(P.MEASURE_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.files.list(ctx.tenantId);
  }

  @Post()
  @RequirePermission(P.MEASURE_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@Ctx() ctx: AuthContext, @UploadedFile() file: UploadInput) {
    return this.files.upload(ctx, file);
  }

  /**
   * Download. Immer als Anhang und nie eingebettet: eine hochgeladene Datei wird niemals
   * im Ursprung der Anwendung gerendert, sonst wäre ein Nachweis ein Einfallstor.
   */
  @Get(':id')
  @RequirePermission(P.MEASURE_READ)
  async download(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { meta, stream } = await this.files.download(ctx.tenantId, id);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', String(meta.sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    stream.pipe(res);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.MEASURE_WRITE)
  async remove(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.files.remove(ctx, id);
  }
}

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  @RequirePermission(P.MEASURE_READ)
  list(@TenantCtx() ctx: TenantAuthContext, @Query('expired') expired?: string) {
    return this.evidence.list(ctx.tenantId, expired === 'true');
  }

  @Post()
  @RequirePermission(P.MEASURE_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(EvidenceDto)) dto: EvidenceDto) {
    return this.evidence.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.MEASURE_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(EvidencePatchDto)) dto: EvidencePatchDto,
  ) {
    return this.evidence.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(P.MEASURE_WRITE)
  async remove(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.evidence.remove(ctx, id);
  }

  @Get('measure/:measureId')
  @RequirePermission(P.MEASURE_READ)
  forMeasure(@TenantCtx() ctx: TenantAuthContext, @Param('measureId', ParseUUIDPipe) measureId: string) {
    return this.evidence.forMeasure(ctx.tenantId, measureId);
  }

  @Post('measure/:measureId')
  @RequirePermission(P.MEASURE_WRITE)
  link(
    @Ctx() ctx: AuthContext,
    @Param('measureId', ParseUUIDPipe) measureId: string,
    @Body(new ZodPipe(LinkEvidenceDto)) dto: LinkEvidenceDto,
  ) {
    return this.evidence.linkMeasure(ctx, measureId, dto.evidenceId);
  }

  @Delete('measure/:measureId/:evidenceId')
  @RequirePermission(P.MEASURE_WRITE)
  unlink(
    @Ctx() ctx: AuthContext,
    @Param('measureId', ParseUUIDPipe) measureId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidence.unlinkMeasure(ctx, measureId, evidenceId);
  }
}
