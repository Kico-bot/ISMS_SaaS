# Review 06: Fachmodule Datenschutz, Kompetenz, Kontext, Assets, KI, SoA, Protokoll, Katalog, Dashboard

Stand: 12.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

Geprüft wurden unter `apps/api/src/modules/`:

- `privacy`, `competence`, `context`, `assets`, `ai`
- `soa`, `auditlog`, `catalog`, `dashboard`
- dazu `apps/api/src/demo-seed.ts`
- die Tests in `apps/api/test`

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer: Er hat die Module gelesen und jede Fundstelle mit `grep -n` belegt.
2. Security-Auditor: Er hat jeden Befund des Code-Reviewers mit Testskripten gegen die echte API auf
   der Testdatenbank nachgewiesen. Beteiligt waren die Rollen ISMS-Leitung, Auditor, Risk-Owner und
   Datenschutzbeauftragte.
3. Test-Engineer: Er hat die Testsuiten ausgeführt und für jeden Befund den fehlenden Test
   beschrieben.

Jede Rolle kannte die Befunde der vorherigen. Alle Zeilenangaben beziehen sich auf die
TypeScript-Quellen bzw. die SQL-Migrationen und sind nachgeprüft. Befunde aus den Reviews 01 bis 05
werden nur erwähnt, wenn sie hier eine neue Seite zeigen.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Critical   | Personenbezogene Daten gehen an eine Rolle, der das passende Recht fehlt. Vor einem produktiven Einsatz beheben. |
| Important  | Echter Fehler mit begrenzter Wirkung, oder eine Pflicht, die sich umgehen lässt. Bald beheben.                   |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                     |

Code-Reviewer und Security-Auditor haben keinen Befund als Critical eingestuft. C1 habe ich
hochgestuft, weil er die erste Frage dieses Reviews unmittelbar mit Nein beantwortet.

## Antworten auf die sechs Fragen

1. **Werden personenbezogene Daten nur mit passendem Recht gelesen?**
   - **In den Fachmodulen selbst ja.** Verzeichnis und Folgenabschätzung verlangen `privacy.read`,
     das nur ISMS-Leitung und Datenschutzbeauftragte haben.
   - **Über Nebenwege nein.** Der Auditor bekommt beim Verzeichnis 403, aber dieselben Inhalte über
     den Export, das Auditpaket und das Änderungsprotokoll (C1).
   - Kompetenzen, Schulungsergebnisse und Kontaktdaten aller Personen liest jede Rolle. Das ist so
     gewollt (`READ_ALL`), aber mehr, als die meisten Rollen brauchen (S1).
2. **Gilt „Schreibrecht nur für Eigenes“ bei Assets?**
   - Für das Bearbeiten eines fremden Assets ja: Jede Methode ruft `assertCan` mit dem bisherigen
     Eigentümer auf, der Test in `risks.e2e.test.ts:90-107` belegt es.
   - **Aber geprüft wird nur der Zustand vorher, nicht der Zustand danach.** Wer nur `_own` hat, kann
     sein Asset einer anderen Person übertragen, es mit fremden Assets verknüpfen (I4) und es
     löschen, wobei es aus fremden Risiken, freigegebenen BIAs und Verarbeitungen verschwindet (I3).
3. **Erreichen Nutzereingaben SQL-Abfragen ungeschützt?**
   - **Nein.** Alle Werte in der Protokollsuche, den SoA-Listen und den übrigen Filtern sind als
     Parameter gebunden. `sql.raw` kommt nur mit Konstanten vor, der einzige Bezeichner
     (`ai-systems.service.ts:280`) stammt aus einer festen Liste. ORDER BY ist immer konstant.
   - Ungültige Werte (`limit=abc`, falsche UUID, unbekannter Status) führen aber zu 500 statt 400
     (S3).
4. **Stimmt die KI-Einstufung mit `packages/shared/src/ai.ts` überein?**
   - **Ja, vollständig.** Der Security-Auditor hat alle 1.152 Kombinationen der Antworten in
     `ai_system` eingefügt und die erzeugten Spalten mit `packages/shared/src/ai.ts` und mit der
     Kopie `apps/web/src/lib/ai.ts` verglichen: keine Abweichung.
   - Der vorhandene Test deckt davon nur einen kleinen Teil ab, die Stufe „begrenzt“ und beide
     Ausnahmen gar nicht, die Web-Kopie überhaupt nicht (I8).
   - Abweichend ist nur die Pflichtenliste eines stillgelegten Systems (S5).
