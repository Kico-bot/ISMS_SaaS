import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './_common';
import { auditLogActionEnum } from './enums';
import { tenant, user } from './platform';

// I · Querschnitt ----------------------------------------------------------------------------------

/** Append-only. UPDATE/DELETE werden der App-Rolle per Migration entzogen. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    action: auditLogActionEnum('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    /** { before, after } bzw. Zusatzinfos */
    diff: jsonb('diff'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('audit_log_tenant_at_idx').on(t.tenantId, t.at),
    index('audit_log_entity_idx').on(t.tenantId, t.entityType, t.entityId),
    index('audit_log_at_brin').using('brin', t.at),
  ],
);

export const notification = pgTable(
  'notification',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    emailQueuedAt: timestamp('email_queued_at', { withTimezone: true }),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_user_idx').on(t.userId, t.readAt, t.createdAt),
    index('notification_outbox_idx').on(t.emailQueuedAt).where(sql`email_sent_at IS NULL AND email_queued_at IS NOT NULL`),
  ],
);

export const integration = pgTable(
  'integration',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    configEncrypted: text('config_encrypted'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('integration_tenant_idx').on(t.tenantId, t.kind)],
);

export const integrationEvent = pgTable(
  'integration_event',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integration.id, { onDelete: 'cascade' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    externalId: text('external_id'),
    payload: jsonb('payload').notNull(),
    mappedIncidentId: uuid('mapped_incident_id'),
  },
  (t) => [index('integration_event_idx').on(t.integrationId, t.receivedAt)],
);
