# Umsetzungsplan: Behebung der bestätigten Review-Befunde

Grundlage: `docs/SPEC.md` und `docs/review/99-bestaetigt.md`. Erstellt nach
`.claude/skills/planning-and-task-breakdown/SKILL.md`. Die abhakbare Liste steht in
`tasks/todo.md`.

## Überblick

- **Umfang:** 55 bestätigte Einträge (5 Critical, 30 Important, 20 Suggestion) in 50 Aufgaben und
  8 Paketen.
- **Paket 1:** alle Critical.
- **Pakete 2 bis 8 nach Bereich:** Auth, Datenbank, Dateien und Exporte, Vier-Augen, Fristen,
  Fachmodule, Oberfläche.
- **Reihenfolge innerhalb eines Pakets:** erst Important, dann Suggestion.
- **Nachweis zuerst:** Jede Aufgabe beginnt mit einem Test, der den Fehler auf dem heutigen Stand
  nachweist (rot), dann folgt der Fix (grün).

## Architekturentscheidungen

- **Prüfung im Service, zweite Linie in der Datenbank.** Wie CLAUDE.md es für das Vier-Augen-Prinzip
  verlangt. Datenbankregeln (CHECK, Trigger, Richtlinien) kommen als `--custom`-Migration, angewendete
  Migrationen bleiben unberührt.
- **`_own` nur ausdrücklich.** W4 stellt den Guard so um, dass `_own` nur an Endpunkten mit
  `allowOwn` gilt. Davon hängen W15, W16 und W21 ab, deshalb kommt W4 früh (Paket 2).
- **Eine Hilfsfunktion für „Freigabe zurücksetzen“.** W17 und W15 nutzen dieselbe Regel je Modul:
  Inhaltsänderung oder Eigentümerwechsel setzt die Freigabe zurück. Die BIA hat das in `upsert`
  schon, das Muster wird übernommen.
- **Protokoll aus dem geprüften Schema.** `ZodPipe` legt das Parse-Ergebnis an der Anfrage ab, der
  Interceptor schreibt dieses statt `req.body` (W10). Davon hängen W11 und W12 im selben Interceptor
  ab; sie liegen deshalb im selben Paket.
- **Keine neue Laufzeitabhängigkeit.** Nur drei Testbibliotheken der Oberfläche (Paket 8, offene
  Frage 4 in der Spec).
- **Tests, die Fehler festschreiben (W30),** werden mit dem jeweiligen Fix umgeschrieben. Die
  Zuordnung steht in der Aufgabe, die den Fix enthält.

## Abhängigkeiten

```
Paket 1 (Critical): T1 bis T7, untereinander unabhängig bis auf T2 nach T1 und T7 nach T6
        │
Paket 2: T8 (W4, Guard nur mit allowOwn) ──┬── Paket 4: T18 (W10 Export)
                                            ├── Paket 5: T25, T26, T27, T35, T36
                                            └── Paket 7: T43 (W19)
Paket 3: T13 (W6, Suchpfad) ── vor T25 (neue Triggerbedingung)
Paket 4: T18 → T19 (W10 Protokoll aus Schema) → T20 (W11) → T21 (W12), alle im selben Interceptor
Paket 8: T45 (Testbibliotheken) ── vor T46 bis T50 und dem Komponententeil von T24
```

**Hinweis zur Reihenfolge:** T13 ändert nur den Suchpfad vorhandener Funktionen. Die neuen Trigger
aus K4 und K5 setzen den Suchpfad von Anfang an richtig, deshalb blockiert T13 Paket 1 nicht.

## Gemeinsame Verifikation je Aufgabe

- [ ] Der neue Test ist auf dem Stand vor dem Fix rot (Ausgabe im PR nennen).
- [ ] Nach dem Fix sind der neue Test und die Testdatei des Moduls grün:
      `pnpm --filter @isms/api exec vitest run test/<modul>.e2e.test.ts`.
- [ ] `pnpm -r typecheck` und `pnpm format:check` sind sauber.
- [ ] Texte in einfachem Deutsch ohne Gedankenstriche.

Das wird unten nicht je Aufgabe wiederholt, nur Abweichungen.

---

## Paket 1: Critical

### T1: Token nur für den Mandanten der Mitgliedschaft (K1)

- [x] Erledigt.

- **Test vorher:**
  - In `apps/api/test/auth.e2e.test.ts` der Test `lehnt ein Token ab, dessen Mandant nicht zur
Mitgliedschaft passt`.
  - Ablauf: Mandant A und B registrieren. Mit `JWT_SECRET` aus der Testumgebung ein Token mit `mid`
    von B und `tid` von A signieren, dann `GET /risks` aufrufen.
  - Erwartet: 401. Heute: 200 mit Daten von A.
- **Zweiter Test:** `apps/api/src/config/env.test.ts`. `loadEnv` mit `NODE_ENV=production` und dem
  Schlüssel aus `docker-compose.yml` wirft. Heute läuft der Start durch.
- **Änderung:**
  - `PermissionCacheService.load` liefert `tenantId` und Status der Mitgliedschaft. Der Guard
    vergleicht mit `claims.tid` und verlangt `status = 'active'`.
  - In `loadEnv` eine Sperrliste der Schlüssel aus dem Repository.
  - `JwtModule` mit `algorithms: ['HS256']`.
- **Akzeptanz:**
  - Ein gefälschtes `tid` ergibt 401.
  - Ein Start in Produktion mit Repository-Schlüssel scheitert mit klarer Meldung.
  - Bestehende Tokens bleiben gültig.
- **Dateien:** `apps/api/src/kernel/auth/jwt.guard.ts`, `permission-cache.service.ts`,
  `auth.module.ts`, `apps/api/src/config/env.ts`, Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T2: Compose ohne Ersatzwerte für Geheimnisse (K1)

- **Test vorher:** `apps/api/test/compose.test.ts` (neu) liest `docker-compose.yml` und prüft, dass
  `JWT_SECRET` und `APP_MASTER_KEY` als `${ISMS_…:?…}` stehen. Heute steht dort `:-` mit festem Wert.
- **Änderung:** `${ISMS_JWT_SECRET:?…}` und `${ISMS_APP_MASTER_KEY:?…}`. Dazu
  `docs/deployment.md` und `.env.example` anpassen.
- **Akzeptanz:** `docker compose config` ohne die Variablen bricht mit einer Meldung ab.
- **Verifikation zusätzlich:** `docker compose config` mit und ohne Variablen ausführen.
- **Dateien:** `docker-compose.yml`, `docs/deployment.md`, Test.
- **Abhängigkeiten:** T1.
- **Umfang:** S.
- **Erst fragen:** Diese Aufgabe ändert das Standardverhalten von Compose (Spec, Grenzen).

### T3: Postausgang je Mandant (K2)

- [x] Erledigt.

- **Test vorher:** `apps/api/test/notifications.e2e.test.ts`, Test `zeigt im Postausgang nur Mails
des eigenen Mandanten`.
  - Mandant A erzeugt Erinnerungen.
  - Mandant B ruft `GET /notifications/outbox` auf.
  - Erwartet: `messages` ohne Mails von A. Heute: Mails von A sind enthalten.
- **Änderung:**
  - Tabelle `mail_outbox` mit `tenant_id` und RLS (Schema plus `--custom`-Migration).
  - `MailService.send` bekommt den Mandanten und schreibt die Nachricht dort hinein.
  - `outbox()` liest im Mandantenkontext.
  - Der Worker schreibt in dieselbe Tabelle.
