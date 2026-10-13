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
import { validatedBodies } from '../http/zod.pipe';

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
 * Was hier steht, ist der abgesetzte Request in der vom Schema geprüften Fassung (unbekannte
 * Felder entfernt, Geheimnisse geschwärzt, höchstens 16 KB), nicht der Zustand davor und danach. Das
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
          const body = action === 'login' ? null : requestBody(req.body);
          const query = action === 'export' ? (req.query as Record<string, unknown>) : undefined;

          const write = (tx: Parameters<Parameters<DbService['tenant']>[1]>[0]) =>
            tx.insert(schema.auditLog).values({
              tenantId: tenantId ?? null,
              actorUserId: actorUserId ?? null,
              action,
              entityType,
              entityId,
              diff: body ? bounded({ request: body }) : query ? bounded({ query }) : null,
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

/** Obergrenze eines Protokolleintrags. Die Tabelle lässt sich nicht löschen, sie darf nicht volllaufen. */
export const MAX_DIFF_BYTES = 16 * 1024;
const SECRET_KEY = /password|secret|token/i;

/**
 * Was vom Rumpf ins Protokoll geht: die vom Schema geprüfte Fassung, wenn die Route eine hat,
 * sonst der Rohinhalt. Beides rekursiv geschwärzt.
 */
function requestBody(raw: unknown): Record<string, unknown> | null {
  const source =
    typeof raw === 'object' && raw !== null && validatedBodies.has(raw) ? validatedBodies.get(raw) : raw;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  return redact(source) as Record<string, unknown>;
}

function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 20) return '[zu tief verschachtelt]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value))
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

/** Über der Grenze bleibt nur, welche Felder es gab und wie groß der Inhalt war. */
function bounded(diff: { request?: Record<string, unknown>; query?: Record<string, unknown> }) {
  const bytes = Buffer.byteLength(JSON.stringify(diff), 'utf8');
  if (bytes <= MAX_DIFF_BYTES) return diff;
  const [part, content] = Object.entries(diff)[0] as [string, Record<string, unknown>];
  const fields = Object.keys(content)
    .slice(0, 50)
    .map((k) => k.slice(0, 100));
  return { truncated: true, bytes, part, fields };
}
