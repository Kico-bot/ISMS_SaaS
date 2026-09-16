# ISMS_SaaS

Modern, KISS-focused GRC platform for streamlined compliance with ISO 27001, BSI IT-Grundschutz,
NIS2, and GDPR. Built for Azure — on open-source components only.

Der Leitgedanke ist überall derselbe: **keine Papiertiger**. Nichts wird zweimal gepflegt, jede
Kennzahl wird aus den gepflegten Daten gerechnet statt abgetippt, und eine Maßnahme zahlt
gleichzeitig auf die Anforderungen mehrerer Normen ein.

## Was die Plattform abdeckt

| Bereich               | Enthalten                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normen & Mapping      | ISO 27001:2022, BSI IT-Grundschutz, NIS2, DSGVO; eine Maßnahme bedient mehrere Anforderungen zugleich; die Anwendbarkeitserklärung ist eine Abfrage, keine zweite Liste |
| Kontext & Ziele       | PESTLE-Faktoren, interessierte Parteien, Sicherheitsziele (Kap. 4, 6.2)                                                                                                 |
| Risiken               | Asset-Inventar, 5×5-Matrix, inhärente und Restbewertung, Behandlung, Akzeptanz im Vier-Augen-Prinzip                                                                    |
| Maßnahmen & Nachweise | Maßnahmenregister mit Reifegraden, Nachweisdateien mit Gültigkeit                                                                                                       |
| Dokumentenlenkung     | Fassungen, Freigabe ≠ Autor, Lesebestätigungen, Prüffristen (Kap. 7.5)                                                                                                  |
| Kompetenz & Awareness | Kompetenzprofile, Soll-Ist-Lücke, Schulungen mit Teilnahmenachweis (Kap. 7.2, 7.3)                                                                                      |
| Vorfälle              | Meldeketten mit den Fristen nach NIS2 (24 h / 72 h / 1 Monat) und Art. 33 DSGVO                                                                                         |
| Geschäftsfortführung  | BIA am Geschäftsprozess, Notfallpläne, Übungen (A.5.29, A.5.30)                                                                                                         |
| Datenschutz           | Verarbeitungsverzeichnis nach Art. 30 mit inhaltlicher Prüfung, TOM als ISMS-Maßnahmen, DSFA nach Art. 35                                                               |
| Audit & KVP           | Auditprogramm mit Abdeckung, Feststellungen, Korrekturmaßnahmen, Kennzahlen, Managementbewertung                                                                        |
| Wiedervorlage         | jede datierte Verpflichtung an einer Stelle, plus tägliche Erinnerung per E-Mail                                                                                        |
| Ausleitungen          | SoA und Verarbeitungsverzeichnis als CSV und als druckfertiges Dokument                                                                                                 |
| Protokollierung       | append-only Änderungsprotokoll samt Anmeldungen und Ausleitungen                                                                                                        |

## Architektur

- [`docs/architecture/01-datenmodell.md`](docs/architecture/01-datenmodell.md) — Datenmodell, Multi-Framework-Mapping, RBAC/SoD, RLS
- [`docs/architecture/02-backend-architektur.md`](docs/architecture/02-backend-architektur.md) — Systemkontext, Module, Pipeline, Jobs, Deployment
- [`CLAUDE.md`](CLAUDE.md) — die Entscheidungen, an die sich der Code hält, mit Begründung

Drei davon prägen alles Weitere:

- **Mandantentrennung in der Datenbank.** Jede Mandantentabelle trägt `tenant_id`, durchgesetzt
  per Row-Level-Security. Die API läuft als Rolle `isms_app` ohne `BYPASSRLS`; eine vergessene
  `WHERE`-Bedingung im Fachcode kann keine fremden Daten sichtbar machen.
- **Funktionstrennung doppelt.** Vier-Augen-Regeln stehen im Service _und_ als Datenbank-Trigger:
  Freigabe ≠ Autor, Risikoakzeptanz ≠ Owner, Verifizierung ≠ Verantwortliche:r.
- **Nur Open Source.** PostgreSQL statt verwaltetem Dienst, pg-boss statt Redis, gedrucktes HTML
  statt PDF-Lizenz, ein eigener SMTP-Treiber statt gebuchter Zustellplattform.

## Schnellstart (lokal)

