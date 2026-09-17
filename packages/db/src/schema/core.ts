import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, id, timestamps } from './_common';
import { requirement } from './catalog';
import {
  changePlanStatusEnum,
  classificationEnum,
  documentKindEnum,
  documentStatusEnum,
  objectiveKindEnum,
  objectiveStatusEnum,
  targetDirectionEnum,
  orgNodeKindEnum,
  partyCategoryEnum,
  pestleDimensionEnum,
  pestleEffectEnum,
  trainingKindEnum,
} from './enums';
import { tenant, user } from './platform';

// C · ISMS-Kern & Kontext ---------------------------------------------------------------

const tenantRef = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

export const location = pgTable(
  'location',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    code: text('code'),
    city: text('city'),
    country: text('country'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('location_tenant_idx').on(t.tenantId, t.name)],
);

export const person = pgTable(
  'person',
  {
    id: id(),
    tenantId: tenantRef(),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: citext('email'),
    department: text('department'),
    position: text('position'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('person_tenant_idx').on(t.tenantId, t.name),
    unique('person_tenant_user_uq').on(t.tenantId, t.userId),
  ],
);

export const orgUnit = pgTable(
  'org_unit',
  {
    id: id(),
    tenantId: tenantRef(),
    parentId: uuid('parent_id'),
    kind: orgNodeKindEnum('kind').notNull().default('unit'),
    label: text('label').notNull(),
    personId: uuid('person_id').references(() => person.id, { onDelete: 'set null' }),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('org_unit_tenant_parent_idx').on(t.tenantId, t.parentId, t.sortOrder)],
);

export const interestedParty = pgTable(
  'interested_party',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    category: partyCategoryEnum('category').notNull(),
    expectations: text('expectations'),
    addressedVia: text('addressed_via'),
    isBinding: boolean('is_binding').notNull().default(false),
    influence: smallint('influence').notNull().default(2),
    ...timestamps,
  },
  (t) => [
    index('interested_party_tenant_idx').on(t.tenantId),
    check('party_influence_chk', sql`${t.influence} BETWEEN 1 AND 3`),
  ],
);

export const pestleFactor = pgTable(
  'pestle_factor',
  {
    id: id(),
    tenantId: tenantRef(),
    dimension: pestleDimensionEnum('dimension').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    effect: pestleEffectEnum('effect').notNull().default('risk'),
    relevance: smallint('relevance').notNull().default(2),
    /** FK auf risk wird in migrations/ per ALTER gesetzt (zirkulär zu assets-risks.ts) */
    linkedRiskId: uuid('linked_risk_id'),
    ...timestamps,
  },
  (t) => [
    index('pestle_tenant_idx').on(t.tenantId, t.dimension),
    check('pestle_relevance_chk', sql`${t.relevance} BETWEEN 1 AND 3`),
  ],
);

export const securityObjective = pgTable(
  'security_objective',
  {
    id: id(),
    tenantId: tenantRef(),
    title: text('title').notNull(),
    description: text('description'),
    kind: objectiveKindEnum('kind').notNull().default('operational'),
    status: objectiveStatusEnum('status').notNull().default('draft'),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    targetValue: text('target_value'),
    currentValue: text('current_value'),
    unit: text('unit'),
    /** „niedriger ist besser“ trifft z. B. auf Wiederanlaufzeiten zu. */
    direction: targetDirectionEnum('direction').notNull().default('higher_is_better'),
    frequency: text('frequency'),
    dueDate: date('due_date'),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('objective_tenant_idx').on(t.tenantId, t.status)],
);

export const objectiveRequirement = pgTable(
  'objective_requirement',
  {
    objectiveId: uuid('objective_id')
      .notNull()
      .references(() => securityObjective.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id),
  },
  (t) => [primaryKey({ columns: [t.objectiveId, t.requirementId] })],
);

export const communicationPlanEntry = pgTable(
  'communication_plan_entry',
  {
    id: id(),
    tenantId: tenantRef(),
    topic: text('topic').notNull(),
    audience: text('audience').notNull(),
    channel: text('channel').notNull(),
    frequency: text('frequency').notNull(),
    responsiblePersonId: uuid('responsible_person_id').references(() => person.id, { onDelete: 'set null' }),
    clauseRef: text('clause_ref'),
    ...timestamps,
  },
  (t) => [index('commplan_tenant_idx').on(t.tenantId)],
);