5. **Ist `requirement_in_scope` korrekt?**
   - **Ja.** Die Fassung in `0015_addressee_and_ai_register.sql:21-53` ist eine korrekte
     Erweiterung von 0010. Jede in CLAUDE.md genannte Stelle ruft sie auf (Tabelle unten).
   - Die Funktion läuft ohne SECURITY DEFINER, RLS gilt also auch für die Nachschlagetabellen.
   - Zwei Stellen rechnen an ihr vorbei: die Kennzahl `avg_maturity` (S7) und die Pflichtenliste
     eines stillgelegten KI-Systems (S5).
6. **Ist der Demo-Seed in Produktion sicher ausgeschlossen?**
   - **Nein.** Die Sperre sitzt nur im Kommandozeilenaufruf und prüft nur `NODE_ENV=production`.
   - Die Compose-Datei setzt für den Migrationsbehälter `NODE_ENV=development` und spielt die
     Demodaten standardmäßig ein. Wer die Datei als Vorlage für einen Server nimmt und
     `ISMS_SEED_DEMO=false` vergisst, hat fünf Konten mit veröffentlichtem Kennwort, darunter die
     ISMS-Leitung (I6).

## Critical

### C1 Auditor liest Verzeichnis und Folgenabschätzung ohne `privacy.read`

- **Wo:**
  - `apps/api/src/modules/exports/exports.controller.ts:43-53`: Die Exporte
    `processing-activities.csv` und `.html` verlangen nur `report.export`.
  - `apps/api/src/modules/exports/exports.controller.ts:65-66`: Das Auditpaket verlangt ebenfalls
    nur `report.export`. Es enthält `09-datenschutz/verarbeitungsverzeichnis` und
    `folgenabschaetzungen` mit Beschreibung, Risiken, Maßnahmen und Stellungnahme
    (`package.service.ts:114`, `:615`, `:636-637`, `:652`).
  - `apps/api/src/kernel/audit-log/audit-log.interceptor.ts:86`: Das Protokoll speichert jeden
    Anfragetext als `diff`. `GET /audit-log` liefert damit den vollen Text jeder Folgenabschätzung.
  - Die Rolle Auditor hat `report.export` und `auditlog.read`, aber nicht `privacy.read`
    (`packages/shared/src/permissions.ts:233-245`).
- **Nachweis (Testskript):** Der Auditor bekommt 403 auf `GET /processing-activities` und
  `GET /processing-activities/:id/dpia`, aber 200 auf beide Exporte, auf das Auditpaket mit dem
  Beschreibungstext der Folgenabschätzung, und auf `GET /audit-log?entityType=processing-activities`
  mit Beschreibung, Risiken und Maßnahmen im Feld `diff.request`.
- **Folge:** Die Trennung zur Rolle der Datenschutzbeauftragten, die CLAUDE.md vorsieht, ist
  aufgehoben. Ein externer Auditor sieht Gesundheitsdaten-Verarbeitungen und deren Risikoanalyse.
- **Behebung:**
  - Beide Verzeichnis-Exporte zusätzlich an `privacy.read` binden.
  - Den Kontext an `AuditPackageService.build` übergeben und `09-datenschutz` nur mit
    `privacy.read` aufnehmen.
  - In `AuditLogService.list` das Feld `diff` leeren, wenn dem Aufrufer das Leserecht des
    Eintragstyps fehlt (mindestens Verarbeitungen, Kompetenzen, Schulungen).
  - Tests für 403 beim Lesen je Rolle ergänzen (siehe Tests, T1).

## Important

### I1 Jede Rolle bestätigt die Schulungsteilnahme anderer Personen, auch rückdatiert

- **Wo:**
  - `apps/api/src/modules/competence/competence.controller.ts:178-179`: `POST /trainings/:id/complete`
    verlangt nur `training.read`, das jede Rolle über `READ_ALL` hat.
  - `apps/api/src/modules/competence/trainings.service.ts:139`: `dto.personId ?? ctx.personId`.
    Ob eine fremde `personId` nur mit `training.write` erlaubt ist, wird nicht geprüft.
  - `trainings.service.ts:148-152`: Das Update überschreibt ein bereits gesetztes `completedAt`,
    das Datum ist frei wählbar.
- **Nachweis:** Der Risk-Owner bestätigt für einen Kollegen Teilnahme am 01.01.2020 mit 100 Punkten: 201. Danach überschreibt der Auditor dieselbe Zeile mit Datum 2099 und 0 Punkten: 201.
- **Folge:** Der Nachweis zu Kap. 7.2/7.3 und A.6.3 zeigt Teilnahmen, die nie stattfanden. Wer
  bestätigt hat, steht nur im Protokoll. Der Kommentar in `competence.controller.ts:177` („für sich
  selbst genügt das Leserecht“) beschreibt die Absicht, der Code setzt sie nicht um.
- **Behebung:** Bei abweichender `personId` `assertCan(ctx, P.TRAINING_WRITE)`. Eine bestätigte
  Teilnahme ohne `training.write` nicht überschreiben (409). Datum in der Zukunft ablehnen.

