# Technische Dokumentation

Für Entwicklung und Betrieb. Was die Anwendung fachlich kann, steht im
[README](../README.md); wie man sie in Betrieb nimmt, sichert und aktualisiert, in
[`deployment.md`](deployment.md).

---

## Grundsätze

Fünf Entscheidungen prägen alles Weitere:

- **ISO 27001 ist die Hauptnorm.** Die Suite ist entlang ISO 27001:2022 gebaut: jeder der 123
  prüfbaren Normpunkte hat einen Platz, und das Programm ISO 27001 misst die Zertifizierungsreife daran.
  NIS2, DSGVO, IT-Grundschutz und EU AI Act docken an dieselben Maßnahmen, Risiken und Nachweise
  an (`measure_requirement`, Zuordnung n:m), statt eigene Listen zu führen.
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

- [`architecture/01-datenmodell.md`](architecture/01-datenmodell.md): Datenmodell,
  Multi-Framework-Mapping, Rollen und Funktionstrennung, Zeilensicherheit
- [`architecture/02-backend-architektur.md`](architecture/02-backend-architektur.md):
  Systemkontext, Module, Pipeline, Hintergrundaufträge
- [`../CLAUDE.md`](../CLAUDE.md): die verbindlichen Entscheidungen, an die sich der Code hält
- [`offene-punkte.md`](offene-punkte.md): Prüfaufträge und bekannte Lücken, u. a. der noch offene
  Abgleich NIS2 Art. 21 Abs. 2 ↔ § 30 Abs. 2 BSIG

---

## Technik im Überblick

| Schicht      | Werkzeug                                                    |
| ------------ | ----------------------------------------------------------- |
| Oberfläche   | React 18, Vite, TailwindCSS, TanStack Query, Recharts       |
| API          | NestJS (modularer Monolith), Zod für Eingabeprüfung         |
| Datenbank    | PostgreSQL 16 mit Row-Level-Security, Drizzle ORM           |
| Hintergrund  | pg-boss; die Warteschlange liegt in derselben Datenbank     |
| Auslieferung | Docker Compose: postgres, migrate, api, worker, web (nginx) |
| Sprache      | TypeScript durchgehend, alle Pakete kompilieren zu CommonJS |

## Aufbau des Repositorys

