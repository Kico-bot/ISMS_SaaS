import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface PgError {
  code?: string;
  message?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Einheitliches Fehlerformat nach RFC 9457 (Problem Details).
 * Übersetzt DB-Fehler: SoD-Trigger → 409, Unique-Verletzung → 409, RLS/Rechte → 403, Check-Constraint → 422.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { type: 'about:blank', title: 'Interner Fehler' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body =
        typeof r === 'string'
          ? { type: 'about:blank', title: r }
          : { type: 'about:blank', title: exception.message, ...(r as object) };
    } else if (isBodyParserError(exception)) {
      // Fehler beim Lesen des Rumpfs (zu groß, kein gültiges JSON) sind Fehler der Anfrage,
      // nicht des Servers: kein 500, kein Stacktrace im Log.
      status = exception.status;
      body =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? {
              type: 'https://isms.example/problems/too-large',
              title: 'Anfrage ist zu groß',
              detail: 'Der Inhalt der Anfrage überschreitet die zulässige Größe.',
            }
          : { type: 'https://isms.example/problems/unreadable', title: 'Anfrage ist nicht lesbar' };
    } else if (isPgError(exception)) {
      const e = exception;
      if (e.code === '23514' && e.message?.startsWith('sod_violation')) {
        status = HttpStatus.CONFLICT;
        body = {
          type: 'https://isms.example/problems/sod-violation',
          title: 'Funktionstrennung verletzt',
          detail: e.message.replace('sod_violation: ', ''),
        };
      } else if (e.code === '23514') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        body = {
          type: 'https://isms.example/problems/constraint',
          title: 'Ungültige Daten',
          detail: e.constraint,
        };
      } else if (e.code === '23505') {
        // `e.detail` nennt die Werte des Schlüssels, auch fremde; nach außen geht er nicht.
        status = HttpStatus.CONFLICT;
        body = {
          type: 'https://isms.example/problems/duplicate',
          title: 'Datensatz existiert bereits',
        };
      } else if (e.code === '23503') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        body = {
          type: 'https://isms.example/problems/reference',
          title: 'Verknüpfter Datensatz nicht gefunden',
        };
      } else if (e.code === '42501') {
        status = HttpStatus.FORBIDDEN;
        body = { type: 'https://isms.example/problems/forbidden', title: 'Zugriff verweigert' };
      } else {
        this.log.error(`${req.method} ${req.url} → PG ${e.code}: ${e.message}`);
      }
    } else {
      this.log.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({ status, instance: req.url, ...body });
  }
}

function isPgError(e: unknown): e is PgError {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as PgError).code === 'string';
}

/** Fehler von body-parser (`entity.too.large`, `entity.parse.failed` …) tragen Status und Typ. */
function isBodyParserError(e: unknown): e is { status: number; type: string } {
  if (typeof e !== 'object' || e === null) return false;
  const { status, type } = e as { status?: unknown; type?: unknown };
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    typeof type === 'string' &&
    type.startsWith('entity.')
  );
}
