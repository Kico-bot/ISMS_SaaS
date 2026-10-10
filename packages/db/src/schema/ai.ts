import { sql } from 'drizzle-orm';
import { boolean, check, date, index, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';
import { asset } from './assets-risks';
import { person } from './core';
import { aiAnnexIiiAreaEnum, aiSystemStatusEnum } from './enums';
import { tenant } from './platform';
import { processingActivity } from './privacy';

// K · KI-Register (EU AI Act) — ausschließlich als Betreiber --------------------------------------

/**
 * Ein KI-System, das der Mandant **einsetzt** (Betreiber, Art. 3 Nr. 4). Anbieterpflichten sind
 * nicht Gegenstand der Suite. Die Risikoklasse wird aus den Fragen abgeleitet, nicht eingetragen —
 * wer „minimal“ ankreuzen könnte, kreuzt „minimal“ an.
 */
export const aiSystem = pgTable(
  'ai_system',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    refNo: text('ref_no').notNull(),
    name: text('name').notNull(),
    purpose: text('purpose'),
    /** Wer das System anbietet — Name und, falls inventarisiert, der Lieferant im Asset-Register. */
    providerName: text('provider_name'),
    supplierAssetId: uuid('supplier_asset_id').references(() => asset.id, { onDelete: 'set null' }),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    /** Art. 26 Abs. 2: menschliche Aufsicht durch eine kompetente, befugte Person. */
    oversightPersonId: uuid('oversight_person_id').references(() => person.id, { onDelete: 'set null' }),
    status: aiSystemStatusEnum('status').notNull().default('draft'),

    // Einstufung — Art. 5
    prohibitedPractices: text('prohibited_practices')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Art. 6 / Anhang III und Anhang I
    annexIiiArea: aiAnnexIiiAreaEnum('annex_iii_area'),
    annexIProduct: boolean('annex_i_product').notNull().default(false),
    /** Art. 6 Abs. 3: trotz Anhang-III-Bereich kein erhebliches Risiko — nur mit Begründung. */
    art6Exception: boolean('art6_exception').notNull().default(false),
    art6Justification: text('art6_justification'),
    // Art. 50 Abs. 3 und 4 — die Transparenzpflichten, die den Betreiber treffen
    emotionOrBiometric: boolean('emotion_or_biometric').notNull().default(false),
    deepfakeOrPublicText: boolean('deepfake_or_public_text').notNull().default(false),
    // Art. 27: wer eine Grundrechte-Folgenabschätzung braucht
    publicService: boolean('public_service').notNull().default(false),
    creditOrInsurance: boolean('credit_or_insurance').notNull().default(false),

    riskClass: text('risk_class').generatedAlwaysAs(
      sql`CASE
        WHEN cardinality(prohibited_practices) > 0 THEN 'prohibited'
        WHEN (annex_iii_area IS NOT NULL AND NOT art6_exception) OR annex_i_product THEN 'high'
        WHEN emotion_or_biometric OR deepfake_or_public_text THEN 'limited'
        ELSE 'minimal' END`,
    ),
    /** Art. 27 Abs. 1 — nicht für Anhang III Nr. 2 (kritische Infrastruktur). */
    friaRequired: boolean('fria_required').generatedAlwaysAs(
      sql`cardinality(prohibited_practices) = 0
        AND annex_iii_area IS NOT NULL AND NOT art6_exception
        AND annex_iii_area <> 'critical_infrastructure'
        AND (public_service OR credit_or_insurance)`,
    ),

    // Betrieb (Art. 26)
    instructionsReceived: boolean('instructions_received').notNull().default(false),
    logRetentionMonths: smallint('log_retention_months'),
    workplaceUse: boolean('workplace_use').notNull().default(false),
    workersInformedAt: date('workers_informed_at'),
    friaCompletedAt: date('fria_completed_at'),
    personalData: boolean('personal_data').notNull().default(false),
    processingActivityId: uuid('processing_activity_id').references(() => processingActivity.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    unique('ai_system_tenant_ref_uq').on(t.tenantId, t.refNo),
    index('ai_system_tenant_status_idx').on(t.tenantId, t.status),
    check('ai_system_retention_chk', sql`${t.logRetentionMonths} IS NULL OR ${t.logRetentionMonths} >= 0`),
  ],
);
