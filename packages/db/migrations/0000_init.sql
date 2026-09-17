CREATE TYPE "public"."action_kind" AS ENUM('corrective', 'preventive', 'improvement');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('open', 'in_progress', 'done', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."applicability" AS ENUM('applicable', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."assessment_stage" AS ENUM('inherent', 'residual');--> statement-breakpoint
CREATE TYPE "public"."asset_category" AS ENUM('information', 'process', 'application', 'system', 'network', 'hardware', 'site', 'person', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_relation_kind" AS ENUM('depends_on', 'hosts', 'processes', 'stores');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('primary', 'supporting');--> statement-breakpoint
CREATE TYPE "public"."audit_kind" AS ENUM('internal', 'external', 'certification', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."audit_log_action" AS ENUM('create', 'update', 'delete', 'approve', 'login', 'logout', 'export');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('planned', 'in_progress', 'reported', 'closed');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('local', 'entra');--> statement-breakpoint
CREATE TYPE "public"."bia_dimension" AS ENUM('financial', 'reputation', 'legal', 'operational');--> statement-breakpoint
CREATE TYPE "public"."bia_horizon" AS ENUM('2h', '8h', '24h', '72h', '1w');--> statement-breakpoint
CREATE TYPE "public"."bia_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."change_plan_status" AS ENUM('planned', 'approved', 'in_progress', 'done', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."classification" AS ENUM('public', 'internal', 'confidential', 'strictly_confidential');--> statement-breakpoint
CREATE TYPE "public"."control_domain" AS ENUM('organizational', 'people', 'physical', 'technological');--> statement-breakpoint
CREATE TYPE "public"."coverage" AS ENUM('full', 'partial');--> statement-breakpoint
CREATE TYPE "public"."crosswalk_relation" AS ENUM('equivalent', 'partial', 'supports');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('policy', 'procedure', 'work_instruction', 'record', 'evidence', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'in_review', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."dpia_result" AS ENUM('approved', 'approved_with_measures', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."dpia_status" AS ENUM('draft', 'in_review', 'approved');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('observation', 'minor', 'major');--> statement-breakpoint
CREATE TYPE "public"."finding_source" AS ENUM('audit', 'self_assessment', 'incident', 'management_review', 'risk_review');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'in_progress', 'closed', 'verified');--> statement-breakpoint
CREATE TYPE "public"."incident_category" AS ENUM('malware', 'phishing', 'data_loss', 'availability', 'unauthorized_access', 'physical', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."incident_source" AS ENUM('manual', 'siem', 'email', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('new', 'triage', 'contained', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."kpi_direction" AS ENUM('higher_is_better', 'lower_is_better');--> statement-breakpoint
CREATE TYPE "public"."kpi_source" AS ENUM('manual', 'computed');--> statement-breakpoint
CREATE TYPE "public"."legal_basis" AS ENUM('art6_1a', 'art6_1b', 'art6_1c', 'art6_1d', 'art6_1e', 'art6_1f', 'art9_2a', 'art9_2b', 'art9_2h', 'other');--> statement-breakpoint
CREATE TYPE "public"."mapping_origin" AS ENUM('manual', 'crosswalk', 'import', 'template');--> statement-breakpoint
CREATE TYPE "public"."measure_status" AS ENUM('planned', 'in_progress', 'implemented', 'verified', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."objective_kind" AS ENUM('strategic', 'operational');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('draft', 'active', 'at_risk', 'achieved', 'missed');--> statement-breakpoint
CREATE TYPE "public"."org_node_kind" AS ENUM('unit', 'location', 'person', 'vacancy');--> statement-breakpoint
CREATE TYPE "public"."party_category" AS ENUM('customer', 'supplier', 'regulator', 'owner', 'employee', 'partner', 'public', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."pestle_dimension" AS ENUM('political', 'economic', 'social', 'technological', 'legal', 'environmental');--> statement-breakpoint
CREATE TYPE "public"."pestle_effect" AS ENUM('risk', 'opportunity');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."playbook_scenario" AS ENUM('asset_outage', 'ransomware', 'data_breach', 'supplier_outage', 'site_loss', 'custom');--> statement-breakpoint
CREATE TYPE "public"."playbook_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."processing_role" AS ENUM('controller', 'processor', 'joint');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."rca_method" AS ENUM('5why', 'ishikawa', 'other');--> statement-breakpoint
CREATE TYPE "public"."reporting_regime" AS ENUM('gdpr_art33', 'gdpr_art34', 'nis2_early_warning_24h', 'nis2_notification_72h', 'nis2_progress', 'nis2_final_1m');--> statement-breakpoint
CREATE TYPE "public"."requirement_kind" AS ENUM('clause', 'control', 'baustein', 'anforderung', 'article', 'paragraph');--> statement-breakpoint
CREATE TYPE "public"."requirement_level" AS ENUM('basis', 'standard', 'erhoeht');--> statement-breakpoint
CREATE TYPE "public"."risk_kind" AS ENUM('risk', 'opportunity');--> statement-breakpoint
CREATE TYPE "public"."risk_measure_effect" AS ENUM('reduces_likelihood', 'reduces_impact', 'both');--> statement-breakpoint
CREATE TYPE "public"."risk_source" AS ENUM('manual', 'pestle', 'incident', 'audit', 'supplier', 'siem', 'dpia');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('identified', 'assessed', 'treated', 'monitored', 'accepted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."risk_treatment" AS ENUM('mitigate', 'accept', 'transfer', 'avoid');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."sod_mode" AS ENUM('block', 'warn');--> statement-breakpoint
CREATE TYPE "public"."training_kind" AS ENUM('awareness', 'nis2_management', 'phishing', 'onboarding', 'other');--> statement-breakpoint
CREATE TABLE "membership_role" (
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "membership_role_membership_id_role_id_pk" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "refresh_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_tenant_key_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "sod_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"role_a" uuid NOT NULL,
	"role_b" uuid NOT NULL,
	"mode" "sod_mode" NOT NULL,
	"reason" text,
	CONSTRAINT "sod_rule_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","role_a","role_b"),
	CONSTRAINT "sod_rule_order_chk" CHECK ("sod_rule"."role_a" < "sod_rule"."role_b")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permissions_version" integer DEFAULT 1 NOT NULL,
	"sso_provider" "auth_provider",
	"sso_config_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" uuid,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_membership_uq" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"external_subject" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"totp_secret_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_external_subject_uq" UNIQUE("auth_provider","external_subject"),
	CONSTRAINT "user_auth_chk" CHECK (("user"."auth_provider" = 'local' AND "user"."password_hash" IS NOT NULL) OR "user"."auth_provider" <> 'local')
);
--> statement-breakpoint
CREATE TABLE "framework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"publisher" text,
	"jurisdiction" text,
	"license_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framework_key_version_uq" UNIQUE("key","version")
);
--> statement-breakpoint
CREATE TABLE "requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"parent_id" uuid,
	"ref_code" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"kind" "requirement_kind" NOT NULL,
	"level" "requirement_level",
	"domain" "control_domain",
	"path" "ltree" NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "requirement_fw_ref_uq" UNIQUE("framework_id","ref_code")
);
--> statement-breakpoint
CREATE TABLE "requirement_crosswalk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_requirement_id" uuid NOT NULL,
	"target_requirement_id" uuid NOT NULL,
	"relation" "crosswalk_relation" NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "crosswalk_uq" UNIQUE("source_requirement_id","target_requirement_id"),
	CONSTRAINT "crosswalk_self_chk" CHECK ("requirement_crosswalk"."source_requirement_id" <> "requirement_crosswalk"."target_requirement_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_framework" (
	"tenant_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"activated_at" date DEFAULT now() NOT NULL,
	"scope_note" text,
	CONSTRAINT "tenant_framework_tenant_id_framework_id_pk" PRIMARY KEY("tenant_id","framework_id")
);
--> statement-breakpoint
CREATE TABLE "acknowledgement" (
	"campaign_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "acknowledgement_campaign_id_person_id_pk" PRIMARY KEY("campaign_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "acknowledgement_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text,
	"target" jsonb DEFAULT '{"mode":"all"}'::jsonb NOT NULL,
	"due_at" date,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_plan_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"impact_assessment" text,
	"status" "change_plan_status" DEFAULT 'planned' NOT NULL,
	"planned_for" date,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_plan_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"audience" text NOT NULL,
	"channel" text NOT NULL,
	"frequency" text NOT NULL,
	"responsible_person_id" uuid,
	"clause_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competence_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competence_profile_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" DEFAULT 'policy' NOT NULL,
	"classification" "classification" DEFAULT 'internal' NOT NULL,
	"owner_person_id" uuid,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"review_interval_months" smallint DEFAULT 12 NOT NULL,
	"next_review_at" date,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_tenant_key_uq" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "document_requirement" (
	"document_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "document_requirement_document_id_requirement_id_pk" PRIMARY KEY("document_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"change_note" text,
	"file_id" uuid,
	"content_md" text,
	"author_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_uq" UNIQUE("document_id","version_label"),
	CONSTRAINT "document_version_four_eyes_chk" CHECK ("document_version"."approved_by_user_id" IS DISTINCT FROM "document_version"."author_user_id")
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "interested_party" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "party_category" NOT NULL,
	"expectations" text,
	"addressed_via" text,
	"is_binding" boolean DEFAULT false NOT NULL,
	"influence" smallint DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_influence_chk" CHECK ("interested_party"."influence" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"city" text,
	"country" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objective_requirement" (
	"objective_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "objective_requirement_objective_id_requirement_id_pk" PRIMARY KEY("objective_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "org_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "org_node_kind" DEFAULT 'unit' NOT NULL,
	"label" text NOT NULL,
	"person_id" uuid,
	"location_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" "citext",
	"department" text,
	"position" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_tenant_user_uq" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "person_profile" (
	"person_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	CONSTRAINT "person_profile_person_id_profile_id_pk" PRIMARY KEY("person_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "person_skill" (
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"evidence_file_id" uuid,
	"evidence_note" text,
	"valid_until" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_skill_person_id_skill_id_pk" PRIMARY KEY("person_id","skill_id"),
	CONSTRAINT "person_skill_level_chk" CHECK ("person_skill"."level" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "pestle_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dimension" "pestle_dimension" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"effect" "pestle_effect" DEFAULT 'risk' NOT NULL,
	"relevance" smallint DEFAULT 2 NOT NULL,
	"linked_risk_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pestle_relevance_chk" CHECK ("pestle_factor"."relevance" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "profile_skill_requirement" (
	"profile_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"min_level" smallint NOT NULL,
	CONSTRAINT "profile_skill_requirement_profile_id_skill_id_pk" PRIMARY KEY("profile_id","skill_id"),
	CONSTRAINT "profile_skill_level_chk" CHECK ("profile_skill_requirement"."min_level" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "security_objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "objective_kind" DEFAULT 'operational' NOT NULL,
	"status" "objective_status" DEFAULT 'draft' NOT NULL,
	"owner_person_id" uuid,
	"target_value" text,
	"current_value" text,
	"unit" text,
	"frequency" text,
	"due_date" date,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_tenant_name_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "training" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "training_kind" DEFAULT 'awareness' NOT NULL,
	"description" text,
	"content_md" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"training_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"due_at" date,
	"completed_at" timestamp with time zone,
	"score" smallint,
	"evidence_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_assignment_uq" UNIQUE("training_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"file_id" uuid,
	"url" text,
	"description" text,
	"collected_at" date DEFAULT now() NOT NULL,
	"valid_until" date,
	"collected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"domain" "control_domain",
	"owner_person_id" uuid,
	"status" "measure_status" DEFAULT 'planned' NOT NULL,
	"maturity" smallint,
	"due_date" date,
	"effort_days" numeric(8, 1),
	"cost_eur" numeric(12, 2),
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"last_review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measure_tenant_ref_uq" UNIQUE("tenant_id","ref_no"),
	CONSTRAINT "measure_maturity_chk" CHECK ("measure"."maturity" IS NULL OR "measure"."maturity" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "measure_evidence" (
	"measure_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	CONSTRAINT "measure_evidence_measure_id_evidence_id_pk" PRIMARY KEY("measure_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "measure_requirement" (
	"tenant_id" uuid NOT NULL,
	"measure_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"coverage" "coverage" DEFAULT 'full' NOT NULL,
	"created_via" "mapping_origin" DEFAULT 'manual' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measure_requirement_measure_id_requirement_id_pk" PRIMARY KEY("measure_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_requirement" (
	"tenant_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"applicability" "applicability" DEFAULT 'applicable' NOT NULL,
	"justification" text,
	"maturity" smallint,
	"target_maturity" smallint,
	"notes" text,
	"assessed_by_user_id" uuid,
	"assessed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_requirement_tenant_id_requirement_id_pk" PRIMARY KEY("tenant_id","requirement_id"),
	CONSTRAINT "tenant_requirement_soa_chk" CHECK ("tenant_requirement"."applicability" = 'applicable' OR "tenant_requirement"."justification" IS NOT NULL),
	CONSTRAINT "tenant_requirement_maturity_chk" CHECK (("tenant_requirement"."maturity" IS NULL OR "tenant_requirement"."maturity" BETWEEN 0 AND 5) AND ("tenant_requirement"."target_maturity" IS NULL OR "tenant_requirement"."target_maturity" BETWEEN 0 AND 5))
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"name" text NOT NULL,
	"type" "asset_type" DEFAULT 'supporting' NOT NULL,
	"category" "asset_category" NOT NULL,
	"classification" "classification" DEFAULT 'internal' NOT NULL,
	"confidentiality" smallint DEFAULT 2 NOT NULL,
	"integrity" smallint DEFAULT 2 NOT NULL,
	"availability" smallint DEFAULT 2 NOT NULL,
	"safety" smallint DEFAULT 1 NOT NULL,
	"has_pii" boolean DEFAULT false NOT NULL,
	"owner_person_id" uuid,
	"custodian_person_id" uuid,
	"location_id" uuid,
	"description" text,
	"vendor" text,
	"product" text,
	"version" text,
	"cpe" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_tenant_ref_uq" UNIQUE("tenant_id","ref_no"),
	CONSTRAINT "asset_cia_chk" CHECK ("asset"."confidentiality" BETWEEN 1 AND 3 AND "asset"."integrity" BETWEEN 1 AND 3 AND "asset"."availability" BETWEEN 1 AND 3 AND "asset"."safety" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "asset_relation" (
	"tenant_id" uuid NOT NULL,
	"from_asset_id" uuid NOT NULL,
	"to_asset_id" uuid NOT NULL,
	"relation" "asset_relation_kind" NOT NULL,
	CONSTRAINT "asset_relation_from_asset_id_to_asset_id_relation_pk" PRIMARY KEY("from_asset_id","to_asset_id","relation"),
	CONSTRAINT "asset_relation_self_chk" CHECK ("asset_relation"."from_asset_id" <> "asset_relation"."to_asset_id")
);
--> statement-breakpoint
CREATE TABLE "risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "risk_kind" DEFAULT 'risk' NOT NULL,
	"source" "risk_source" DEFAULT 'manual' NOT NULL,
	"category" text,
	"owner_person_id" uuid,
	"status" "risk_status" DEFAULT 'identified' NOT NULL,
	"inherent_likelihood" smallint,
	"inherent_impact" smallint,
	"inherent_score" smallint GENERATED ALWAYS AS (inherent_likelihood * inherent_impact) STORED,
	"residual_likelihood" smallint,
	"residual_impact" smallint,
	"residual_score" smallint GENERATED ALWAYS AS (residual_likelihood * residual_impact) STORED,
	"treatment" "risk_treatment",
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_until" date,
	"acceptance_rationale" text,
	"acceptance_snapshot" jsonb,
	"ale_frequency" numeric(10, 3),
	"loss_min" numeric(14, 2),
	"loss_likely" numeric(14, 2),
	"loss_max" numeric(14, 2),
	"next_review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_tenant_ref_uq" UNIQUE("tenant_id","ref_no"),
	CONSTRAINT "risk_matrix_chk" CHECK (("risk"."inherent_likelihood" IS NULL OR "risk"."inherent_likelihood" BETWEEN 1 AND 5) AND ("risk"."inherent_impact" IS NULL OR "risk"."inherent_impact" BETWEEN 1 AND 5) AND ("risk"."residual_likelihood" IS NULL OR "risk"."residual_likelihood" BETWEEN 1 AND 5) AND ("risk"."residual_impact" IS NULL OR "risk"."residual_impact" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE TABLE "risk_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"stage" "assessment_stage" NOT NULL,
	"likelihood" smallint NOT NULL,
	"impact" smallint NOT NULL,
	"score" smallint GENERATED ALWAYS AS (likelihood * impact) STORED,
	"assessed_by_user_id" uuid,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "risk_assessment_chk" CHECK ("risk_assessment"."likelihood" BETWEEN 1 AND 5 AND "risk_assessment"."impact" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "risk_asset" (
	"tenant_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "risk_asset_risk_id_asset_id_pk" PRIMARY KEY("risk_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "risk_matrix_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"likelihood_labels" jsonb NOT NULL,
	"impact_labels" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"appetite" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_measure" (
	"tenant_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"measure_id" uuid NOT NULL,
	"effect" "risk_measure_effect" DEFAULT 'both' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_measure_risk_id_measure_id_pk" PRIMARY KEY("risk_id","measure_id")
);
--> statement-breakpoint
CREATE TABLE "sequence_counter" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequence_counter_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind")
);
--> statement-breakpoint
CREATE TABLE "action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "action_kind" DEFAULT 'corrective' NOT NULL,
	"finding_id" uuid,
	"risk_id" uuid,
	"incident_id" uuid,
	"review_id" uuid,
	"owner_person_id" uuid,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"due_at" date,
	"completed_at" timestamp with time zone,
	"effectiveness_check_at" date,
	"effectiveness_result" text,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_single_origin_chk" CHECK (num_nonnulls("action"."finding_id", "action"."risk_id", "action"."incident_id", "action"."review_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"kind" "audit_kind" DEFAULT 'internal' NOT NULL,
	"framework_id" uuid,
	"scope" text,
	"planned_from" date,
	"planned_to" date,
	"lead_auditor_user_id" uuid,
	"status" "audit_status" DEFAULT 'planned' NOT NULL,
	"report_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"audit_id" uuid,
	"source" "finding_source" DEFAULT 'audit' NOT NULL,
	"severity" "finding_severity" DEFAULT 'minor' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requirement_id" uuid,
	"measure_id" uuid,
	"raised_by_user_id" uuid NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"due_at" date,
	"closed_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"finding_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	CONSTRAINT "finding_evidence_finding_id_evidence_id_pk" PRIMARY KEY("finding_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "kpi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"target" numeric(12, 2),
	"direction" "kpi_direction" DEFAULT 'higher_is_better' NOT NULL,
	"source" "kpi_source" DEFAULT 'manual' NOT NULL,
	"computation_key" text,
	"frequency" text,
	"owner_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_value" (
	"kpi_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"measured_at" date NOT NULL,
	"value" numeric(14, 3) NOT NULL,
	"note" text,
	CONSTRAINT "kpi_value_kpi_id_measured_at_pk" PRIMARY KEY("kpi_id","measured_at")
);
--> statement-breakpoint
CREATE TABLE "management_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"held_at" date NOT NULL,
	"chair_person_id" uuid,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decisions" text,
	"minutes_file_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bc_exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"held_at" date NOT NULL,
	"kind" text DEFAULT 'tabletop' NOT NULL,
	"result" text,
	"lessons_learned" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"mtpd_hours" integer,
	"rto_hours" integer,
	"rpo_hours" integer,
	"mbco" text,
	"status" "bia_status" DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bia_rto_chk" CHECK ("bia"."mtpd_hours" IS NULL OR "bia"."rto_hours" IS NULL OR "bia"."rto_hours" <= "bia"."mtpd_hours")
);
--> statement-breakpoint
CREATE TABLE "bia_impact" (
	"bia_id" uuid NOT NULL,
	"dimension" "bia_dimension" NOT NULL,
	"horizon" "bia_horizon" NOT NULL,
	"score" smallint NOT NULL,
	CONSTRAINT "bia_impact_bia_id_dimension_horizon_pk" PRIMARY KEY("bia_id","dimension","horizon"),
	CONSTRAINT "bia_impact_score_chk" CHECK ("bia_impact"."score" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "bia_resource" (
	"bia_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"criticality" smallint,
	CONSTRAINT "bia_resource_bia_id_asset_id_pk" PRIMARY KEY("bia_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "business_process" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"description" text,
	"owner_person_id" uuid,
	"tier" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_tier_chk" CHECK ("business_process"."tier" IS NULL OR "business_process"."tier" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "continuity_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bia_id" uuid NOT NULL,
	"title" text NOT NULL,
	"activation_criteria" text,
	"strategy" text,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"last_test_at" date,
	"next_test_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_plan_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"phase" text,
	"title" text NOT NULL,
	"instruction" text,
	"responsible_person_id" uuid,
	CONSTRAINT "continuity_plan_step_uq" UNIQUE("plan_id","seq")
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "incident_category" DEFAULT 'other' NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"status" "incident_status" DEFAULT 'new' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone,
	"reported_by_user_id" uuid,
	"handler_person_id" uuid,
	"source" "incident_source" DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"is_personal_data_breach" boolean DEFAULT false NOT NULL,
	"breach_confirmed_at" timestamp with time zone,
	"affected_persons" integer,
	"nis2_relevant" boolean DEFAULT false NOT NULL,
	"nis2_significant_at" timestamp with time zone,
	"cross_border" boolean DEFAULT false NOT NULL,
	"playbook_id" uuid,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_tenant_ref_uq" UNIQUE("tenant_id","ref_no")
);
--> statement-breakpoint
CREATE TABLE "incident_asset" (
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "incident_asset_incident_id_asset_id_pk" PRIMARY KEY("incident_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "incident_playbook_step" (
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid,
	"note" text,
	CONSTRAINT "incident_playbook_step_incident_id_step_id_pk" PRIMARY KEY("incident_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "incident_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scenario" "playbook_scenario" DEFAULT 'custom' NOT NULL,
	"asset_id" uuid,
	"process_id" uuid,
	"status" "playbook_status" DEFAULT 'draft' NOT NULL,
	"auto_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"playbook_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"title" text NOT NULL,
	"instruction" text,
	"role_hint" text,
	"contact_person_id" uuid,
	CONSTRAINT "playbook_step_uq" UNIQUE("playbook_id","seq")
);
--> statement-breakpoint
CREATE TABLE "reporting_obligation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"regime" "reporting_regime" NOT NULL,
	"due_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"authority" text,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_obligation_uq" UNIQUE("incident_id","regime")
);
--> statement-breakpoint
CREATE TABLE "root_cause_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"method" "rca_method" DEFAULT '5why' NOT NULL,
	"problem_statement" text,
	"analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"root_cause" text,
	"conclusions" text,
	"performed_by_user_id" uuid,
	"performed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "root_cause_analysis_incident_id_unique" UNIQUE("incident_id")
);
--> statement-breakpoint
CREATE TABLE "dpia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processing_activity_id" uuid NOT NULL,
	"status" "dpia_status" DEFAULT 'draft' NOT NULL,
	"description_of_processing" text,
	"necessity_assessment" text,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dpo_opinion" text,
	"dpo_user_id" uuid,
	"dpo_consulted_at" timestamp with time zone,
	"result" "dpia_result",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dpia_processing_activity_id_unique" UNIQUE("processing_activity_id")
);
--> statement-breakpoint
CREATE TABLE "incident_processing" (
	"incident_id" uuid NOT NULL,
	"processing_activity_id" uuid NOT NULL,
	CONSTRAINT "incident_processing_incident_id_processing_activity_id_pk" PRIMARY KEY("incident_id","processing_activity_id")
);
--> statement-breakpoint
CREATE TABLE "processing_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"role" "processing_role" DEFAULT 'controller' NOT NULL,
	"legal_basis" "legal_basis",
	"legal_basis_note" text,
	"data_subject_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"special_categories" boolean DEFAULT false NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"third_country_transfer" boolean DEFAULT false NOT NULL,
	"safeguards" text,
	"retention" text,
	"dpia_required" boolean DEFAULT false NOT NULL,
	"owner_person_id" uuid,
	"status" "processing_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_asset" (
	"processing_activity_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "processing_asset_processing_activity_id_asset_id_pk" PRIMARY KEY("processing_activity_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "processing_requirement" (
	"processing_activity_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "processing_requirement_processing_activity_id_requirement_id_pk" PRIMARY KEY("processing_activity_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "processing_tom" (
	"processing_activity_id" uuid NOT NULL,
	"measure_id" uuid NOT NULL,
	CONSTRAINT "processing_tom_processing_activity_id_measure_id_pk" PRIMARY KEY("processing_activity_id","measure_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "audit_log_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"config_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"payload" jsonb NOT NULL,
	"mapped_incident_id" uuid
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email_queued_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_membership_id_tenant_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."tenant_membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_key_permission_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sod_rule" ADD CONSTRAINT "sod_rule_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sod_rule" ADD CONSTRAINT "sod_rule_role_a_role_id_fk" FOREIGN KEY ("role_a") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sod_rule" ADD CONSTRAINT "sod_rule_role_b_role_id_fk" FOREIGN KEY ("role_b") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_membership" ADD CONSTRAINT "tenant_membership_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_membership" ADD CONSTRAINT "tenant_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_membership" ADD CONSTRAINT "tenant_membership_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_crosswalk" ADD CONSTRAINT "requirement_crosswalk_source_requirement_id_requirement_id_fk" FOREIGN KEY ("source_requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_crosswalk" ADD CONSTRAINT "requirement_crosswalk_target_requirement_id_requirement_id_fk" FOREIGN KEY ("target_requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_framework" ADD CONSTRAINT "tenant_framework_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_framework" ADD CONSTRAINT "tenant_framework_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement" ADD CONSTRAINT "acknowledgement_campaign_id_acknowledgement_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."acknowledgement_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement" ADD CONSTRAINT "acknowledgement_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement" ADD CONSTRAINT "acknowledgement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_campaign" ADD CONSTRAINT "acknowledgement_campaign_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_campaign" ADD CONSTRAINT "acknowledgement_campaign_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_campaign" ADD CONSTRAINT "acknowledgement_campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_plan_entry" ADD CONSTRAINT "change_plan_entry_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_plan_entry" ADD CONSTRAINT "change_plan_entry_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_plan_entry" ADD CONSTRAINT "communication_plan_entry_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_plan_entry" ADD CONSTRAINT "communication_plan_entry_responsible_person_id_person_id_fk" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence_profile" ADD CONSTRAINT "competence_profile_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement" ADD CONSTRAINT "document_requirement_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement" ADD CONSTRAINT "document_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interested_party" ADD CONSTRAINT "interested_party_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_requirement" ADD CONSTRAINT "objective_requirement_objective_id_security_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."security_objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_requirement" ADD CONSTRAINT "objective_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profile" ADD CONSTRAINT "person_profile_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profile" ADD CONSTRAINT "person_profile_profile_id_competence_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."competence_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_skill" ADD CONSTRAINT "person_skill_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_skill" ADD CONSTRAINT "person_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_skill" ADD CONSTRAINT "person_skill_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_skill" ADD CONSTRAINT "person_skill_evidence_file_id_file_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pestle_factor" ADD CONSTRAINT "pestle_factor_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_requirement" ADD CONSTRAINT "profile_skill_requirement_profile_id_competence_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."competence_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_requirement" ADD CONSTRAINT "profile_skill_requirement_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_objective" ADD CONSTRAINT "security_objective_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_objective" ADD CONSTRAINT "security_objective_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_objective" ADD CONSTRAINT "security_objective_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."training"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_evidence_file_id_file_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_collected_by_user_id_user_id_fk" FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure" ADD CONSTRAINT "measure_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure" ADD CONSTRAINT "measure_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure" ADD CONSTRAINT "measure_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_evidence" ADD CONSTRAINT "measure_evidence_measure_id_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_evidence" ADD CONSTRAINT "measure_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_requirement" ADD CONSTRAINT "measure_requirement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_requirement" ADD CONSTRAINT "measure_requirement_measure_id_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_requirement" ADD CONSTRAINT "measure_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_requirement" ADD CONSTRAINT "measure_requirement_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_requirement" ADD CONSTRAINT "tenant_requirement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_requirement" ADD CONSTRAINT "tenant_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_requirement" ADD CONSTRAINT "tenant_requirement_assessed_by_user_id_user_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_custodian_person_id_person_id_fk" FOREIGN KEY ("custodian_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relation" ADD CONSTRAINT "asset_relation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relation" ADD CONSTRAINT "asset_relation_from_asset_id_asset_id_fk" FOREIGN KEY ("from_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relation" ADD CONSTRAINT "asset_relation_to_asset_id_asset_id_fk" FOREIGN KEY ("to_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessment" ADD CONSTRAINT "risk_assessment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessment" ADD CONSTRAINT "risk_assessment_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessment" ADD CONSTRAINT "risk_assessment_assessed_by_user_id_user_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_asset" ADD CONSTRAINT "risk_asset_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_asset" ADD CONSTRAINT "risk_asset_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_asset" ADD CONSTRAINT "risk_asset_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_matrix_config" ADD CONSTRAINT "risk_matrix_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_measure" ADD CONSTRAINT "risk_measure_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_measure" ADD CONSTRAINT "risk_measure_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_measure" ADD CONSTRAINT "risk_measure_measure_id_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_counter" ADD CONSTRAINT "sequence_counter_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_review_id_management_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."management_review"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_lead_auditor_user_id_user_id_fk" FOREIGN KEY ("lead_auditor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_report_file_id_file_id_fk" FOREIGN KEY ("report_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_audit_id_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_measure_id_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measure"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_raised_by_user_id_user_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_value" ADD CONSTRAINT "kpi_value_kpi_id_kpi_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_value" ADD CONSTRAINT "kpi_value_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review" ADD CONSTRAINT "management_review_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review" ADD CONSTRAINT "management_review_chair_person_id_person_id_fk" FOREIGN KEY ("chair_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review" ADD CONSTRAINT "management_review_minutes_file_id_file_id_fk" FOREIGN KEY ("minutes_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bc_exercise" ADD CONSTRAINT "bc_exercise_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bc_exercise" ADD CONSTRAINT "bc_exercise_plan_id_continuity_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."continuity_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia" ADD CONSTRAINT "bia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia" ADD CONSTRAINT "bia_process_id_business_process_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."business_process"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia" ADD CONSTRAINT "bia_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia_impact" ADD CONSTRAINT "bia_impact_bia_id_bia_id_fk" FOREIGN KEY ("bia_id") REFERENCES "public"."bia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia_resource" ADD CONSTRAINT "bia_resource_bia_id_bia_id_fk" FOREIGN KEY ("bia_id") REFERENCES "public"."bia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bia_resource" ADD CONSTRAINT "bia_resource_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_process" ADD CONSTRAINT "business_process_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_process" ADD CONSTRAINT "business_process_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_plan" ADD CONSTRAINT "continuity_plan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_plan" ADD CONSTRAINT "continuity_plan_bia_id_bia_id_fk" FOREIGN KEY ("bia_id") REFERENCES "public"."bia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_plan_step" ADD CONSTRAINT "continuity_plan_step_plan_id_continuity_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."continuity_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_plan_step" ADD CONSTRAINT "continuity_plan_step_responsible_person_id_person_id_fk" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_reported_by_user_id_user_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_handler_person_id_person_id_fk" FOREIGN KEY ("handler_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_playbook_id_playbook_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbook"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_asset" ADD CONSTRAINT "incident_asset_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_asset" ADD CONSTRAINT "incident_asset_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_asset" ADD CONSTRAINT "incident_asset_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_playbook_step" ADD CONSTRAINT "incident_playbook_step_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_playbook_step" ADD CONSTRAINT "incident_playbook_step_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_playbook_step" ADD CONSTRAINT "incident_playbook_step_step_id_playbook_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."playbook_step"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_playbook_step" ADD CONSTRAINT "incident_playbook_step_done_by_user_id_user_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_process_id_business_process_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."business_process"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_step" ADD CONSTRAINT "playbook_step_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_step" ADD CONSTRAINT "playbook_step_playbook_id_playbook_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_step" ADD CONSTRAINT "playbook_step_contact_person_id_person_id_fk" FOREIGN KEY ("contact_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_obligation" ADD CONSTRAINT "reporting_obligation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_obligation" ADD CONSTRAINT "reporting_obligation_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_cause_analysis" ADD CONSTRAINT "root_cause_analysis_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_cause_analysis" ADD CONSTRAINT "root_cause_analysis_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_cause_analysis" ADD CONSTRAINT "root_cause_analysis_performed_by_user_id_user_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpia" ADD CONSTRAINT "dpia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpia" ADD CONSTRAINT "dpia_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpia" ADD CONSTRAINT "dpia_dpo_user_id_user_id_fk" FOREIGN KEY ("dpo_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_processing" ADD CONSTRAINT "incident_processing_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_processing" ADD CONSTRAINT "incident_processing_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_asset" ADD CONSTRAINT "processing_asset_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_asset" ADD CONSTRAINT "processing_asset_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_requirement" ADD CONSTRAINT "processing_requirement_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_requirement" ADD CONSTRAINT "processing_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_tom" ADD CONSTRAINT "processing_tom_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_tom" ADD CONSTRAINT "processing_tom_measure_id_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_token_user_idx" ON "refresh_token" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "tenant_membership_user_idx" ON "tenant_membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requirement_fw_kind_idx" ON "requirement" USING btree ("framework_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "requirement_parent_idx" ON "requirement" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "requirement_path_gist" ON "requirement" USING gist ("path");--> statement-breakpoint
CREATE INDEX "crosswalk_target_idx" ON "requirement_crosswalk" USING btree ("target_requirement_id");--> statement-breakpoint
CREATE INDEX "ack_person_idx" ON "acknowledgement" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "ack_campaign_tenant_idx" ON "acknowledgement_campaign" USING btree ("tenant_id","document_version_id");--> statement-breakpoint
CREATE INDEX "changeplan_tenant_idx" ON "change_plan_entry" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "commplan_tenant_idx" ON "communication_plan_entry" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "document_tenant_status_idx" ON "document" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "document_review_idx" ON "document" USING btree ("tenant_id","next_review_at");--> statement-breakpoint
CREATE INDEX "file_tenant_idx" ON "file" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "interested_party_tenant_idx" ON "interested_party" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "location_tenant_idx" ON "location" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "org_unit_tenant_parent_idx" ON "org_unit" USING btree ("tenant_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "person_tenant_idx" ON "person" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "person_skill_valid_idx" ON "person_skill" USING btree ("tenant_id","valid_until");--> statement-breakpoint
CREATE INDEX "pestle_tenant_idx" ON "pestle_factor" USING btree ("tenant_id","dimension");--> statement-breakpoint
CREATE INDEX "objective_tenant_idx" ON "security_objective" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "training_tenant_idx" ON "training" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "training_assignment_due_idx" ON "training_assignment" USING btree ("tenant_id","due_at");--> statement-breakpoint
CREATE INDEX "evidence_tenant_idx" ON "evidence" USING btree ("tenant_id","valid_until");--> statement-breakpoint
CREATE INDEX "measure_tenant_status_idx" ON "measure" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "measure_tenant_owner_idx" ON "measure" USING btree ("tenant_id","owner_person_id");--> statement-breakpoint
CREATE INDEX "measure_requirement_by_req_idx" ON "measure_requirement" USING btree ("tenant_id","requirement_id");--> statement-breakpoint
CREATE INDEX "asset_tenant_status_idx" ON "asset" USING btree ("tenant_id","status","name");--> statement-breakpoint
CREATE INDEX "asset_tenant_owner_idx" ON "asset" USING btree ("tenant_id","owner_person_id");--> statement-breakpoint
CREATE INDEX "asset_tags_gin" ON "asset" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "asset_relation_to_idx" ON "asset_relation" USING btree ("tenant_id","to_asset_id");--> statement-breakpoint
CREATE INDEX "risk_tenant_status_idx" ON "risk" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "risk_tenant_owner_idx" ON "risk" USING btree ("tenant_id","owner_person_id");--> statement-breakpoint
CREATE INDEX "risk_tenant_scores_idx" ON "risk" USING btree ("tenant_id","inherent_score","residual_score");--> statement-breakpoint
CREATE INDEX "risk_review_idx" ON "risk" USING btree ("tenant_id","next_review_at");--> statement-breakpoint
CREATE INDEX "risk_assessment_risk_idx" ON "risk_assessment" USING btree ("risk_id","assessed_at");--> statement-breakpoint
CREATE INDEX "risk_asset_asset_idx" ON "risk_asset" USING btree ("tenant_id","asset_id");--> statement-breakpoint
CREATE INDEX "risk_measure_measure_idx" ON "risk_measure" USING btree ("tenant_id","measure_id");--> statement-breakpoint
CREATE INDEX "action_tenant_status_idx" ON "action" USING btree ("tenant_id","status","due_at");--> statement-breakpoint
CREATE INDEX "action_tenant_owner_idx" ON "action" USING btree ("tenant_id","owner_person_id");--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit" USING btree ("tenant_id","status","planned_from");--> statement-breakpoint
CREATE INDEX "finding_tenant_status_idx" ON "finding" USING btree ("tenant_id","status","severity");--> statement-breakpoint
CREATE INDEX "finding_audit_idx" ON "finding" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "finding_measure_idx" ON "finding" USING btree ("tenant_id","measure_id");--> statement-breakpoint
CREATE INDEX "kpi_tenant_idx" ON "kpi" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mgmt_review_tenant_idx" ON "management_review" USING btree ("tenant_id","held_at");--> statement-breakpoint
CREATE INDEX "bc_exercise_plan_idx" ON "bc_exercise" USING btree ("plan_id","held_at");--> statement-breakpoint
CREATE INDEX "bia_tenant_idx" ON "bia" USING btree ("tenant_id","process_id");--> statement-breakpoint
CREATE INDEX "process_tenant_idx" ON "business_process" USING btree ("tenant_id","tier");--> statement-breakpoint
CREATE INDEX "continuity_plan_tenant_idx" ON "continuity_plan" USING btree ("tenant_id","next_test_at");--> statement-breakpoint
CREATE INDEX "incident_tenant_status_idx" ON "incident" USING btree ("tenant_id","status","severity");--> statement-breakpoint
CREATE INDEX "incident_detected_idx" ON "incident" USING btree ("tenant_id","detected_at");--> statement-breakpoint
CREATE INDEX "incident_asset_asset_idx" ON "incident_asset" USING btree ("tenant_id","asset_id");--> statement-breakpoint
CREATE INDEX "incident_timeline_idx" ON "incident_timeline" USING btree ("incident_id","at");--> statement-breakpoint
CREATE INDEX "playbook_tenant_idx" ON "playbook" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "reporting_obligation_open_idx" ON "reporting_obligation" USING btree ("tenant_id","due_at") WHERE fulfilled_at IS NULL;--> statement-breakpoint
CREATE INDEX "processing_tenant_idx" ON "processing_activity" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_brin" ON "audit_log" USING brin ("at");--> statement-breakpoint
CREATE INDEX "integration_tenant_idx" ON "integration" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "integration_event_idx" ON "integration_event" USING btree ("integration_id","received_at");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_idx" ON "notification" USING btree ("email_queued_at") WHERE email_sent_at IS NULL AND email_queued_at IS NOT NULL;