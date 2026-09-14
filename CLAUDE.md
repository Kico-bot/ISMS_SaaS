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
