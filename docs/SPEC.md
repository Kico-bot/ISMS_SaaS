# Spec: Behebung der bestätigten Review-Befunde

Stand: 13.10.2026. Grundlage: `docs/review/99-bestaetigt.md` (Commit `7672d6f`).

## Ziel

Die in `docs/review/99-bestaetigt.md` bestätigten Befunde werden behoben:

- alle 5 Critical (K1 bis K5),
- alle 30 Important (W1 bis W30),
- die 20 Suggestions (H1 bis H20) zuletzt, soweit sie im Plan stehen.

**Fachliches Verhalten ändert sich sonst nicht.** Was eine Nutzerin heute rechtmäßig tun kann,
kann sie danach auch. Neu ist nur, dass die beschriebenen Umgehungen, Abstürze, Abflüsse und
Falschdarstellungen nicht mehr möglich sind.

Wer davon profitiert:

- **Betreiber:** Die Compose-Installation ist ohne verborgene Fallen produktiv nutzbar.
- **ISMS-Leitung und Auditoren:** Freigaben, Abschlüsse und Bestätigungen bedeuten, was sie
  behaupten, und das Vier-Augen-Prinzip hält über die API und in der Datenbank.
- **Datenschutz:** Inhalte des Verarbeitungsverzeichnisses und der DSFA erreicht nur, wer
  `privacy.read` hat.
- **Alle:** Meldefristen nach NIS2, DSGVO und AI Act erreichen eine Person, rechtzeitig und richtig
  dargestellt.

## Zielverhalten je Befund

Das ist der Vertrag für die Umsetzung. Wo das Zielverhalten bewusst von heute abweicht, steht es
hier; alles andere bleibt, wie es ist.

### Critical

| Nr. | Zielverhalten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Der Guard lädt die Mitgliedschaft mit Mandant und Status und lehnt ein Token ab, dessen `tid` nicht zum Mandanten von `mid` passt (401). `loadEnv` verweigert den Start unter `NODE_ENV=production` mit einem der im Repository stehenden Schlüssel. Compose verlangt `ISMS_JWT_SECRET` und `ISMS_APP_MASTER_KEY` (`${VAR:?…}`). JWT mit `algorithms: ['HS256']`.                                                                                                                                                     |
| K2  | Der Postausgang speichert je Nachricht den Mandanten und liefert nur die des aufrufenden Mandanten. Mails des Worker-Prozesses landen in derselben Ablage (Tabelle mit RLS), damit der Postausgang zeigt, was die Anwendung wirklich erzeugt.                                                                                                                                                                                                                                                                         |
| K3  | Meldefristen haben als Eigentümer die bearbeitende Person des Vorfalls, ohne sie alle mit `incident.write`. Die Fristenliste behält den Zeitpunkt, „überfällig“ heißt `due_at < now()`, Tagesgrenzen in `Europe/Berlin`. Sortierung nach fester Stufenreihenfolge, `critical` zuerst.                                                                                                                                                                                                                                 |
| K4  | `verified`, `accepted` und `approved` sind über Anlegen und Ändern nicht setzbar (400); sie entstehen nur über die eigenen Endpunkte mit Vier-Augen-Prüfung. Bei Risiken setzt nur der Service den Status. Datenbank: CHECK `status <> 'verified' OR verified_by_user_id IS NOT NULL` (und entsprechend). Eine Migration bereinigt vorhandene Zeilen ohne handelnde Person auf den Vorstatus. Der Demo-Seed legt keine Maßnahme mehr direkt als `verified` an, sondern lässt sie von einer zweiten Person bestätigen. |
| K5  | Den Status `reported` und `closed` setzt nur die leitende Auditorin, und nur mit der Rolle Auditor. `closed` verlangt wie `reported` einen Bericht. Ab `reported` sind Umfang, Termine, Regelwerk und Bericht gesperrt, ab `closed` alles; neue Feststellungen nehmen ein abgeschlossenes Audit nicht mehr an. `leadAuditorUserId` muss Mitglied des Mandanten sein. Zweite Linie: Trigger auf `audit` und `audit_requirement`.                                                                                       |

### Important

