# Technische Dokumentation

Für Entwicklung und Betrieb. Was die Anwendung fachlich kann, steht im
[README](../README.md); wie man sie in Betrieb nimmt, sichert und aktualisiert, in
[`deployment.md`](deployment.md).

---

## Grundsätze

Vier Entscheidungen prägen alles Weitere:

- **Mandantentrennung in der Datenbank.** Jede Mandantentabelle trägt `tenant_id`, durchgesetzt
  per Row-Level-Security. Die API läuft als Rolle `isms_app` ohne `BYPASSRLS`; eine vergessene
  `WHERE`-Bedingung im Fachcode kann keine fremden Daten sichtbar machen.
- **Funktionstrennung doppelt.** Vier-Augen-Regeln stehen im Service _und_ als Datenbank-Trigger:
  Freigabe ≠ Autor, Risikoakzeptanz ≠ Owner, Verifizierung ≠ Verantwortliche:r.
- **Nur Open Source.** PostgreSQL statt verwaltetem Dienst, pg-boss statt Redis, gedrucktes HTML
  statt PDF-Lizenz, ein eigener SMTP-Treiber statt gebuchter Zustellplattform.
- **Was zählt, steht an einer Stelle.** Welche Katalog-Anforderungen für einen Mandanten gelten,
  entscheidet die SQL-Funktion `requirement_in_scope()`: IT-Grundschutz nur in modellierten
  Bausteinen, NIS2 und DSGVO nur mit Pflichten des Unternehmens (nicht der Mitgliedstaaten), der
  AI Act nur mit Betreiberpflichten, die ein KI-System im Register auslöst.

Ausführlich, mit Begründung jeder einzelnen Entscheidung:

- [`architecture/01-datenmodell.md`](architecture/01-datenmodell.md) — Datenmodell,
  Multi-Framework-Mapping, Rollen und Funktionstrennung, Zeilensicherheit
- [`architecture/02-backend-architektur.md`](architecture/02-backend-architektur.md) —
  Systemkontext, Module, Pipeline, Hintergrundaufträge
- [`../CLAUDE.md`](../CLAUDE.md) — die verbindlichen Entscheidungen, an die sich der Code hält
- [`offene-punkte.md`](offene-punkte.md) — Prüfaufträge und bekannte Lücken, u. a. der noch offene
  Abgleich NIS2 Art. 21 Abs. 2 ↔ § 30 Abs. 2 BSIG

---

## Technik im Überblick

| Schicht      | Werkzeug                                                    |
| ------------ | ----------------------------------------------------------- |
| Oberfläche   | React 18, Vite, TailwindCSS, TanStack Query, Recharts       |
| API          | NestJS (modularer Monolith), Zod für Eingabeprüfung         |
| Datenbank    | PostgreSQL 16 mit Row-Level-Security, Drizzle ORM           |
| Hintergrund  | pg-boss — die Warteschlange liegt in derselben Datenbank    |
| Auslieferung | Docker Compose: postgres, migrate, api, worker, web (nginx) |
| Sprache      | TypeScript durchgehend, alle Pakete kompilieren zu CommonJS |

## Aufbau des Repositorys

```
apps/api          NestJS-API und Hintergrundprozess (src/worker.ts)
apps/web          Oberfläche
packages/shared   Enums, Berechtigungen, Rollen, SoD-Regeln, Zod-DTOs, Beschriftungen
packages/db       Drizzle-Schema, SQL-Migrationen (RLS, Trigger, Sichten), Seeds
packages/catalog  Regelwerkskataloge als JSON (aus docs/context extrahiert; AI Act von Hand gepflegt)
infra/docker      Dockerfile, nginx-Konfiguration, Entwicklungs-Compose
docs/             Architektur, Deployment, diese Datei, Produkt-Screenshots
```

Bau-Reihenfolge: `packages/shared` → `packages/catalog` → `packages/db` → `apps/*`.
`pnpm -r build` erledigt das in der richtigen Reihenfolge.

---

## Entwicklungsumgebung