### I2 Teilnahme- und Kompetenznachweis heftet jede Datei des Mandanten an

- **Wo:** `apps/api/src/modules/competence/trainings.service.ts:147` und
  `apps/api/src/modules/competence/competence.service.ts:143` prüfen mit `requireTenantFile` nur
  den Mandanten. Der Dateiname geht an jede Rolle mit `training.read` (`trainings.service.ts:53`).
- **Nachweis:** Die ISMS-Leitung lädt `Kuendigungsliste-Geheim.pdf` hoch. Der Risk-Owner bestätigt
  seine eigene Schulung mit dieser Datei als Nachweis: 201. Der Auditor sieht den Dateinamen. Das
  Löschen der Datei scheitert danach mit 409 „Die Datei ist noch verknüpft“.
- **Folge:** Jede Rolle kann Dateinamen offenlegen und das Löschen einer Datei dauerhaft
  blockieren, auch wenn die Löschung datenschutzrechtlich geboten ist.
- **Behebung:** Ohne `training.write` bzw. `competence.write` nur Dateien annehmen, die der
  Aufrufer selbst hochgeladen hat.

### I3 Wer ein eigenes Asset löscht, entfernt es still aus fremden Nachweisen

- **Wo:** `apps/api/src/modules/assets/assets.service.ts:136-142` löscht nach Prüfung des
  bisherigen Eigentümers, `asset.write_own` genügt. `risk_asset`, `bia_resource`,
  `processing_asset`, `incident_asset` und `asset_relation` verweisen mit `ON DELETE cascade`
  (`packages/db/migrations/0000_init.sql:1169`, `:1206`, `:1219`, `:1246`).
- **Nachweis:** Der Risk-Owner löscht sein Asset (204), an dem ein Risiko der ISMS-Leitung, eine
  freigegebene BIA und eine Verarbeitung hängen. Danach: Risiko mit `assets: []`, BIA weiter
  `approved` mit 0 Ressourcen, Verarbeitung mit `assets: []`.
- **Folge:** Eine freigegebene BIA behält ihre Vier-Augen-Freigabe, obwohl CLAUDE.md verlangt, dass
  jede inhaltliche Änderung sie auf Entwurf setzt. Der Auditor verliert die Verbindung zwischen
  Risiko und Asset, ohne dass irgendwo eine Spur bleibt.
- **Behebung:** Löschen mit 409 ablehnen, solange Verweise bestehen, und stattdessen
  `status = 'retired'` anbieten, so wie Personen nur deaktiviert werden. Löschen nur mit vollem
  `asset.write` erlauben.

### I4 `_own` prüft beim Asset den neuen Eigentümer und das Ziel einer Verknüpfung nicht

- **Wo:**
  - `apps/api/src/modules/assets/assets.service.ts:128` prüft nur `existing.ownerPersonId`;
    `toColumns` übernimmt `ownerPersonId` und `custodianPersonId` ungeprüft aus dem DTO (`:180-181`).
  - `assets.service.ts:145-156`: `link` prüft nur den Eigentümer des Ausgangs-Assets.
  - Es gibt keine Route, um eine Verknüpfung wieder zu lösen.
- **Nachweis:** `PATCH ownerPersonId` auf eine andere Person: 200, danach ist der Risk-Owner selbst
  ausgesperrt. `ownerPersonId: null`: 200, das Asset ist verwaist. Verknüpfung auf ein fremdes Asset:
  204, die Abhängigkeit erscheint beim fremden Asset. `DELETE /assets/:id/relations`: 404.
- **Folge:** Verantwortung (A.5.9) und Erinnerungsmails wandern zu jemandem, der nie zugestimmt hat.
  Eine falsche Verknüpfung kann niemand mehr entfernen.
- **Behebung:** Ohne `asset.write` muss das neue `ownerPersonId` fehlen oder gleich
  `ctx.personId` sein. Für `link` auch das Ziel prüfen. Eine Route zum Lösen ergänzen.

### I5 Die Stellungnahme zur Folgenabschätzung lässt sich umgehen und nachträglich ändern

- **Wo:**
  - `apps/api/src/modules/privacy/dpia.service.ts:154`: Die Trennung greift nur, wenn die
    Verarbeitung eine verantwortliche Person hat und das Konto mit einer Person verknüpft ist.
  - `dpia.service.ts:147`: Abgelehnt wird nur der Status `draft`. Eine Stellungnahme zu einer bereits
    freigegebenen Folgenabschätzung wird angenommen.
  - `processing.service.ts:131`: Ein Wechsel der verantwortlichen Person berührt die
    Folgenabschätzung nicht.
  - Anders als bei den übrigen Vier-Augen-Regeln gibt es keinen Datenbank-Trigger.
