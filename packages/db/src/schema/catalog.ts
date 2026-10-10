import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, ltree, timestamps } from './_common';
import {
  controlDomainEnum,
  crosswalkRelationEnum,
  protectionVariantEnum,
  requirementKindEnum,
  requirementScopeEnum,
  requirementLevelEnum,
} from './enums';
import { tenant } from './platform';

// B · Framework-Katalog (global, kein tenant_id, kein RLS) ---------------------------------

export const framework = pgTable(
  'framework',
  {
    id: id(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    publisher: text('publisher'),
    jurisdiction: text('jurisdiction'),
    licenseNote: text('license_note'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('framework_key_version_uq').on(t.key, t.version)],
);

export const requirement = pgTable(
  'requirement',
  {
    id: id(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => framework.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    refCode: text('ref_code').notNull(),
    title: text('title').notNull(),
    /** NULL, wo der Volltext lizenzrechtlich nicht erlaubt ist (ISO 27001). */
    body: text('body'),
    kind: requirementKindEnum('kind').notNull(),
    level: requirementLevelEnum('level'),
    domain: controlDomainEnum('domain'),
    /** Wann die Anforderung zählt; NULL = immer. Siehe REQUIREMENT_SCOPES. */
    appliesTo: requirementScopeEnum('applies_to'),
    /** Nationale Fundstelle neben der EU-Referenz, z. B. „§ 30 Abs. 2 Nr. 10 BSIG“ zu NIS2 Art. 21 Abs. 2 j). */
    altRef: text('alt_ref'),
    /**
     * Kurzer Umsetzungshinweis in eigenen Worten, wo die Zuordnung allein in die Irre führt — etwa
     * dass § 32 BSIG eine Behördenmeldung verlangt, die kein ISO-27001-Control abdeckt.
     */
    hint: text('hint'),
    /** Ab wann die Pflicht gilt (AI Act: gestaffelt). NULL = bereits anwendbar. */
    appliesFrom: date('applies_from'),
    path: ltree('path').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    unique('requirement_fw_ref_uq').on(t.frameworkId, t.refCode),
    index('requirement_fw_kind_idx').on(t.frameworkId, t.kind, t.sortOrder),
    index('requirement_parent_idx').on(t.parentId),
    index('requirement_path_gist').using('gist', t.path),
  ],
);

export const requirementCrosswalk = pgTable(
  'requirement_crosswalk',
  {
    id: id(),
    sourceRequirementId: uuid('source_requirement_id')
      .notNull()
      .references(() => requirement.id, { onDelete: 'cascade' }),
    targetRequirementId: uuid('target_requirement_id')
      .notNull()
      .references(() => requirement.id, { onDelete: 'cascade' }),
    relation: crosswalkRelationEnum('relation').notNull(),
    source: text('source').notNull(),
  },
  (t) => [
    unique('crosswalk_uq').on(t.sourceRequirementId, t.targetRequirementId),
    index('crosswalk_target_idx').on(t.targetRequirementId),
    check('crosswalk_self_chk', sql`${t.sourceRequirementId} <> ${t.targetRequirementId}`),
  ],
);

export const tenantFramework = pgTable(
  'tenant_framework',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => framework.id),
    isPrimary: boolean('is_primary').notNull().default(false),
    activatedAt: date('activated_at').notNull().defaultNow(),
    scopeNote: text('scope_note'),
    /** Nur für Kataloge mit Bausteinen (IT-Grundschutz); NULL wird als 'standard' gelesen. */
    protectionVariant: protectionVariantEnum('protection_variant'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.frameworkId] })],
);

/**
 * Modellierung (BSI-Standard 200-2): welche Bausteine für den Informationsverbund gelten.
 * Nur die Anforderungen modellierter Bausteine gehören in den IT-Grundschutz-Check, in die
 * Abdeckung und in die Vorschläge — sonst stünden 1.800 Anforderungen in jeder Liste, von denen
 * die meisten nie zutreffen. `elevated` schaltet die Anforderungen für erhöhten Schutzbedarf
 * dieses einen Bausteins zu.
 */
export const tenantModule = pgTable(
  'tenant_module',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id, { onDelete: 'cascade' }),
    elevated: boolean('elevated').notNull().default(false),
    /** Worauf der Baustein angewandt wird (Zielobjekte) oder warum er gewählt wurde. */
    note: text('note'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.requirementId] })],
);
