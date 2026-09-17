import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { P } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { AuditLogService } from './auditlog.service';

/**
 * Änderungsprotokoll. Lesen darf es, wer `auditlog.read` hat — ISMS-Leitung, Auditor und DSB.
 * Schreiben kann es niemand: die Einträge entstehen ausschließlich im Interceptor.
 */
@ApiTags('audit-log')
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission(P.AUDITLOG_READ)
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditLog.list(ctx.tenantId, {
      entityType,
      entityId,
      action,
      actorUserId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('facets')
  @RequirePermission(P.AUDITLOG_READ)
  facets(@TenantCtx() ctx: TenantAuthContext) {
    return this.auditLog.facets(ctx.tenantId);
  }

  @Get('entity/:entityType/:entityId')
  @RequirePermission(P.AUDITLOG_READ)
  forEntity(
    @TenantCtx() ctx: TenantAuthContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLog.forEntity(ctx.tenantId, entityType, entityId);
  }
}
