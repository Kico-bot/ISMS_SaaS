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
        status = HttpStatus.CONFLICT;
        body = {
          type: 'https://isms.example/problems/duplicate',
          title: 'Datensatz existiert bereits',
          detail: e.detail,
        };
      } else if (e.code === '23503') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        body = {
          type: 'https://isms.example/problems/reference',
          title: 'Verknüpfter Datensatz nicht gefunden',
          detail: e.detail,
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
