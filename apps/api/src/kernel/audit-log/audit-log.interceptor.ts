import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { schema } from '@isms/db';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import type { RequestWithCtx } from '../auth/auth.types';
import type { Session } from '../auth/auth.service';
import { DbService } from '../db/db.service';

type LoggedAction = 'create' | 'update' | 'delete' | 'login' | 'export';

const ACTION: Record<string, 'create' | 'update' | 'delete'> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};
/** Erneuern und Abmelden sagen nichts aus und liefen sonst im Minutentakt ins Protokoll. */
const SKIP = new Set(['/api/v1/auth/refresh', '/api/v1/auth/logout']);
const LOGIN_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/accept-invite',
  '/api/v1/auth/switch-tenant',
]);

/**
 * Schreibt für jeden erfolgreichen mutierenden Request eine Zeile ins append-only Audit-Log.
 *
 * Drei Arten von Ereignissen stehen darin, weil ein Auditor nach genau diesen drei fragt:
 * Änderungen an Daten, erfolgreiche Anmeldungen (Kap. A.8.15, A.5.16) und Ausleitungen — wer
 * das Verarbeitungsverzeichnis einer Aufsichtsbehörde mitgibt, hat den Registerbestand
 * außer Haus gegeben, und das gehört protokolliert.
 *
 * Was hier steht, ist der abgesetzte Request, nicht der Zustand davor und danach. Das
 * beantwortet „wer hat wann was angefasst“, nicht „welchen Wert hatte das Feld vorher“ —
 * für Letzteres führen die Fachmodule ihre eigenen Historien (Dokumentenversionen,
 * Risikobewertungen, eingefrorene Managementbewertungen).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly log = new Logger('AuditLog');

  constructor(private readonly dbs: DbService) {}

  intercept(ec: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ec.switchToHttp().getRequest<Request & RequestWithCtx>();
    if (SKIP.has(req.path)) return next.handle();
    const action = resolveAction(req);
    if (!action) return next.handle();

    return next.handle().pipe(
      tap({
        next: (result) => {
          const path = req.path.replace(/^\/api\/v1\//, '');
          const segments = path.split('/');
          const session = result as Session | undefined;
          // Bei der Anmeldung gibt es noch keinen AuthContext — Person und Mandant stehen
          // erst in der Antwort.
          const tenantId = req.ctx?.tenantId ?? (action === 'login' ? session?.activeTenant?.tenantId : null);
          const actorUserId = req.ctx?.userId ?? (action === 'login' ? session?.user?.id : null);

          const entityType = action === 'export' ? 'exports' : (segments[0] ?? 'unknown');
          const entityId =
            action === 'export'
              ? (segments[1] ?? null)
              : ((req.params as Record<string, string | undefined>).id ??
                (result as { id?: string } | undefined)?.id ??
                null);
          // Eine Anmeldung führt kein Formular mit; der Rumpf enthielte nur das Kennwort.
          const body = action === 'login' ? null : redact(req.body as Record<string, unknown> | undefined);
          const query = action === 'export' ? (req.query as Record<string, unknown>) : undefined;

          const write = (tx: Parameters<Parameters<DbService['tenant']>[1]>[0]) =>
            tx.insert(schema.auditLog).values({
              tenantId: tenantId ?? null,
              actorUserId: actorUserId ?? null,
              action,
              entityType,
              entityId,
              diff: body ? { request: body } : query ? { query } : null,
              ip: req.ip ?? null,
              userAgent: req.headers['user-agent'] ?? null,
            });
          const p = tenantId ? this.dbs.tenant(tenantId, write) : this.dbs.platform(write);
          p.catch((e) => this.log.warn(`audit_log write failed: ${(e as Error).message}`));
        },
      }),
    );
  }
}

/**
 * Welche Art von Ereignis der Request ist.
 *
 * Ein POST auf eine untergeordnete Route (`/risks/:id/assessments`, `/incidents/:id/mark-significant`)
 * legt zwar etwas an, verändert aber vor allem den übergeordneten Vorgang — im Protokoll steht
 * deshalb „geändert“. Sonst stünden im Verlauf eines Risikos lauter „angelegt“, obwohl es nur
 * einmal entstanden ist.
 */
function resolveAction(req: Request & RequestWithCtx): LoggedAction | undefined {
  if (LOGIN_PATHS.has(req.path)) return 'login';
  if (req.method === 'GET') return req.path.startsWith('/api/v1/exports/') ? 'export' : undefined;
  const base = ACTION[req.method];
  if (!base) return undefined;
  const segments = req.path.replace(/^\/api\/v1\//, '').split('/');
  return base === 'create' && segments.length > 2 ? 'update' : base;
}

function redact(body: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) out[k] = /password|secret|token/i.test(k) ? '[redacted]' : v;
  return out;
}