Mit laufendem Neuaufbau bei jeder Änderung. Voraussetzungen: Node ≥ 22, pnpm ≥ 10 und Docker
(oder eine lokale PostgreSQL 16 mit den Rollen aus `infra/docker/postgres-init.sql`).

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d     # nur PostgreSQL + Mailpit
pnpm install
pnpm -r build                                                # Pakete zuerst
pnpm db:migrate                                              # Schema, RLS, Trigger
pnpm db:seed                                                 # Berechtigungen, Rollen, Kataloge
pnpm db:seed:demo                                            # optional: Demomandant
pnpm dev                                                     # API :3000 + Oberfläche :5173
```

`pnpm db:reset` verwirft das Schema und spielt Migrationen und Seeds neu ein (nur außerhalb
von Produktion).

### Schemaänderungen

`packages/db/src/schema/*` bearbeiten, dann `pnpm --filter @isms/db generate` und das erzeugte
SQL lesen. Handgeschriebenes SQL (RLS, Trigger, Sichten) kommt in eine
`drizzle-kit generate --custom`-Migration. Angewandte Migrationen werden nie geändert.

### Kataloge

Die Kataloge entstehen aus den PDFs in `docs/context/`:

```bash
pip install pypdf
python3 packages/catalog/extract/extract.py   # ISO, BSI, NIS2, DSGVO, Crosswalk ISO → BSI
pnpm db:seed                                  # idempotent, auch auf bestehenden Datenbanken
```

Von Hand gepflegt und vom Extraktor nicht überschrieben: `crosswalk-curated.json` (ISO ↔ NIS2 ↔ DSGVO,
NIS2 → Grundschutz-Bausteine, AI Act → ISO/NIS2/DSGVO/BSI) und `eu-ai-act-2024.json` (nur
Betreiberpflichten). Einzelheiten in [`../packages/catalog/README.md`](../packages/catalog/README.md).

### Normbezüge in der Oberfläche

Die Kurzhilfen (Fragezeichen am Feld) werden aus `packages/catalog/data` erzeugt:

```bash
pnpm --filter @isms/web norm-refs
```

Nur Referenz und Kurztitel, kein Normtext — der ISO-27001-Text steht aus urheberrechtlichen
Gründen nirgends in der Anwendung.

---

## Demodaten

`pnpm db:seed:demo` legt den erfundenen Mandanten **Nordlicht Energiewerke GmbH** an. Die
Daten entstehen über dieselben Dienste wie im Betrieb, nicht per `INSERT`: Referenznummern,
Vier-Augen-Prinzip, inhaltliche Prüfungen und Zeilensicherheit gelten genauso. Deshalb ist der
Seed zugleich ein modulübergreifender Integrationstest (`apps/api/test/demo-seed.e2e.test.ts`).

- Ein zweiter Lauf tut nichts. Frischer Stand: `pnpm db:reset && pnpm db:seed && pnpm db:seed:demo`.
- Mit `NODE_ENV=production` verweigert das Skript den Dienst — alle Konten teilen ein
  veröffentlichtes Kennwort.
- Keine Inhalte aus fremden Produkten: erfundene Personen auf `.example`-Adressen, keine
  Herstellernamen.
- Inhalt: alle fünf Regelwerke aktiv; IT-Grundschutz mit 27 modellierten Bausteinen (Leittechnik und
  Notfallmanagement mit erhöhtem Schutzbedarf); NIS2-Pflichten mit direkten, indirekten und offenen
  Zuordnungen fürs Cockpit; vier KI-Systeme im Register, eines davon bewusst noch blockiert.

## Hintergrundaufträge und E-Mail

Die tägliche Wiedervorlage je verantwortlicher Person verschickt ein eigener Prozess:

```bash
JOBS_ENABLED=true pnpm --filter @isms/api worker
```

Er braucht `DATABASE_URL_MIGRATOR`, weil pg-boss sein eigenes Schema anlegt; Fachdaten liest er
weiterhin als `isms_app` unter der Zeilensicherheit. Ohne `JOBS_ENABLED` beendet er sich sofort.

Der Mailversand hat zwei Treiber. Standard ist `MAIL_DRIVER=log`: es wird **nichts
zugestellt**, jede Nachricht landet im Protokoll und im Postausgang der Anwendung.
`MAIL_DRIVER=smtp` stellt zu — lokal gegen Mailpit (`http://localhost:8025`), sonst gegen den
Mailserver der Organisation.

## Auditpaket

`GET /api/v1/exports/audit-package.zip` liefert den gesamten Datenbestand eines Mandanten:

- jedes Register als CSV — Semikolon, UTF-8 mit BOM, damit deutsches Excel es direkt öffnet;
  Zellen, die mit `=`, `+`, `-` oder `@` beginnen, werden entschärft (CSV-Injection)
- Anwendbarkeitserklärung und Verarbeitungsverzeichnis zusätzlich als druckfertiges HTML
- alle Nachweisdateien im Original unter `15-dateien/`, mit SHA-256 und Bezug je Datei
- ein `LIESMICH.html` mit Inhalt, Stand und dem, was bewusst fehlt

Das Paket wird bei jedem Abruf neu erzeugt und im Datenstrom ausgeliefert.

---

## Tests und Prüfungen

```bash
pnpm -r test          # Unit-Tests + Integrationstests gegen echtes PostgreSQL (DATABASE_URL_TEST)
pnpm -r typecheck
pnpm format:check
```

Die API-Tests fahren die echte Anwendung gegen eine echte PostgreSQL hoch — mit
Zeilensicherheit, Triggern und Berechtigungen. Was dort grün ist, ist nicht wegkonfiguriert.

Die CI (`.github/workflows/ci.yml`) läuft bei jedem Pull Request und jedem Push auf `main`:
Installation, Bau, Typprüfung, Lint, Formatprüfung, Tests.

## Produkt-Screenshots

Die Bilder in [`produkt-screenshots/`](produkt-screenshots/) werden per Skript aufgenommen,
nicht von Hand — sonst veralten sie still:

```bash
pnpm --filter @isms/web screenshots
```

Voraussetzung: laufende API auf :3000 und Oberfläche auf :5173 mit Demodaten.