- **W30-Anteil:** Die Prüfung `:153-155` auf den globalen Postausgang wird auf den Mandanten
  umgestellt.
- **Akzeptanz:**
  - Mandant B sieht nichts von A.
  - Der Postausgang zeigt auch Mails des Workers.
- **Dateien:** `apps/api/src/kernel/mail/mail.service.ts`, `notifications.controller.ts`,
  `notifications.service.ts`, `packages/db/src/schema/*`, eine Migration, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T4: Meldefristen mit Empfänger, Zeitpunkt und richtiger Reihenfolge (K3)

- [x] Erledigt.

- **Test vorher:** In `apps/api/test/deadlines.e2e.test.ts` drei Tests:
  1. **Empfänger:** Eine Meldefrist eines Vorfalls mit bearbeitender Person hat diese als
     `ownerPersonId`. Heute ist sie `null`.
  2. **Überfällig:** Kenntnis vor 25 Stunden, die 24-Stunden-Frist zählt in `/deadlines/summary` als
     `overdue`. Heute ist sie `daysLeft 0`.
  3. **Reihenfolge:** Eine Meldefrist am selben Tag wie eine Maßnahme steht vorn. Heute steht sie
     hinten.
- **Zweiter Test:** In `notifications.e2e.test.ts` erscheint die Meldefrist in der Vorschau des
  Erinnerungslaufs der bearbeitenden Person.
- **Änderung:**
  - Die Quelle `reporting_obligation` liefert `COALESCE(i.handler_person_id, …)` als Eigentümer.
    Ohne bearbeitende Person geht die Frist an alle mit `incident.write`.
  - Die Liste trägt `dueAt` als Zeitpunkt. `overdue` heißt `due_at < now()`.
  - Tagesgrenzen per `AT TIME ZONE 'Europe/Berlin'`.
  - Sortierung `CASE severity WHEN 'critical' THEN 0 …`.
- **Akzeptanz:** alle vier Tests grün. Die übrigen Quellen der Fristenliste behalten ihr Verhalten.
- **Dateien:** `apps/api/src/modules/deadlines/deadlines.service.ts`, `notifications.service.ts`,
  Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T5: Freigaben nicht als Status setzbar (K4)

- [x] Erledigt (teilweise, siehe tasks/offen.md).

- **Test vorher:**
  - **`apps/api/test/risks.e2e.test.ts`:** Der Risk-Owner sendet
    `PATCH /measures/:id {"status":"verified"}` auf die eigene Maßnahme, erwartet 400. Ebenso
    `PATCH /risks/:id {"status":"accepted"}`, erwartet 400. Heute: 200.
  - **`apps/api/test/incidents.e2e.test.ts`:** `PATCH /actions/:id {"status":"verified"}`,
    erwartet 400.
  - **`apps/api/test/planning.e2e.test.ts`:** `PATCH {"status":"approved"}`, erwartet 400.
  - **`packages/db/src/db.test.ts`:** `UPDATE measure SET status='verified'` als `isms_app` ohne
    `verified_by_user_id` scheitert. Heute gelingt es.
- **Änderung:**
  - Die DTOs für Anlegen und Ändern nehmen `verified`, `accepted` und `approved` aus. Bei Risiken
    entfällt `status` ganz aus dem DTO.
  - CHECK-Bedingungen per `--custom`-Migration, mit `search_path` wie in T13.
  - Eine Migration setzt Zeilen ohne handelnde Person auf den Vorstatus (offene Frage 1 der Spec).
  - `demo-seed.ts:986-990` bestätigt M-0009 über `measures.verify` durch eine zweite Person.
- **Akzeptanz:**
  - Alle Tests grün.
  - Die Bestätigungs-Endpunkte funktionieren unverändert.
  - `demo-seed.e2e.test.ts` ist grün.
- **Dateien:** `packages/shared/src/dto.ts`, `measures.service.ts`, `risks.service.ts`,
  `actions.service.ts`, `planning.service.ts`, eine Migration, `demo-seed.ts`, Tests. Teilbar in
  T5a (DTO und Service) und T5b (Datenbank und Bereinigung).
- **Abhängigkeiten:** keine.
- **Umfang:** L, als zwei Teilaufgaben je M.
- **Erst fragen:** Die Datenmigration setzt vorhandene Freigaben zurück (Spec, Grenzen).

### T6: Audit abschließen nur durch die leitende Auditorin mit Bericht (K5)

- [x] Erledigt.

- **Test vorher:** In `apps/api/test/audit.e2e.test.ts`:
  - Die ISMS-Leitung legt ein Audit mit vollem Umfang an und setzt `closed`, erwartet 403. Heute: 200.
  - Die Auditorin setzt `closed` ohne Bericht, erwartet 400.
  - `leadAuditorUserId` eines fremden Mandanten, erwartet 404.
- **W30-Anteil:** Die Tests `:135-139` und `:159`, in denen die ISMS-Leitung abschließt, werden auf
  die Auditorin umgestellt.
- **Änderung:**
  - In `audits.service.update`: Statusschritte `reported` und `closed` nur für
    `ctx.userId === lead_auditor_user_id` mit Rolle Auditor.
  - Bericht für beide Statusschritte.
  - Prüfung der Mitgliedschaft von `leadAuditorUserId`.
- **Akzeptanz:** Abdeckung im Auditprogramm entsteht nur aus Audits, die die leitende Auditorin
  mit Bericht abgeschlossen hat.
- **Dateien:** `apps/api/src/modules/audit/audits.service.ts`, `packages/shared/src/permissions.ts`
  (falls offene Frage 2 so entschieden wird), Test.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T7: Abgeschlossene Audits sperren (K5)

- [x] Erledigt.

- **Test vorher:**
  - In `audit.e2e.test.ts`: Nach `closed` ergeben `PATCH {requirementIds}`, `{plannedTo}` und
    `{reportFileId: null}` jeweils 409. Heute: 200.
  - `POST /findings` mit `auditId` des abgeschlossenen Audits, erwartet 409.
  - In `packages/db/src/db.test.ts`: `UPDATE audit SET planned_to` auf ein abgeschlossenes Audit als
    `isms_app` scheitert.
- **Änderung:**
  - Sperren im Service.
  - Trigger auf `audit` und `audit_requirement` per `--custom`-Migration.
  - `findings.service` lehnt abgeschlossene Audits ab.
- **Akzeptanz:** Ab `reported` sind Umfang, Termine, Regelwerk und Bericht fest, ab `closed`
  alles.
- **Dateien:** `audits.service.ts`, `findings.service.ts`, eine Migration, Tests.
- **Abhängigkeiten:** T6.
- **Umfang:** M.

### Checkpoint Paket 1

- [ ] `pnpm -r test` grün, `pnpm -r build` sauber
- [ ] `pnpm db:seed:demo` auf frischer Datenbank läuft durch
- [ ] `docs/review/99-bestaetigt.md`: K1 bis K5 mit Commit vermerkt
- [ ] Durchsicht mit dem Menschen vor Paket 2

---

## Paket 2: Auth und Mandantentrennung

### T8: Guard erlaubt `_own` nur ausdrücklich (W4)

- [x] Erledigt.

- **Test vorher:** In `apps/api/test/continuity.e2e.test.ts` und `files.e2e.test.ts`:
  - Der Risk-Owner sendet `POST /playbooks`, erwartet 403. Heute: 201.
  - Er sendet `DELETE /files/:id` auf den unverknüpften Upload einer anderen Person, erwartet 403.
    Heute: 204.
  - Er sendet `DELETE /processes/:fremd/bia/resources/:asset`, erwartet 403. Heute: 200.
