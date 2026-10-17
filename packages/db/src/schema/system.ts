import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id } from './_common';
import { auditLogActionEnum } from './enums';
import { tenant, user } from './platform';

// I · Querschnitt ----------------------------------------------------------------------------------

/**
 * Append-only. UPDATE/DELETE werden der App-Rolle per Migration entzogen, `at` setzt ein Trigger
 * (0025). Die Fremdschlüssel verhindern das Löschen von Mandant und Konto, statt die Zeilen
 * mitzulöschen oder zu leeren: Das Protokoll verschwindet nicht über einen Umweg.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'restrict' }),
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
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    emailQueuedAt: timestamp('email_queued_at', { withTimezone: true }),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_user_idx').on(t.userId, t.readAt, t.createdAt),
    index('notification_outbox_idx')
      .on(t.emailQueuedAt)
      .where(sql`email_sent_at IS NULL AND email_queued_at IS NOT NULL`),
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

/**
 * Postausgang: was die Anwendung als Mail erzeugt hat, je Mandant. Ohne SMTP ist das die einzige
 * Stelle, an der sichtbar wird, was verschickt worden wäre. Eine Tabelle statt eines Speichers im
 * Prozess, damit API und Hintergrundprozess in dieselbe Ablage schreiben und RLS die Mandanten
 * trennt. Der Mailversand hält je Mandant nur die letzten Nachrichten vor.
 */
export const mailOutbox = pgTable(
  'mail_outbox',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    text: text('text').notNull(),
    driver: text('driver').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mail_outbox_tenant_at_idx').on(t.tenantId, t.at)],
);

/**
 * Tageslauf der Erinnerung: eine Zeile je Mandant und Tag (deutscher Zeit). Der Lauf legt sie in
 * derselben Transaktion an, die er bis nach dem Versand offen hält. Ein zweiter Lauf am selben
 * Tag, etwa nach einem Neustart des Hintergrundprozesses, findet sie und verschickt nichts.
 */
export const digestRun = pgTable(
  'digest_run',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    runDate: date('run_date').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.runDate] })],
);
