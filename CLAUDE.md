# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

ISMS_SaaS is a modern, KISS-focused GRC (Governance, Risk & Compliance) platform for
streamlined compliance with ISO 27001, BSI IT-Grundschutz, NIS2, and GDPR. Built for Azure.

# ISMS & Compliance SaaS Platform - System Context

## Core Philosophy & Tech Stack
- **Philosophy**: "KISS" (Keep it simple and stupid). Avoid bureaucratic overhead; focus on lean, automated, and living compliance processes.
- **Tech Stack**: Optimized for Microsoft Azure (App Service, CosmosDB/SQL). Frontend built with React and TailwindCSS.
- **Architecture**: Single Source of Truth with strong relational database modeling. Designed for future API integrations with SIEM tools (e.g., Azure Sentinel / KQL) for automated incident and risk ingestion.

## Identity, RBAC & Segregation of Duties (SoD)
- **Authentication**: Hybrid approach. Initial login via local JWT, architecturally prepared for Microsoft Entra ID (OIDC/SAML) enterprise SSO integration.
- **Authorization & Roles**: Enforce strict Role-Based Access Control (RBAC) and Functionstrennung (SoD) across all API endpoints and database operations:
  1. *Platform Admin*: Technical setup only (no compliance approval rights).
  2. *ISMS-Manager / CISO*: Full read/write access to the ISMS (cannot audit own work).
  3. *Asset-/Risk-Owner*: Scoped write access to assigned assets, risks, and treatments.
  4. *Auditor (Internal/External)*: Read-only ISMS access, write access restricted to audit findings and non-conformities.
  5. *Data Protection Officer (DSB)*: Specialized rights for GDPR/DSGVO compliance registers.

## Supported Frameworks & Multi-Mapping Logic
The platform supports dynamic activation and unified mapping across:
- ISO/IEC 27001:2022
- BSI IT-Grundschutz (and IT-Grundschutz on ISO 27001 baseline)
- NIS2 Directive
- GDPR (DSGVO)

*Important Rule for Development*: A single security measure or control (e.g., implementing MFA) must be relationally mapped to requirements across multiple active frameworks simultaneously to prevent redundant data entry.

## Repository Context & Reference Documents
When designing schemas, components, or logic, reference the files stored in:
- `docs/context/`: Contains all official directives, guidelines, and frameworks (ISO 27001, NIS2, IT-Grundschutz compendium & modules, GDPR texts, and crosswalk mapping tables).
- `docs/screenshots/`: UI/UX design references for dashboards, 5x5 risk matrices, BIA tables, and incident playbooks.

