import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcknowledgementRequestDto,
  type AuthContext,
  DocumentDto,
  DocumentVersionDto,
  ListQuery,
  P,
} from '@isms/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { DocumentsService } from './documents.service';

const LinkRequirementDto = z.object({ requirementId: z.string().uuid() });
const AcknowledgeDto = z.object({ personId: z.string().uuid().optional() });

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermission(P.DOCUMENT_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query(new ZodPipe(ListQuery)) q: ListQuery,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
  ) {
    return this.documents.list(ctx.tenantId, { ...q, kind, status });
  }

  /** „Was muss ich noch lesen?“ — offene Lesebestätigungen der aufrufenden Person. */
  @Get('my-acknowledgements')
  @RequirePermission(P.DOCUMENT_READ)
  myPending(@Ctx() ctx: AuthContext) {
    return this.documents.myPending(ctx.tenantId!, ctx.personId);
  }

  @Get(':id')
  @RequirePermission(P.DOCUMENT_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.DOCUMENT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(DocumentDto)) dto: DocumentDto) {
    return this.documents.create(ctx, dto);
  }

  @Post(':id/versions')
  @RequirePermission(P.DOCUMENT_WRITE)
  addVersion(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(DocumentVersionDto)) dto: DocumentVersionDto,
  ) {
    return this.documents.addVersion(ctx, id, dto);
  }

  @Post(':id/versions/:versionId/submit')
  @RequirePermission(P.DOCUMENT_WRITE)
  submit(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.documents.submitForReview(ctx, id, versionId);
  }

  /** Freigabe im Vier-Augen-Prinzip — nie durch die Autorin oder den Autor der Version. */
  @Post(':id/versions/:versionId/approve')
  @RequirePermission(P.DOCUMENT_APPROVE)
  approve(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.documents.approve(ctx, id, versionId);
  }

  @Post(':id/acknowledgements')
  @RequirePermission(P.DOCUMENT_PUBLISH)
  requestAck(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AcknowledgementRequestDto)) dto: AcknowledgementRequestDto,
  ) {
    return this.documents.requestAcknowledgement(ctx, id, dto);
  }

  /** Wer hat noch nicht bestätigt — die Frage, die vor jedem Audit gestellt wird. */
  @Get('acknowledgements/:campaignId')
  @RequirePermission(P.DOCUMENT_READ)
  pending(@TenantCtx() ctx: TenantAuthContext, @Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.documents.pending(ctx.tenantId, campaignId);
  }

  /**
   * Bestätigen. Ohne personId bestätigt die aufrufende Person für sich selbst;
   * fremde Bestätigungen erfordern Schreibrechte auf der Dokumentenlenkung.
   */
  @Post('acknowledgements/:campaignId/confirm')
  @RequirePermission(P.DOCUMENT_READ)
  acknowledge(
    @Ctx() ctx: AuthContext,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body(new ZodPipe(AcknowledgeDto)) dto: z.infer<typeof AcknowledgeDto>,
  ) {
    return this.documents.acknowledge(ctx, campaignId, dto.personId);
  }

  /** Dokument einer Normanforderung zuordnen — Nachweis für die SoA. */
  @Post(':id/requirements')
  @RequirePermission(P.DOCUMENT_WRITE)
  link(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(LinkRequirementDto)) dto: z.infer<typeof LinkRequirementDto>,
  ) {
    return this.documents.linkRequirement(ctx, id, dto.requirementId);
  }
}
