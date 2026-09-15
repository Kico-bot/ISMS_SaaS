import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { requirement } from './catalog';
import { file, person } from './core';
import { applicabilityEnum, controlDomainEnum, coverageEnum, mappingOriginEnum, measureStatusEnum } from './enums';
import { tenant, user } from './platform';

// E · Maßnahmen & Statement of Applicability -------------------------------------------------

const tenantRef = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

/** SoA-Zeile: Anwendbarkeit + Self-Assessment je Anforderung und Mandant. */
export const tenantRequirement = pgTable(
  'tenant_requirement',
  {
    tenantId: tenantRef(),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id),
    applicability: applicabilityEnum('applicability').notNull().default('applicable'),
    justification: text('justification'),
    maturity: smallint('maturity'),
    targetMaturity: smallint('target_maturity'),
    notes: text('notes'),
    assessedByUserId: uuid('assessed_by_user_id').references(() => user.id),
    assessedAt: timestamp('assessed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.requirementId] }),
    check('tenant_requirement_soa_chk', sql`${t.applicability} = 'applicable' OR ${t.justification} IS NOT NULL`),
    check('tenant_requirement_maturity_chk', sql`(${t.maturity} IS NULL OR ${t.maturity} BETWEEN 0 AND 5) AND (${t.targetMaturity} IS NULL OR ${t.targetMaturity} BETWEEN 0 AND 5)`),
  ],
);

export const measure = pgTable(
  'measure',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    domain: controlDomainEnum('domain'),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: measureStatusEnum('status').notNull().default('planned'),
    maturity: smallint('maturity'),
    dueDate: date('due_date'),
    effortDays: numeric('effort_days', { precision: 8, scale: 1 }),
    costEur: numeric('cost_eur', { precision: 12, scale: 2 }),
    verifiedByUserId: uuid('verified_by_user_id').references(() => user.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastReviewAt: date('last_review_at'),
    ...timestamps,
  },
  (t) => [
    unique('measure_tenant_ref_uq').on(t.tenantId, t.refNo),
    index('measure_tenant_status_idx').on(t.tenantId, t.status),
    index('measure_tenant_owner_idx').on(t.tenantId, t.ownerPersonId),
    check('measure_maturity_chk', sql`${t.maturity} IS NULL OR ${t.maturity} BETWEEN 0 AND 5`),
  ],
);

/** Das Multi-Framework-Mapping: eine Maßnahme erfüllt n Anforderungen aus beliebigen Frameworks. */
export const measureRequirement = pgTable(
  'measure_requirement',
  {
    tenantId: tenantRef(),
    measureId: uuid('measure_id')
      .notNull()
      .references(() => measure.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id),
    coverage: coverageEnum('coverage').notNull().default('full'),
    createdVia: mappingOriginEnum('created_via').notNull().default('manual'),
    createdByUserId: uuid('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.measureId, t.requirementId] }),
    // "alle Maßnahmen zu Anforderung X in Mandant T" — der SoA-/Coverage-Index
    index('measure_requirement_by_req_idx').on(t.tenantId, t.requirementId),
  ],
);

export const evidence = pgTable(
  'evidence',
  {
    id: id(),
    tenantId: tenantRef(),
    title: text('title').notNull(),
    fileId: uuid('file_id').references(() => file.id, { onDelete: 'set null' }),
    url: text('url'),
    description: text('description'),
    collectedAt: date('collected_at').notNull().defaultNow(),
    validUntil: date('valid_until'),
    collectedByUserId: uuid('collected_by_user_id').references(() => user.id),
    ...timestamps,
  },
  (t) => [index('evidence_tenant_idx').on(t.tenantId, t.validUntil)],
);

export const measureEvidence = pgTable(
  'measure_evidence',
  {
    measureId: uuid('measure_id')
      .notNull()
      .references(() => measure.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.measureId, t.evidenceId] })],
);
