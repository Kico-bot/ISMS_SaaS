import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { P } from '@isms/shared';
import type { Response } from 'express';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { exportFilename } from './csv';
import { ExportsService, type ExportResult } from './exports.service';

/**
 * Ausleitungen für Auditoren und Aufsichtsbehörden. Alles wird bei jedem Abruf neu erzeugt —
 * es gibt keinen zweiten Datenstand, der gepflegt werden müsste.
 */
@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('soa.csv')
  @RequirePermission(P.REPORT_EXPORT)
  async soaCsv(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('framework') framework = 'ISO27001',
    @Res() res: Response,
  ) {
    send(res, await this.exports.soaCsv(ctx.tenantId, framework), 'csv');
  }

  /** Druckfertige Erklärung zur Anwendbarkeit — im Browser über „Drucken“ zum PDF. */
  @Get('soa.html')
  @RequirePermission(P.REPORT_EXPORT)
  async soaDocument(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('framework') framework = 'ISO27001',
    @Res() res: Response,
  ) {
    send(res, await this.exports.soaDocument(ctx.tenantId, framework), 'html');
  }

  @Get('processing-activities.csv')
  @RequirePermission(P.REPORT_EXPORT)
  async processingCsv(@TenantCtx() ctx: TenantAuthContext, @Res() res: Response) {
    send(res, await this.exports.processingCsv(ctx.tenantId), 'csv');
  }

  @Get('processing-activities.html')
  @RequirePermission(P.REPORT_EXPORT)
  async processingDocument(@TenantCtx() ctx: TenantAuthContext, @Res() res: Response) {
    send(res, await this.exports.processingDocument(ctx.tenantId), 'html');
  }

  @Get('risks.csv')
  @RequirePermission(P.REPORT_EXPORT)
  async riskCsv(@TenantCtx() ctx: TenantAuthContext, @Res() res: Response) {
    send(res, await this.exports.riskCsv(ctx.tenantId), 'csv');
  }

  @Get('measures.csv')
  @RequirePermission(P.REPORT_EXPORT)
  async measureCsv(@TenantCtx() ctx: TenantAuthContext, @Res() res: Response) {
    send(res, await this.exports.measureCsv(ctx.tenantId), 'csv');
  }
}

/**
 * CSV geht als Anhang heraus. Das Dokument wird angezeigt, weil es gedruckt werden soll —
 * es ist selbst erzeugtes HTML, in dem jeder Mandantenwert maskiert wurde.
 */
function send(res: Response, result: ExportResult, extension: 'csv' | 'html'): void {
  const filename = exportFilename(result.filename, extension);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extension === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  }
  res.send(result.body);
}