Voraussetzungen: Node ≥ 22, pnpm ≥ 10, Docker (oder eine lokale PostgreSQL 16 mit den Rollen aus
`infra/docker/postgres-init.sql`).

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d     # Postgres + Mailpit
pnpm install
pnpm -r build                                                # packages zuerst (shared, catalog, db)
pnpm db:migrate                                              # Schema + RLS + Trigger
pnpm db:seed                                                 # Permissions, Rollen, Framework-Kataloge
pnpm dev                                                     # API (http://localhost:3000/api) + Web (http://localhost:5173)
```

Auf der Anmeldeseite legt „Organisation registrieren“ einen Mandanten samt erster ISMS-Managerin
an. `pnpm db:reset` verwirft das Schema und spielt Migrationen + Seeds neu ein (nur außerhalb von
Produktion).

### Demodaten

```bash
pnpm db:seed:demo
```

Legt den erfundenen Mandanten **Nordlicht Energiewerke GmbH** an — einen regionalen
Energieversorger, weil darin alle vier Regelwerke zugleich greifen: NIS2 für den Netzbetrieb,
DSGVO für Kunden- und Beschäftigtendaten, ISO 27001 als Managementsystem und der IT-Grundschutz
als Baukasten. Sämtliche Personen und Vorgänge sind frei erfunden.

Anmeldung mit dem Kennwort `demo-passwort-2026-nordlicht`:

| Konto                               | Rolle                                      |
| ----------------------------------- | ------------------------------------------ |
| `henrike.sallach@nordlicht.example` | ISMS-Leitung (CISO)                        |
| `jorin.kessler@nordlicht.example`   | Stellvertretung ISMS — gibt Dokumente frei |
| `bastian.olwig@nordlicht.example`   | Asset-/Risk-Owner                          |
| `corinna.feldt@nordlicht.example`   | Interne Auditorin                          |
| `ilka.norgaard@nordlicht.example`   | Datenschutzbeauftragte                     |

Die Daten entstehen über dieselben Dienste wie im Betrieb, nicht per `INSERT`: Referenznummern,
Vier-Augen-Prinzip, inhaltliche Prüfungen und Zeilensicherheit gelten genauso. Was der Seed
anlegt, kann die Anwendung also auch anzeigen und bearbeiten. Ein zweiter Lauf tut nichts —
für einen frischen Stand `pnpm db:reset && pnpm db:seed && pnpm db:seed:demo`.

Das Skript weigert sich mit `NODE_ENV=production`: es legt Konten mit einem veröffentlichten
Kennwort an.

### Erinnerungen und Hintergrundaufträge

Die tägliche Wiedervorlage je verantwortlicher Person verschickt ein eigener Prozess:

```bash
JOBS_ENABLED=true pnpm --filter @isms/api worker
```

Er braucht `DATABASE_URL_MIGRATOR`, weil pg-boss sein eigenes Schema anlegt; Fachdaten liest er
weiterhin als `isms_app` unter der Zeilensicherheit. Ohne `JOBS_ENABLED` beendet er sich sofort.

Der Mailversand hat zwei Treiber. Standard ist `MAIL_DRIVER=log`: es wird **nichts zugestellt**,
jede Nachricht landet im Protokoll und im Postausgang der Anwendung (sichtbar unter
„Wiedervorlage → Erinnerungen per E-Mail“). Das genügt, um die Anwendung ohne SMTP-Entscheidung
zu betreiben. `MAIL_DRIVER=smtp` stellt zu — lokal gegen Mailpit (`http://localhost:8025`), sonst
gegen den Mailserver der Organisation.

## Struktur

```
apps/api        NestJS-API (modularer Monolith) + Job-Worker (src/worker.ts)
apps/web        React + Vite + TailwindCSS
packages/shared Enums, Permission-Katalog, Rollenmatrix, SoD-Regeln, Zod-DTOs, Policy-Helper
packages/db     Drizzle-Schema, SQL-Migrationen (RLS, Trigger, Views), Seeds
packages/catalog Framework-Kataloge als JSON (aus docs/context extrahiert)
infra/          Docker-Compose (dev), Azure-Deployment
docs/           Architektur, Referenzdokumente (context), UI-Referenzen (screenshots)
```

## Tests und Prüfungen

```bash
pnpm -r test          # Unit-Tests (shared) + Integrationstests gegen Postgres (DATABASE_URL_TEST)
pnpm -r typecheck
pnpm format:check     # läuft auch in der CI, damit die Formatierung nicht verrutscht
```

Die API-Tests fahren die echte Anwendung gegen eine echte PostgreSQL hoch — inklusive RLS,
Trigger und Berechtigungen. Was dort grün ist, ist nicht wegkonfiguriert.