## Architecture Decisions (approved 2026-09-15)
See `docs/architecture/` for the full data model and backend architecture. Key decisions that bind all code:
- **Database**: PostgreSQL 16 (open source, no managed-service cost). Multi-tenancy is row-level (`tenant_id` on every tenant table) enforced by **Row-Level-Security**; the API runs as role `isms_app` (no `BYPASSRLS`), migrations as `isms_migrator`. Every tenant-scoped query runs inside `withTenant(db, tenantId, fn)` which issues `set_config('app.tenant_id', …, true)`.
- **Stack**: TypeScript end-to-end. NestJS modular monolith (`apps/api`), React + Vite + TailwindCSS (`apps/web`), Drizzle ORM (`packages/db`), pg-boss for jobs (no Redis). All packages compile to CommonJS.
- **Multi-framework mapping**: global catalog `framework`/`requirement`/`requirement_crosswalk` (no tenant_id, read-only for the app). Tenant data: `tenant_requirement` (SoA row: applicability + maturity 0–5) and `measure_requirement` (n:m measure ↔ requirement). The SoA is a query, never a separate table.
- **Risk matrix**: fixed 5×5, scores are generated columns (`likelihood * impact`). Maturity scale 0–5.
- **RBAC**: permissions `module.action` (+ `_own` variants for ownership-scoped writes) defined once in `packages/shared/src/permissions.ts`; system roles and SoD rules are seeded from there. Effective permissions are cached per membership and invalidated via `tenant.permissions_version`.
- **Four-eyes / SoD** is enforced in the service layer *and* by DB triggers (`assert_distinct_actor`): document approval ≠ author, risk acceptance ≠ owner, measure/action verification ≠ owner, finding ≠ owner of the measure.
- **ISO 27001 text**: only `ref_code` + short title are stored (DIN copyright). BSI, NIS2, DSGVO may carry full text.
- **Context (clause 4) & objectives (clause 6.2)**: `pestle_factor`, `interested_party` and `security_objective` are what fill the management review's 9.3.2 b), c), d.4) and e) sections — they are registers, not decoration. `security_objective.direction` (enum `target_direction`, shared with `kpi`) decides whether a lower value is better, so "6 of 4 hours" is not shown as an over-achieved target.
- **Persons**: `person` rows exist independently of `user` — ownership of assets, risks, measures and objectives must be assignable to people who never log in. Persons are deactivated (`is_active = false`), never deleted, because acknowledgements and evidence hang off them.
- **Competence (clause 7.2) & awareness (clause 7.3)**: a `competence_profile` states the required minimum level per skill; the gap to `person_skill` comes from the view `v_skill_gap` and is the training need. `person_skill.valid_until` makes expired evidence visible. Training assignments are resolved into one `training_assignment` row per person on assignment, and re-assigning never resets a completed one.
- **Business continuity (A.5.29/A.5.30)**: the BIA hangs off `business_process`, not off assets — an asset inherits its criticality from the process it carries. `bia.rto_hours <= mtpd_hours` is a DB CHECK; on top of that the service cross-checks the impact grid against the promised times (a critical impact at 8h with an RTO of 24h is an error, not a warning) and flags low-availability assets under a short RTO. Those errors block approval, which is four-eyes: never by the process owner. Any content change resets an approved BIA to draft. A plan cannot go `active` before its first exercise, and each exercise sets the next due date from the newest exercise only, so backfilling an old one never pushes the date out.
- **Privacy (GDPR)**: `processing_activity` is the Art. 30 record and is checked, not just stored. Errors block activation: missing purpose, missing categories, no legal basis (except `role = 'processor'`, Art. 30(2)), special categories carrying only an Art. 6 basis instead of Art. 9(2), a third-country transfer without Chapter V safeguards, and a required DPIA that does not exist. TOMs under Art. 32 are the ISMS `measure` rows via `processing_tom` — never a second list. A DPIA cannot be submitted while a high risk (likelihood × impact >= 15) has no mitigation (Art. 35(7)(d) / Art. 36), the Art. 35(2) opinion cannot come from the activity owner, and any content change withdraws a given opinion.
- **Evidence files**: uploads go through `StorageService` (driver `local` writes to `STORAGE_LOCAL_DIR`; the interface is deliberately three methods so an Azure Blob driver only has to fill those). Paths start with the tenant id, so tenant separation also holds in the filesystem, and keys are resolved against the root to block traversal. Content is deduplicated per tenant by SHA-256, the hash is stored so a document can later be shown unchanged, and the MIME allowlist excludes SVG and HTML because they can carry script. Downloads are always `Content-Disposition: attachment` with `nosniff` and a sandbox CSP — an uploaded file is never rendered in the app's own origin. A `file` still referenced by evidence, a document version, a certificate, an audit report or review minutes cannot be deleted.
- **Audit programme**: `audit_requirement` records which requirements an audit covered; only audits in status `reported`/`closed` count towards coverage (view `v_audit_coverage`). A nonconformity (`severity` ≠ `observation`) cannot be closed without a linked `action` (ISO 27001 clause 10.2), and its closure cannot be verified by the owner of those actions (trigger `trg_finding_verify_sod`).
- **Management review**: the clause 9.3.2 a)–g) inputs are computed from live data, never typed in. Closing a review freezes the computed snapshot into `management_review.inputs` — a closed review never changes retroactively.
- **KPIs**: `kpi.source = 'computed'` reads its value from one query per `computation_key` (catalog in `apps/api/src/modules/audit/kpis.service.ts`, keys in `packages/shared/src/enums.ts`). Manual values are rejected for computed KPIs.
- **Exports**: everything under `report.export` is generated per request — there is no second data set to maintain. CSV is written by `apps/api/src/modules/exports/csv.ts`: semicolon separator plus a BOM (German Excel), and a cell starting with `=`, `+`, `-`, `@` or a control character is prefixed with `'` so a measure title cannot execute as a formula on the auditor's machine (CSV injection). The print-ready document is plain HTML with an A4 print stylesheet — the browser's "print to PDF" replaces a headless browser and a PDF license; every tenant value goes through `escapeHtml`, the response carries `nosniff` and a `default-src 'none'` CSP, and the web client renders it in an iframe with `sandbox="allow-same-origin allow-modals"` (no `allow-scripts`) purely to call `print()`.
- **Deadlines (`/deadlines`)**: one UNION over every dated obligation in the ISMS — measures, actions, findings, document reviews, acknowledgements, evidence and competence validity, trainings, risk reviews and expiring acceptances, continuity exercises, objectives, planned audits and the NIS2/GDPR reporting deadlines (those carry `severity = 'critical'`). The endpoint has no `@RequirePermission`: each source is included only if the caller holds its read permission, and the two person-bound sources (acknowledgement, training) fall back to the caller's own rows unless they hold `document.publish` / `training.write` — a blanket guard would hide an employee's own read receipt from them.
- **Reminders & jobs**: `MailService` mirrors `StorageService` — two drivers, and the default `log` delivers nothing, so the app runs without an SMTP decision, without credentials and without cost; `MAIL_DRIVER=smtp` (nodemailer, MIT) delivers. Messages are plain text. The daily digest is built from the `/deadlines` query and grouped per owner, so nobody is mailed anything they could not already see, and people without an address or without an assigned deadline get nothing — a round-robin "47 open items" mail is read for two weeks at most. Background work runs in a separate process (`apps/api/src/worker.ts`, `pnpm --filter @isms/api worker`, gated by `JOBS_ENABLED`) on pg-boss, whose queue lives in the same PostgreSQL — no Redis, and the schedule survives a restart because it is a table, not a `setInterval`. pg-boss creates its own schema and therefore connects with `DATABASE_URL_MIGRATOR`; tenant data is still read as `isms_app` under RLS. Note pg-boss is pinned to `^11`: v12 is ESM-only and every package here compiles to CommonJS.
- **Audit log (`/audit-log`)**: `AuditLogInterceptor` writes one row per successful request that changes data, plus successful logins (A.5.16) and exports — handing a register to a supervisory authority is an event worth recording. A POST to a nested path (`/risks/:id/assessments`) is logged as `update` on the parent, so a record's history does not read as a series of creations. The table is append-only: `UPDATE`, `DELETE` and `TRUNCATE` are revoked from `isms_app` in migration 0001, so not even the ISMS lead can smooth over their own tracks, and a test asserts that with a direct connection as the app role. Deliberate limit: what is stored is the submitted request, not before/after state — field-level history lives in the modules that own it (document versions, risk assessments, frozen management reviews), and the UI says so rather than implying a full change history.
- **Framework activation**: the multi-framework promise was unreachable from the UI — the API could activate ISO 27001, IT-Grundschutz, NIS2 and GDPR, but nothing called it. `/settings` does now. Deactivating deletes nothing (applicability, justifications, maturities and measure mappings hang off the requirement, not the activation), but two states are refused because the app cannot represent them meaningfully: no active framework at all, and a tenant with no primary — the primary must be moved first. Counts shown are assessable requirements only (`control`/`anforderung`/`article`/`paragraph`), so a catalogue that carries chapter references alone reads as 0 and cannot be activated.
- **Phase 2 (not in MVP)**: supplier management module (suppliers are `asset.category = 'supplier'` for now), DSAR handling, SIEM ingestion, Entra ID SSO (provider abstraction is prepared).

## Repository Conventions
- pnpm workspace; build order is `packages/shared` → `packages/catalog` → `packages/db` → `apps/*` (`pnpm -r build` handles it).
- Schema changes: edit `packages/db/src/schema/*`, run `pnpm --filter @isms/db generate`, review the SQL; hand-written SQL (RLS, triggers, views) goes into a `drizzle-kit generate --custom` migration. Never edit applied migrations.
- Catalog changes: edit `packages/catalog/extract/extract.py` or `data/crosswalk-curated.json`; JSON files are committed and seeded idempotently.
- Tests: `pnpm -r test`. `packages/db` tests run against a real Postgres (`DATABASE_URL_TEST`) and drop/recreate the `public` schema there.
- Language: UI and domain docs in German; code identifiers, enums and commit messages in English.