- **Änderung:**
  - `@RequirePermission(P.X_WRITE, { allowOwn: true })`; der Guard prüft `_own` nur bei `allowOwn`.
  - Alle Endpunkte mit `…_WRITE` durchgehen und `allowOwn` dort setzen, wo der Service
    `assertCan` mit Datensatz aufruft.
  - `removeResource` ruft `assertCan` mit dem Prozess auf.
  - `files.remove` prüft `uploadedByUserId` oder volles Recht.
- **Akzeptanz:**
  - Die drei neuen Tests sind grün.
  - Alle vorhandenen `_own`-Tests (`risks.e2e.test.ts:90-107` u. a.) bleiben grün.
- **Dateien:** `apps/api/src/kernel/auth/permission.guard.ts`, `decorators.ts`, die betroffenen
  Controller, `bia.service.ts`, `files.service.ts`, Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** L, aber mechanisch.
- **Hinweis:** In zwei Commits schneiden: Guard und Dekorator, dann die Endpunkte.

### T9: Einladung bindet das Kennwort an das Konto (W1)

- [x] Erledigt.

- **Test vorher:** In `auth.e2e.test.ts`:
  - Mandant A lädt X ein, Mandant B lädt X ein, erwartet 409. Heute: 201.
  - B löst seinen Token mit einem Kennwort ein; danach kann X die Einladung von A mit einem eigenen
    Kennwort annehmen.
- **W30-Anteil:** Der Test `:165-170` sendet zusätzlich einen bereits eingelösten Token.
- **Änderung:**
  - `invite` lehnt eine Adresse ab, deren Konto mit Platzhalter in einem anderen Mandanten wartet.
  - `acceptInvite` setzt das Kennwort nur, wenn die Mitgliedschaft das Konto angelegt hat (Spalte
    `created_user` oder Vergleich mit `invitedByUserId`).
- **Dateien:** `members.service.ts`, `auth.service.ts`, gegebenenfalls Schema und Migration, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T10: Keine Änderung der eigenen Rollen, Leitung bleibt erhalten (W2)

- [x] Erledigt.

- **Test vorher:** In `auth.e2e.test.ts`:
  - Die einzige ISMS-Leitung setzt sich auf `auditor`, erwartet 400. Heute: 200.
  - Eine ISMS-Leitung stuft die zweite und letzte andere Leitung herab, sodass keine aktive Leitung
    bleibt, erwartet 409.
- **Änderung:** Der Controller reicht `ctx.membershipId` weiter; `setRoles` prüft die eigene
  Mitgliedschaft und zählt die verbleibenden Leitungen.
- **Dateien:** `members.controller.ts`, `members.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T11: Mandant des Erneuerungstokens in der Datenbank (W3)

- [x] Erledigt.

- **Test vorher:** In `auth.e2e.test.ts`:
  - Ein Konto mit zwei Mandanten meldet sich an.
  - Den Neustart nachstellen: die Map über einen Test-Hook leeren oder eine zweite App-Instanz
    `createApp()` starten und dort `POST /auth/refresh` aufrufen.
  - Das neue Token hat dasselbe `tid`. Heute: `tid` ist `null`.
- **W30-Anteil:** Der Test `:127-131` stuft eine Rolle herab und erwartet 403 mit dem alten Token.
- **Änderung:**
  - Spalte `refresh_token.tenant_id` (Schema und Migration).
  - `issueSession` gibt die ID zurück, `replacedById` wird direkt gesetzt.
  - Beide Maps entfallen.
  - Der Web-Client übernimmt die Sitzung aus der Erneuerung (`apps/web/src/lib/api.ts:82`).
- **Dateien:** `auth.service.ts`, Schema, Migration, `apps/web/src/lib/api.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T12: Suggestions Auth (H1 bis H5)

- [x] Erledigt.

Je Punkt ein Test vorher, alle in `auth.e2e.test.ts` bzw. `members`-Tests:

- **H1:** Nach dem Abmelden erhält der ersetzte Token in der Gnadenfrist 401.
- **H2:** Ein Konto mit `is_active = false` (per SQL gesetzt) bekommt bei `refresh` 401.
- **H3:** `register` mit vorhandener Adresse antwortet wie bei belegtem Kürzel.
- **H4:** Mit zwei App-Instanzen wirkt ein Rechteentzug auf der zweiten sofort.
- **H5:** Eine Einladung mit `personId` einer schon verknüpften Person ergibt 409, mit unbekannter
  `personId` 404.

Weitere Angaben:

- **Dateien:** `auth.service.ts`, `permission-cache.service.ts`, `members.service.ts`, Tests.
- **Abhängigkeiten:** T11 für H1.
- **Umfang:** M. Bei Bedarf in Einzelaufgaben teilen.

### Checkpoint Paket 2

- [ ] `pnpm -r test` grün
- [ ] Anmelden, Mandant wechseln, zwei Tabs und Abmelden im Browser geprüft
- [ ] Durchsicht vor Paket 3

---

## Paket 3: Datenbank und Rechte

### T13: Suchpfad mit `pg_temp` in allen Funktionen (W6)

- [x] Erledigt.

- **Test vorher:** In `packages/db/src/db.test.ts`:
  - Als `isms_app` `CREATE TEMP TABLE action(...)` anlegen, dann eine eigene Feststellung bestätigen.
    Erwartet: `sod_violation`. Heute: gelingt.
  - Ein zweiter Test prüft im Katalog, dass jede Funktion in `public` ein `proconfig` mit
    `search_path` hat, das auf `pg_temp` endet.
- **Änderung:**
  - Eine `--custom`-Migration setzt `ALTER FUNCTION … SET search_path = pg_catalog, public, pg_temp`
    für alle Trigger- und Hilfsfunktionen.
  - `REVOKE TEMPORARY ON DATABASE … FROM isms_app` (auch in `infra/docker/postgres-init.sql`).
- **Dateien:** eine Migration, `postgres-init.sql`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T14: Globale Rollen und SoD-Regeln nur lesbar (W5)

- [x] Erledigt (teilweise, siehe tasks/offen.md).

- **Test vorher:** In `db.test.ts`: `DELETE FROM sod_rule WHERE tenant_id IS NULL` als `isms_app` im
  Mandantenkontext löscht 0 Zeilen. Heute: 3. Ebenso `UPDATE role … WHERE tenant_id IS NULL`.
- **Änderung:**
  - Getrennte Richtlinien `FOR SELECT` (global oder eigen) und `FOR INSERT/UPDATE/DELETE` (nur
    eigen).
  - Mandanteneigene Kopien eines Systemschlüssels lehnt `members.service.resolveRoles` ab.