- **Nachweis:**
  - Ohne verantwortliche Person erstellt, legt vor und genehmigt die Datenschutzbeauftragte selbst:
    201, `approved`.
  - Verantwortung auf eine andere Person, Stellungnahme, Verantwortung zurück: Die Freigabe bleibt.
  - Eine zweite Stellungnahme mit `rejected` auf eine freigegebene Abschätzung: 201, Ergebnis jetzt
    `status approved, result rejected`. Umgekehrt wird eine Ablehnung ohne neue Vorlage zur Freigabe.
- **Behebung:**
  - Vor der Vorlage eine verantwortliche Person verlangen; fehlt sie, ablehnen.
  - Stellungnahme nur im Status `in_review` annehmen.
  - Bei Wechsel der verantwortlichen Person eine gegebene Stellungnahme zurücknehmen.
  - Wer vorgelegt hat, speichern und eine Stellungnahme derselben Person ablehnen, zusätzlich
    `assert_distinct_actor` als Trigger.
  - Der Test `privacy.e2e.test.ts:346-366` beschreibt den Wechsel der Verantwortung durch die
    Datenschutzbeauftragte selbst als vorgesehenen Weg. Er ist mit der Behebung anzupassen.

### I6 Demodaten mit veröffentlichtem Kennwort sind in der Compose-Installation voreingestellt

- **Wo:**
  - `docker-compose.yml:74-75`: Der Behälter `migrate` läuft mit `NODE_ENV: development` und
    `SEED_DEMO: ${ISMS_SEED_DEMO:-true}`; `:83` spielt `demo-seed.js` ein.
  - `apps/api/src/demo-seed.ts:99`: Die Sperre steht nur in `main()` und prüft nur den Wert
    `production`.
  - `demo-seed.ts:119`: `seedDemoTenant` hat keine Sperre, nur die Prüfung auf Wiederholung.
  - Das Kennwort steht im Quelltext (`demo-seed.ts:69`).
- **Folge:** Wer die Compose-Datei wie beschrieben für einen einzelnen Server nutzt, die Geheimnisse
  setzt und `ISMS_SEED_DEMO=false` vergisst (erwähnt nur in `docs/deployment.md:230`), hat fünf
  Konten mit bekanntem Kennwort, darunter die ISMS-Leitung mit Benutzerverwaltung. Ohne gesetztes
  `NODE_ENV` gilt `development` (`apps/api/src/config/env.ts:24`), dann läuft auch
  `pnpm db:seed:demo` auf einem Server.
- **Behebung:** `ISMS_SEED_DEMO` standardmäßig `false`, Demodaten nur über ein eigenes Profil.
  Die Sperre in `seedDemoTenant` verlegen und an eine ausdrückliche Freigabe
  (`ALLOW_DEMO_SEED=true`) binden statt an `NODE_ENV`. Verwandt mit Review 01 C1 (voreingestelltes
  JWT-Geheimnis in derselben Datei).

### I7 Tests: kein einziger Lesezugriff auf Datenschutz- oder Kompetenzdaten wird mit 403 geprüft

- **Wo:** Die einzigen 403-Tests betreffen Schreibzugriffe: `privacy.e2e.test.ts:200` und `:375`,
  `competence.e2e.test.ts:225`. Der Risk-Owner aus `privacy.e2e.test.ts:72` liest nie.
- **Folge:** C1 und I1 konnten ohne roten Test entstehen. Siehe T1 bis T3.

### I8 Tests: der Vergleich der KI-Einstufung prüft nur zufällig vorhandene Zeilen

- **Wo:** `apps/api/test/ai-nis2.e2e.test.ts:255-282` vergleicht Datenbank und
  `packages/shared/src/ai.ts` nur für die Systeme, die frühere Tests angelegt haben.
  `packages/shared` hat keinen Test für `ai.ts` (`packages/shared/package.json:13` läuft mit
  `--passWithNoTests`). Die Web-Kopie `apps/web/src/lib/ai.ts` wird nie geprüft.
- **Folge:** Nie ausgeführt werden die Stufe „begrenzt“, `annex_i_product`, die Ausnahme nach
  Art. 6 Abs. 3, „verboten“ zusammen mit Anhang III und die Auslöser `ai_biometric` und
  `ai_deepfake`. Heute stimmt alles überein (siehe Frage 4), aber eine Abweichung fiele nicht auf.
- **Behebung:** Siehe T5.

## Suggestion

