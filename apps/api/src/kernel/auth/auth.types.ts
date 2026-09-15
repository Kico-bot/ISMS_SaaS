import type { AuthContext } from '@isms/shared';

/** Claims des Access-Tokens — bewusst klein; die Permission-Liste kommt aus dem Cache. */
export interface AccessClaims {
  sub: string; // user.id
  mid: string | null; // tenant_membership.id
  tid: string | null; // tenant.id
  pid: string | null; // person.id
  pv: number; // tenant.permissions_version beim Ausstellen
  pa: boolean; // is_platform_admin
}

export interface RequestWithCtx {
  ctx?: AuthContext;
  claims?: AccessClaims;
}

export const REQUIRE_PERMISSION = 'isms:require_permission';
export const PUBLIC_ROUTE = 'isms:public';

/**
 * Passwort-Platzhalter für eingeladene Konten. Kein gültiger argon2-Hash — er kann nie verifizieren,
 * das Konto ist bis zur Annahme der Einladung nicht anmeldbar.
 */
export const INVITE_PLACEHOLDER = '!invited';