- **Dateien:** eine Migration, `members.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T15: Änderungsprotokoll gegen Kaskade und Rückdatierung (W7)

- [x] Erledigt.

- **Test vorher:** In `apps/api/test/auditlog.e2e.test.ts` bzw. `db.test.ts`:
  - `DELETE FROM tenant WHERE id = T` als `isms_app` scheitert. Heute löscht es alle
    Protokollzeilen.
  - `INSERT INTO audit_log (…, at) VALUES (…, '2020-01-01')` speichert `now()`.
- **Änderung:**
  - Fremdschlüssel auf `ON DELETE RESTRICT`.
  - `REVOKE DELETE ON tenant, "user" FROM isms_app`.
  - Trigger `BEFORE INSERT … NEW.at := now()`.
- **Dateien:** eine Migration, Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T16: Migrator-Zugang nur für Migration und Worker (W8)

- [x] Erledigt (teilweise, siehe tasks/offen.md).

- **Test vorher:** `apps/api/test/compose.test.ts`: Der Dienst `api` in `docker-compose.yml` hat kein
  `DATABASE_URL_MIGRATOR`, und die Kennwörter von `isms_app` und `isms_migrator` sind Variablen.
  Heute: beides nein.
- **Änderung:**
  - `x-db-env` aufteilen.
  - Die API startet pg-boss nicht.
  - Kennwörter als `ISMS_DB_APP_PASSWORD` und `ISMS_DB_MIGRATOR_PASSWORD`, auch in
    `postgres-init.sql` per Umgebungsvariable.
- **Dateien:** `docker-compose.yml`, `infra/docker/postgres-init.sql` (wird zu `.sh`, falls
  Variablen nötig sind), `docs/deployment.md`, Test.
- **Abhängigkeiten:** T2.
- **Umfang:** S.
- **Erst fragen:** Diese Aufgabe ändert das Standardverhalten von Compose (Spec, Grenzen).

### T17: Katalogtest für RLS und App-Rolle, Idempotenz (H19-Teil, W30-Teil)

- [x] Erledigt.

- **Test vorher:** In `db.test.ts`:
  - Jede Tabelle mit `tenant_id` hat `relrowsecurity` und eine Richtlinie mit `USING` und
    `WITH CHECK`. Der Test ist grün, wenn alles stimmt; er schützt künftige Tabellen.
  - `current_user = 'isms_app'`, `rolbypassrls = false`, die Rolle besitzt keine Tabelle.
  - **W30:** „ist idempotent“ zählt vor und nach dem zweiten Seed. Heute kann der Test nicht
    scheitern; nachgewiesen wird das, indem man den Seed testweise doppeln lässt.
  - **Textersetzung in `apps/api/test/setup.ts:10`:** Die App-Verbindung prüft beim Start ihr
    `current_user` und bricht sonst ab.
- **Dateien:** `packages/db/src/db.test.ts`, `apps/api/test/setup.ts`.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### Checkpoint Paket 3

- [x] `pnpm --filter @isms/db test` und `pnpm -r test` grün
- [x] `pnpm db:reset` und `pnpm db:seed:demo` laufen auf frischer Datenbank
- [ ] Durchsicht vor Paket 4

---

## Paket 4: Dateien, Exporte, Protokoll

### T18: Verarbeitungsverzeichnis und DSFA nur mit `privacy.read` (W10, Exportteil)

- [x] Erledigt.

- **Test vorher:** In `apps/api/test/privacy.e2e.test.ts`, Block „Lesezugriff“:
  - Der Auditor erhält 403 auf `GET /exports/processing-activities.csv` und `.html`. Heute: 200.
  - In `audit-package.e2e.test.ts`: Das Paket des Auditors enthält keinen Eintrag unter
    `09-datenschutz/`.
- **Änderung:**
  - Beide Routen verlangen `REPORT_EXPORT` und `PRIVACY_READ`; der Guard braucht dafür „alle“
    statt „eines“, also `@RequireAllPermissions`.
  - `AuditPackageService.build(ctx)` filtert die Register nach Recht.
- **Dateien:** `exports.controller.ts`, `package.service.ts`, `decorators.ts`,
  `permission.guard.ts`, Tests.
- **Abhängigkeiten:** T8.
- **Umfang:** M.

### T19: Protokoll speichert geprüften Inhalt, begrenzt und nach Recht gefiltert (W10, Protokollteil)

- [x] Erledigt.

- **Test vorher:** In `auditlog.e2e.test.ts`:
  - Ein Merkwort aus dem Text einer DSFA erscheint nicht in der Antwort von `GET /audit-log` an den
    Auditor. Heute erscheint es.
  - `{"extra":{"password":"x"}}` an einer Route mit Schema wird nicht gespeichert (unbekanntes
    Feld) bzw. geschwärzt.
  - Ein Upload mit 50 Textfeldern zu je 1 MB wird abgelehnt (413).
- **Änderung:**
  - `ZodPipe` legt das Ergebnis an `req` ab, der Interceptor nimmt es.
  - Rekursives Schwärzen, 16 KB Grenze.
  - `AuditLogService.list` leert `diff` ohne passendes Leserecht.
  - Multer-Grenzen `fields: 20`, `fieldSize: 64 KB`, `parts`.
- **Dateien:** `apps/api/src/kernel/http/zod.pipe.ts`, `audit-log.interceptor.ts`,
  `auditlog.service.ts`, `files.controller.ts`, Tests.
- **Abhängigkeiten:** T18.
- **Umfang:** M.

### T20: Protokoll ordnet nach Route statt Rohpfad (W11)

- [x] Erledigt.

- **Test vorher:** In `auditlog.e2e.test.ts`:
  - `GET /api/v1/EXPORTS/risks.csv` erzeugt einen Exporteintrag. Heute: keinen.
  - `POST /api/v1/auth/LOGIN` erzeugt einen Anmeldeeintrag.
- **Änderung:** Dekorator `@AuditAction('export' | 'login')` an den Handlern; der Interceptor liest
  ihn über den `Reflector`.
- **Dateien:** `audit-log.interceptor.ts`, `exports.controller.ts`, `auth.controller.ts`, Test.
- **Abhängigkeiten:** T19 (derselbe Interceptor).
- **Umfang:** S.

### T21: IP im Protokoll (W12)

- **Test vorher:** In `auditlog.e2e.test.ts`: Nach `POST /risks` hat der Protokolleintrag eine IP.
  Heute: `null`. Zweiter Test: Mit `TRUST_PROXY=1` und `X-Forwarded-For: 203.0.113.7` steht diese
  Adresse im Eintrag.
- **Änderung:**
  - Die IP vor `next.handle()` festhalten.
  - `app.set('trust proxy', env.TRUST_PROXY)`.
  - nginx `proxy_set_header X-Forwarded-For $remote_addr`.
- **Dateien:** `audit-log.interceptor.ts`, `app.factory.ts`, `env.ts`, `infra/docker/nginx.conf`,
  Test.
- **Abhängigkeiten:** T20.
- **Umfang:** S.

### T22: Downloads und Auditpaket überstehen Lesefehler (W9, W30-Teil)

- **Test vorher:** In `files.e2e.test.ts`:
  - Datei hochladen, die Datei im Speicher löschen, `GET /files/:id` aufrufen. Erwartet: 404 und der
    Prozess läuft weiter (Folgeanfrage 200). Heute: Absturz des Testprozesses.
  - In `audit-package.e2e.test.ts` dasselbe mit einer Datei, die nach `exists()` verschwindet. Der
    Test hängt sich dafür an `storage.stream`.
- **W30:** Der Test `:308-312` entpackt das ZIP mit `zipRead` und sucht in den Einträgen. Er wird
  nachweislich rot, wenn man testweise eine fremde Zeile einschleust.
- **Änderung:**
  - Download mit `pipeline` und Fehlerbehandlung.
  - Im Paket die Dateien nacheinander öffnen, z. B. mit einem verzögerten Stream.
  - `archive.on('error')` beendet die Antwort, `res.on('close')` ruft `archive.abort()`.
- **Dateien:** `files.controller.ts`, `package.service.ts`, `storage.service.ts`, Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T23: Dateityp nach Endung und Inhalt, Umlaute erhalten (W13, W14)

- **Test vorher:** In `files.e2e.test.ts`:
  - `scan.pdf.exe` als `application/pdf` ergibt 400. Heute: 201.
  - Ein Name mit U+202E wird ohne das Zeichen gespeichert.
  - Eine PDF-Endung mit PNG-Inhalt ergibt 400.
  - `Prüfbericht.pdf` bleibt `Prüfbericht.pdf`. Heute: `PrÃ¼fbericht.pdf`.
- **Änderung:**
  - Tabelle MIME zu Endungen.
  - Prüfung der ersten Bytes für PDF, PNG, JPEG, WEBP, ZIP/OOXML und OLE.
  - `\p{Cf}` aus dem Namen entfernen.
  - `defParamCharset: 'utf8'`.
- **Dateien:** `files.service.ts`, `files.controller.ts`, `packages/shared/src/enums.ts`
  (Allowlist), Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T24: Suggestions Dateien und Exporte (H7, H8, H9)

Je Punkt ein Test vorher:

- **H7 (`files.e2e.test.ts`):** `POST /evidence {url:'javascript:alert(1)'}` ergibt 400. Heute: 201.
  In `EvidenceSection` wird ein Verweis nur bei `http:` oder `https:` als Link gerendert;
  Komponententest nach T45.
- **H8 (`apps/api/src/modules/exports/csv.test.ts`, neu):** `csvCell('Backup,=1+1')` ist gequotet,
  `csvCell(-3)` bleibt `-3`.
- **H9 (`exports.e2e.test.ts`):** Ein JSON-Inhalt von 200 KB ergibt 413 mit deutscher Meldung, kein
  Stacktrace im Log. 23505 und 23503 ohne `e.detail`.

Weitere Angaben:

- **Dateien:** `packages/shared/src/dto.ts`, `EvidenceSection.tsx`, `csv.ts`, `problem.filter.ts`,
  Tests.
- **Abhängigkeiten:** T45 für den Komponententest.
- **Umfang:** M.

### Checkpoint Paket 4

- [ ] `pnpm -r test` grün
- [ ] Auditpaket mit echten Nachweisen der Demodaten heruntergeladen und entpackt
- [ ] Durchsicht vor Paket 5

---

## Paket 5: Vier-Augen-Prinzip und Schreibrechte

### T25: Eigentümerwechsel unter `_own` nur auf sich selbst, Freigabe zurück (W15, Teil Risiko, Maßnahme, Verbesserung)

- **Test vorher:**
  - In `risks.e2e.test.ts`: Der Risk-Owner setzt `ownerPersonId` seiner Maßnahme auf eine andere
    Person, erwartet 403. Heute: 200.
  - In `apps/api/test/notifications.e2e.test.ts`: Die Erinnerung an die andere Person enthält den
    Titel danach nicht.
  - In `risks.e2e.test.ts`: Die ISMS-Leitung wechselt den Eigentümer eines getragenen Risikos; die
    Übernahme ist danach aufgehoben. Heute bleibt sie.
- **Änderung:**
  - `assertCan` auch gegen das neue `ownerPersonId`.
  - Ein Eigentümerwechsel setzt `accepted_*` bzw. `verified_*` zurück.
  - Trigger zusätzlich auf `owner_person_id`, wenn die Freigabe gesetzt ist.
- **Dateien:** `risks.service.ts`, `measures.service.ts`, `actions.service.ts`, eine Migration,
  Tests.
- **Abhängigkeiten:** T8, T13.
- **Umfang:** M.

### T26: Assets unter `_own`: Eigentümer, Verknüpfungsziel, Lösen (W15, Teil Asset)

- **Test vorher:** In `risks.e2e.test.ts`:
  - `PATCH /assets/:own {ownerPersonId: <andere>}` ergibt 403, mit `null` ebenfalls 403.
  - `POST /assets/:own/relations {toAssetId: <fremd>}` ergibt 403.
  - `DELETE /assets/:id/relations/:toId` ergibt 204. Heute: 404.
- **Änderung:**
  - `update` prüft den neuen Eigentümer.
  - `link` prüft das Ziel.
  - Neue Route zum Lösen.
- **Dateien:** `assets.service.ts`, `assets.controller.ts`, Test.
- **Abhängigkeiten:** T8.
- **Umfang:** S.

### T27: Kein kaskadierendes Löschen freigegebener oder fremder Datensätze (W16)

- **Test vorher:**
  - In `continuity.e2e.test.ts`: Der Risk-Owner löscht seinen Prozess mit freigegebener BIA,
    erwartet 409. Heute: 204, und die BIA ist weg.
  - In `risks.e2e.test.ts`: Der Risk-Owner löscht ein Asset, an dem ein fremdes Risiko, eine
    freigegebene BIA und eine Verarbeitung hängen, erwartet 409. Danach sind die Verweise
    unverändert.
- **Änderung:**
  - Vor dem Löschen Verweise zählen und mit 409 und Hinweis auf „stilllegen“ ablehnen.
  - Prozess und Asset bekommen den Status `retired`, falls er fehlt (offene Frage 3 der Spec).
- **Dateien:** `processes.service.ts`, `assets.service.ts`, gegebenenfalls Schema, Tests.
- **Abhängigkeiten:** T8.
- **Umfang:** M.

### T28: Freigabe der BIA bei jeder Inhaltsänderung zurück (W17, Teil BIA)

- **Test vorher:** In `continuity.e2e.test.ts`: Nach der Freigabe der BIA ergibt `PUT …/bia/impact`
  `status: 'draft'`. Heute bleibt `approved`. Ebenso `setResource` und `removeResource`.
- **Änderung:** Hilfsfunktion `resetApproval(tx, biaId)` aus allen vier Schreibwegen und beim
  Eigentümerwechsel des Prozesses.
- **Dateien:** `bia.service.ts`, `processes.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T29: Getragenes Risiko bei Inhaltsänderung zurück (W17, Teil Risiko)