- **S1 Personendaten gehen an jede Rolle, auch an externe Auditoren.**
  - `GET /persons` (`context.controller.ts:46-47`) liefert E-Mail, Abteilung und Funktion.
  - `GET /members` liefert E-Mails und Rollen.
  - Kompetenzmatrix, Lücken, abgelaufene Nachweise und je Person die Schulungspunkte
    (`trainings.service.ts:51-55`) gehen über `READ_ALL` an alle.
  - Für die Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO, § 26 BDSG) die Punkte nur mit
    `training.write` oder an die betroffene Person ausgeben, und der Personenauswahl ohne
    `context.write` nur `id` und Namen liefern.
- **S2 Erneutes Aktivieren der Hauptnorm entzieht ihr den Hauptstatus.**
  `catalog.service.ts:58-64` setzt beim Upsert `isPrimary: dto.isPrimary`, der DTO-Standard ist
  `false`. Nachweis: `POST /frameworks/activate {frameworkKey:'ISO27001'}` auf die aktive Hauptnorm,
  danach ist keine Hauptnorm mehr gesetzt und ISO 27001 lässt sich deaktivieren (204). CLAUDE.md
  verlangt, diesen Zustand abzulehnen. Nur die Oberfläche verhindert ihn. Ein Katalog ohne prüfbare
  Anforderungen wird serverseitig ebenfalls nicht abgelehnt.
- **S3 Ungültige Suchparameter führen zu 500.**
  - `auditlog.controller.ts:36-37`: `Number('abc')` ergibt `NaN`, das `Math.min/Math.max` in
    `auditlog.service.ts:47` übersteht und in `LIMIT` landet.
  - `auditlog.service.ts:96-99`: falsche UUID oder falsches Datum scheitern am Cast.
  - Ebenso `GET /assets?status=…` (`assets.service.ts:26-28`), `GET /soa?kind=…`
    (`soa.service.ts:83`) und `GET /processing-activities?status=…` (`processing.service.ts:48`).
  - Es dringt nichts nach außen, die Antwort ist allgemein. Abfragen mit einem Zod-Schema prüfen.
  - Nebenbei: In `assets.service.ts:29` und der Suche in `processing.service.ts` wirken `%` und `_`
    als Platzhalter. Das ist harmlos.
- **S4 Ein stillgelegtes KI-System zeigt weiter Pflichten.** `ai-systems.service.ts:166` filtert mit
  `aiTriggers` ohne Blick auf den Status, `requirement_in_scope` schließt stillgelegte Systeme aus
  (`0015_addressee_and_ai_register.sql:28`). Nachweis: Nach Stilllegung zeigt das System weiter
  Art. 4, Art. 5 und Art. 50 Abs. 4, die SoA ist leer.
- **S5 Art. 6 Abs. 3 ist unvollständig abgebildet.** Ein System nach Anhang III, das Profile
  natürlicher Personen erstellt, ist immer hochriskant. Das Register fragt nach Profiling nicht,
  die Ausnahme kann also ein Bewerbungssystem herabstufen, das Bewerbende profiliert. Fachliche
  Lücke, gegen den Verordnungstext noch zu bestätigen.
- **S6 Die Kennzahl „mittlerer Reifegrad“ rechnet am Geltungsbereich vorbei.**
  `kpis.service.ts:171-173` mittelt über alle `tenant_requirement`, auch über deaktivierte Normen,
  nicht modellierte Bausteine und `not_addressed`. Nachweis: Reifegrad 0 auf einer nicht
  modellierten Grundschutz-Anforderung und 5 auf einem ISO-Control ergibt 2,5. Das Dashboard
  rechnet richtig. `requirement_in_scope` und `tenant_framework` einbeziehen. Außerdem nimmt
  `PATCH /soa/:id` Reifegrade für Anforderungen außerhalb des Geltungsbereichs an.
- **S7 Kleine Lücken neben bekannten Befunden.**
  - `processing.service.ts:177-191`: `unlinkTom` entfernt auch die letzte TOM aus einer aktiven
    Verarbeitung. Gleiche Ursache wie der Befund aus Review 02 (aktive Verarbeitung lässt sich
    ungültig ändern).
  - `assets.service.ts:91/108`: Anlegen prüft `dto.ownerPersonId ?? ctx.personId`, speichert aber
    `?? null`. Der Risk-Owner kann sein eben angelegtes Asset danach nicht mehr bearbeiten. Gleiche
    Ursache wie Review 04 I9 bei Risiken und Maßnahmen.
  - `v_skill_gap` ohne `security_invoker` (Review 01/02) wird von `competence.service.ts:193`
    gelesen und bleibt damit relevant.

## Personendaten: wer liest was