```
apps/api          NestJS-API und Hintergrundprozess (src/worker.ts)
apps/web          Oberfläche
packages/shared   Enums, Berechtigungen, Rollen, SoD-Regeln, Zod-DTOs, Beschriftungen
packages/db       Drizzle-Schema, SQL-Migrationen (RLS, Trigger, Sichten), Seeds
packages/catalog  Regelwerkskataloge als JSON, eingecheckt (aus den Normtexten extrahiert; AI Act von Hand gepflegt)
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

Die Kataloge liegen fertig als JSON in `packages/catalog/data` und werden mit `pnpm db:seed`
eingespielt. Für den normalen Betrieb und die Entwicklung braucht es nichts weiter.

Neu erzeugt werden sie nur, wenn sich ein Regelwerk ändert. Dafür braucht der Extraktor die
Normtexte als PDF unter `docs/context/`. Diese liegen aus urheberrechtlichen Gründen **nicht** im
Repository; wer neu extrahiert, legt sie dort lokal ab (der Ordner ist in `.gitignore`):

```bash
pip install pypdf
python3 packages/catalog/extract/extract.py   # ISO, BSI, NIS2, DSGVO, Crosswalk ISO → BSI
pnpm db:seed                                  # idempotent, auch auf bestehenden Datenbanken
```

Von Hand gepflegt und vom Extraktor nicht überschrieben: `crosswalk-curated.json` (ISO ↔ NIS2 ↔ DSGVO,
NIS2 → Grundschutz-Bausteine, AI Act → ISO/NIS2/DSGVO/BSI) und `eu-ai-act-2024.json` (nur
Betreiberpflichten). Einzelheiten in [`../packages/catalog/README.md`](../packages/catalog/README.md).

### Normbezüge in der Oberfläche

Die Kurzhilfen (das i am Feld) werden aus `packages/catalog/data` erzeugt:

```bash
pnpm --filter @isms/web norm-refs
```

Nur Referenz und Kurztitel, kein Normtext. Der ISO-27001-Text steht aus urheberrechtlichen
Gründen nirgends in der Anwendung.

---

## Demodaten

`pnpm db:seed:demo` legt den erfundenen Mandanten **Stadtwerke Lindenbach GmbH** an. Die
Daten entstehen über dieselben Dienste wie im Betrieb, nicht per `INSERT`: Referenznummern,
Vier-Augen-Prinzip, inhaltliche Prüfungen und Zeilensicherheit gelten genauso. Deshalb ist der
Seed zugleich ein modulübergreifender Integrationstest (`apps/api/test/demo-seed.e2e.test.ts`).

- Ein zweiter Lauf tut nichts. Frischer Stand: `pnpm db:reset && pnpm db:seed && pnpm db:seed:demo`.
- Mit `NODE_ENV=production` verweigert das Skript den Dienst, weil alle Konten teilen ein
  veröffentlichtes Kennwort.
- Keine Inhalte aus fremden Produkten: erfundene Personen auf `.example`-Adressen, keine
  Herstellernamen.
- Inhalt: ISO 27001 (führend), NIS2 und EU AI Act aktiv. DSGVO und IT-Grundschutz entstehen mit
  allen Daten (Modellierung, Zuordnungen, Verarbeitungsverzeichnis) und werden am Ende
  abgeschaltet; unter Einstellungen zugeschaltet, ist alles wieder da. Jede der 13 NIS2-Pflichten
  hat eine Maßnahme, die zugleich ISO 27001 bedient; drei Zustände sind für die Vorführung
  vorbereitet (siehe [Demo-Leitfaden](demo-leitfaden.md)). Ein unbekanntes Normkürzel in den
  Zuordnungen bricht den Seed ab, statt still zu fehlen. Vier KI-Systeme im Register, eines davon
  bewusst noch blockiert.
- Der Stand ist stimmig wie in einem ISMS im ersten Jahr: Die Gap-Analyse ist abgeschlossen
  (alle 123 Normpunkte haben eine Maßnahme oder einen begründeten Ausschluss, nur Controls aus
  Anhang A sind ausgeschlossen), die Umsetzung läuft, ein erstes internes Teilaudit über bereits
  umgesetzte Bereiche ist berichtet, die erste Managementbewertung ist angesetzt. Der Demo-Test
  prüft, dass kein Normpunkt offen und kein Kapitel 4 bis 10 ausgeschlossen ist.

## Programme und Zertifizierungsreife

Das Lagebild (Startseite) besteht aus Zahlen, nicht aus Listen: drei Programmkarten (ISO 27001
mit dem Umsetzungsgrad als Kreisdiagramm aus `GET /dashboard/certification-readiness`), acht
Kennzahlen unter „Lage in Zahlen“, jede ein Link auf die Seite mit den Einträgen, und die offenen
Aufgaben als zugeklappte Liste. Die Einträge selbst stehen erst auf der Seite dahinter.
`GET /programmes`
(`apps/api/src/modules/programmes/programmes.service.ts`) leitet für jedes Stand, Schritte und
nächsten Schritt aus vorhandenen Daten ab: ISO 27001 aus der Zertifizierungsreife und den
entschiedenen Controls, NIS2 und AI Act aus dem Cockpit und dem KI-Register. Niemand setzt eine
Phase von Hand, und jeder Schritt verlinkt die Ansicht, aus der er stammt. Eine laufende
NIS2-Meldefrist steht als `urgent` vor jedem Ausbauschritt. Ein abgeschaltetes Regelwerk erscheint
als „nicht aktiviert“; seinen Reiter unter „Normen“ (etwa DSGVO mit dem
Verarbeitungsverzeichnis) blendet die Navigation aus, in den Einstellungen bleibt es aktivierbar.

**Navigation** (`NAV` in `apps/web/src/components/Layout.tsx`): elf Menüpunkte in den Gruppen
Planen, Betreiben, Prüfen & verbessern, dazu Start, Normen und Einstellungen. Was zusammengehört,
ist ein Menüpunkt mit einer Reiterleiste über der Seite (etwa Risikoregister und Maßnahmen); jedes
Register behält dabei seine eigene Seite und Adresse. Zwei Seiten sind ganz zusammengelegt:
Organisation & Kontext (Geltungsbereich, Umfeld, Ziele, Organigramm, Kommunikation, Änderungen)
und Personen & Schulung (Beschäftigte, Qualifikationsmatrix, Profile, Schulungen). Reiter stehen
in der Adresse (`?tab=`), `/planning` und `/persons` leiten auf ihren neuen Platz um.

Die **Gap-Analyse** (`/programme/iso27001/gap`) ist eine Oberfläche auf der vorhandenen
Anwendbarkeitserklärung (`GET /soa`, `PATCH /soa/:id`, Maßnahmen und ihre Zuordnung): Kapitel
für Kapitel, je Normpunkt die drei Fragen „Gilt das für uns?“, „Womit erfüllen wir es?“ und „Wie
weit sind wir?“. Entschieden ist ein Punkt, wenn eine Maßnahme zugeordnet oder er begründet
ausgeschlossen ist; Kapitel 4 bis 10 lassen sich nicht ausschließen, das lehnt auch `PATCH /soa`
ab. Hat ein Normpunkt ein eigenes Register, nennt die Gap-Analyse es mit Link
(`apps/web/src/lib/iso-places.ts`, dieselbe Zuordnung wie in `docs/iso27001-abdeckung.md`).
**Offene Aufgaben**
(`GET /programmes/tasks`) sind Abfragen mit Anzahl und Ziel, etwa Controls ohne Entscheidung,
hohe Risiken ohne Behandlung oder Assets ohne Verantwortliche. Eine Aufgabe von Hand anzulegen
ist bewusst nicht vorgesehen: Sie veraltet, sobald sich die Daten ändern.

**Mein Bereich** (`/my`, `GET /programmes/my-area`) zeigt der angemeldeten Person, was ihr gehört:
offene Maßnahmen, Risiken und Assets. Verantwortung hängt an `person`, nicht am Konto. Im
Asset-Inventar steht, wie viele Assets eine verantwortliche Person haben; die Zuweisung geht
direkt in der Zeile, und „+ Risiko“ öffnet die Risikoerfassung für genau dieses Asset, mit
Vorschlägen je Asset-Art (`apps/web/src/lib/risk-suggestions.ts`) und dem Verantwortlichen des
Assets als Risk-Owner.

**Erste Schritte** (`GET /programmes/onboarding`): Für einen neuen Mandanten zeigt das Lagebild
fünf Schritte (Geltungsbereich, Team einladen, Assets, erste Risikobewertung, Gap-Analyse
beginnen), abgeleitet aus den Daten wie alles andere. Sind alle erledigt, verschwindet die
Karte; „Später“ blendet sie nur im eigenen Browser aus.

Die Zertifizierungsreife selbst steht auf der Programmseite ISO 27001:

`GET /api/v1/dashboard/certification-readiness` beantwortet die Frage, wie weit eine
Organisation für die Zertifizierung nach ISO 27001 ist. Gezählt werden die 123 prüfbaren
Normpunkte (Kapitel 4 bis 10 und Anhang A), mit derselben Regel wie im IT-Grundschutz-Check
(`requirement_check_status`):

| Stand eines Normpunkts                         | zählt |
| ---------------------------------------------- | ----- |
| umgesetzte Maßnahme deckt ihn voll ab          | voll  |
| begründet als nicht anwendbar erklärt          | voll  |
| umgesetzte Maßnahme deckt ihn nur teilweise ab | halb  |
| sonst                                          | nicht |

Daneben stehen zehn Kernnachweise, nach denen ein Auditor zuerst fragt: Geltungsbereich,
interessierte Parteien, freigegebene Leitlinie, Sicherheitsziele, behandelte Risiken, eine
Entscheidung zu jedem Control aus Anhang A, Schulung, internes Audit und Managementbewertung in
den letzten zwölf Monaten und keine offene Hauptabweichung. Sie fließen bewusst nicht in die
Prozentzahl ein: Ein fehlendes internes Audit verhindert die Zertifizierung allein und lässt sich
nicht mit vielen umgesetzten Controls aufwiegen. Jeder Kernnachweis führt per Klick dorthin, wo er
entsteht.

**Chancen** (Risikoregister, Art „Chance“, Kap. 6.1.1) stehen im Register, zählen aber weder in
der Risikomatrix noch in den Risikokennzahlen, der Zertifizierungsreife oder Punkt f) der
Managementbewertung: Eine hoch bewertete Chance ist kein unbehandeltes hohes Risiko.

## Hintergrundaufträge und E-Mail

Die tägliche Fristenmail je verantwortlicher Person verschickt ein eigener Prozess:

```bash
JOBS_ENABLED=true pnpm --filter @isms/api worker
```

Er braucht `DATABASE_URL_MIGRATOR`, weil pg-boss sein eigenes Schema anlegt; Fachdaten liest er
weiterhin als `isms_app` unter der Zeilensicherheit. Ohne `JOBS_ENABLED` beendet er sich sofort.

Der Mailversand hat zwei Treiber. Standard ist `MAIL_DRIVER=log`: es wird **nichts
zugestellt**, jede Nachricht landet im Protokoll und im Postausgang der Anwendung.
`MAIL_DRIVER=smtp` stellt zu: lokal gegen Mailpit (`http://localhost:8025`), sonst gegen den
Mailserver der Organisation.

## Auditpaket

`GET /api/v1/exports/audit-package.zip` liefert den gesamten Datenbestand eines Mandanten:

- jedes Register als CSV: Semikolon, UTF-8 mit BOM, damit deutsches Excel es direkt öffnet;
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

Die API-Tests fahren die echte Anwendung gegen eine echte PostgreSQL hoch, mit
Zeilensicherheit, Triggern und Berechtigungen. Was dort grün ist, ist nicht wegkonfiguriert.

Die CI (`.github/workflows/ci.yml`) läuft bei jedem Pull Request und jedem Push auf `main`:
Installation, Bau, Typprüfung, Lint, Formatprüfung, Tests.

## Produkt-Screenshots

Die Bilder in [`produkt-screenshots/`](produkt-screenshots/) werden per Skript aufgenommen,
nicht von Hand, sonst veralten sie still:

```bash
pnpm --filter @isms/web screenshots
```

Voraussetzung: laufende API auf :3000 und Oberfläche auf :5173 mit Demodaten.