- **Test vorher:** In `risks.e2e.test.ts`: Ein getragenes Risiko bekommt einen neuen Titel und eine
  Maßnahme wird gelöst; danach ist `acceptedAt` leer. Heute: gesetzt.
- **Änderung:**
  - `update` und `unlinkMeasure` heben die Übernahme samt Begründung auf.
  - Der Schnappschuss enthält Titel, Beschreibung, Assets und Maßnahmen.
- **Dateien:** `risks.service.ts`, Test.
- **Abhängigkeiten:** T25.
- **Umfang:** S.

### T30: Bestätigte Maßnahmen und Verbesserungen fest (W17, Teil Maßnahme und Verbesserung)

- **Test vorher:** In `risks.e2e.test.ts` bzw. `incidents.e2e.test.ts`:
  - `PATCH` des Titels einer bestätigten Maßnahme ergibt 409.
  - `POST /measures/:id/requirements` ergibt 409.
  - `DELETE` ergibt 409.
  - `POST /measures/:id/verify` auf eine geplante Maßnahme ergibt 400.
  - Die Eigentümerin einer bestätigten Verbesserung überschreibt `effectivenessResult`, erwartet 409.
- **Änderung:**
  - Sperren im Service.
  - `verify` nur aus `implemented`.
- **Dateien:** `measures.service.ts`, `actions.service.ts`, Tests.
- **Abhängigkeiten:** T5.
- **Umfang:** M.

### T31: Nachweise hinter bestätigten Datensätzen unveränderlich (W17, Teil Nachweis)

