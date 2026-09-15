/**
 * Zod-Schemas für API-Requests. Werden identisch im Backend (Validation-Pipe) und im
 * Frontend (react-hook-form) verwendet. Nur Eingabe-Schemas; Antwort-Typen kommen aus OpenAPI.
 */
import { z } from 'zod';
import {
  APPLICABILITY,
  ASSET_CATEGORIES,
  ASSET_STATUS,
  ASSET_TYPES,
  ASSESSMENT_STAGES,
  CLASSIFICATIONS,
  COVERAGE,
  CONTROL_DOMAINS,
  DOCUMENT_KINDS,
  MATURITY_MAX,
  MATURITY_MIN,
  MEASURE_STATUS,
  RISK_KINDS,
  RISK_MATRIX_SIZE,
  RISK_MEASURE_EFFECTS,
  RISK_SOURCES,
  RISK_STATUS,
  RISK_TREATMENTS,
  ACTION_KINDS,
  ACTION_STATUS,
  INCIDENT_CATEGORIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUS,
  RCA_METHODS,
  SEVERITIES,
} from './enums';
import { TENANT_ROLE_KEYS } from './permissions';

const uuid = z.string().uuid();
const cia = z.number().int().min(1).max(3);
const maturity = z.number().int().min(MATURITY_MIN).max(MATURITY_MAX);
const matrixValue = z.number().int().min(1).max(RISK_MATRIX_SIZE);

// --- Identity ---------------------------------------------------------------------------
export const LoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  tenantSlug: z.string().min(1).optional(),
});
export type LoginDto = z.infer<typeof LoginDto>;

export const RegisterTenantDto = z.object({
  tenantName: z.string().min(2).max(120),
  tenantSlug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche'),
  email: z.string().email(),
  password: z.string().min(12).max(200),
  displayName: z.string().min(2).max(120),
});
export type RegisterTenantDto = z.infer<typeof RegisterTenantDto>;

export const InviteMemberDto = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  roleKeys: z.array(z.enum(TENANT_ROLE_KEYS)).min(1),
  /** Person (Beschäftigter) verknüpfen, damit Ownership-Scoping greift */
  personId: uuid.optional(),
});
export type InviteMemberDto = z.infer<typeof InviteMemberDto>;

export const AcceptInviteDto = z.object({
  token: z.string().min(20).max(200),
  /** Neues Passwort — nur für Konten, die noch keines haben; sonst das bestehende zur Bestätigung. */
  password: z.string().min(12).max(200),
});
export type AcceptInviteDto = z.infer<typeof AcceptInviteDto>;

export const SetMemberRolesDto = z.object({
  roleKeys: z.array(z.enum(TENANT_ROLE_KEYS)).min(1),
  /** SoD-Warnungen ("warn") bewusst akzeptieren */
  acknowledgeSodWarnings: z.boolean().default(false),
});
export type SetMemberRolesDto = z.infer<typeof SetMemberRolesDto>;

// --- Frameworks / SoA -----------------------------------------------------------------
export const ActivateFrameworkDto = z.object({
  frameworkKey: z.string().min(1),
  isPrimary: z.boolean().default(false),
});
export type ActivateFrameworkDto = z.infer<typeof ActivateFrameworkDto>;

export const UpsertTenantRequirementDto = z
  .object({
    applicability: z.enum(APPLICABILITY).optional(),
    justification: z.string().max(2000).nullable().optional(),
    maturity: maturity.nullable().optional(),
    targetMaturity: maturity.nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (d) => d.applicability !== 'not_applicable' || (d.justification && d.justification.trim().length > 0),
    {
      message: 'Bei "nicht anwendbar" ist eine Begründung Pflicht (SoA).',
      path: ['justification'],
    },
  );
export type UpsertTenantRequirementDto = z.infer<typeof UpsertTenantRequirementDto>;

// --- Maßnahmen --------------------------------------------------------------------------
export const MeasureDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(8000).nullable().optional(),
  domain: z.enum(CONTROL_DOMAINS).nullable().optional(),
  ownerPersonId: uuid.nullable().optional(),
  status: z.enum(MEASURE_STATUS).default('planned'),
  maturity: maturity.nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  effortDays: z.number().min(0).nullable().optional(),
  costEur: z.number().min(0).nullable().optional(),
});
export type MeasureDto = z.infer<typeof MeasureDto>;
export const MeasurePatchDto = MeasureDto.partial();
export type MeasurePatchDto = z.infer<typeof MeasurePatchDto>;

