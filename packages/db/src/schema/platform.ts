import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, id, timestamps } from './_common';
import { authProviderEnum, membershipStatusEnum, sodModeEnum } from './enums';

// A · Plattform & Identität ------------------------------------------------------------

export const tenant = pgTable('tenant', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** Bei jeder Rollen-/Rechteänderung +1 → sofortige Invalidierung des Permission-Caches. */
  permissionsVersion: integer('permissions_version').notNull().default(1),
  ssoProvider: authProviderEnum('sso_provider'),
  /** verschlüsselt (pgp_sym_encrypt mit APP_MASTER_KEY), Klartext nie in der DB */
  ssoConfigEncrypted: text('sso_config_encrypted'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const user = pgTable(
  'user',
  {
    id: id(),
    email: citext('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    authProvider: authProviderEnum('auth_provider').notNull().default('local'),
    externalSubject: text('external_subject'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check(
      'user_auth_chk',
      sql`(${t.authProvider} = 'local' AND ${t.passwordHash} IS NOT NULL) OR ${t.authProvider} <> 'local'`,
    ),
    unique('user_external_subject_uq').on(t.authProvider, t.externalSubject),
  ],
);

export const refreshToken = pgTable(
  'refresh_token',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** Token-Familie für Reuse-Detection: bei Wiederverwendung wird die ganze Familie widerrufen. */
    family: uuid('family').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refresh_token_user_idx').on(t.userId, t.expiresAt)],
);

export const tenantMembership = pgTable(
  'tenant_membership',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: membershipStatusEnum('status').notNull().default('invited'),
    invitedByUserId: uuid('invited_by_user_id').references(() => user.id),
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('tenant_membership_uq').on(t.tenantId, t.userId),
    index('tenant_membership_user_idx').on(t.userId),
  ],
);

export const permission = pgTable('permission', {
  key: text('key').primaryKey(),
  module: text('module').notNull(),
  action: text('action').notNull(),
  description: text('description'),
});

export const role = pgTable(
  'role',
  {
    id: id(),
    /** NULL = Systemrolle (global), sonst mandantenspezifische Kopie */
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (t) => [unique('role_tenant_key_uq').on(t.tenantId, t.key).nullsNotDistinct()],
);

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permission.key),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const membershipRole = pgTable(
  'membership_role',
  {
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => tenantMembership.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.roleId] })],
);

export const sodRule = pgTable(
  'sod_rule',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    roleA: uuid('role_a')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    roleB: uuid('role_b')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    mode: sodModeEnum('mode').notNull(),
    reason: text('reason'),
  },
  (t) => [
    check('sod_rule_order_chk', sql`${t.roleA} < ${t.roleB}`),
    unique('sod_rule_uq').on(t.tenantId, t.roleA, t.roleB).nullsNotDistinct(),
  ],
);