| Nr. | Zielverhalten                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `acceptInvite` setzt ein Kennwort nur über die Einladung, die das Konto angelegt hat. Eine Einladung an eine Adresse, deren Konto in einem anderen Mandanten noch auf Annahme wartet, wird abgelehnt (409).                                                                                                                                                                                   |
| W2  | `setRoles` auf die eigene Mitgliedschaft wird abgelehnt (400). Keine Änderung, nach der der Mandant ohne aktive ISMS-Leitung dasteht (409).                                                                                                                                                                                                                                                   |
| W3  | Der Mandant steht als Spalte an `refresh_token`; beide Maps entfallen. Erneuern nach einem Neustart behält den Mandanten.                                                                                                                                                                                                                                                                     |
| W4  | `_own` gilt im Guard nur, wo ein Endpunkt es ausdrücklich erlaubt (`@RequirePermission(P.X_WRITE, { allowOwn: true })`). Ablaufpläne, Dateilöschung und `removeResource` prüfen Eigentum bzw. das volle Recht.                                                                                                                                                                                |
| W5  | Getrennte Richtlinien auf `role` und `sod_rule`: lesen global und eigen, schreiben nur eigen.                                                                                                                                                                                                                                                                                                 |
| W6  | Alle Trigger- und Hilfsfunktionen mit `SET search_path = pg_catalog, public, pg_temp`. `isms_app` verliert `TEMPORARY`.                                                                                                                                                                                                                                                                       |
| W7  | `audit_log` verweist mit `ON DELETE RESTRICT`; `isms_app` darf `tenant` und `user` nicht löschen; ein Trigger erzwingt `at := now()`.                                                                                                                                                                                                                                                         |
| W8  | `DATABASE_URL_MIGRATOR` bekommt nur `migrate` und `worker`. Die Kennwörter der beiden Rollen sind über `ISMS_`-Variablen einstellbar.                                                                                                                                                                                                                                                         |
| W9  | Downloads mit `stream.pipeline` und Fehlerbehandlung (404 bzw. Abbruch der Antwort). Das Auditpaket öffnet Dateien nacheinander erst beim Schreiben; Fehler beenden die Antwort, ein Abbruch des Clients bricht das Archiv ab.                                                                                                                                                                |
| W10 | Die Verarbeitungs-Exporte verlangen zusätzlich `privacy.read`. Das Auditpaket nimmt `09-datenschutz` nur mit `privacy.read` auf. Das Protokoll speichert das geprüfte Schema-Ergebnis statt des Rohinhalts, rekursiv geschwärzt und auf 16 KB begrenzt; `GET /audit-log` leert `diff` für Eintragstypen, deren Leserecht fehlt. Uploads begrenzen `fields`, `fieldSize` und `parts`.          |
| W11 | Das Protokoll ordnet nach der getroffenen Route ein, nicht nach dem Rohpfad.                                                                                                                                                                                                                                                                                                                  |
| W12 | Die IP wird vor dem Handler festgehalten. `trust proxy` ist über eine Umgebungsvariable auf die Zahl der Proxys einstellbar; nginx setzt `X-Forwarded-For` auf `$remote_addr`.                                                                                                                                                                                                                |
| W13 | Je erlaubtem MIME-Typ eine Liste zulässiger Endungen und eine Prüfung der ersten Bytes für Binärformate. Unsichtbare Formatzeichen (`\p{Cf}`) werden aus Dateinamen entfernt.                                                                                                                                                                                                                 |
| W14 | `defParamCharset: 'utf8'`; Umlaute bleiben erhalten.                                                                                                                                                                                                                                                                                                                                          |
| W15 | Wer nur `_own` hat, muss auch nach der Änderung Eigentümer sein; Eigentümerwechsel und Verknüpfung auf fremde Datensätze brauchen das volle Recht. Ein Eigentümerwechsel setzt eine gegebene Freigabe zurück. Assets bekommen eine Route zum Lösen einer Verknüpfung.                                                                                                                         |
| W16 | Löschen eines Prozesses oder Assets, an dem freigegebene oder fremde Datensätze hängen, wird mit 409 abgelehnt; stattdessen `status = 'retired'`. Löschen mit `_own` nur ohne solche Verweise.                                                                                                                                                                                                |
| W17 | Jede inhaltliche Änderung an BIA, getragenem Risiko, bestätigter Maßnahme oder Verbesserung setzt die Freigabe zurück (wie heute schon `bia.upsert`). Nachweise an bestätigten Feststellungen oder Maßnahmen sind unveränderlich; Korrekturen über einen neuen Nachweis.                                                                                                                      |
| W18 | Dokumentfreigabe nur für eingereichte, noch nicht freigegebene Fassungen; Freigabezeit nur einmal schreibbar. Notfallplan aktiv nur bei freigegebener BIA und bestandener Übung; Übungen nicht in der Zukunft. `assertClosable` bei jeder Änderung, nach der eine Feststellung geschlossen und keine Beobachtung ist; Schließen und Bestätigen verlangen erledigte bzw. bestätigte Maßnahmen. |
| W19 | Fremde Schulungsteilnahmen nur mit `training.write`, fremde Lesebestätigungen nur mit `document.publish`. Bestehende Bestätigungen werden nicht überschrieben (409). Neue Spalte `confirmed_by_user_id` an beiden Tabellen. Datum nicht in der Zukunft.                                                                                                                                       |
| W20 | `action.verify` der Auditorin nur für Verbesserungen mit `findingId`. Managementbewertung und Kennzahlenwerte verlangen ein eigenes Recht der Leitung; erfasste Kennzahlenwerte werden ergänzt, nie überschrieben. `POST /evidence` erlaubt `measure.write` oder `finding.write`. Jede Mandantenrolle bekommt `incident.report`.                                                              |
| W21 | Wer nur `_own` hat, wird beim Anlegen immer selbst Eigentümer; ein leerer Eigentümer wird bei Risiko, Maßnahme, Verbesserung, Prozess und Asset ohne volles Recht abgelehnt.                                                                                                                                                                                                                  |
| W22 | Jede verknüpfte ID wird vor dem Einfügen im eigenen Mandanten nachgeschlagen (404).                                                                                                                                                                                                                                                                                                           |
| W23 | Zeitpunkte höchstens 5 Minuten in der Zukunft und nicht vor der Entdeckung. Erneutes Erfüllen wird abgelehnt (409). Ein ausdrücklicher Korrekturweg mit `incident.write` schreibt alten und neuen Zeitpunkt in die Zeitleiste.                                                                                                                                                                |
| W24 | „Unverzüglich“ wird mit dem auslösenden Zeitpunkt als Fälligkeit gespeichert und als „unverzüglich“ beschriftet; `nis2_progress` bleibt ohne Fälligkeit.                                                                                                                                                                                                                                      |
| W25 | Eine Zeile je Mandant und Tag (`digest_run`, eindeutig) macht den Lauf wiederholbar ohne Doppelversand. Der manuelle Versand geht nur an die aufrufende Person.                                                                                                                                                                                                                               |
| W26 | Jede Registerzeile öffnet den Datensatz über eine echte Schaltfläche oder einen Link, per Tastatur erreichbar.                                                                                                                                                                                                                                                                                |
| W27 | Entfernen-Schaltflächen sind per Tastatur erreichbar (`focus:opacity-100` statt `hidden`), mit `aria-label`. Löschen ganzer Teilbäume fragt nach und nennt die Zahl der Unterknoten.                                                                                                                                                                                                          |
| W28 | Ein globales `MutationCache({ onError })` als Auffangnetz; Downloads über ein gemeinsames `useDownload()` mit Fehlerzustand; in der Mitgliederverwaltung jede Nicht-Warnung mit `detail`.                                                                                                                                                                                                     |
| W29 | Ein gemeinsames Seitenfenster mit `aria-modal`, Fokus beim Öffnen, Fokusfalle, Escape und Fokusrückgabe ersetzt die 13 Kopien.                                                                                                                                                                                                                                                                |
| W30 | Die genannten Tests prüfen, was ihr Name verspricht: Das ZIP wird entpackt, Idempotenz zählt vor und nach dem Seed, die Tests mit festgeschriebenem Fehlverhalten werden mit dem jeweiligen Fix umgeschrieben.                                                                                                                                                                                |

