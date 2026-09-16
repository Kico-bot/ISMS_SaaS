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
  BC_EXERCISE_KINDS,
  BIA_DIMENSIONS,
  BIA_HORIZONS,
  ASSESSMENT_STAGES,
  CLASSIFICATIONS,
  COVERAGE,
  CONTROL_DOMAINS,
  DOCUMENT_KINDS,
  MATURITY_MAX,
  MATURITY_MIN,
  MEASURE_STATUS,
  PLAN_STATUS,
  RISK_KINDS,
  RISK_MATRIX_SIZE,
  RISK_MEASURE_EFFECTS,
  RISK_SOURCES,
  RISK_STATUS,
  RISK_TREATMENTS,
  AUDIT_KINDS,
  AUDIT_STATUS,
  FINDING_SEVERITIES,
  FINDING_SOURCES,
  FINDING_STATUS,
  KPI_COMPUTATION_KEYS,
  TARGET_DIRECTIONS,
  KPI_SOURCES,
  OBJECTIVE_KINDS,
  OBJECTIVE_STATUS,
  PARTY_CATEGORIES,
  PESTLE_DIMENSIONS,
  PESTLE_EFFECTS,
  ACTION_KINDS,
  ACTION_STATUS,
  INCIDENT_CATEGORIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUS,
  DPIA_RESULTS,
  LEGAL_BASES,
  PROCESSING_ROLES,
  PROCESSING_STATUS,
  RCA_METHODS,
  SEVERITIES,
  TRAINING_KINDS,
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
  /**
   * Eine Richtlinie liegt selten als Markdown vor. `fileId` nimmt die hochgeladene Fassung
   * auf — mit ihrem SHA-256 ist später belegbar, dass die freigegebene Version unverändert ist.
   */
  fileId: uuid.nullable().optional(),
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

// --- Audit & Feststellungen -----------------------------------------------------------------
export const AuditDto = z.object({
  title: z.string().min(3).max(200),
  kind: z.enum(AUDIT_KINDS).default('internal'),
  frameworkKey: z.string().min(1).nullable().optional(),
  scope: z.string().max(4000).nullable().optional(),
  plannedFrom: z.string().date().nullable().optional(),
  plannedTo: z.string().date().nullable().optional(),
  leadAuditorUserId: uuid.nullable().optional(),
  /** Anforderungen im Auditumfang — die Basis der Programmabdeckung nach Kap. 9.2.2. */
  requirementIds: z.array(uuid).default([]),
  /** Der Auditbericht als Datei — Kap. 9.2.2 f) verlangt ihn als dokumentierte Information. */
  reportFileId: uuid.nullable().optional(),
});
export type AuditDto = z.infer<typeof AuditDto>;
export const AuditPatchDto = AuditDto.partial().extend({
  status: z.enum(AUDIT_STATUS).optional(),
});
export type AuditPatchDto = z.infer<typeof AuditPatchDto>;

export const FindingDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(8000).nullable().optional(),
  source: z.enum(FINDING_SOURCES).default('audit'),
  severity: z.enum(FINDING_SEVERITIES).default('minor'),
  auditId: uuid.nullable().optional(),
  requirementId: uuid.nullable().optional(),
  measureId: uuid.nullable().optional(),
  dueAt: z.string().date().nullable().optional(),
});
export type FindingDto = z.infer<typeof FindingDto>;
export const FindingPatchDto = FindingDto.partial().extend({
  status: z.enum(FINDING_STATUS).optional(),
});
export type FindingPatchDto = z.infer<typeof FindingPatchDto>;

export const VerifyFindingDto = z.object({
  /** Womit wurde die Wirksamkeit der Korrektur belegt — landet im Auditnachweis. */
  result: z.string().min(5).max(4000),
});
export type VerifyFindingDto = z.infer<typeof VerifyFindingDto>;

// --- Management-Review ----------------------------------------------------------------------
export const ManagementReviewDto = z.object({
  heldAt: z.string().date(),
  chairPersonId: uuid.nullable().optional(),
});
export type ManagementReviewDto = z.infer<typeof ManagementReviewDto>;

export const CloseReviewDto = z.object({
  decisions: z.string().min(10).max(20_000),
  /** Das unterzeichnete Protokoll — Kap. 9.3.3 verlangt dokumentierte Information. */
  minutesFileId: uuid.nullable().optional(),
});
export type CloseReviewDto = z.infer<typeof CloseReviewDto>;