- **Test vorher:** In `audit.e2e.test.ts`: `DELETE /evidence/finding/:id/:evidenceId` auf eine
  bestätigte Feststellung ergibt 409. Heute: 200.
- **W30-Anteil:** Der Test `:484-489` wird so umgeschrieben. Ebenso `PATCH /evidence/:id` mit neuer
  Datei an einer bestätigten Maßnahme.
- **Änderung:** `evidence.service` prüft den Status der verknüpften Feststellung bzw. Maßnahme.
- **Dateien:** `evidence.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T32: Dokumentfreigabe mit Zustandsfolge (W18, Teil Dokument)

- **Test vorher:** In `apps/api/test/documents.e2e.test.ts`:
  - Freigabe einer nie eingereichten Fassung ergibt 409. Heute: 201.
  - Erneute Freigabe einer älteren Fassung nach Freigabe einer neueren ergibt 409.
  - `submitForReview` mit fremder `versionId` ergibt 404.
- **Änderung:**
  - `approve` verlangt `submittedAt` und kein `approvedAt`.
  - `submitForReview` filtert nach `documentId` und prüft die getroffene Zeile.
- **Dateien:** `documents.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T33: Notfallplan aktiv nur auf freigegebener BIA (W18, Teil Notfallplan)

- **Test vorher:** In `continuity.e2e.test.ts`:
  - Ein Plan auf einer Entwurf-BIA mit einer Übung „nicht bestanden“ wird `active`, erwartet 409.
    Heute: 200.
  - Eine Übung mit Datum in der Zukunft ergibt 400.
- **W30-Anteil:** Der Test `:379-387` wird umgeschrieben.
- **Änderung:** In `plans.service.update` vor `active` eine freigegebene BIA und eine bestandene
  Übung verlangen; `heldAt <= today`.
- **Dateien:** `plans.service.ts`, `packages/shared/src/dto.ts`, Test.
- **Abhängigkeiten:** T28.
- **Umfang:** S.

### T34: Nichtkonformität nur mit wirksamer Korrektur schließen (W18, Teil Feststellung)

- **Test vorher:** In `audit.e2e.test.ts`:
  - Eine Beobachtung schließen und auf `major` hochstufen ergibt 400. Heute: 200.
  - Schließen mit einer nur offenen Verbesserung ergibt 400.
  - `verify` mit einer nur erledigten, nicht bestätigten Verbesserung ergibt 409.
- **W30-Anteil:** Der Test `:242-294` wird umgeschrieben.
- **Änderung:**
  - `assertClosable` nach jeder Änderung prüfen, deren Ergebnis geschlossen und keine Beobachtung
    ist.
  - Status der Verbesserungen prüfen.
- **Dateien:** `findings.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T35: Rollenzuschnitt Auditor (W20)

- **Test vorher:** In `audit.e2e.test.ts` bzw. `incidents.e2e.test.ts`:
  - Die Auditorin bestätigt eine Verbesserung aus einem Risiko, erwartet 403. Heute: 201.
  - Die Auditorin legt eine Managementbewertung an, erwartet 403.
  - Ein zweiter Kennzahlenwert für dieselbe Periode ergibt 409.
  - Die Auditorin legt mit `POST /evidence` einen Nachweis an, erwartet 201. Heute: 403.
  - Die Auditorin meldet einen Vorfall, erwartet 201. Heute: 403.
- **W30-Anteil:** Der Test `:467-471` legt den Nachweis wieder als Auditorin an.
- **Änderung:**
  - `actions.verify` prüft bei reinem `action.verify` der Auditorin die `findingId`.
  - Eigenes Recht `review.write` für Managementbewertungen (offene Frage 2 der Spec).
  - Kennzahlenwerte als Insert.
  - `POST /evidence` mit `MEASURE_WRITE` oder `FINDING_WRITE`.
  - `incident.report` für jede Mandantenrolle.
- **Dateien:** `packages/shared/src/permissions.ts`, `actions.service.ts`, `audit.controller.ts`,
  `kpis.service.ts`, `files.controller.ts`, Tests.
- **Abhängigkeiten:** T8.
- **Umfang:** M.
- **Erst fragen:** Diese Aufgabe ändert den Rechtekatalog (Spec, Grenzen).

### T36: Beim Anlegen unter `_own` immer selbst Eigentümer (W21)

- **Test vorher:** In `risks.e2e.test.ts`: Der Risk-Owner legt eine Maßnahme ohne `ownerPersonId` an
  und kann sie danach bearbeiten (200), `ownerPersonId` ist er selbst. Heute: `null`, danach 403.
  Ebenso für Risiko, Verbesserung, Prozess und Asset.
- **Änderung:** Gespeichert wird derselbe Wert, der geprüft wird; ohne volles Recht ist ein leerer
  Eigentümer nicht möglich.
- **Dateien:** `risks.service.ts`, `measures.service.ts`, `actions.service.ts`,
  `processes.service.ts`, `assets.service.ts`, Tests.
- **Abhängigkeiten:** T8.
- **Umfang:** M, mechanisch.

### T37: Suggestion Vier-Augen (H20)

- **Test vorher:** In `auth.e2e.test.ts`: Eine deaktivierte Person bekommt nach erneuter Anmeldung
  keine `personId` im Token, und `_own`-Änderungen an ihrem Risiko ergeben 403. Eine deaktivierte
  Person ist als Eigentümer nicht wählbar (400).
- **Dateien:** `auth.service.ts`, die Services mit `ownerPersonId`, Test.
- **Abhängigkeiten:** T36.
- **Umfang:** S.

### Checkpoint Paket 5

- [ ] `pnpm -r test` grün
- [ ] `demo-seed.e2e.test.ts` grün (die Demodaten durchlaufen alle Vier-Augen-Wege)
- [ ] Durchsicht vor Paket 6

---

## Paket 6: Fristen

### T38: Verknüpfungen nur im eigenen Mandanten (W22)

- **Test vorher:** In `incidents.e2e.test.ts`:
  - Ein Vorfall in A mit einem Asset aus B ergibt 404. Heute: 201.
  - Ebenso eine Verarbeitung aus B.
  - In `incidents.e2e.test.ts` eine Verbesserung mit `riskId` aus B, erwartet 404.
- **Änderung:** Hilfsfunktion `requireOwn(tx, tenantId, table, ids)` vor jedem Einfügen.
- **Dateien:** `incidents.service.ts`, `actions.service.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### T39: Zeitpunkte begrenzt, Erfüllen einmalig, Korrekturweg (W23)

- **Test vorher:** In `incidents.e2e.test.ts`:
  - `knownAt` ein Jahr in der Zukunft ergibt 400. Heute: 201.
  - Zweites Erfüllen der 72-Stunden-Meldung ergibt 409. Heute: 201, und der Abschlussbericht
    wandert.
  - `POST /incidents/:id/corrections` korrigiert `knownAt` und schreibt beide Werte in die
    Zeitleiste.
- **Änderung:**
  - Zod-Refinement mit höchstens 5 Minuten Zukunft und nicht vor `detectedAt`.
  - Prüfung `fulfilledAt IS NULL`.
  - Neuer Korrekturendpunkt mit `incident.write`.
- **Dateien:** `packages/shared/src/dto.ts`, `incidents.service.ts`, `incidents.controller.ts`,
  Test.
- **Abhängigkeiten:** keine.
- **Umfang:** M.

### T40: „Unverzüglich“ erscheint in Liste, Monitor und Mail (W24)