| Endpunkt                                      | Daten                                   | Recht                            | Rollen mit Zugriff                 | Bewertung    |
| --------------------------------------------- | --------------------------------------- | -------------------------------- | ---------------------------------- | ------------ |
| `GET /persons`                                | Name, E-Mail, Abteilung, Funktion       | context.read                     | alle vier                          | zu weit (S1) |
| `GET /members`                                | E-Mail, Rollen, Status                  | tenant.members oder context.read | alle vier                          | zu weit (S1) |
| `GET /competence/matrix`, `/persons/:id`      | Stufen, Lücken, abgelaufene Nachweise   | competence.read                  | alle vier                          | zu weit (S1) |
| `GET /trainings/:id`                          | Teilnehmende, Punkte, überfällig        | training.read                    | alle vier                          | Punkte (S1)  |
| `POST /trainings/:id/complete`                | schreibt fremde Teilnahme               | training.read                    | alle vier                          | **I1**       |
| `GET /processing-activities*`, `/dpia`        | Betroffene, Empfänger, DSFA             | privacy.read                     | ISMS-Leitung, Datenschutz          | in Ordnung   |
| `GET /exports/processing-activities.*`, Paket | Verzeichnis, DSFA, Personen, Protokoll  | report.export                    | ISMS-Leitung, Auditor, Datenschutz | **C1**       |
| `GET /audit-log`                              | Handelnde, Anfragetext                  | auditlog.read                    | ISMS-Leitung, Auditor, Datenschutz | **C1**       |
| `GET /ai-systems/:id`                         | Verantwortliche, Aufsicht, Verarbeitung | ai.read                          | alle vier                          | vertretbar   |
| `GET /dashboard/summary`                      | nur Zahlen                              | context.read                     | alle vier                          | in Ordnung   |

## Assets: Schreibzugriffe

| Endpunkt                     | Stelle                   | Prüfung des Eigentümers                                  | Bewertung                                          |
| ---------------------------- | ------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| `POST /assets`               | `assets.service.ts:91`   | `dto.ownerPersonId ?? ctx.personId`, speichert `?? null` | bekannt, S7                                        |
| `PATCH /assets/:id`          | `assets.service.ts:128`  | nur bisheriger Eigentümer                                | **I4**                                             |
| `DELETE /assets/:id`         | `assets.service.ts:140`  | bisheriger Eigentümer                                    | **I3**                                             |
| `POST /assets/:id/relations` | `assets.service.ts:150`  | nur Ausgangs-Asset                                       | **I4**, keine Route zum Lösen                      |
| Guard `_own`                 | `permission.guard.ts:36` | jedes `p_own` passiert                                   | bekannt (01 I2), hier durch `assertCan` abgefangen |

## Nutzereingaben in SQL

| Stelle                                            | Eingabe                              | Bindung                                  | Bewertung                   |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------------- | --------------------------- |
| `auditlog.service.ts:91-100`                      | Typ, ID, Aktion, Person, von, bis    | Parameter, Casts `::uuid` / `::date`     | sicher, 500 bei Unsinn (S3) |
| `auditlog.service.ts:47-48`                       | limit, offset                        | Parameter, begrenzt, `NaN` rutscht durch | S3                          |
| `processing.service.ts:48-52`                     | Status, Rolle, Suche, Seite          | Parameter, Enum-Casts, `ILIKE`           | sicher, S3                  |
| `assets.service.ts:26-29`                         | Status, Kategorie, Einstufung, Suche | Drizzle `eq`/`ilike`                     | sicher, S3                  |
| `soa.service.ts:83`                               | kind                                 | Parameter `::requirement_kind`           | sicher, S3                  |
| `soa.service.ts:43`, `coverage-map.service.ts:50` | Normschlüssel                        | Drizzle `eq`, sonst 404                  | sicher                      |
| `catalog.service.ts:31`, `:122`                   | `:key`                               | Drizzle `eq`                             | sicher                      |
| `ai-systems.service.ts:280`                       | Tabellenname                         | `sql.identifier` aus fester Liste        | sicher                      |
| ORDER BY                                          | keine                                | immer konstant                           | sicher                      |

## KI-Einstufung: Datenbank, gemeinsames Paket, Oberfläche

| Regel           | SQL (`0014_busy_dust.sql:26-34`)                                                                                     | `packages/shared/src/ai.ts`        | `apps/web/src/lib/ai.ts` | Ergebnis                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | ------------------------------- |
| verboten        | `cardinality(prohibited_practices) > 0`                                                                              | `:21`                              | `:19`                    | gleich                          |
| hoch            | Anhang III ohne Ausnahme nach Art. 6 Abs. 3, oder Anhang I                                                           | `:22`                              | `:20`                    | gleich, Profiling fehlt (S5)    |
| begrenzt        | Emotion/Biometrie oder Deepfake/öffentlicher Text                                                                    | `:23`                              | `:21`                    | gleich                          |
| FRIA nötig      | nicht verboten, Anhang III ohne Ausnahme, nicht kritische Infrastruktur, öffentliche Stelle oder Kredit/Versicherung | `:28-35`                           | `:25-32`                 | gleich                          |
| Auslöser `ai_*` | `0015:26-36`, nur `status <> 'retired'`                                                                              | `aiTriggers` `:39-53`, ohne Status | entfällt                 | Abweichung bei stillgelegt (S4) |