// --- Kennzahlen ------------------------------------------------------------------------------
export const KpiDto = z.object({
  name: z.string().min(3).max(200),
  unit: z.string().max(40).nullable().optional(),
  target: z.number().nullable().optional(),
  direction: z.enum(TARGET_DIRECTIONS).default('higher_is_better'),
  /** `computed` liest den Wert aus dem ISMS selbst, statt ihn abtippen zu lassen. */
  source: z.enum(KPI_SOURCES).default('manual'),
  computationKey: z.enum(KPI_COMPUTATION_KEYS).nullable().optional(),
  frequency: z.string().max(40).nullable().optional(),
  ownerPersonId: uuid.nullable().optional(),
});
export type KpiDto = z.infer<typeof KpiDto>;

export const KpiValueDto = z.object({
  measuredAt: z.string().date(),
  value: z.number(),
  note: z.string().max(2000).nullable().optional(),
});
export type KpiValueDto = z.infer<typeof KpiValueDto>;

// --- Organisation & Kontext ------------------------------------------------------------------
export const PersonDto = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  position: z.string().max(120).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type PersonDto = z.infer<typeof PersonDto>;
export const PersonPatchDto = PersonDto.partial();
export type PersonPatchDto = z.infer<typeof PersonPatchDto>;

export const InterestedPartyDto = z.object({
  name: z.string().min(2).max(160),
  category: z.enum(PARTY_CATEGORIES),
  /** Erwartung der Partei — bei bindenden Anforderungen die Pflichtenquelle. */
  expectations: z.string().max(4000).nullable().optional(),
  addressedVia: z.string().max(2000).nullable().optional(),
  isBinding: z.boolean().default(false),
  influence: z.number().int().min(1).max(3).default(2),
});
export type InterestedPartyDto = z.infer<typeof InterestedPartyDto>;
export const InterestedPartyPatchDto = InterestedPartyDto.partial();
export type InterestedPartyPatchDto = z.infer<typeof InterestedPartyPatchDto>;

export const PestleFactorDto = z.object({
  dimension: z.enum(PESTLE_DIMENSIONS),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).nullable().optional(),
  effect: z.enum(PESTLE_EFFECTS).default('risk'),
  relevance: z.number().int().min(1).max(3).default(2),
  linkedRiskId: uuid.nullable().optional(),
});
export type PestleFactorDto = z.infer<typeof PestleFactorDto>;
export const PestleFactorPatchDto = PestleFactorDto.partial();
export type PestleFactorPatchDto = z.infer<typeof PestleFactorPatchDto>;

export const SecurityObjectiveDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(4000).nullable().optional(),
  kind: z.enum(OBJECTIVE_KINDS).default('operational'),
  ownerPersonId: uuid.nullable().optional(),
  targetValue: z.string().max(60).nullable().optional(),
  currentValue: z.string().max(60).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  frequency: z.string().max(40).nullable().optional(),
  /** Ohne Zielrichtung liest sich „6 von 4 Stunden“ fälschlich als erreicht. */
  direction: z.enum(TARGET_DIRECTIONS).default('higher_is_better'),
  dueDate: z.string().date().nullable().optional(),
  /** Anforderungen, auf die das Ziel einzahlt — macht Kap. 6.2 im SoA nachvollziehbar. */
  requirementIds: z.array(uuid).default([]),
});
export type SecurityObjectiveDto = z.infer<typeof SecurityObjectiveDto>;
export const SecurityObjectivePatchDto = SecurityObjectiveDto.partial().extend({
  status: z.enum(OBJECTIVE_STATUS).optional(),
});
export type SecurityObjectivePatchDto = z.infer<typeof SecurityObjectivePatchDto>;

// --- Kompetenz & Schulung ---------------------------------------------------------------------
const skillLevel = z.number().int().min(1).max(5);

export const SkillDto = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
});
export type SkillDto = z.infer<typeof SkillDto>;

export const CompetenceProfileDto = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  /** Sollprofil: welche Fähigkeit in welcher Mindeststufe (1–5). */
  requirements: z.array(z.object({ skillId: uuid, minLevel: skillLevel })).default([]),
});
export type CompetenceProfileDto = z.infer<typeof CompetenceProfileDto>;

export const PersonSkillDto = z.object({
  skillId: uuid,
  level: skillLevel,
  /** Nachweis der Kompetenz — Kap. 7.2 d) verlangt dokumentierte Information. */
  evidenceNote: z.string().max(2000).nullable().optional(),
  /** Das Zertifikat selbst; die Notiz allein ist kein Nachweis. */
  evidenceFileId: uuid.nullable().optional(),
  validUntil: z.string().date().nullable().optional(),
});
export type PersonSkillDto = z.infer<typeof PersonSkillDto>;

export const AssignProfilesDto = z.object({
  profileIds: z.array(uuid).default([]),
});
export type AssignProfilesDto = z.infer<typeof AssignProfilesDto>;