### Suggestion

H1 bis H20 setzen die Vorschläge aus `docs/review/99-bestaetigt.md` und den Einzelberichten um. Sie
stehen im Plan als je eine Aufgabe am Ende ihres Pakets. Zwei sind fachlich zu entscheiden:

- **H13 Demodaten:** Standard `ISMS_SEED_DEMO=false`.
- **H18 Statustexte:** Welcher Begriff gilt, „Freigegeben“ oder „veröffentlicht“, ist offen.

## Nicht Ziel

- Neue Funktionen, Umbenennungen oder Umgestaltungen, die kein Befund verlangt.
- Rate Limiting, Entra ID, Azure-Deployment und Blob-Treiber (Phase 2 laut CLAUDE.md).
- Änderungen an den Katalogdaten (`packages/catalog/data`).

## Tech-Stack

- TypeScript durchgehend; alle Pakete werden zu CommonJS gebaut.
- API: NestJS mit Express, Zod-DTOs aus `packages/shared`.
- Datenbank: PostgreSQL 16 mit Drizzle ORM; die App läuft als `isms_app` unter RLS, Migrationen als
  `isms_migrator`.
- Jobs: pg-boss `^11`. Version 12 ist ESM-only, deshalb kein Upgrade.
- Archiv: archiver `^7`. Version 8 ist ESM-only, deshalb kein Upgrade.
- Oberfläche: React 18, Vite, TanStack Query, TailwindCSS.
- Tests: Vitest in API, Paketen und Oberfläche.

