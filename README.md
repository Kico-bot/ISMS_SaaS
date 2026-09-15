# ISMS_SaaS

Modern, KISS-focused GRC platform for streamlined compliance with ISO 27001, BSI IT-Grundschutz, NIS2, and GDPR. Built for Azure — on open-source components only.

## Architektur

- [`docs/architecture/01-datenmodell.md`](docs/architecture/01-datenmodell.md) — Datenmodell, Multi-Framework-Mapping, RBAC/SoD, RLS
- [`docs/architecture/02-backend-architektur.md`](docs/architecture/02-backend-architektur.md) — Systemkontext, Module, Pipeline, Jobs, Deployment

## Schnellstart (lokal)

Voraussetzungen: Node ≥ 22, pnpm ≥ 10, Docker (oder eine lokale PostgreSQL 16 mit den Rollen aus `infra/docker/postgres-init.sql`).

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d     # Postgres, Mailpit, MinIO
pnpm install
pnpm -r build                                                # packages zuerst (shared, catalog, db)
pnpm db:migrate                                              # Schema + RLS + Trigger
pnpm db:seed                                                 # Permissions, Rollen, Framework-Kataloge
pnpm dev                                                     # API (http://localhost:3000/api) + Web (http://localhost:5173)
```

`pnpm db:reset` verwirft das Schema und spielt Migrationen + Seeds neu ein (nur außerhalb von Produktion).

## Struktur

```
apps/api        NestJS-API (modularer Monolith) + Job-Worker
apps/web        React + Vite + TailwindCSS
packages/shared Enums, Permission-Katalog, Rollenmatrix, SoD-Regeln, Zod-DTOs, Policy-Helper
packages/db     Drizzle-Schema, SQL-Migrationen (RLS, Trigger, Views), Seeds
packages/catalog Framework-Kataloge als JSON (aus docs/context extrahiert)
infra/          Docker-Compose (dev), Azure-Deployment
docs/           Architektur, Referenzdokumente (context), UI-Referenzen (screenshots)
```

## Tests

```bash
pnpm -r test          # Unit-Tests (shared) + Integrationstests gegen Postgres (db: DATABASE_URL_TEST)
```
