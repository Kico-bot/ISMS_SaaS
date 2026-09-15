import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { schema } from '@isms/db';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import type { RequestWithCtx } from '../auth/auth.types';
import { DbService } from '../db/db.service';

const ACTION: Record<string, 'create' | 'update' | 'delete'> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const SKIP = new Set(['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']);

/** Schreibt für jeden erfolgreichen mutierenden Request eine Zeile ins append-only Audit-Log. */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly log = new Logger('AuditLog');

  constructor(private readonly dbs: DbService) {}

  intercept(ec: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ec.switchToHttp().getRequest<Request & RequestWithCtx>();
    const action = ACTION[req.method];
    if (!action || SKIP.has(req.path)) return next.handle();

    return next.handle().pipe(
      tap({
        next: (result) => {
          const ctx = req.ctx;
          const entityType = req.path.replace(/^\/api\/v1\//, '').split('/')[0] ?? 'unknown';
          const entityId = (req.params as Record<string, string | undefined>).id ?? (result as { id?: string } | undefined)?.id ?? null;
          const body = redact(req.body as Record<string, unknown> | undefined);
          const write = (tx: Parameters<Parameters<DbService['tenant']>[1]>[0]) =>
            tx.insert(schema.auditLog).values({
              tenantId: ctx?.tenantId ?? null,
              actorUserId: ctx?.userId ?? null,
              action,
              entityType,
              entityId,
              diff: body ? { request: body } : null,
              ip: req.ip ?? null,
              userAgent: req.headers['user-agent'] ?? null,
            });
          const p = ctx?.tenantId ? this.dbs.tenant(ctx.tenantId, write) : this.dbs.platform(write);
          p.catch((e) => this.log.warn(`audit_log write failed: ${(e as Error).message}`));
        },
      }),
    );
  }
}

function redact(body: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) out[k] = /password|secret|token/i.test(k) ? '[redacted]' : v;
  return out;
}
