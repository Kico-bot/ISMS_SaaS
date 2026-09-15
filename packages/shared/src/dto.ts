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
  MATURITY_MAX,
  MATURITY_MIN,
  MEASURE_STATUS,
  RISK_KINDS,
  RISK_MATRIX_SIZE,
  RISK_MEASURE_EFFECTS,
  RISK_SOURCES,
  RISK_STATUS,
  RISK_TREATMENTS,
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
  .refine((d) => d.applicability !== 'not_applicable' || (d.justification && d.justification.trim().length > 0), {
    message: 'Bei "nicht anwendbar" ist eine Begründung Pflicht (SoA).',
    path: ['justification'],
  });
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
