import { pgEnum } from 'drizzle-orm/pg-core';
import * as E from '@isms/shared';

// Die DB-Enums werden 1:1 aus @isms/shared abgeleitet — eine Quelle für DB, API und UI.
export const authProviderEnum = pgEnum('auth_provider', E.AUTH_PROVIDERS);
export const membershipStatusEnum = pgEnum('membership_status', E.MEMBERSHIP_STATUS);
export const sodModeEnum = pgEnum('sod_mode', E.SOD_MODES);

export const requirementKindEnum = pgEnum('requirement_kind', E.REQUIREMENT_KINDS);
export const requirementLevelEnum = pgEnum('requirement_level', E.REQUIREMENT_LEVELS);
export const controlDomainEnum = pgEnum('control_domain', E.CONTROL_DOMAINS);
export const crosswalkRelationEnum = pgEnum('crosswalk_relation', E.CROSSWALK_RELATIONS);

export const partyCategoryEnum = pgEnum('party_category', E.PARTY_CATEGORIES);
export const pestleDimensionEnum = pgEnum('pestle_dimension', E.PESTLE_DIMENSIONS);
export const pestleEffectEnum = pgEnum('pestle_effect', E.PESTLE_EFFECTS);
export const objectiveKindEnum = pgEnum('objective_kind', E.OBJECTIVE_KINDS);
export const objectiveStatusEnum = pgEnum('objective_status', E.OBJECTIVE_STATUS);
export const changePlanStatusEnum = pgEnum('change_plan_status', E.CHANGE_PLAN_STATUS);
export const orgNodeKindEnum = pgEnum('org_node_kind', E.ORG_NODE_KINDS);

export const documentKindEnum = pgEnum('document_kind', E.DOCUMENT_KINDS);
export const documentStatusEnum = pgEnum('document_status', E.DOCUMENT_STATUS);
export const classificationEnum = pgEnum('classification', E.CLASSIFICATIONS);

export const assetTypeEnum = pgEnum('asset_type', E.ASSET_TYPES);
export const assetCategoryEnum = pgEnum('asset_category', E.ASSET_CATEGORIES);
export const assetRelationEnum = pgEnum('asset_relation_kind', E.ASSET_RELATIONS);
export const assetStatusEnum = pgEnum('asset_status', E.ASSET_STATUS);
export const riskKindEnum = pgEnum('risk_kind', E.RISK_KINDS);
export const riskSourceEnum = pgEnum('risk_source', E.RISK_SOURCES);
export const riskStatusEnum = pgEnum('risk_status', E.RISK_STATUS);
export const riskTreatmentEnum = pgEnum('risk_treatment', E.RISK_TREATMENTS);
export const assessmentStageEnum = pgEnum('assessment_stage', E.ASSESSMENT_STAGES);
export const riskMeasureEffectEnum = pgEnum('risk_measure_effect', E.RISK_MEASURE_EFFECTS);

export const measureStatusEnum = pgEnum('measure_status', E.MEASURE_STATUS);
export const applicabilityEnum = pgEnum('applicability', E.APPLICABILITY);
export const coverageEnum = pgEnum('coverage', E.COVERAGE);
export const mappingOriginEnum = pgEnum('mapping_origin', E.MAPPING_ORIGINS);

export const auditKindEnum = pgEnum('audit_kind', E.AUDIT_KINDS);
export const auditStatusEnum = pgEnum('audit_status', E.AUDIT_STATUS);
export const findingSourceEnum = pgEnum('finding_source', E.FINDING_SOURCES);
export const findingSeverityEnum = pgEnum('finding_severity', E.FINDING_SEVERITIES);
export const findingStatusEnum = pgEnum('finding_status', E.FINDING_STATUS);
export const actionKindEnum = pgEnum('action_kind', E.ACTION_KINDS);
export const actionStatusEnum = pgEnum('action_status', E.ACTION_STATUS);
export const kpiSourceEnum = pgEnum('kpi_source', E.KPI_SOURCES);
export const targetDirectionEnum = pgEnum('target_direction', E.TARGET_DIRECTIONS);

export const incidentCategoryEnum = pgEnum('incident_category', E.INCIDENT_CATEGORIES);
export const severityEnum = pgEnum('severity', E.SEVERITIES);
export const incidentStatusEnum = pgEnum('incident_status', E.INCIDENT_STATUS);
export const incidentSourceEnum = pgEnum('incident_source', E.INCIDENT_SOURCES);
export const reportingRegimeEnum = pgEnum('reporting_regime', E.REPORTING_REGIMES);
export const rcaMethodEnum = pgEnum('rca_method', E.RCA_METHODS);
export const playbookScenarioEnum = pgEnum('playbook_scenario', E.PLAYBOOK_SCENARIOS);
export const playbookStatusEnum = pgEnum('playbook_status', E.PLAYBOOK_STATUS);
export const biaDimensionEnum = pgEnum('bia_dimension', E.BIA_DIMENSIONS);
export const biaHorizonEnum = pgEnum('bia_horizon', E.BIA_HORIZONS);
export const biaStatusEnum = pgEnum('bia_status', E.BIA_STATUS);
export const planStatusEnum = pgEnum('plan_status', E.PLAN_STATUS);

export const processingRoleEnum = pgEnum('processing_role', E.PROCESSING_ROLES);
export const legalBasisEnum = pgEnum('legal_basis', E.LEGAL_BASES);
export const processingStatusEnum = pgEnum('processing_status', E.PROCESSING_STATUS);
export const dpiaStatusEnum = pgEnum('dpia_status', E.DPIA_STATUS);
export const dpiaResultEnum = pgEnum('dpia_result', E.DPIA_RESULTS);

export const auditLogActionEnum = pgEnum('audit_log_action', E.AUDIT_LOG_ACTIONS);
export const trainingKindEnum = pgEnum('training_kind', E.TRAINING_KINDS);