Geprüft durch Einfügen aller 1.152 Kombinationen in `ai_system`: keine Abweichung zwischen den drei
Fassungen.

## `requirement_in_scope`: Regel und Aufrufer

Regel (`0015_addressee_and_ai_register.sql:21-53`):

- `not_addressed` ergibt falsch.
- `ai_*` verlangt ein nicht stillgelegtes System des Mandanten, das die Pflicht auslöst.
- Ein Baustein verlangt eine Zeile in `tenant_module`.
- Eine Anforderung unter einem Baustein zählt bei Stufe leer oder `basis` immer, bei `standard`
  außer in der Variante `basis` (`kern` zählt wie Standard), bei `erhoeht` nur mit
  `tm.elevated`, unabhängig von der Variante.
- Alles andere ergibt wahr. Eine unbekannte Anforderung ergibt NULL und zählt damit nicht.
- Die Funktion sagt nichts über die Aktivierung einer Norm. Das müssen die Aufrufer über
  `tenant_framework` lösen.

| Aufrufer laut CLAUDE.md | Stelle                                                             | nutzt die Funktion            |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------- |
| SoA-Liste und Kapitel   | `soa.service.ts:82`, `:160`                                        | ja                            |
| Dashboard-Abdeckung     | `dashboard.service.ts:32`                                          | ja                            |
| Kennzahl Abdeckung      | `kpis.service.ts:163`                                              | ja, `avg_maturity` nicht (S6) |
| Exporte und Auditpaket  | `exports.service.ts:82`, `package.service.ts:104-105`              | ja                            |
| Zuordnungsvorschläge    | `measures.service.ts:261`                                          | ja                            |
| Anforderungsauswahl     | `catalog.service.ts:140`                                           | ja (Kennzeichen)              |
| `v_audit_coverage`      | `0010:93`                                                          | ja                            |
| Cockpit                 | `coverage-map.service.ts:64`, `:87`, `:98`, `:113`, `:128`, `:136` | ja                            |
| Modellierung, Zählungen | `modeling.service.ts:47`, `catalog.service.ts:28`                  | ja                            |

## Demo-Seed in Produktion

| Weg                                  | Sperre                                                    | Ergebnis                    |
| ------------------------------------ | --------------------------------------------------------- | --------------------------- |
| `pnpm db:seed:demo` mit `production` | `demo-seed.ts:99`                                         | abgelehnt                   |
| `pnpm db:seed:demo` ohne `NODE_ENV`  | Standard `development` (`env.ts:24`)                      | läuft                       |
| Compose-Behälter `migrate`           | `NODE_ENV: development`, `SEED_DEMO` standardmäßig `true` | läuft (I6)                  |
| Direkter Aufruf `seedDemoTenant`     | keine (`demo-seed.ts:119`)                                | läuft, Test prüft das nicht |

## Tests

Ausgeführt am 12.10.2026 gegen die Testdatenbank, alle grün:

| Datei                    | Tests | Dauer  |
| ------------------------ | ----- | ------ |
| `privacy.e2e.test.ts`    | 20    | 7,7 s  |
| `competence.e2e.test.ts` | 20    | 6,9 s  |
| `context.e2e.test.ts`    | 18    | 6,9 s  |
| `planning.e2e.test.ts`   | 11    | 6,2 s  |
| `risks.e2e.test.ts`      | 17    | 6,9 s  |
| `ai-nis2.e2e.test.ts`    | 18    | 8,1 s  |
| `mapping.e2e.test.ts`    | 23    | 11,6 s |
| `auditlog.e2e.test.ts`   | 9     | 6,8 s  |
| `demo-seed.e2e.test.ts`  | 7     | 12,2 s |
| `@isms/shared`           | 3     | 0,5 s  |

Zusammen 146 Tests ohne Fehler. SoA und Modellierung haben keine eigene Datei, sie stecken in
`mapping.e2e.test.ts:218-500`.

### Fehlende Tests

- **T1 (zu C1):** In `privacy.e2e.test.ts` einen Block „Lesezugriff“: Auditor und Risk-Owner
  bekommen 403 auf Liste, Detail, Folgenabschätzung und beide Exporte, ISMS-Leitung und
  Datenschutz 200. In `audit-package.e2e.test.ts` als Auditor: kein Eintrag unter
  `09-datenschutz/`. In `auditlog.e2e.test.ts`: Ein Merkwort aus dem Text der Folgenabschätzung darf
  in der Antwort an den Auditor nicht vorkommen.