- **Test vorher:** In `incidents.e2e.test.ts`: Nach `confirmBreach` mit hohem Risiko steht
  `gdpr_art34` im Fristenmonitor und in `/deadlines` mit `severity = 'critical'`. Heute fehlt es.
- **W30-Anteil:** Der Test `:202-203` wird umgeschrieben.
- **Änderung:** In `reporting-deadlines.ts` als Fälligkeit den auslösenden Zeitpunkt setzen, plus
  Kennzeichen `immediate` für die Beschriftung; `nis2_progress` bleibt `null`.
- **Dateien:** `reporting-deadlines.ts`, `deadlines.service.ts`, Oberfläche für die Beschriftung,
  Test.
- **Abhängigkeiten:** T4.
- **Umfang:** S.

### T41: Erinnerungslauf ohne Doppelversand (W25)

- **Test vorher:** In `notifications.e2e.test.ts`: `sendDigests(tenant)` zweimal am selben Tag
  erzeugt beim zweiten Mal 0 Mails. Heute: dieselbe Zahl. `POST /digest/send` schickt nur an die
  aufrufende Person.
- **Änderung:**
  - Tabelle `digest_run(tenant_id, run_date)` eindeutig, Eintrag im selben Commit wie der Versand.
  - Der Worker legt je Mandant einen Job mit Schlüssel aus Mandant und Datum an.
- **Dateien:** `notifications.service.ts`, `notifications.controller.ts`, `worker.ts`, Schema,
  Migration, Test.
- **Abhängigkeiten:** T3.
- **Umfang:** M.

### T42: Suggestion Fristen und Testuhr (H10, W30-Teil)

- **Test vorher:** `apps/api/src/modules/incidents/reporting-deadlines.test.ts` (neu): `addMonths`
  für `2027-01-30T23:30Z` ergibt den 28.02. deutscher Zeit. Heute ergibt er den 01.03.
- **W30:** Der Monatsende-Test in `incidents.e2e.test.ts:168-182` nimmt einen Zeitpunkt kurz nach
  Mitternacht deutscher Zeit. `deadlines.e2e.test.ts:23` und `notifications.e2e.test.ts:22` rechnen
  „heute“ in `Europe/Berlin`.
- **Änderung:** `addMonths` in `Europe/Berlin` über `Intl` ohne neue Abhängigkeit.
- **Dateien:** `reporting-deadlines.ts`, Tests.
- **Abhängigkeiten:** keine.
- **Umfang:** S.

### Checkpoint Paket 6

- [ ] `pnpm -r test` grün
- [ ] Vorfall in den Demodaten durchgespielt: Frist erscheint, Mail in der Vorschau
- [ ] Durchsicht vor Paket 7

---

## Paket 7: Fachmodule

### T43: Bestätigungen für andere nur mit passendem Recht, nie überschrieben (W19)

- **Test vorher:**
  - In `apps/api/test/competence.e2e.test.ts`: Der Risk-Owner bestätigt die Schulung einer anderen
    Person, erwartet 403. Heute: 201. Eine zweite Bestätigung ergibt 409. `completedAt` in der
    Zukunft ergibt 400.
  - In `documents.e2e.test.ts`: Die DSB bestätigt für eine andere Person, erwartet 403.
  - Eine bestehende Bestätigung bleibt unverändert, mit `confirmed_by_user_id`.
- **W30-Anteil:** Der Test `documents.e2e.test.ts:239-246` wird umgeschrieben.
- **Änderung:**
  - `complete` prüft `training.write` bei fremder `personId`.
  - `acknowledge` prüft `document.publish`.
  - Kein Überschreiben.
  - Spalte `confirmed_by_user_id` an `training_assignment` und `acknowledgement`.
- **Dateien:** `trainings.service.ts`, `documents.service.ts`, Schema, Migration, Tests.
- **Abhängigkeiten:** T8.
- **Umfang:** M.

### T44: Suggestions Fachmodule (H11, H12, H13, H19-Teil)

Je Punkt ein Test vorher:

- **H11 (`competence.e2e.test.ts`):** Ein Risk-Owner heftet eine fremde Datei als Nachweis an,
  erwartet 403.
- **H12 (`privacy.e2e.test.ts`):** Eine zweite Stellungnahme zu einer freigegebenen DSFA ergibt 409.
  Eine Vorlage ohne verantwortliche Person ergibt 400. Ein Wechsel der Verantwortung nimmt die
  Stellungnahme zurück. Der Test `:346-366` wird angepasst.
- **H13 (`demo-seed.e2e.test.ts` und `compose.test.ts`):** `seedDemoTenant` mit
  `NODE_ENV=production` wirft, `ISMS_SEED_DEMO` steht standardmäßig auf `false`.
- **H19, Teil 1 (`packages/shared/src/ai.test.ts`, neu):** Wahrheitstabelle aller Kombinationen,
  `packages/shared/src/ai.ts` gegen `apps/web/src/lib/ai.ts`.
- **H19, Teil 2 (`ai-nis2.e2e.test.ts`):** Dieselbe Tabelle in einer zurückgerollten Transaktion
  gegen die erzeugten Spalten.
- **H19, Teil 3 (`privacy.e2e.test.ts`):** Lese-403 für Auditor und Risk-Owner.

Weitere Angaben:

- **Dateien:** `trainings.service.ts`, `competence.service.ts`, `dpia.service.ts`, `demo-seed.ts`,
  `docker-compose.yml`, Tests.
- **Abhängigkeiten:** T18 für den Lese-403-Teil.
- **Umfang:** M. Bei Bedarf teilen.

### Checkpoint Paket 7

- [ ] `pnpm -r test` grün
- [ ] Durchsicht vor Paket 8

---

## Paket 8: Oberfläche und Infrastruktur

### T45: Testbibliotheken für Komponententests

- **Test vorher:** Ein erster Komponententest `apps/web/src/components/ui.test.tsx` rendert
  `ErrorNote`. Er kann ohne die Bibliotheken nicht laufen; das ist der rote Zustand.
- **Änderung:**
  - Entwicklungsabhängigkeiten `jsdom`, `@testing-library/react` und `@testing-library/user-event`.
  - `apps/web/vitest.config.ts` mit `environment: 'jsdom'`.