export const changePlanEntry = pgTable(
  'change_plan_entry',
  {
    id: id(),
    tenantId: tenantRef(),
    title: text('title').notNull(),
    purpose: text('purpose'),
    impactAssessment: text('impact_assessment'),
    status: changePlanStatusEnum('status').notNull().default('planned'),
    plannedFor: date('planned_for'),
    /** Wer die Änderung geplant hat — ohne das ließe sich die Freigabe nicht davon trennen. */
    createdByUserId: uuid('created_by_user_id').references(() => user.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('changeplan_tenant_idx').on(t.tenantId, t.status)],
);

// Dateien --------------------------------------------------------------------------------

export const file = pgTable(
  'file',
  {
    id: id(),
    tenantId: tenantRef(),
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('file_tenant_idx').on(t.tenantId, t.createdAt)],
);

// Dokumentenlenkung -----------------------------------------------------------------------

export const document = pgTable(
  'document',
  {
    id: id(),
    tenantId: tenantRef(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    kind: documentKindEnum('kind').notNull().default('policy'),
    classification: classificationEnum('classification').notNull().default('internal'),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: documentStatusEnum('status').notNull().default('draft'),
    reviewIntervalMonths: smallint('review_interval_months').notNull().default(12),
    nextReviewAt: date('next_review_at'),
    /** FK auf document_version per ALTER in Migration (zirkulär) */
    currentVersionId: uuid('current_version_id'),
    ...timestamps,
  },
  (t) => [
    unique('document_tenant_key_uq').on(t.tenantId, t.key),
    index('document_tenant_status_idx').on(t.tenantId, t.status),
    index('document_review_idx').on(t.tenantId, t.nextReviewAt),
  ],
);

export const documentVersion = pgTable(
  'document_version',
  {
    id: id(),
    tenantId: tenantRef(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    versionLabel: text('version_label').notNull(),
    changeNote: text('change_note'),
    fileId: uuid('file_id').references(() => file.id, { onDelete: 'set null' }),
    contentMd: text('content_md'),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => user.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('document_version_uq').on(t.documentId, t.versionLabel),
    // Vier-Augen-Prinzip: Freigabe nie durch den Autor
    check('document_version_four_eyes_chk', sql`${t.approvedByUserId} IS DISTINCT FROM ${t.authorUserId}`),
  ],
);

export const documentRequirement = pgTable(
  'document_requirement',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.requirementId] })],
);

export const acknowledgementCampaign = pgTable(
  'acknowledgement_campaign',
  {
    id: id(),
    tenantId: tenantRef(),
    documentVersionId: uuid('document_version_id')
      .notNull()
      .references(() => documentVersion.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    message: text('message'),
    /** { mode: 'all' | 'roles' | 'persons', roleKeys?: string[], personIds?: string[] } */
    target: jsonb('target')
      .notNull()
      .default(sql`'{"mode":"all"}'::jsonb`),
    dueAt: date('due_at'),
    createdByUserId: uuid('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ack_campaign_tenant_idx').on(t.tenantId, t.documentVersionId)],
);

export const acknowledgement = pgTable(
  'acknowledgement',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => acknowledgementCampaign.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    tenantId: tenantRef(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.personId] }),
    index('ack_person_idx').on(t.tenantId, t.personId),
  ],
);

// Kompetenz & Schulung ----------------------------------------------------------------------

export const skill = pgTable(
  'skill',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [unique('skill_tenant_name_uq').on(t.tenantId, t.name)],
);

export const competenceProfile = pgTable(
  'competence_profile',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [unique('competence_profile_uq').on(t.tenantId, t.name)],
);

export const profileSkillRequirement = pgTable(
  'profile_skill_requirement',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => competenceProfile.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
    minLevel: smallint('min_level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.skillId] }),
    check('profile_skill_level_chk', sql`${t.minLevel} BETWEEN 1 AND 5`),
  ],
);

export const personProfile = pgTable(
  'person_profile',
  {
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => competenceProfile.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.profileId] })],
);

export const personSkill = pgTable(
  'person_skill',
  {
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
    tenantId: tenantRef(),
    level: smallint('level').notNull(),
    evidenceFileId: uuid('evidence_file_id').references(() => file.id, { onDelete: 'set null' }),
    evidenceNote: text('evidence_note'),
    validUntil: date('valid_until'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.skillId] }),
    check('person_skill_level_chk', sql`${t.level} BETWEEN 1 AND 5`),
    index('person_skill_valid_idx').on(t.tenantId, t.validUntil),
  ],
);

export const training = pgTable(
  'training',
  {
    id: id(),
    tenantId: tenantRef(),
    title: text('title').notNull(),
    kind: trainingKindEnum('kind').notNull().default('awareness'),
    description: text('description'),
    contentMd: text('content_md'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('training_tenant_idx').on(t.tenantId, t.isActive)],
);

export const trainingAssignment = pgTable(
  'training_assignment',
  {
    id: id(),
    tenantId: tenantRef(),
    trainingId: uuid('training_id')
      .notNull()
      .references(() => training.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    dueAt: date('due_at'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    score: smallint('score'),
    evidenceFileId: uuid('evidence_file_id').references(() => file.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('training_assignment_uq').on(t.trainingId, t.personId),
    index('training_assignment_due_idx').on(t.tenantId, t.dueAt),
  ],
);