- **T2 (zu I1, I2):** In `competence.e2e.test.ts`: Risk-Owner bestätigt für eine andere Person,
  erwartet 403, und die Zeile bleibt unverändert. Zweite Bestätigung überschreibt die erste nicht.
  Fremde Datei als Nachweis wird abgelehnt.
- **T3 (zu I3, I4):** In `risks.e2e.test.ts`: Löschen eines Assets mit Risiko, freigegebener BIA und
  Verarbeitung durch den Risk-Owner ergibt 403 oder 409, die Verweise bleiben. Eigentümerwechsel
  auf andere Person oder `null` ergibt 403. Verknüpfung auf fremdes Asset ergibt 403. Anlegen ohne
  `ownerPersonId` speichert den Aufrufer.
- **T4 (zu I5):** In `privacy.e2e.test.ts`: Stellungnahme ohne verantwortliche Person wird
  abgelehnt; Wechsel der Verantwortung nach Freigabe setzt auf Entwurf zurück; zweite Stellungnahme
  ergibt 409.
- **T5 (zu I8):** Neue Datei `packages/shared/src/ai.test.ts` mit vollständiger Wahrheitstabelle,
  die `packages/shared/src/ai.ts` mit `apps/web/src/lib/ai.ts` vergleicht. In
  `ai-nis2.e2e.test.ts` statt der Schleife über vorhandene Zeilen dieselbe Tabelle in einer
  zurückgerollten Transaktion einfügen und die erzeugten Spalten vergleichen, dazu `aiTriggers`
  gegen `requirement_in_scope` für alle fünf `ai_*`.
- **T6 (zu I6):** In `demo-seed.e2e.test.ts`: `seedDemoTenant` mit `NODE_ENV=production` muss
  scheitern. Schlägt heute fehl.
- **T7 (zu S2, S3, S4, S6):** Hauptnorm bleibt nach erneutem Aktivieren Hauptnorm; ungültige
  Suchparameter ergeben 400 (`it.each` je Modul); stillgelegtes KI-System hat keine Pflichten;
  `avg_maturity` bleibt bei Reifegrad außerhalb des Geltungsbereichs gleich.
- **T8 (`requirement_in_scope`):** ungeprüft sind die Variante `kern`, ein Mandant ohne Zeile in
  `tenant_framework`, Stufe leer unter einem Baustein, `erhoeht` bei Variante `basis`,
  `ai_biometric`, `ai_deepfake` und ein KI-System eines anderen Mandanten.

### Qualität der vorhandenen Tests

- **Reihenfolge:** Die Tests einer Datei teilen veränderliche Variablen und bauen aufeinander auf.
  Beispiele: `ai-nis2.e2e.test.ts:316` legt alle Hochrisiko-Systeme still, `:266` braucht mehr als
  vier vorher angelegte Zeilen, `mapping.e2e.test.ts:356` deaktiviert ISO 27001 für alle folgenden
  Tests. Ein einzelner Test mit `-t` läuft daher nicht verlässlich.
- **Feste Daten:** `risks.e2e.test.ts:241` (`2027-07-13`), `competence.e2e.test.ts:276`
  (`2027-06-30`), `context.e2e.test.ts:283` (`2026-12-31`) und `planning.e2e.test.ts:123`
  (`2027-01-15`) werden mit der Zeit zu vergangenen Daten. `inDays()` aus `apps/api/test/setup.ts`
  ist dafür vorhanden.
- **Mitternacht:** `auditlog.e2e.test.ts:154` und `:161` bilden „heute“ und „morgen“ in UTC, die
  Abfrage castet `::date` in der Zeitzone der Datenbanksitzung. Kurz nach Mitternacht kann das
  kippen, wenn die Datenbank nicht in UTC läuft.

## Was gut gelöst ist

1. Alle Abfragen in diesen Modulen binden Nutzereingaben als Parameter.
2. Der Geltungsbereich ist eine einzige SQL-Funktion, und jede in CLAUDE.md genannte Stelle nutzt
   sie, auch die verschachtelten Zählungen im Cockpit.
3. Die KI-Einstufung liegt als erzeugte Spalte in der Datenbank und stimmt in allen 1.152
   Kombinationen mit beiden TypeScript-Fassungen überein.
4. Die Protokollabfrage ist begrenzt (höchstens 500), immer nach Mandant gefiltert und konstant
   sortiert.
5. `privacy.write` hat nur die Datenschutzbeauftragte, die ISMS-Leitung kann lesen, aber keine
   Stellungnahme abgeben (`privacy.e2e.test.ts:370-376`).
6. `AiSystemPatchDto` setzt beim Ändern keine Standardwerte, und die Prüfung rechnet die Einstufung
   aus der zusammengeführten Zeile neu. Ein Ändern kann also nicht mit einer veralteten Einstufung
   aktivieren.
