import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { framework, requirement } from './catalog';
import { file, person } from './core';
import {
  actionKindEnum,
  actionStatusEnum,
  auditKindEnum,
  auditStatusEnum,
  findingSeverityEnum,
  findingSourceEnum,
  findingStatusEnum,
  kpiDirectionEnum,
  kpiSourceEnum,
} from './enums';
import { evidence, measure } from './measures';
import { tenant, user } from './platform';

// F · Audit, Findings, KVP, Management-Review, KPIs ----------------------------------------------

const tenantRef = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

export const audit = pgTable(
  'audit',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    title: text('title').notNull(),
    kind: auditKindEnum('kind').notNull().default('internal'),
    frameworkId: uuid('framework_id').references(() => framework.id),
    scope: text('scope'),
    plannedFrom: date('planned_from'),
    plannedTo: date('planned_to'),
    leadAuditorUserId: uuid('lead_auditor_user_id').references(() => user.id),
    status: auditStatusEnum('status').notNull().default('planned'),
    reportFileId: uuid('report_file_id').references(() => file.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('audit_tenant_idx').on(t.tenantId, t.status, t.plannedFrom)],
);

export const finding = pgTable(
  'finding',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    auditId: uuid('audit_id').references(() => audit.id, { onDelete: 'set null' }),
    source: findingSourceEnum('source').notNull().default('audit'),
    severity: findingSeverityEnum('severity').notNull().default('minor'),
    title: text('title').notNull(),
    description: text('description'),
    requirementId: uuid('requirement_id').references(() => requirement.id),
    measureId: uuid('measure_id').references(() => measure.id, { onDelete: 'set null' }),
    raisedByUserId: uuid('raised_by_user_id')
      .notNull()
      .references(() => user.id),
    status: findingStatusEnum('status').notNull().default('open'),
    dueAt: date('due_at'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    verifiedByUserId: uuid('verified_by_user_id').references(() => user.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('finding_tenant_status_idx').on(t.tenantId, t.status, t.severity),
    index('finding_audit_idx').on(t.auditId),
    index('finding_measure_idx').on(t.tenantId, t.measureId),
  ],
);

export const findingEvidence = pgTable(
  'finding_evidence',
  {
    findingId: uuid('finding_id')
      .notNull()
      .references(() => finding.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.findingId, t.evidenceId] })],
);

export const managementReview = pgTable(
  'management_review',
  {
    id: id(),
    tenantId: tenantRef(),
    heldAt: date('held_at').notNull(),
    chairPersonId: uuid('chair_person_id').references(() => person.id, { onDelete: 'set null' }),
    /** Snapshot der Inputs nach 9.3.2 a–g zum Zeitpunkt der Sitzung */
    inputs: jsonb('inputs').notNull().default(sql`'{}'::jsonb`),
    decisions: text('decisions'),
    minutesFileId: uuid('minutes_file_id').references(() => file.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('planned'),
    ...timestamps,
  },
  (t) => [index('mgmt_review_tenant_idx').on(t.tenantId, t.heldAt)],
);

/** KVP-Register (CAPA). Genau ein Auslöser (oder keiner bei freien Verbesserungen). */
export const action = pgTable(
  'action',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    kind: actionKindEnum('kind').notNull().default('corrective'),
    findingId: uuid('finding_id').references(() => finding.id, { onDelete: 'set null' }),
    /** FK auf risk / incident per ALTER in Migration (Modulgrenze) */
    riskId: uuid('risk_id'),
    incidentId: uuid('incident_id'),
    reviewId: uuid('review_id').references(() => managementReview.id, { onDelete: 'set null' }),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: actionStatusEnum('status').notNull().default('open'),
    dueAt: date('due_at'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    effectivenessCheckAt: date('effectiveness_check_at'),
    effectivenessResult: text('effectiveness_result'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => user.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('action_tenant_status_idx').on(t.tenantId, t.status, t.dueAt),
    index('action_tenant_owner_idx').on(t.tenantId, t.ownerPersonId),
    check('action_single_origin_chk', sql`num_nonnulls(${t.findingId}, ${t.riskId}, ${t.incidentId}, ${t.reviewId}) <= 1`),
  ],
);

export const kpi = pgTable(
  'kpi',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    unit: text('unit'),
    target: numeric('target', { precision: 12, scale: 2 }),
    direction: kpiDirectionEnum('direction').notNull().default('higher_is_better'),
    source: kpiSourceEnum('source').notNull().default('manual'),
    computationKey: text('computation_key'),
    frequency: text('frequency'),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('kpi_tenant_idx').on(t.tenantId)],
);

export const kpiValue = pgTable(
  'kpi_value',
  {
    kpiId: uuid('kpi_id')
      .notNull()
      .references(() => kpi.id, { onDelete: 'cascade' }),
    tenantId: tenantRef(),
    measuredAt: date('measured_at').notNull(),
    value: numeric('value', { precision: 14, scale: 3 }).notNull(),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.kpiId, t.measuredAt] })],
);