export const MapRequirementDto = z.object({
  requirementId: uuid,
  coverage: z.enum(COVERAGE).default('full'),
  /** true, wenn aus einem Crosswalk-Vorschlag übernommen */
  fromCrosswalk: z.boolean().default(false),
});
export type MapRequirementDto = z.infer<typeof MapRequirementDto>;

// --- Assets -----------------------------------------------------------------------------
export const AssetDto = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(ASSET_TYPES).default('supporting'),
  category: z.enum(ASSET_CATEGORIES),
  classification: z.enum(CLASSIFICATIONS).default('internal'),
  confidentiality: cia.default(2),
  integrity: cia.default(2),
  availability: cia.default(2),
  safety: cia.default(1),
  hasPii: z.boolean().default(false),
  ownerPersonId: uuid.nullable().optional(),
  custodianPersonId: uuid.nullable().optional(),
  locationId: uuid.nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  vendor: z.string().max(120).nullable().optional(),
  product: z.string().max(120).nullable().optional(),
  version: z.string().max(60).nullable().optional(),
  cpe: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  status: z.enum(ASSET_STATUS).default('active'),
});
export type AssetDto = z.infer<typeof AssetDto>;
export const AssetPatchDto = AssetDto.partial();
export type AssetPatchDto = z.infer<typeof AssetPatchDto>;

// --- Risiken ----------------------------------------------------------------------------
export const RiskDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(8000).nullable().optional(),
  kind: z.enum(RISK_KINDS).default('risk'),
  source: z.enum(RISK_SOURCES).default('manual'),
  category: z.string().max(80).nullable().optional(),
  ownerPersonId: uuid.nullable().optional(),
  status: z.enum(RISK_STATUS).default('identified'),
  treatment: z.enum(RISK_TREATMENTS).nullable().optional(),
  assetIds: z.array(uuid).default([]),
  nextReviewAt: z.string().date().nullable().optional(),
});
export type RiskDto = z.infer<typeof RiskDto>;
export const RiskPatchDto = RiskDto.partial();
export type RiskPatchDto = z.infer<typeof RiskPatchDto>;

export const AssessRiskDto = z.object({
  stage: z.enum(ASSESSMENT_STAGES),
  likelihood: matrixValue,
  impact: matrixValue,
  note: z.string().max(2000).nullable().optional(),
});
export type AssessRiskDto = z.infer<typeof AssessRiskDto>;

export const LinkRiskMeasureDto = z.object({
  measureId: uuid,
  effect: z.enum(RISK_MEASURE_EFFECTS).default('both'),
});
export type LinkRiskMeasureDto = z.infer<typeof LinkRiskMeasureDto>;

export const AcceptRiskDto = z.object({
  validUntil: z.string().date(),
  rationale: z.string().min(10).max(4000),
});
export type AcceptRiskDto = z.infer<typeof AcceptRiskDto>;

export const QuantifyRiskDto = z.object({
  aleFrequency: z.number().min(0).nullable(),
  lossMin: z.number().min(0).nullable(),
  lossLikely: z.number().min(0).nullable(),
  lossMax: z.number().min(0).nullable(),
});
export type QuantifyRiskDto = z.infer<typeof QuantifyRiskDto>;

// --- Listen -----------------------------------------------------------------------------
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().max(200).optional(),
  sort: z.string().max(60).optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;

// --- Vorfälle ----------------------------------------------------------------------------
export const IncidentDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(8000).nullable().optional(),
  category: z.enum(INCIDENT_CATEGORIES).default('other'),
  severity: z.enum(SEVERITIES).default('medium'),
  detectedAt: z.string().datetime().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
  handlerPersonId: uuid.nullable().optional(),
  source: z.enum(INCIDENT_SOURCES).default('manual'),
  externalRef: z.string().max(200).nullable().optional(),
  assetIds: z.array(uuid).default([]),
});
export type IncidentDto = z.infer<typeof IncidentDto>;
export const IncidentPatchDto = IncidentDto.partial().extend({
  status: z.enum(INCIDENT_STATUS).optional(),
});
export type IncidentPatchDto = z.infer<typeof IncidentPatchDto>;