- **Akzeptanz:** `pnpm --filter @isms/web test` läuft mit dem neuen Test grün.
- **Dateien:** `apps/web/package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, Test.
- **Abhängigkeiten:** keine.
- **Umfang:** S.
- **Erst fragen:** Offene Frage 4 der Spec.

### T46: Gemeinsames Seitenfenster als Dialog (W29, H14)

- **Test vorher:** `apps/web/src/components/Drawer.test.tsx`:
  - Nach dem Öffnen liegt der Fokus im Dialog, `aria-modal="true"`, Escape schließt, der Fokus kehrt
    zurück.
  - Bei `isError` erscheint `ErrorNote` statt Spinner (H14).
  - Gegen die heutige Seite `Risks` geprüft ist der Test rot.
- **Änderung:**
  - Komponente `Drawer` (natives `<dialog>` mit `showModal()`).
  - Die 13 Seitenfenster nutzen sie, in Schritten je zwei bis drei Seiten.
- **Dateien:** `apps/web/src/components/Drawer.tsx`, die Seiten. Wegen der Zahl der Seiten in
  Commits je Seitengruppe.
- **Abhängigkeiten:** T45.
- **Umfang:** L, in Schritten.

### T47: Datensätze per Tastatur öffnen (W26)

- **Test vorher:** In `apps/web/src/pages/Risks.test.tsx`: Mit `user.tab()` und `{Enter}` öffnet die
  erste Zeile das Seitenfenster. Heute: nicht erreichbar.
- **Änderung:** Komponente `RowButton` in der Titelzelle, in allen 13 Registern.
- **Dateien:** `ui.tsx`, die Seiten.
- **Abhängigkeiten:** T46.
- **Umfang:** M, mechanisch.

### T48: Entfernen erreichbar und mit Rückfrage (W27)

- **Test vorher:** In `apps/web/src/components/EvidenceSection.test.tsx`: „Lösen“ ist per Tab
  erreichbar und hat ein `aria-label` mit dem Titel. In `Planning.test.tsx`: Löschen eines Knotens
  mit Unterknoten fragt nach und nennt die Zahl.
- **Änderung:**
  - `opacity-0 group-hover:opacity-100 focus:opacity-100` an allen neun Stellen.
  - Gemeinsame Rückfrage `ConfirmButton`.
- **Dateien:** `ui.tsx`, `EvidenceSection.tsx`, die Seiten.
- **Abhängigkeiten:** T45.
- **Umfang:** M.

### T49: Fehler werden sichtbar (W28, H15)

- **Test vorher:**
  - In `Members.test.tsx`: Ein 409 `sod-violation` beim Rollenwechsel zeigt den `detail`-Text. Heute
    zeigt er nichts.
  - In `apps/web/src/lib/api.test.ts`: Eine HTML-Antwort mit Status 502 ergibt eine deutsche Meldung
    statt `SyntaxError` (H15). Ein Netzwerkfehler ergibt eine deutsche Meldung.
  - In `FileField.test.tsx`: Ein Download mit 404 zeigt eine Meldung.
- **Änderung:**
  - `MutationCache({ onError })` in `main.tsx`.
  - `useDownload()`.
  - `api()` mit geschütztem Parsen.
- **Dateien:** `main.tsx`, `apps/web/src/lib/api.ts`, `Members.tsx`, `FileField.tsx`,
  `EvidenceSection.tsx`, Tests.
- **Abhängigkeiten:** T45.
- **Umfang:** M.

### T50: Suggestions Oberfläche und Infrastruktur (H6, H16, H17, H18)

Je Punkt ein Test vorher:

- **H6 (`apps/api/test/compose.test.ts` bzw. ein Test, der `infra/docker/nginx.conf` liest):**
  Prüft CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` und `server_tokens off` in jedem
  `location` mit eigenem `add_header`. Swagger ist mit `NODE_ENV=production` nicht eingehängt
  (`app.factory`-Test).
- **H16:** Komponententest. Die Auswahllisten in `Soa`, `Members`, `Incidents`, `Continuity`,
  `Context` und `Privacy` haben einen zugänglichen Namen (`getByRole('combobox', { name })`).
- **H17:** Compose-Test. Veröffentlichte Ports beginnen mit `${ISMS_BIND:-127.0.0.1}`.
- **H18:** Test in `apps/web`. `STATUS_LABEL` deckt sich mit `packages/shared/src/labels.ts`. Die
  Begriffsfrage (offene Frage 5 der Spec) wird vorher entschieden.

Weitere Angaben:

- **Dateien:** `infra/docker/nginx.conf`, `app.factory.ts`, `docker-compose.yml`,
  `infra/docker/docker-compose.yml`, `ui.tsx`, `apps/web/src/lib/labels.ts`, die Seiten, Tests.
- **Abhängigkeiten:** T45.
- **Umfang:** M. Bei Bedarf teilen.

### Checkpoint Paket 8 (Abschluss)

- [ ] `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r build`, `pnpm format:check` grün
- [ ] Bildschirmfotos neu (`pnpm --filter @isms/web screenshots`), Oberfläche per Tastatur
      durchgegangen
- [ ] `docker compose up -d --build` mit gesetzten Geheimnissen startet, Anmeldung über
      `http://localhost:8080` gelingt
- [ ] `docs/review/99-bestaetigt.md`: jeder Eintrag mit Commit vermerkt
- [ ] Durchsicht mit dem Menschen vor dem Merge

---

## Zuordnung Befund zu Aufgabe

| Befund | Aufgabe  | Befund      | Aufgabe     | Befund      | Aufgabe                                                      |
| ------ | -------- | ----------- | ----------- | ----------- | ------------------------------------------------------------ |
| K1     | T1, T2   | W11         | T20         | W22         | T38                                                          |
| K2     | T3       | W12         | T21         | W23         | T39                                                          |
| K3     | T4       | W13         | T23         | W24         | T40                                                          |
| K4     | T5       | W14         | T23         | W25         | T41                                                          |
| K5     | T6, T7   | W15         | T25, T26    | W26         | T47                                                          |
| W1     | T9       | W16         | T27         | W27         | T48                                                          |
| W2     | T10      | W17         | T28 bis T31 | W28         | T49                                                          |
| W3     | T11      | W18         | T32 bis T34 | W29         | T46                                                          |
| W4     | T8       | W19         | T43         | W30         | T3, T6, T9, T11, T17, T22, T31, T33, T34, T35, T40, T42, T43 |
| W5     | T14      | W20         | T35         | H1 bis H5   | T12                                                          |
| W6     | T13      | W21         | T36         | H6          | T50                                                          |
| W7     | T15      | H7 bis H9   | T24         | H10         | T42                                                          |
| W8     | T16      | H11 bis H13 | T44         | H14         | T46                                                          |
| W9     | T22      | H15         | T49         | H16 bis H18 | T50                                                          |
| W10    | T18, T19 | H19         | T17, T44    | H20         | T37                                                          |

## Risiken und Gegenmaßnahmen

| Risiko                                                                   | Wirkung | Gegenmaßnahme                                                                                                  |
| ------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| T8 (Guard) ändert das Verhalten vieler Endpunkte auf einmal              | hoch    | Erst Guard und Dekorator, dann Endpunkte je Modul in eigenen Commits; volle Testsuite nach jedem               |
| T5 setzt vorhandene Freigaben zurück                                     | mittel  | Offene Frage 1 vorher klären; Migration protokolliert jede Änderung im Änderungsprotokoll                      |
| Neue Sperren (K5, W17, W18) brechen den Demo-Seed                        | mittel  | `demo-seed.e2e.test.ts` nach jeder Aufgabe in Paket 1 und 5; der Seed nutzt die Services und zeigt jeden Bruch |
| Compose-Änderungen (T2, T16, H13, H17) brechen bestehende Installationen | mittel  | `docs/deployment.md` im selben Commit; Fehlermeldung von `${VAR:?…}` nennt die Variable                        |
| Neue Spalten und Tabellen ohne RLS                                       | hoch    | T17 zuerst in Paket 3 oder vorziehen; jede neue Tabelle mit `tenant_id` in derselben Migration mit Richtlinie  |
| Paket 8 groß wegen 13 Seiten                                             | niedrig | `Drawer` und `RowButton` zuerst, dann Seiten in kleinen Commits                                                |

## Offene Fragen

Aus `docs/SPEC.md` übernommen, vor den genannten Aufgaben zu klären:

1. **Vor T5:** Bereinigung vorhandener Freigaben ohne handelnde Person.
2. **Vor T6 und T35:** Aufteilung von `audit.write`.
3. **Vor T27:** Ablehnen und stilllegen statt löschen.
4. **Vor T45:** Testbibliotheken für die Oberfläche.
5. **Vor T50:** Begriffe in `labels.ts`.
