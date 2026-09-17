import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { location, person } from './core';
import {
  assessmentStageEnum,
  assetCategoryEnum,
  assetRelationEnum,
  assetStatusEnum,
  assetTypeEnum,
  classificationEnum,
  riskKindEnum,
  riskMeasureEffectEnum,
  riskSourceEnum,
  riskStatusEnum,
  riskTreatmentEnum,
} from './enums';
import { measure } from './measures';
import { tenant, user } from './platform';

// D · Assets & Risiken ------------------------------------------------------------------------

const tenantRef = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

export const asset = pgTable(
  'asset',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    name: text('name').notNull(),
    type: assetTypeEnum('type').notNull().default('supporting'),
    category: assetCategoryEnum('category').notNull(),
    classification: classificationEnum('classification').notNull().default('internal'),
    confidentiality: smallint('confidentiality').notNull().default(2),
    integrity: smallint('integrity').notNull().default(2),
    availability: smallint('availability').notNull().default(2),
    safety: smallint('safety').notNull().default(1),
    hasPii: boolean('has_pii').notNull().default(false),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    custodianPersonId: uuid('custodian_person_id').references(() => person.id, { onDelete: 'set null' }),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    description: text('description'),
    vendor: text('vendor'),
    product: text('product'),
    version: text('version'),
    cpe: text('cpe'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: assetStatusEnum('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('asset_tenant_ref_uq').on(t.tenantId, t.refNo),
    index('asset_tenant_status_idx').on(t.tenantId, t.status, t.name),
    index('asset_tenant_owner_idx').on(t.tenantId, t.ownerPersonId),
    index('asset_tags_gin').using('gin', t.tags),
    check(
      'asset_cia_chk',
      sql`${t.confidentiality} BETWEEN 1 AND 3 AND ${t.integrity} BETWEEN 1 AND 3 AND ${t.availability} BETWEEN 1 AND 3 AND ${t.safety} BETWEEN 1 AND 3`,
    ),
  ],
);

export const assetRelation = pgTable(
  'asset_relation',
  {
    tenantId: tenantRef(),
    fromAssetId: uuid('from_asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
    toAssetId: uuid('to_asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
    relation: assetRelationEnum('relation').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromAssetId, t.toAssetId, t.relation] }),
    index('asset_relation_to_idx').on(t.tenantId, t.toAssetId),
    check('asset_relation_self_chk', sql`${t.fromAssetId} <> ${t.toAssetId}`),
  ],
);

/** Feste 5×5-Matrix; nur Labels, Schwellen und Appetit sind mandantenspezifisch. */
export const riskMatrixConfig = pgTable('risk_matrix_config', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  likelihoodLabels: jsonb('likelihood_labels').notNull(),
  impactLabels: jsonb('impact_labels').notNull(),
  /** { low: 4, medium: 9, high: 14 } */
  thresholds: jsonb('thresholds').notNull(),
  appetite: smallint('appetite'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const risk = pgTable(
  'risk',
  {
    id: id(),
    tenantId: tenantRef(),
    refNo: text('ref_no').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    kind: riskKindEnum('kind').notNull().default('risk'),
    source: riskSourceEnum('source').notNull().default('manual'),
    category: text('category'),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: riskStatusEnum('status').notNull().default('identified'),
    inherentLikelihood: smallint('inherent_likelihood'),
    inherentImpact: smallint('inherent_impact'),
    inherentScore: smallint('inherent_score').generatedAlwaysAs(sql`inherent_likelihood * inherent_impact`),
    residualLikelihood: smallint('residual_likelihood'),
    residualImpact: smallint('residual_impact'),
    residualScore: smallint('residual_score').generatedAlwaysAs(sql`residual_likelihood * residual_impact`),
    treatment: riskTreatmentEnum('treatment'),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => user.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedUntil: date('accepted_until'),
    acceptanceRationale: text('acceptance_rationale'),
    /** Matrix-Labels/Schwellen/Score zum Zeitpunkt der Freigabe — eingefroren */
    acceptanceSnapshot: jsonb('acceptance_snapshot'),
    aleFrequency: numeric('ale_frequency', { precision: 10, scale: 3 }),
    lossMin: numeric('loss_min', { precision: 14, scale: 2 }),
    lossLikely: numeric('loss_likely', { precision: 14, scale: 2 }),
    lossMax: numeric('loss_max', { precision: 14, scale: 2 }),
    nextReviewAt: date('next_review_at'),
    ...timestamps,
  },
  (t) => [
    unique('risk_tenant_ref_uq').on(t.tenantId, t.refNo),
    index('risk_tenant_status_idx').on(t.tenantId, t.status),
    index('risk_tenant_owner_idx').on(t.tenantId, t.ownerPersonId),
    index('risk_tenant_scores_idx').on(t.tenantId, t.inherentScore, t.residualScore),
    index('risk_review_idx').on(t.tenantId, t.nextReviewAt),
    check(
      'risk_matrix_chk',
      sql`(${t.inherentLikelihood} IS NULL OR ${t.inherentLikelihood} BETWEEN 1 AND 5) AND (${t.inherentImpact} IS NULL OR ${t.inherentImpact} BETWEEN 1 AND 5) AND (${t.residualLikelihood} IS NULL OR ${t.residualLikelihood} BETWEEN 1 AND 5) AND (${t.residualImpact} IS NULL OR ${t.residualImpact} BETWEEN 1 AND 5)`,
    ),
  ],
);

export const riskAsset = pgTable(
  'risk_asset',
  {
    tenantId: tenantRef(),
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risk.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.riskId, t.assetId] }),
    index('risk_asset_asset_idx').on(t.tenantId, t.assetId),
  ],
);

export const riskAssessment = pgTable(
  'risk_assessment',
  {
    id: id(),
    tenantId: tenantRef(),
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risk.id, { onDelete: 'cascade' }),
    stage: assessmentStageEnum('stage').notNull(),
    likelihood: smallint('likelihood').notNull(),
    impact: smallint('impact').notNull(),
    score: smallint('score').generatedAlwaysAs(sql`likelihood * impact`),
    assessedByUserId: uuid('assessed_by_user_id').references(() => user.id),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (t) => [
    index('risk_assessment_risk_idx').on(t.riskId, t.assessedAt),
    check('risk_assessment_chk', sql`${t.likelihood} BETWEEN 1 AND 5 AND ${t.impact} BETWEEN 1 AND 5`),
  ],
);

export const riskMeasure = pgTable(
  'risk_measure',
  {
    tenantId: tenantRef(),
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risk.id, { onDelete: 'cascade' }),
    measureId: uuid('measure_id')
      .notNull()
      .references(() => measure.id, { onDelete: 'cascade' }),
    effect: riskMeasureEffectEnum('effect').notNull().default('both'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.riskId, t.measureId] }),
    index('risk_measure_measure_idx').on(t.tenantId, t.measureId),
  ],
);

/** Fortlaufende Referenznummern je Mandant (R-0009, INC-0031, …) — lückenlos, ohne Race. */
export const sequenceCounter = pgTable(
  'sequence_counter',
  {
    tenantId: tenantRef(),
    kind: text('kind').notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.kind] })],
);