export const ConfirmBreachDto = z.object({
  /** Zeitpunkt des Bekanntwerdens — startet die 72-Stunden-Frist nach Art. 33 DSGVO. */
  confirmedAt: z.string().datetime().optional(),
  affectedPersons: z.number().int().min(0).nullable().optional(),
  /** Art. 34: Benachrichtigung der Betroffenen nur bei voraussichtlich hohem Risiko. */
  highRiskForIndividuals: z.boolean().default(false),
  processingActivityIds: z.array(uuid).default([]),
});
export type ConfirmBreachDto = z.infer<typeof ConfirmBreachDto>;

export const MarkSignificantDto = z.object({
  /** Kenntnisnahme des erheblichen Vorfalls — Beginn der NIS2-Fristen. */
  knownAt: z.string().datetime().optional(),
  crossBorder: z.boolean().default(false),
});
export type MarkSignificantDto = z.infer<typeof MarkSignificantDto>;

export const FulfilObligationDto = z.object({
  fulfilledAt: z.string().datetime().optional(),
  reference: z.string().max(200).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
});
export type FulfilObligationDto = z.infer<typeof FulfilObligationDto>;

export const TimelineEntryDto = z.object({
  kind: z.string().min(2).max(40).default('note'),
  text: z.string().min(1).max(4000),
  at: z.string().datetime().optional(),
});
export type TimelineEntryDto = z.infer<typeof TimelineEntryDto>;

export const RcaDto = z.object({
  method: z.enum(RCA_METHODS).default('5why'),
  problemStatement: z.string().max(2000).nullable().optional(),
  /** Bei 5-Why: die Warum-Kette als Liste. */
  whys: z.array(z.string().max(1000)).max(10).default([]),
  rootCause: z.string().max(2000).nullable().optional(),
  conclusions: z.string().max(4000).nullable().optional(),
});
export type RcaDto = z.infer<typeof RcaDto>;

// --- KVP (CAPA) --------------------------------------------------------------------------
export const ActionDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(8000).nullable().optional(),
  kind: z.enum(ACTION_KINDS).default('corrective'),
  ownerPersonId: uuid.nullable().optional(),
  dueAt: z.string().date().nullable().optional(),
  /** Höchstens eine Herkunft — die DB erzwingt das zusätzlich. */
  findingId: uuid.nullable().optional(),
  riskId: uuid.nullable().optional(),
  incidentId: uuid.nullable().optional(),
  reviewId: uuid.nullable().optional(),
});
export type ActionDto = z.infer<typeof ActionDto>;
export const ActionPatchDto = ActionDto.partial().extend({
  status: z.enum(ACTION_STATUS).optional(),
  effectivenessCheckAt: z.string().date().nullable().optional(),
  effectivenessResult: z.string().max(4000).nullable().optional(),
});
export type ActionPatchDto = z.infer<typeof ActionPatchDto>;

// --- Dokumentenlenkung ---------------------------------------------------------------------
export const DocumentDto = z.object({
  /** Kürzel wie „RL-01“ — je Mandant eindeutig und im Audit die gängige Referenz. */
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich'),
  title: z.string().min(3).max(200),
  kind: z.enum(DOCUMENT_KINDS).default('policy'),
  classification: z.enum(CLASSIFICATIONS).default('internal'),
  ownerPersonId: uuid.nullable().optional(),
  /** Überprüfungsintervall nach ISO 27001 Kap. 7.5.2; 0 = keine wiederkehrende Prüfung. */
  reviewIntervalMonths: z.number().int().min(0).max(120).default(12),
});
export type DocumentDto = z.infer<typeof DocumentDto>;

export const DocumentVersionDto = z.object({
  versionLabel: z.string().min(1).max(20),
  changeNote: z.string().max(4000).optional(),
  contentMd: z.string().max(200_000).optional(),
});
export type DocumentVersionDto = z.infer<typeof DocumentVersionDto>;

export const AcknowledgementRequestDto = z.object({
  subject: z.string().min(3).max(200).optional(),
  message: z.string().max(4000).optional(),
  dueAt: z.string().date().optional(),
  target: z
    .object({
      mode: z.enum(['all', 'persons']).default('all'),
      personIds: z.array(uuid).optional(),
    })
    .optional(),
});
export type AcknowledgementRequestDto = z.infer<typeof AcknowledgementRequestDto>;