## Befehle

```bash
# Umgebung (Datenbank muss laufen: service postgresql start)
set -a && . ./.env && set +a

pnpm -r build                                   # Reihenfolge shared → catalog → db → apps
pnpm -r typecheck
pnpm -r test                                    # alle Tests, db und api gegen DATABASE_URL_TEST
pnpm --filter @isms/api exec vitest run test/<datei>.e2e.test.ts   # ein API-Test
pnpm --filter @isms/db test                     # Datenbanktests (RLS, Trigger)
pnpm --filter @isms/web test
pnpm --filter @isms/db generate                 # Migration aus Schemaänderung
pnpm exec drizzle-kit generate --custom         # handgeschriebene Migration (RLS, Trigger), im Paket db
pnpm format:check
```

## Projektstruktur

```
apps/api/src/kernel/      → Querschnitt: auth, tenancy, audit-log, mail, jobs, storage, http
apps/api/src/modules/     → Fachmodule (risks, measures, audit, continuity, incidents, …)
apps/api/test/            → E2E-Tests je Modul gegen die Testdatenbank (setup.ts)
apps/web/src/             → Oberfläche (pages, components, lib)
packages/shared/src/      → DTOs (dto.ts), Rechte (permissions.ts), Policy, Labels
packages/db/src/schema/   → Drizzle-Schema; packages/db/migrations/ → SQL-Migrationen
infra/docker/             → Dockerfile, nginx.conf, postgres-init.sql, Compose für die Entwicklung
docker-compose.yml        → Compose für den Server
docs/review/              → Reviews und bestätigte Befunde
tasks/                    → Plan und Aufgabenliste
```

## Code-Stil

Der Code folgt dem vorhandenen Muster: Prüfung im Service, zweite Linie in der Datenbank,
Fehlermeldungen als Problem-JSON in einfachem Deutsch ohne Gedankenstriche, Bezeichner auf
Englisch.

```ts
async update(ctx: AuthContext, id: string, dto: MeasurePatchDto) {
  const tenantId = ctx.tenantId!;
  return this.dbs.tenant(tenantId, async (tx) => {
    const existing = await this.require(tx, tenantId, id);
    assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: existing.ownerPersonId });
    // Wer nur das eigene Recht hat, bleibt auch nach der Änderung Eigentümer.
    if (dto.ownerPersonId !== undefined)
      assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: dto.ownerPersonId });
    if (existing.status === 'verified' && touchesContent(dto)) {
      throw new ConflictException({
        title: 'Die Maßnahme ist bestätigt',
        detail: 'Eine bestätigte Maßnahme wird nicht mehr geändert. Legen Sie eine neue an.',
      });
    }
    …
  });
}
```

Schemaänderungen nur über `packages/db/src/schema/*` und `generate`; RLS, Trigger und Views in
einer `--custom`-Migration. Angewendete Migrationen werden nie geändert.

## Teststrategie

- **Nachweis zuerst:** Jede Aufgabe beginnt mit einem Test, der den Fehler auf dem heutigen Stand
  nachweist und rot ist. Danach kommt der Fix, und derselbe Test wird grün. Der rote Lauf wird in
  der Commit-Nachricht oder im PR genannt.
