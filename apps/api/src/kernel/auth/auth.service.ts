import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { schema, type Tx } from '@isms/db';
import {
  type AcceptInviteDto,
  DEFAULT_IMPACT_LABELS,
  DEFAULT_LIKELIHOOD_LABELS,
  DEFAULT_RISK_THRESHOLDS,
  type LoginDto,
  type RegisterTenantDto,
} from '@isms/shared';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { loadEnv } from '../../config/env';
import { DbService } from '../db/db.service';
import { type AccessClaims, INVITE_PLACEHOLDER } from './auth.types';

export interface MembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  roles: string[];
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; email: string; displayName: string; isPlatformAdmin: boolean };
  activeTenant: MembershipSummary | null;
  memberships: MembershipSummary[];
}

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  constructor(
    private readonly dbs: DbService,
    private readonly jwt: JwtService,
  ) {}

  // --- Registrierung: neuer Mandant + erster ISMS-Manager --------------------------------
  async registerTenant(dto: RegisterTenantDto, meta: { ip?: string; userAgent?: string }): Promise<Session> {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const db = this.dbs.db;

    const existingSlug = await db
      .select({ id: schema.tenant.id })
      .from(schema.tenant)
      .where(eq(schema.tenant.slug, dto.tenantSlug));
    if (existingSlug.length) throw new ConflictException({ title: 'Mandanten-Kürzel bereits vergeben' });

    const userId = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(schema.tenant)
        .values({ slug: dto.tenantSlug, name: dto.tenantName })
        .returning({ id: schema.tenant.id });
      const tenantId = t!.id;

      let [u] = await tx
        .select({ id: schema.user.id, hash: schema.user.passwordHash })
        .from(schema.user)
        .where(eq(schema.user.email, dto.email));
      if (!u) {
        [u] = await tx
          .insert(schema.user)
          .values({ email: dto.email, displayName: dto.displayName, passwordHash, authProvider: 'local' })
          .returning({ id: schema.user.id, hash: schema.user.passwordHash });
      } else if (!(await verifyPassword(u.hash ?? DUMMY_HASH, dto.password))) {
        throw new ConflictException({
          title: 'E-Mail bereits registriert',
          detail: 'Bitte mit dem bestehenden Passwort anmelden.',
        });
      }
      const userId = u!.id;

      const [m] = await tx
        .insert(schema.tenantMembership)
        .values({ tenantId, userId, status: 'active' })
        .returning({ id: schema.tenantMembership.id });
      const [managerRole] = await tx
        .select({ id: schema.role.id })
        .from(schema.role)
        .where(and(isNull(schema.role.tenantId), eq(schema.role.key, 'isms_manager')));
      await tx.insert(schema.membershipRole).values({ membershipId: m!.id, roleId: managerRole!.id });

      // Mandantendaten unterliegen RLS → Kontext setzen
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.insert(schema.person).values({ tenantId, userId, name: dto.displayName, email: dto.email });
      await tx.insert(schema.riskMatrixConfig).values({
        tenantId,
        likelihoodLabels: DEFAULT_LIKELIHOOD_LABELS,
        impactLabels: DEFAULT_IMPACT_LABELS,
        thresholds: DEFAULT_RISK_THRESHOLDS,
      });
      const [iso] = await tx
        .select({ id: schema.framework.id })
        .from(schema.framework)
        .where(eq(schema.framework.key, 'ISO27001'));
      if (iso)
        await tx.insert(schema.tenantFramework).values({ tenantId, frameworkId: iso.id, isPrimary: true });
      await tx.insert(schema.auditLog).values({
        tenantId,
        actorUserId: userId,
        action: 'create',
        entityType: 'tenant',
        entityId: tenantId,
      });
      return userId;
    });

    return this.issueSession(userId, dto.tenantSlug, meta);
  }

  // --- Login ----------------------------------------------------------------------------------
  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }): Promise<Session> {
    const [u] = await this.dbs.db
      .select({ id: schema.user.id, hash: schema.user.passwordHash, active: schema.user.isActive })
      .from(schema.user)
      .where(eq(schema.user.email, dto.email));
    // Unbekannte E-Mail und noch nicht angenommene Einladung verhalten sich wie ein falsches Passwort
    // (gleiche Antwort, gleiche Laufzeit) — sonst wären Konten aufzählbar.
    const hash = u?.hash && u.hash !== INVITE_PLACEHOLDER ? u.hash : DUMMY_HASH;
    const ok = await verifyPassword(hash, dto.password);
    if (!u || !ok || !u.active || u.hash === INVITE_PLACEHOLDER) {
      throw new UnauthorizedException({ title: 'E-Mail oder Passwort falsch' });
    }
    await this.dbs.db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, u.id));
    return this.issueSession(u.id, dto.tenantSlug ?? null, meta);
  }

  // --- Einladung annehmen ----------------------------------------------------------------------
  /**
   * Schließt eine Einladung ab: Passwort setzen (neues Konto) bzw. bestätigen (bestehendes Konto),
   * Mitgliedschaft aktivieren und direkt eine Session ausstellen.
   */
  async acceptInvite(dto: AcceptInviteDto, meta: { ip?: string; userAgent?: string }): Promise<Session> {
    const tokenHash = sha256(dto.token);
    const [row] = await this.dbs.db
      .select({
        membershipId: schema.tenantMembership.id,
        status: schema.tenantMembership.status,
        expiresAt: schema.tenantMembership.inviteExpiresAt,
        userId: schema.user.id,
        passwordHash: schema.user.passwordHash,
        tenantSlug: schema.tenant.slug,
      })
      .from(schema.tenantMembership)
      .innerJoin(schema.user, eq(schema.user.id, schema.tenantMembership.userId))
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.tenantMembership.tenantId))
      .where(eq(schema.tenantMembership.inviteTokenHash, tokenHash));

    if (!row || row.status !== 'invited')
      throw new UnauthorizedException({ title: 'Einladung ungültig oder bereits eingelöst' });
    if (row.expiresAt && row.expiresAt < new Date())
      throw new UnauthorizedException({ title: 'Einladung abgelaufen' });

    const isNewAccount = row.passwordHash === INVITE_PLACEHOLDER;
    if (!isNewAccount) {
      // Bestehendes Konto wird in einen weiteren Mandanten eingeladen: Passwort bestätigen, nie überschreiben.
      const ok = await verifyPassword(row.passwordHash ?? DUMMY_HASH, dto.password);
      if (!ok) throw new UnauthorizedException({ title: 'Passwort des bestehenden Kontos ist falsch' });
    }

    await this.dbs.db.transaction(async (tx) => {
      if (isNewAccount) {
        const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
        await tx.update(schema.user).set({ passwordHash }).where(eq(schema.user.id, row.userId));
      }
      await tx
        .update(schema.tenantMembership)
        .set({ status: 'active', inviteTokenHash: null, inviteExpiresAt: null })
        .where(eq(schema.tenantMembership.id, row.membershipId));
    });

    return this.issueSession(row.userId, row.tenantSlug, meta);
  }

  async switchTenant(
    userId: string,
    tenantSlug: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<Session> {
    return this.issueSession(userId, tenantSlug, meta);
  }

  // --- Refresh mit Rotation und Reuse-Detection ---------------------------------------------
  async refresh(rawToken: string, meta: { ip?: string; userAgent?: string }): Promise<Session> {
    const hash = sha256(rawToken);
    const [row] = await this.dbs.db
      .select()
      .from(schema.refreshToken)
      .where(eq(schema.refreshToken.tokenHash, hash));
    if (!row) throw new UnauthorizedException({ title: 'Sitzung ungültig' });
    if (row.revokedAt || row.replacedById) {
      // Wiederverwendung eines rotierten Tokens → gesamte Familie sperren
      await this.dbs.db
        .update(schema.refreshToken)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.refreshToken.family, row.family), isNull(schema.refreshToken.revokedAt)));
      throw new UnauthorizedException({
        title: 'Sitzung widerrufen',
        detail: 'Token-Wiederverwendung erkannt.',
      });
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException({ title: 'Sitzung abgelaufen' });

    const claimsTenant = await this.activeTenantSlugFromToken(row.id);
    const session = await this.issueSession(row.userId, claimsTenant, meta, row.family);
    await this.dbs.db
      .update(schema.refreshToken)
      .set({ replacedById: sha256ToId(session.refreshToken) ?? null, revokedAt: new Date() })
      .where(eq(schema.refreshToken.id, row.id));
    return session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const [row] = await this.dbs.db
      .select({ family: schema.refreshToken.family })
      .from(schema.refreshToken)
      .where(eq(schema.refreshToken.tokenHash, sha256(rawToken)));
    if (row) {
      await this.dbs.db
        .update(schema.refreshToken)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.refreshToken.family, row.family), isNull(schema.refreshToken.revokedAt)));
    }
  }

  // --- intern ---------------------------------------------------------------------------------
  private async issueSession(
    userId: string,
    tenantSlug: string | null,
    meta: { ip?: string; userAgent?: string },
    family?: string,
  ): Promise<Session> {
    const db = this.dbs.db;
    const [u] = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        displayName: schema.user.displayName,
        pa: schema.user.isPlatformAdmin,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    if (!u) throw new UnauthorizedException();

    const memberships = await this.listMemberships(db, userId);
    let active: MembershipSummary | null = null;
    if (tenantSlug) {
      active = memberships.find((m) => m.tenantSlug === tenantSlug) ?? null;
      if (!active) throw new UnauthorizedException({ title: 'Keine Mitgliedschaft in diesem Mandanten' });
    } else if (memberships.length === 1) {
      active = memberships[0]!;
    }

    let pv = 0;
    let personId: string | null = null;
    if (active) {
      const [t] = await db
        .select({ pv: schema.tenant.permissionsVersion })
        .from(schema.tenant)
        .where(eq(schema.tenant.id, active.tenantId));
      pv = t?.pv ?? 0;
      personId = await this.dbs.tenant(active.tenantId, async (tx) => {
        const [p] = await tx
          .select({ id: schema.person.id })
          .from(schema.person)
          .where(and(eq(schema.person.tenantId, active!.tenantId), eq(schema.person.userId, userId)));
        return p?.id ?? null;
      });
    }

    const claims: AccessClaims = {
      sub: userId,
      mid: active?.membershipId ?? null,
      tid: active?.tenantId ?? null,
      pid: personId,
      pv,
      pa: u.pa,
    };
    const accessToken = this.jwt.sign(claims, { expiresIn: this.env.JWT_ACCESS_TTL as never });

    const raw = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL_DAYS * 86_400_000);
    const [rt] = await db
      .insert(schema.refreshToken)
      .values({
        userId,
        tokenHash: sha256(raw),
        family: family ?? randomUUID(),
        expiresAt,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      })
      .returning({ id: schema.refreshToken.id });
    lastIssued.set(sha256(raw), rt!.id);
    // Mandant im Refresh-Token-Datensatz merken (für Rotation ohne erneute Auswahl)
    if (active) tokenTenant.set(rt!.id, active.tenantSlug);

    return {
      accessToken,
      refreshToken: raw,
      refreshExpiresAt: expiresAt,
      user: { id: u.id, email: u.email, displayName: u.displayName, isPlatformAdmin: u.pa },
      activeTenant: active,
      memberships,
    };
  }

  private async listMemberships(db: Tx | typeof this.dbs.db, userId: string): Promise<MembershipSummary[]> {
    const rows = await db
      .select({
        membershipId: schema.tenantMembership.id,
        tenantId: schema.tenant.id,
        tenantSlug: schema.tenant.slug,
        tenantName: schema.tenant.name,
        roleKey: schema.role.key,
      })
      .from(schema.tenantMembership)
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.tenantMembership.tenantId))
      .leftJoin(schema.membershipRole, eq(schema.membershipRole.membershipId, schema.tenantMembership.id))
      .leftJoin(schema.role, eq(schema.role.id, schema.membershipRole.roleId))
      .where(
        and(
          eq(schema.tenantMembership.userId, userId),
          eq(schema.tenantMembership.status, 'active'),
          eq(schema.tenant.isActive, true),
        ),
      );
    const byId = new Map<string, MembershipSummary>();
    for (const r of rows) {
      const m = byId.get(r.membershipId) ?? {
        membershipId: r.membershipId,
        tenantId: r.tenantId,
        tenantSlug: r.tenantSlug,
        tenantName: r.tenantName,
        roles: [],
      };
      if (r.roleKey) m.roles.push(r.roleKey);
      byId.set(r.membershipId, m);
    }
    return [...byId.values()];
  }

  private async activeTenantSlugFromToken(refreshTokenId: string): Promise<string | null> {
    return tokenTenant.get(refreshTokenId) ?? null;
  }
}

// Hilfsstrukturen (prozesslokal; bei mehreren Instanzen fällt die Rotation auf "kein aktiver Mandant" zurück,
// der Client ruft dann /auth/switch-tenant — bewusst KISS statt zusätzlicher Spalte).
const tokenTenant = new Map<string, string>();
const lastIssued = new Map<string, string>();

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
function sha256ToId(raw: string): string | undefined {
  return lastIssued.get(sha256(raw));
}

/** Wirft nie: ein beschädigter oder fremdformatiger Hash bedeutet „Passwort falsch“, keinen 500er. */
async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Gültiger argon2id-Hash eines Zufallswerts. Wird geprüft, wenn es kein echtes Passwort zu prüfen gibt,
 * damit unbekannte Konten dieselbe Antwortzeit haben wie bekannte (Timing-Enumeration).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$hCwNQ2XfxzJdm4IyH9BvdQ$dA82pYGPZmjcRctn5zswl4f2T5JSapiUnYYGLSkUWrw';
