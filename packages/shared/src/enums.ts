/**
 * Fachliche Enums — Single Source of Truth für DB-Enum-Typen (packages/db), API-Validierung und UI.
 * Werte sind bewusst stabile Schlüssel (englisch, snake_case); Anzeige-Labels kommen aus i18n.
 */

export const AUTH_PROVIDERS = ['local', 'entra'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const MEMBERSHIP_STATUS = ['invited', 'active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const SOD_MODES = ['block', 'warn'] as const;
export type SodMode = (typeof SOD_MODES)[number];

// --- Katalog -------------------------------------------------------------------------
export const REQUIREMENT_KINDS = [
  'clause',
  'control',
  'baustein',
  'anforderung',
  'article',
  'paragraph',
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const REQUIREMENT_LEVELS = ['basis', 'standard', 'erhoeht'] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

/**
 * Absicherungsvariante nach BSI-Standard 200-2. Sie bestimmt, welche Anforderungsstufen eines
 * modellierten Bausteins im IT-Grundschutz-Check erscheinen: Basis nur die Basis-Anforderungen,
 * Standard und Kern zusätzlich die Standard-Anforderungen. Anforderungen bei erhöhtem Schutzbedarf
 * werden je Baustein zugeschaltet, nicht pauschal.
 */
export const PROTECTION_VARIANTS = ['basis', 'standard', 'kern'] as const;
export type ProtectionVariant = (typeof PROTECTION_VARIANTS)[number];

export const CONTROL_DOMAINS = ['organizational', 'people', 'physical', 'technological'] as const;
export type ControlDomain = (typeof CONTROL_DOMAINS)[number];

export const CROSSWALK_RELATIONS = ['equivalent', 'partial', 'supports'] as const;
export type CrosswalkRelation = (typeof CROSSWALK_RELATIONS)[number];

// --- Kontext -------------------------------------------------------------------------
export const PARTY_CATEGORIES = [
  'customer',
  'supplier',
  'regulator',
  'owner',
  'employee',
  'partner',
  'public',
  'internal',
  'other',
] as const;
export type PartyCategory = (typeof PARTY_CATEGORIES)[number];

export const PESTLE_DIMENSIONS = [
  'political',
  'economic',
  'social',
  'technological',
  'legal',
  'environmental',
] as const;
export type PestleDimension = (typeof PESTLE_DIMENSIONS)[number];

export const PESTLE_EFFECTS = ['risk', 'opportunity'] as const;
export type PestleEffect = (typeof PESTLE_EFFECTS)[number];

export const OBJECTIVE_KINDS = ['strategic', 'operational'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export const OBJECTIVE_STATUS = ['draft', 'active', 'at_risk', 'achieved', 'missed'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUS)[number];

export const CHANGE_PLAN_STATUS = ['planned', 'approved', 'in_progress', 'done', 'rejected'] as const;
export type ChangePlanStatus = (typeof CHANGE_PLAN_STATUS)[number];

export const ORG_NODE_KINDS = ['unit', 'location', 'person', 'vacancy'] as const;
export type OrgNodeKind = (typeof ORG_NODE_KINDS)[number];

// --- Dokumente -----------------------------------------------------------------------
export const DOCUMENT_KINDS = [
  'policy',
  'procedure',
  'work_instruction',
  'record',
  'evidence',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUS = ['draft', 'in_review', 'published', 'retired'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'strictly_confidential'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

// --- Assets & Risiken ----------------------------------------------------------------
export const ASSET_TYPES = ['primary', 'supporting'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CATEGORIES = [
  'information',
  'process',
  'application',
  'system',
  'network',
  'hardware',
  'site',
  'person',
  'supplier',
  'other',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_RELATIONS = ['depends_on', 'hosts', 'processes', 'stores'] as const;
export type AssetRelation = (typeof ASSET_RELATIONS)[number];

export const ASSET_STATUS = ['active', 'retired'] as const;
export type AssetStatus = (typeof ASSET_STATUS)[number];

export const RISK_KINDS = ['risk', 'opportunity'] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export const RISK_SOURCES = ['manual', 'pestle', 'incident', 'audit', 'supplier', 'siem', 'dpia'] as const;
export type RiskSource = (typeof RISK_SOURCES)[number];

export const RISK_STATUS = ['identified', 'assessed', 'treated', 'monitored', 'accepted', 'closed'] as const;
export type RiskStatus = (typeof RISK_STATUS)[number];

export const RISK_TREATMENTS = ['mitigate', 'accept', 'transfer', 'avoid'] as const;
export type RiskTreatment = (typeof RISK_TREATMENTS)[number];

export const RISK_MEASURE_EFFECTS = ['reduces_likelihood', 'reduces_impact', 'both'] as const;
export type RiskMeasureEffect = (typeof RISK_MEASURE_EFFECTS)[number];

/** Feste 5×5-Matrix (Freigabe-Entscheidung 2026-09-15). */
export const RISK_MATRIX_SIZE = 5;
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// --- Maßnahmen / SoA -----------------------------------------------------------------
export const MEASURE_STATUS = [
  'planned',
  'in_progress',
  'implemented',
  'verified',
  'not_applicable',
] as const;
export type MeasureStatus = (typeof MEASURE_STATUS)[number];

export const APPLICABILITY = ['applicable', 'not_applicable'] as const;
export type Applicability = (typeof APPLICABILITY)[number];

export const COVERAGE = ['full', 'partial'] as const;
export type Coverage = (typeof COVERAGE)[number];

export const MAPPING_ORIGINS = ['manual', 'crosswalk', 'import', 'template'] as const;
export type MappingOrigin = (typeof MAPPING_ORIGINS)[number];

/** Reifegrad 0–5 (Freigabe-Entscheidung 2026-09-15). */
export const MATURITY_MIN = 0;
export const MATURITY_MAX = 5;

// --- Audit & KVP ---------------------------------------------------------------------
export const AUDIT_KINDS = ['internal', 'external', 'certification', 'supplier'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export const AUDIT_STATUS = ['planned', 'in_progress', 'reported', 'closed'] as const;
export type AuditStatus = (typeof AUDIT_STATUS)[number];

export const FINDING_SOURCES = [
  'audit',
  'self_assessment',
  'incident',
  'management_review',
  'risk_review',
] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const FINDING_SEVERITIES = ['observation', 'minor', 'major'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUS = ['open', 'in_progress', 'closed', 'verified'] as const;
export type FindingStatus = (typeof FINDING_STATUS)[number];

export const ACTION_KINDS = ['corrective', 'preventive', 'improvement'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUS = ['open', 'in_progress', 'done', 'verified', 'rejected'] as const;
export type ActionStatus = (typeof ACTION_STATUS)[number];

export const KPI_SOURCES = ['manual', 'computed'] as const;
export type KpiSource = (typeof KPI_SOURCES)[number];

/**
 * Kennzahlen, die sich aus dem ISMS selbst berechnen lassen. Jeder Schlüssel entspricht einer
 * Abfrage im Backend — abgetippte Kennzahlen sind der erste Schritt zum Papiertiger.
 */
export const KPI_COMPUTATION_KEYS = [
  'soa_coverage_pct',
  'measure_implementation_pct',
  'avg_maturity',
  'open_major_findings',
  'overdue_actions',
  'incidents_last_quarter',
  'reporting_deadline_hit_rate_pct',
  'acknowledgement_rate_pct',
  'document_review_overdue',
  'risks_above_appetite',
] as const;
export type KpiComputationKey = (typeof KPI_COMPUTATION_KEYS)[number];

/** Zielrichtung einer Messgröße — gilt für Kennzahlen wie für Informationssicherheitsziele. */
export const TARGET_DIRECTIONS = ['higher_is_better', 'lower_is_better'] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];

// --- Betrieb & Vorfälle --------------------------------------------------------------
export const INCIDENT_CATEGORIES = [
  'malware',
  'phishing',
  'data_loss',
  'availability',
  'unauthorized_access',
  'physical',
  'supplier',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUS = ['new', 'triage', 'contained', 'resolved', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

export const INCIDENT_SOURCES = ['manual', 'siem', 'email', 'supplier'] as const;
export type IncidentSource = (typeof INCIDENT_SOURCES)[number];

export const REPORTING_REGIMES = [
  'gdpr_art33',
  'gdpr_art34',
  'nis2_early_warning_24h',
  'nis2_notification_72h',
  'nis2_progress',
  'nis2_final_1m',
] as const;
export type ReportingRegime = (typeof REPORTING_REGIMES)[number];

export const RCA_METHODS = ['5why', 'ishikawa', 'other'] as const;
export type RcaMethod = (typeof RCA_METHODS)[number];

export const PLAYBOOK_SCENARIOS = [
  'asset_outage',
  'ransomware',
  'data_breach',
  'supplier_outage',
  'site_loss',
  'custom',
] as const;
export type PlaybookScenario = (typeof PLAYBOOK_SCENARIOS)[number];

export const PLAYBOOK_STATUS = ['draft', 'active', 'archived'] as const;
export type PlaybookStatus = (typeof PLAYBOOK_STATUS)[number];

export const BIA_DIMENSIONS = ['financial', 'reputation', 'legal', 'operational'] as const;
export type BiaDimension = (typeof BIA_DIMENSIONS)[number];

export const BIA_HORIZONS = ['2h', '8h', '24h', '72h', '1w'] as const;
export type BiaHorizon = (typeof BIA_HORIZONS)[number];

export const BIA_STATUS = ['draft', 'approved'] as const;
export type BiaStatus = (typeof BIA_STATUS)[number];

/** Übungsarten nach ISO 22301 Kap. 8.5 — vom Planbesprechen bis zum echten Schwenk. */
export const BC_EXERCISE_KINDS = ['tabletop', 'walkthrough', 'simulation', 'failover', 'real_event'] as const;
export type BcExerciseKind = (typeof BC_EXERCISE_KINDS)[number];

export const PLAN_STATUS = ['draft', 'active', 'archived'] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

// --- Datenschutz ---------------------------------------------------------------------
export const PROCESSING_ROLES = ['controller', 'processor', 'joint'] as const;
export type ProcessingRole = (typeof PROCESSING_ROLES)[number];

export const LEGAL_BASES = [
  'art6_1a',
  'art6_1b',
  'art6_1c',
  'art6_1d',
  'art6_1e',
  'art6_1f',
  'art9_2a',
  'art9_2b',
  'art9_2h',
  'other',
] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];

export const PROCESSING_STATUS = ['draft', 'active', 'retired'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUS)[number];

export const DPIA_STATUS = ['draft', 'in_review', 'approved'] as const;
export type DpiaStatus = (typeof DPIA_STATUS)[number];

export const DPIA_RESULTS = ['approved', 'approved_with_measures', 'rejected'] as const;
export type DpiaResult = (typeof DPIA_RESULTS)[number];

// --- Querschnitt ---------------------------------------------------------------------
export const AUDIT_LOG_ACTIONS = [
  'create',
  'update',
  'delete',
  'approve',
  'login',
  'logout',
  'export',
] as const;
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export const TRAINING_KINDS = ['awareness', 'nis2_management', 'phishing', 'onboarding', 'other'] as const;
export type TrainingKind = (typeof TRAINING_KINDS)[number];

/**
 * Zulässige Dateitypen für Nachweise. Bewusst eng: das ISMS sammelt Belege, keine Programme.
 * SVG und HTML fehlen absichtlich — sie können Skripte tragen.
 */
export const ALLOWED_UPLOAD_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
] as const;
export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number];

/** Obergrenze je Datei. Nachweise sind Belege, keine Archive. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Präfixe für fortlaufende Referenznummern je Mandant. */
export const REF_PREFIX = {
  asset: 'A',
  risk: 'R',
  measure: 'M',
  incident: 'INC',
  action: 'KVP',
  finding: 'F',
  audit: 'AUD',
} as const;
export type RefKind = keyof typeof REF_PREFIX;