- **API-Verhalten:** E2E-Test in `apps/api/test/<modul>.e2e.test.ts` über HTTP mit echten Rollen,
  nach dem Muster der vorhandenen Tests (`setup.ts`, `inviteAndAccept`).
- **Datenbankregeln:** RLS, Trigger, CHECK, Rechte der Rollen in `packages/db/src/db.test.ts`, als
  `isms_app` gegen `DATABASE_URL_TEST`.
- **Reine Funktionen:** Unit-Tests neben der Datei, zum Beispiel `reporting-deadlines.test.ts`,
  `csv.test.ts`, `ai.test.ts`.
- **Konfiguration:** Tests, die `docker-compose.yml`, `nginx.conf` und `postgres-init.sql` lesen
  und Eigenschaften prüfen (kein Ersatzwert, Header vorhanden, Bindung an `127.0.0.1`).
- **Oberfläche:**
  - Komponententests mit Vitest, `jsdom` und `@testing-library/react`, dazu `@testing-library/user-event`
    für Tastaturbedienung. Alle drei sind MIT-lizenziert und kostenlos.
  - Die Abhängigkeiten werden einmal in Paket 8 ergänzt (siehe Offene Fragen).
- **Bestehende Tests:** Tests, die einen Fehler festschreiben (W30), werden im selben Commit wie der
  Fix umgeschrieben, nie gelöscht oder übersprungen.

## Grenzen

- **Immer:**
  - Erst der rote Test, dann der Fix.
  - Vor jedem Commit `pnpm -r typecheck`, die betroffenen Tests und `pnpm format:check`.
  - Prüfung im Service und, wo CLAUDE.md es verlangt, in der Datenbank.
  - Texte in einfachem Deutsch ohne Gedankenstriche.
- **Erst fragen:**
  - neue Abhängigkeiten über die drei Testbibliotheken der Oberfläche hinaus
  - neue Rechte im Rechtekatalog über W20 hinaus
  - Datenmigrationen, die vorhandene Freigaben zurücksetzen (K4)
  - Änderungen am Standardverhalten von Compose (K1, W8, H13, H17)
- **Nie:**
  - Fachliches Verhalten über das Zielverhalten hinaus ändern.
  - Tests überspringen oder löschen, um grün zu werden.
  - Angewendete Migrationen ändern.
  - Geheimnisse ins Repository schreiben.
  - Den Demo-Seed in Produktion zulassen.

## Erfolgskriterien

- Für jeden Eintrag K1 bis K5 und W1 bis W30 gibt es einen Test, der auf `7672d6f` rot war und nach
  dem Fix grün ist.
- `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r build` und `pnpm format:check` laufen fehlerfrei.
- Die übrigen vorhandenen Tests laufen unverändert grün. Ausnahme sind die in W30 genannten, deren
  Erwartung bewusst umgeschrieben wird.
- `pnpm db:seed:demo` läuft weiter durch, und `test/demo-seed.e2e.test.ts` ist grün.
- `docs/review/99-bestaetigt.md` vermerkt je Eintrag den Commit, der ihn behebt.

## Offene Fragen

1. **K4 Bereinigung:** Sollen vorhandene `verified`/`accepted`/`approved` ohne handelnde Person auf
   den Vorstatus zurückgesetzt werden, oder nur markiert? Vorschlag: zurücksetzen auf
   `implemented`/`assessed`/`planned`, im Protokoll vermerkt.
2. **K5 und W20 Rechte:** `audit.write` aufteilen in Auditprogramm (Auditor und ISMS-Leitung
   planen), Abschluss (nur leitende Auditorin) und Managementbewertung (nur Leitung)? Das ändert
   den Rechtekatalog.
3. **W16 Löschen:** Ablehnen mit 409 und stattdessen stilllegen (Vorschlag), oder Löschen nur mit
   vollem Recht erlauben?
4. **Oberflächentests:** Dürfen `jsdom`, `@testing-library/react` und `@testing-library/user-event`
   als Entwicklungsabhängigkeiten in `apps/web` aufgenommen werden?
5. **H18 Begriffe:** „Freigegeben“ (Oberfläche) oder „veröffentlicht“ (Auditpaket) für
   `published`, und ein oder drei Texte für `verified`?