export const TrainingDto = z.object({
  title: z.string().min(3).max(200),
  kind: z.enum(TRAINING_KINDS).default('awareness'),
  description: z.string().max(4000).nullable().optional(),
  contentMd: z.string().max(200_000).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type TrainingDto = z.infer<typeof TrainingDto>;
export const TrainingPatchDto = TrainingDto.partial();
export type TrainingPatchDto = z.infer<typeof TrainingPatchDto>;

export const AssignTrainingDto = z.object({
  /** Ohne Auswahl werden alle aktiven Beschäftigten zugewiesen. */
  personIds: z.array(uuid).default([]),
  dueAt: z.string().date().nullable().optional(),
});
export type AssignTrainingDto = z.infer<typeof AssignTrainingDto>;

export const CompleteTrainingDto = z.object({
  personId: uuid.optional(),
  completedAt: z.string().datetime().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  /** Teilnahmebestätigung — bei externen Schulungen der einzige Beleg. */
  evidenceFileId: uuid.nullable().optional(),
});
export type CompleteTrainingDto = z.infer<typeof CompleteTrainingDto>;

// --- Geschäftsfortführung (BIA, Notfallpläne, Übungen) ------------------------------------------
export const BusinessProcessDto = z.object({
  name: z.string().min(3).max(200),
  department: z.string().max(120).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  ownerPersonId: uuid.nullable().optional(),
  /** 1 = kritisch, 3 = unterstützend. */
  tier: z.number().int().min(1).max(3).nullable().optional(),
});
export type BusinessProcessDto = z.infer<typeof BusinessProcessDto>;
export const BusinessProcessPatchDto = BusinessProcessDto.partial();
export type BusinessProcessPatchDto = z.infer<typeof BusinessProcessPatchDto>;

export const BiaDto = z
  .object({
    /** Maximal tolerierbare Ausfalldauer. */
    mtpdHours: z.number().int().min(0).max(8760).nullable().optional(),
    /** Wiederanlaufzeit — darf die MTPD nicht überschreiten. */
    rtoHours: z.number().int().min(0).max(8760).nullable().optional(),
    /** Maximal tolerierbarer Datenverlust. */
    rpoHours: z.number().int().min(0).max(8760).nullable().optional(),
    /** Mindestbetriebsniveau, das im Notbetrieb zu halten ist. */
    mbco: z.string().max(4000).nullable().optional(),
  })
  .refine((d) => d.mtpdHours == null || d.rtoHours == null || d.rtoHours <= d.mtpdHours, {
    message:
      'Die Wiederanlaufzeit (RTO) darf die maximal tolerierbare Ausfalldauer (MTPD) nicht überschreiten.',
    path: ['rtoHours'],
  });
export type BiaDto = z.infer<typeof BiaDto>;

export const BiaImpactDto = z.object({
  dimension: z.enum(BIA_DIMENSIONS),
  horizon: z.enum(BIA_HORIZONS),
  /** 0 = keine Auswirkung, 4 = existenzbedrohend. */
  score: z.number().int().min(0).max(4),
});
export type BiaImpactDto = z.infer<typeof BiaImpactDto>;

export const BiaResourceDto = z.object({
  assetId: uuid,
  criticality: z.number().int().min(1).max(3).nullable().optional(),
});
export type BiaResourceDto = z.infer<typeof BiaResourceDto>;

export const ContinuityPlanDto = z.object({
  title: z.string().min(3).max(200),
  activationCriteria: z.string().max(4000).nullable().optional(),
  strategy: z.string().max(8000).nullable().optional(),
  /** Übungsintervall in Monaten; bestimmt die nächste Fälligkeit nach einer Übung. */
  testIntervalMonths: z.number().int().min(1).max(60).default(12),
});
export type ContinuityPlanDto = z.infer<typeof ContinuityPlanDto>;
export const ContinuityPlanPatchDto = ContinuityPlanDto.partial().extend({
  status: z.enum(PLAN_STATUS).optional(),
});
export type ContinuityPlanPatchDto = z.infer<typeof ContinuityPlanPatchDto>;

export const ContinuityStepDto = z.object({
  seq: z.number().int().min(1).max(200),
  phase: z.string().max(60).nullable().optional(),
  title: z.string().min(3).max(200),
  instruction: z.string().max(4000).nullable().optional(),
  responsiblePersonId: uuid.nullable().optional(),
});
export type ContinuityStepDto = z.infer<typeof ContinuityStepDto>;

export const BcExerciseDto = z.object({
  heldAt: z.string().date(),
  kind: z.enum(BC_EXERCISE_KINDS).default('tabletop'),
  result: z.string().max(4000).nullable().optional(),
  lessonsLearned: z.string().max(8000).nullable().optional(),
  /** Monate bis zur nächsten Übung; ohne Angabe gilt das Intervall des Plans. */
  nextInMonths: z.number().int().min(1).max(60).nullable().optional(),
});
export type BcExerciseDto = z.infer<typeof BcExerciseDto>;

// --- Datenschutz (VVT, TOM, DSFA) ---------------------------------------------------------------
export const ProcessingActivityDto = z.object({
  name: z.string().min(3).max(200),
  /** Art. 30 Abs. 1 lit. b — Zweck der Verarbeitung. */
  purpose: z.string().max(4000).nullable().optional(),
  role: z.enum(PROCESSING_ROLES).default('controller'),
  legalBasis: z.enum(LEGAL_BASES).nullable().optional(),
  legalBasisNote: z.string().max(2000).nullable().optional(),
  /** Art. 30 Abs. 1 lit. c — Kategorien betroffener Personen und personenbezogener Daten. */
  dataSubjectCategories: z.array(z.string().min(1).max(120)).max(40).default([]),
  dataCategories: z.array(z.string().min(1).max(120)).max(60).default([]),
  /** Art. 9 — besondere Kategorien verlangen eine eigene Rechtsgrundlage. */
  specialCategories: z.boolean().default(false),
  /** Art. 30 Abs. 1 lit. d — Empfänger. */
  recipients: z.array(z.string().min(1).max(200)).max(40).default([]),
  /** Art. 30 Abs. 1 lit. e — Drittlandübermittlung samt Garantien nach Kap. V. */
  thirdCountryTransfer: z.boolean().default(false),
  safeguards: z.string().max(2000).nullable().optional(),
  /** Art. 30 Abs. 1 lit. f — Löschfristen. */
  retention: z.string().max(2000).nullable().optional(),
  dpiaRequired: z.boolean().default(false),
  ownerPersonId: uuid.nullable().optional(),
});
export type ProcessingActivityDto = z.infer<typeof ProcessingActivityDto>;
export const ProcessingActivityPatchDto = ProcessingActivityDto.partial().extend({
  status: z.enum(PROCESSING_STATUS).optional(),
});
export type ProcessingActivityPatchDto = z.infer<typeof ProcessingActivityPatchDto>;

export const LinkTomDto = z.object({ measureId: uuid });
export type LinkTomDto = z.infer<typeof LinkTomDto>;

export const LinkProcessingAssetDto = z.object({ assetId: uuid });
export type LinkProcessingAssetDto = z.infer<typeof LinkProcessingAssetDto>;

export const DpiaDto = z.object({
  /** Art. 35 Abs. 7 lit. a — systematische Beschreibung der Verarbeitung. */
  descriptionOfProcessing: z.string().max(8000).nullable().optional(),
  /** Art. 35 Abs. 7 lit. b — Notwendigkeit und Verhältnismäßigkeit. */
  necessityAssessment: z.string().max(8000).nullable().optional(),
  /** Art. 35 Abs. 7 lit. c — Risiken für die Rechte und Freiheiten. */
  risks: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        likelihood: matrixValue,
        impact: matrixValue,
        mitigation: z.string().max(2000).nullable().optional(),
        riskId: uuid.nullable().optional(),
      }),
    )
    .max(50)
    .default([]),
});
export type DpiaDto = z.infer<typeof DpiaDto>;

export const DpoOpinionDto = z.object({
  /** Art. 35 Abs. 2 — der Rat der oder des Datenschutzbeauftragten. */
  opinion: z.string().min(10).max(8000),
  result: z.enum(DPIA_RESULTS),
});
export type DpoOpinionDto = z.infer<typeof DpoOpinionDto>;

// --- Nachweise und Dateien ---------------------------------------------------------------------
export const EvidenceDto = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(4000).nullable().optional(),
  /** Entweder eine hochgeladene Datei oder ein Verweis — eines von beidem muss vorliegen. */
  fileId: uuid.nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  collectedAt: z.string().date().optional(),
  /** Nachweise altern: ein Penetrationstest von 2022 belegt den heutigen Stand nicht. */
  validUntil: z.string().date().nullable().optional(),
});
export type EvidenceDto = z.infer<typeof EvidenceDto>;
export const EvidencePatchDto = EvidenceDto.partial();
export type EvidencePatchDto = z.infer<typeof EvidencePatchDto>;

export const LinkEvidenceDto = z.object({ evidenceId: uuid });
export type LinkEvidenceDto = z.infer<typeof LinkEvidenceDto>;
