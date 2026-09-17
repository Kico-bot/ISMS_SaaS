import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { asset } from './assets-risks';
import { requirement } from './catalog';
import { person } from './core';
import {
  dpiaResultEnum,
  dpiaStatusEnum,
  legalBasisEnum,
  processingRoleEnum,
  processingStatusEnum,
} from './enums';
import { measure } from './measures';
import { incident } from './operations';
import { tenant, user } from './platform';

// H · Datenschutz --------------------------------------------------------------------------------

const tenantRef = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

/** Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) */
export const processingActivity = pgTable(
  'processing_activity',
  {
    id: id(),
    tenantId: tenantRef(),
    name: text('name').notNull(),
    purpose: text('purpose'),
    role: processingRoleEnum('role').notNull().default('controller'),
    legalBasis: legalBasisEnum('legal_basis'),
    legalBasisNote: text('legal_basis_note'),
    dataSubjectCategories: text('data_subject_categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    dataCategories: text('data_categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    specialCategories: boolean('special_categories').notNull().default(false),
    recipients: text('recipients')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    thirdCountryTransfer: boolean('third_country_transfer').notNull().default(false),
    safeguards: text('safeguards'),
    retention: text('retention'),
    dpiaRequired: boolean('dpia_required').notNull().default(false),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: processingStatusEnum('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => [index('processing_tenant_idx').on(t.tenantId, t.status)],
);

export const processingAsset = pgTable(
  'processing_asset',
  {
    processingActivityId: uuid('processing_activity_id')
      .notNull()
      .references(() => processingActivity.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.processingActivityId, t.assetId] })],
);

/** TOMs (Art. 32) = dieselben Maßnahmen wie im ISMS */
export const processingTom = pgTable(
  'processing_tom',
  {
    processingActivityId: uuid('processing_activity_id')
      .notNull()
      .references(() => processingActivity.id, { onDelete: 'cascade' }),
    measureId: uuid('measure_id')
      .notNull()
      .references(() => measure.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.processingActivityId, t.measureId] })],
);

export const processingRequirement = pgTable(
  'processing_requirement',
  {
    processingActivityId: uuid('processing_activity_id')
      .notNull()
      .references(() => processingActivity.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id),
  },
  (t) => [primaryKey({ columns: [t.processingActivityId, t.requirementId] })],
);

export const incidentProcessing = pgTable(
  'incident_processing',
  {
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incident.id, { onDelete: 'cascade' }),
    processingActivityId: uuid('processing_activity_id')
      .notNull()
      .references(() => processingActivity.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.incidentId, t.processingActivityId] })],
);

/** Datenschutz-Folgenabschätzung (Art. 35) */
export const dpia = pgTable('dpia', {
  id: id(),
  tenantId: tenantRef(),
  processingActivityId: uuid('processing_activity_id')
    .notNull()
    .references(() => processingActivity.id, { onDelete: 'cascade' })
    .unique(),
  status: dpiaStatusEnum('status').notNull().default('draft'),
  descriptionOfProcessing: text('description_of_processing'),
  necessityAssessment: text('necessity_assessment'),
  /** Verweise auf risk-IDs + Bewertung */
  risks: jsonb('risks')
    .notNull()
    .default(sql`'[]'::jsonb`),
  dpoOpinion: text('dpo_opinion'),
  dpoUserId: uuid('dpo_user_id').references(() => user.id),
  dpoConsultedAt: timestamp('dpo_consulted_at', { withTimezone: true }),
  result: dpiaResultEnum('result'),
  ...timestamps,
});
