import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { loadEnv } from '../../config/env';

/**
 * Zähler mit festem Zeitfenster: höchstens `limit` Treffer je Schlüssel und Fenster. Bewusst im
 * Speicher statt in Redis: Die Suite läuft als ein API-Prozess, und eine weitere Infrastruktur
 * nur für Zähler widerspräche dem KISS-Grundsatz. Wer mehrere API-Instanzen betreibt, begrenzt
 * zusätzlich im Reverse Proxy (siehe docs/deployment.md).
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Zählt einen Treffer. `retryAfterSec` sagt, wann der Schlüssel wieder darf. */
  hit(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (this.hits.size > 10_000) this.sweep(t);
    return {
      allowed: entry.count <= this.limit,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
    };
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

const RATE_LIMITED = 'rate_limited';

/**
 * Begrenzt Anmeldung, Registrierung, Einladung und Token-Erneuerung: je Adresse und Endpunkt
 * `AUTH_RATE_LIMIT_PER_MINUTE` Versuche pro Minute (großzügig, weil ein ganzes Büro hinter einer
 * Adresse sitzen kann), je Konto (E-Mail) `AUTH_RATE_LIMIT_PER_ACCOUNT` Versuche pro 15 Minuten.
 * Das bremst Passwortraten von einer Adresse ebenso wie verteiltes Raten gegen ein einzelnes
 * Konto. 0 schaltet die jeweilige Begrenzung ab.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger('RateLimit');
  private readonly ipLimit = loadEnv().AUTH_RATE_LIMIT_PER_MINUTE;
  private readonly accountLimit = loadEnv().AUTH_RATE_LIMIT_PER_ACCOUNT;
  private readonly perIp = new FixedWindowLimiter(this.ipLimit, 60_000);
  private readonly perAccount = new FixedWindowLimiter(this.accountLimit, 15 * 60_000);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ec: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(RATE_LIMITED, [ec.getHandler(), ec.getClass()])) {
      return true;
    }
    const req = ec.switchToHttp().getRequest<Request>();
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const ip = req.ip ?? 'unbekannt';
    const checks: { allowed: boolean; retryAfterSec: number }[] = [];
    if (this.ipLimit > 0) checks.push(this.perIp.hit(`${route}|${ip}`));
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (this.accountLimit > 0 && typeof email === 'string' && email.length > 0) {
      checks.push(this.perAccount.hit(`${route}|${email.trim().toLowerCase()}`));
    }
    const blocked = checks.find((c) => !c.allowed);
    if (!blocked) return true;

    this.log.warn(`Zu viele Versuche: ${route} von ${ip}`);
    ec.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(blocked.retryAfterSec));
    throw new HttpException(
      {
        type: 'https://isms.example/problems/too-many-requests',
        title: 'Zu viele Versuche',
        detail: `Bitte in ${blocked.retryAfterSec} Sekunden erneut versuchen.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Markiert einen Endpunkt als begrenzt und hängt den Guard an. */
export const RateLimit = () => applyDecorators(SetMetadata(RATE_LIMITED, true), UseGuards(RateLimitGuard));
