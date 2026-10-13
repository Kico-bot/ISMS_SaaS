# Bestätigte Befunde aus den Reviews 01 bis 07

Stand: 13.10.2026, Branch `main` (Commit `e899279`). Am Code wurde nichts geändert.

**Was hier steht:** Jeder Critical- und Important-Befund aus `docs/review/01` bis `07` wurde gegen
den tatsächlichen Code nachgeprüft:

- Fundstellen mit `sed`/`grep` gelesen
- an einzelnen Stellen mit eigenen Proben nachgestellt:
  - Node-Stream ohne Fehler-Listener
  - archiver mit fehlender Datei
  - Deflate mit Klartext
  - Testlauf von `auditlog.e2e.test.ts` mit Auswertung der IP-Spalte

Ergebnis:

- **Geprüft:** 74 Befunde (11 Critical, 63 Important).
- **Echt in der beschriebenen Form:** 70. Vier davon sind heute nur mit SQL-Zugriff (S3-21 bis
  S3-23) oder gar nicht auslösbar (S3-24) und stehen deshalb in Stufe 3.
- **Echt, aber in einem Teil falsch oder überzeichnet:** 4 Berichtsbefunde in 3 Sachverhalten
  (Abschnitt „Fehlalarme und Teilfehlalarme“).
- **Ganz falsch:** keiner.

Inhaltlich gleiche Befunde aus mehreren Berichten sind zu einem Eintrag zusammengefasst; die
Herkunft steht jeweils in der Spalte „aus“. Es bleiben 59 nummerierte Einträge, dazu eine Tabelle
der Tests.

**Neu eingestuft:** Die Stufen richten sich nach der konkreten Auslösbarkeit, nicht nach der
Einstufung im Einzelbericht:

- 04 C1, C2 und C3 (Critical) stehen in Stufe 2: Sie verfälschen Nachweise, öffnen aber keine
  Mandantengrenze und lassen nichts abfließen.
- 06 I6 (Important) steht in Stufe 1: Die Compose-Datei spielt die Demodaten standardmäßig ein.

**Sortierung nach Dringlichkeit:**

| Stufe | Bedeutung                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| 1     | Vor jedem echten Einsatz beheben: Mandantengrenze, Kontoübernahme, Absturz, Abfluss, verpasste Meldefrist. |
| 2     | Das Vier-Augen-Prinzip oder ein Nachweis lässt sich über die API aushebeln, ohne Datenbankzugriff.         |
| 3     | Echter Fehler mit begrenzter Wirkung, oder nur mit SQL-Zugriff auf `isms_app` auslösbar.                   |
| 4     | Oberfläche und Bedienbarkeit.                                                                              |

Innerhalb einer Stufe steht der wirksamste Befund oben. Die Kennung `S1-03` heißt Stufe 1, Eintrag 3.

## Stufe 1: vor jedem echten Einsatz

| Nr.   | Befund                                                                             | aus          | Wo                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-01 | Zugriffstoken für fremde Mandanten fälschbar mit dem Standardschlüssel aus Compose | 01 C1        | `docker-compose.yml:30-32`, `apps/api/src/kernel/auth/jwt.guard.ts:35-45`, `permission-cache.service.ts:52-61`                              |
| S1-02 | Konto einer eingeladenen Person durch einen fremden Mandanten übernehmbar          | 01 C2        | `apps/api/src/kernel/tenancy/members.service.ts:75-90`, `:128`; `apps/api/src/kernel/auth/auth.service.ts:165-177`                          |
| S1-03 | Postausgang der Mails für jeden Mandanten lesbar                                   | 05 C1        | `apps/api/src/kernel/mail/mail.service.ts:39`, `:86-87`; `notifications.controller.ts:39-42`                                                |
| S1-04 | Ein Lesefehler einer Datei beendet den API-Prozess                                 | 03 C1        | `apps/api/src/modules/files/files.controller.ts:73`; `package.service.ts:184-185`                                                           |
| S1-05 | Auditor liest Verarbeitungsverzeichnis und DSFA ohne `privacy.read`                | 06 C1, 03 I6 | `exports.controller.ts:43-53`, `:65-66`; `package.service.ts:114`, `:615-652`; `audit-log.interceptor.ts:76`, `:86`                         |
| S1-06 | Meldefristen gehen an niemanden, stehen zu spät und zuletzt in der Fristenliste    | 05 C2        | `deadlines.service.ts:114-119`, `:158-159`; `notifications.service.ts:75`                                                                   |
| S1-07 | „Bestätigt“, „akzeptiert“, „freigegeben“ lassen sich direkt als Status setzen      | 02 C1        | `packages/shared/src/dto.ts:181`, `:188`, `:233`, `:239`, `:357`, `:575`; `measures.service.ts:101`, `:128`; `risks.service.ts:114`, `:141` |
| S1-08 | Demodaten mit veröffentlichtem Kennwort in der Compose-Installation voreingestellt | 06 I6        | `docker-compose.yml:74-75`, `:83`; `apps/api/src/demo-seed.ts:69`, `:99`, `:119`                                                            |

**S1-01 Token fälschen.** Wie es konkret auftritt:

1. Ein Betreiber startet `docker compose up` ohne `ISMS_JWT_SECRET`. Die API läuft dann mit
   `NODE_ENV: production` und dem Schlüssel `docker-compose-entwicklungsschluessel-bitte-ersetzen`
   aus dem Repository.
2. Ein Angreifer registriert sich über `POST /auth/register` einen eigenen Mandanten.
3. Er signiert ein Token mit seiner eigenen `mid` und der Mandanten-ID des Opfers als `tid`.
4. `PermissionCacheService.load` lädt die Rechte nur über die Mitgliedschaft und vergleicht den
   Mandanten nie mit `tid`. Der Guard übernimmt `claims.tid` ungeprüft als Mandanten.
5. Jede Abfrage läuft unter dem Mandanten des Opfers, mit Rechten der ISMS-Leitung.

Voraussetzung: Die UUID des Opfermandanten ist bekannt. Auch ohne Standardschlüssel bleibt die
fehlende Prüfung `tid` gegen `mid` ein Fehler.

**S1-02 Kontoübernahme.**

1. Mandant A lädt `opfer@firma.example` ein. Das Konto steht mit Platzhalter-Kennwort in `user`.
2. Der Angreifer registriert Mandant B und lädt dieselbe Adresse ein. `invite` findet das
   vorhandene Konto (`members.service.ts:75-78`) und gibt den Einladungstoken an ihn zurück
   (`:128`).
3. `acceptInvite` sieht den Platzhalter und setzt das Kennwort des Angreifers
   (`auth.service.ts:165-172`).

Das Kennwort gilt danach plattformweit. Die echte Person kann die Einladung von A nur noch mit dem
Kennwort des Angreifers annehmen.

**S1-03 Postausgang.** `MailService.recent` ist ein Feld des prozessweiten Dienstes ohne
Mandantenbezug, `outbox()` gibt die letzten 20 Nachrichten zurück. Wer sich über `register` einen
Mandanten anlegt, ist dort ISMS-Leitung mit `tenant.settings`. `GET /notifications/outbox` liefert
ihm die Erinnerungsmails aller Mandanten mit Adresse und Titeln.

**S1-04 Absturz.** Belegt mit einer eigenen Probe: `fs.createReadStream('/fehlt').pipe(...)` ohne
Fehler-Listener und ebenso `archive.append(fs.createReadStream('/fehlt'))` enden beide mit
„Unhandled 'error' event“. Konkret tritt das auf:

- Eine Datei wird zwischen `exists()` und dem Öffnen gelöscht.
- Das Auditpaket öffnet bei einem Mandanten mit über 1.000 Dateien alle auf einmal (EMFILE).
- Das Speichervolume meldet einen Lesefehler.

Der Prozess endet für alle Mandanten.

**S1-05 Datenschutzdaten an den Auditor.** Die Rolle Auditor hat `report.export` und
`auditlog.read`, aber nicht `privacy.read`. Sie bekommt:

- auf `GET /processing-activities`: 403
- auf `GET /exports/processing-activities.csv`: 200
- im Auditpaket den Ordner `09-datenschutz` mit Verzeichnis und Folgenabschätzungen
- in `GET /audit-log` den vollen Anfragetext jeder DSFA im Feld `diff.request`

Gleiche Ursache wie 03 I6: Der Interceptor speichert den Rohinhalt der Anfrage.

**S1-06 Meldefristen.**

- Meldefristen tragen `NULL::uuid AS "ownerPersonId"` (`deadlines.service.ts:159`), und die
  Erinnerung überspringt Zeilen ohne Eigentümer (`notifications.service.ts:75`). Keine NIS2-,
  DSGVO- oder AI-Act-Frist wird je gemailt.
- `ro.due_at::date` und `"dueAt" - current_date` machen aus einer seit einer Stunde verpassten
  24-Stunden-Frist „heute fällig“.
- `ORDER BY "dueAt", severity DESC` sortiert den Text `critical` hinter `high` und `normal`.

**S1-07 Status direkt setzen.** `MeasureDto.status` enthält `verified`, `RiskDto.status` enthält
`accepted`, und die Services übernehmen den Wert. Die Trigger feuern nur, wenn
`verified_by_user_id` bzw. `accepted_by_user_id` gesetzt wird. Konkret:

- Ein Risk-Owner sendet `PATCH /measures/:id {"status":"verified"}` auf seine eigene Maßnahme.
- Abdeckung, Grundschutz-Check und Kennzahlen zählen sie danach als wirksam bestätigt, mit leerer
  bestätigender Person.
- Die Demodaten tun das selbst: `demo-seed.ts:984-990` legt eine Maßnahme mit
  `status: 'verified'` über `measures.create` an.

**S1-08 Demodaten.** Der Behälter `migrate` läuft mit `NODE_ENV: development` und
`SEED_DEMO: ${ISMS_SEED_DEMO:-true}`. Die Sperre gegen Produktion steht nur in `main()` und prüft
nur `NODE_ENV`. Wer die Compose-Datei als Server-Vorlage nutzt und `ISMS_SEED_DEMO=false` vergisst,
hat fünf Konten mit `demo-passwort-2026-nordlicht`, darunter eine ISMS-Leitung mit
Benutzerverwaltung.

## Stufe 2: Vier-Augen-Prinzip und Nachweise über die API aushebelbar

| Nr.   | Befund                                                                                                                  | aus                        | Wo                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-01 | Abgeschlossenes Audit nachträglich auf volle Abdeckung umschreibbar, auch durch die ISMS-Leitung                        | 02 I2, 04 C3               | `apps/api/src/modules/audit/audits.service.ts:108-152`; `0010_grundschutz_scope.sql:77-96`                                                     |
| S2-02 | Eigentümerin eines Prozesses löscht eine freigegebene BIA samt Plänen und Übungen                                       | 04 C1                      | `continuity/processes.service.ts:72-78`; `0000_init.sql:1202`, `:1210`                                                                         |
| S2-03 | Wer nur `_own` hat, löscht ein Asset und entfernt es still aus fremden Risiken, BIAs, Verarbeitungen                    | 06 I3                      | `assets/assets.service.ts:136-142`; `0000_init.sql:1169`, `:1206`, `:1219`, `:1246`                                                            |
| S2-04 | Nichtkonformität ohne wirksame Korrekturmaßnahme schließbar und bestätigbar                                             | 04 C2                      | `audit/findings.service.ts:134-157`, `:167-205`, `:208-221`                                                                                    |
| S2-05 | Eigentümerwechsel wird bei `_own` nicht geprüft und setzt keine Freigabe zurück                                         | 02 I1, 05 I3, 06 I4, 06 I5 | `measures.service.ts:120`, `:127`; `assets.service.ts:128`, `:180`; `risks.service.ts:133-147`; `0001_rls_triggers_views.sql:111`              |
| S2-06 | Bestätigungen für andere: Schulungen von jeder Rolle, Lesebestätigungen von der DSB, überschreibbar, ohne Urheber       | 06 I1, 04 I8               | `competence.controller.ts:178-179`; `trainings.service.ts:139`, `:148-152`; `documents.service.ts:306-315`                                     |
| S2-07 | Freigabe von Dokumentfassungen ohne Zustandsprüfung, alte Fassung wieder aktuell                                        | 04 I2                      | `documents/documents.service.ts:184-221`, `:166-177`                                                                                           |
| S2-08 | Freigegebene BIA bleibt freigegeben, obwohl Inhalt sich ändert; Ressourcen ohne Eigentumsprüfung entfernbar             | 04 I1, 04 I9 (Teil)        | `continuity/bia.service.ts:111-156`                                                                                                            |
| S2-09 | Notfallplan allein aktivierbar, auf Entwurf-BIA und mit „nicht bestanden“                                               | 04 I6                      | `continuity/plans.service.ts:69-99`, `:105-123`, `:169-201`                                                                                    |
| S2-10 | Risikoübernahme überlebt das vollständige Umschreiben des Risikos                                                       | 04 I3                      | `risks/risks.service.ts:128-160`, `:299-308`                                                                                                   |
| S2-11 | Bestätigte Maßnahmen und Verbesserungen bleiben änderbar, löschbar, neu zuordenbar, erneut bestätigbar                  | 04 I4                      | `measures.service.ts:112-167`, `:176-232`; `improvement/actions.service.ts:92-119`                                                             |
| S2-12 | Nachweise hinter bestätigten Feststellungen und Maßnahmen bleiben änderbar und lösbar                                   | 04 I5                      | `files/evidence.service.ts:66-90`, `:167-192`                                                                                                  |
| S2-13 | Stellungnahme zur DSFA umgehbar und nach der Freigabe überschreibbar                                                    | 06 I5                      | `privacy/dpia.service.ts:147`, `:154`; `processing.service.ts:131`                                                                             |
| S2-14 | Rolle Auditor bestätigt Verbesserungen jeder Herkunft, legt Managementbewertungen an, kann aber keine Nachweise anlegen | 04 I7                      | `packages/shared/src/permissions.ts:238-246`; `actions.service.ts:125-147`; `files.controller.ts:95-96`; `evidence.service.ts:239-246`         |
| S2-15 | Rechteprüfung akzeptiert `_own` für jedes Recht; Ablaufpläne und Dateilöschung ohne Eigentumsprüfung                    | 01 I2                      | `kernel/auth/permission.guard.ts:36`; `incidents/playbooks.controller.ts`; `files.controller.ts:76-79`                                         |
| S2-16 | Datensätze ohne Eigentümer: geprüft wird der Aufrufer, gespeichert `null`                                               | 04 I9, 06 S7               | `risks.service.ts:100/113`, `measures.service.ts:89/100`, `actions.service.ts:61/80`, `processes.service.ts:36/45`, `assets.service.ts:91/108` |
| S2-17 | Deaktivierte Personen behalten ihre `_own`-Rechte                                                                       | 04 I9 (Teil)               | `kernel/auth/auth.service.ts:289-295`                                                                                                          |
| S2-18 | Einladung hängt eine Person auf ein anderes Konto um und umgeht so die Trigger                                          | 01 I8                      | `kernel/tenancy/members.service.ts:119-123`                                                                                                    |
| S2-19 | Mitglied ändert die eigenen Rollen und entfernt die letzte ISMS-Leitung                                                 | 01 I4                      | `members.service.ts:132-153`; `members.controller.ts:27-32`                                                                                    |

**Wie die Einträge konkret auftreten:**

- **S2-01:** Die Auditorin schließt ein Audit über eine Anforderung ab. Danach sendet die
  ISMS-Leitung (`audit.write`) an dasselbe Audit `requirementIds` mit allen Anforderungen,
  `plannedTo` gestern und `reportFileId: null`: 200. Gesperrt ist nur `closed` zu einem anderen
  Status (`audits.service.ts:129`), und `closed` braucht keinen Bericht, nur `reported`
  (`:142`). `v_audit_coverage` zählt danach alle Kapitel als im Zyklus geprüft.
- **S2-02:** `remove` prüft `assertCan(ctx, P.CONTINUITY_WRITE, existing)`, `continuity.write_own`
  genügt. `bia.process_id` und `continuity_plan.bia_id` löschen per `ON DELETE cascade`. Ein
  Risk-Owner löscht seinen Prozess, und mit ihm verschwinden die von der ISMS-Leitung freigegebene
  BIA, der aktive Plan und jede Übung.
- **S2-03:** Ein Risk-Owner löscht „sein“ Asset (204). `risk_asset`, `bia_resource`,
  `processing_asset` und `incident_asset` kaskadieren. Die betroffene BIA bleibt dabei `approved`.
- **S2-04:**
  - `assertClosable` läuft nur, wenn im selben Aufruf `status: 'closed'` gesendet wird. Die
    Einstufung (`severity`) lässt sich danach frei ändern.
  - Eine Beobachtung wird geschlossen und danach zur Hauptabweichung hochgestuft, mit 0 Maßnahmen.
  - `verify` prüft weder Zahl noch Status der Maßnahmen.
- **S2-05:** Die Eigentumsprüfung beim Ändern gilt dem bisherigen Eigentümer. Der neue wird
  ungeprüft gespeichert. Daraus folgen:
  - **Selbstfreigabe über einen Umweg:** Eigentümer auf eine andere Person setzen, freigeben,
    zurücksetzen. Der Trigger sieht nur die Spalte der handelnden Person.
  - **Phishing:** Ein Risk-Owner schreibt einen Link in den Titel einer Maßnahme und weist sie
    einer externen Person zu. Die Erinnerungsmail geht vom ISMS-Absender an diese Person.
  - **DSFA:** Die DSB setzt die verantwortliche Person weg, gibt die Stellungnahme ab und setzt sie
    zurück.
- **S2-06:**
  - **Schulungen:** `POST /trainings/:id/complete` verlangt nur `training.read`, das jede Rolle hat.
    `dto.personId ?? ctx.personId` erlaubt fremde Personen. Das Update überschreibt ein gesetztes
    `completedAt` mit einem frei gewählten Datum.
  - **Lesebestätigungen:** Wer `document.write` hat, darf sie für andere abgeben, also auch die DSB
    (`permissions.ts:258`). Auch hier wird überschrieben.
  - Wer bestätigt hat, steht in keiner Spalte, nur im Protokoll.
- **S2-07:** `approve` verlangt weder den Status „eingereicht“ noch eine noch nicht freigegebene
  Fassung. Es setzt Freigabe und `currentVersionId` neu. Eine nie eingereichte oder ältere
  Fassung wird so veröffentlicht. Die Sperre gegen den Autor (CHECK) greift.
- **S2-08:** Nur `upsert` setzt die Freigabe zurück (`bia.service.ts:101`). `setImpact`,
  `setResource` und `removeResource` lassen sie stehen. `removeResource` ruft kein `assertCan`
  auf, und der Guard lässt `continuity.write_own` durch.
- **S2-09:** `update` prüft vor `active` nur, ob es eine Übung gab, nicht deren Ergebnis und nicht
  den Status der BIA.
- **S2-10:** Nur eine neue Bewertung mit anderen Werten hebt die Übernahme auf. Titel, Beschreibung,
  Assets und Maßnahmen bleiben frei änderbar. „Druckerpapier geht aus“ wird zu „Ransomware“ und
  bleibt bewusst getragen.
- **S2-11:**
  - `measures.verify` setzt `verified` ohne Statusprüfung und überschreibt eine frühere Bestätigung.
  - `update` und die Zuordnungen ändern eine bestätigte Maßnahme.
  - `remove` löscht sie mit Kaskade.
- **S2-12:** `evidence.update` und `remove` prüfen nur `assertEvidenceWriter`, nicht den Status der
  verknüpften Feststellung oder Maßnahme.
- **S2-13:**
  - Die Trennung greift nur, wenn eine verantwortliche Person gesetzt ist.
  - `recordOpinion` lehnt nur `draft` ab: Eine zweite Stellungnahme macht aus „freigegeben“ ein
    `approved` mit Ergebnis `rejected`, oder umgekehrt.
- **S2-14:** Belegt: Die Rolle Auditor hat `ACTION_VERIFY` ohne Bezug zur Herkunft und
  `AUDIT_WRITE`, das auch Managementbewertungen und Kennzahlen schreibt. `POST /evidence` verlangt
  `MEASURE_WRITE` im Guard, das die Auditorin nicht hat. Der Zweig `FINDING_WRITE` in
  `assertEvidenceWriter` wird nie erreicht. Auch ein Risk-Owner kommt durch den Guard
  (`measure.write_own`), scheitert aber an `assertEvidenceWriter`, weil dort ohne Datensatz
  geprüft wird.
- **S2-15:** Ein Risk-Owner (`continuity.write_own`, `measure.write_own`) erzeugt und aktiviert
  Ablaufpläne und löscht jede noch nicht verknüpfte Datei, auch fremde frische Uploads.
- **S2-16:** Ein Risk-Owner legt eine Maßnahme ohne `ownerPersonId` an (201). Danach kann er sie
  nicht mehr bearbeiten, und `assert_distinct_actor` steigt bei leerem Eigentümer ohne Prüfung aus.
- **S2-17:** Die Person wird bei der Sitzung ohne `is_active` ermittelt. Die ISMS-Leitung deaktiviert
  Rita als Person. Rita meldet sich neu an und ändert ihr Risiko weiter.
- **S2-18:** `invite` mit `personId` setzt `person.user_id` ohne Prüfung, ob die Person schon einem
  Konto gehört. Die ISMS-Leitung hängt die Person, der ein Risiko gehört, auf ein Wegwerfkonto und
  übernimmt das Risiko danach selbst.
- **S2-19:** `setRoles` bekommt die handelnde Person gar nicht übergeben. Die einzige ISMS-Leitung
  setzt sich selbst auf „Auditor“, danach verwaltet niemand mehr Mitglieder.

## Stufe 3: echter Fehler mit begrenzter Wirkung oder nur mit SQL-Zugriff

| Nr.   | Befund                                                                                                        | aus             | Wo                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| S3-01 | Abmelden und Sperren einer Token-Familie in 20 Sekunden umgehbar                                              | 01 I1           | `kernel/auth/auth.service.ts:207-222`, `:239-249`                                        |
| S3-02 | Änderungsprotokoll: Exporte und Anmeldungen entgehen ihm über Groß- und Kleinschreibung                       | 03 I1           | `kernel/audit-log/audit-log.interceptor.ts:24-30`, `:53`, `:106-107`                     |
| S3-03 | Änderungsprotokoll: IP fehlt bei allen Änderungen, hinter nginx stimmt sie nie                                | 03 I2           | `audit-log.interceptor.ts:87`; `app.factory.ts` ohne `trust proxy`                       |
| S3-04 | Änderungsprotokoll speichert ungeprüften Rohinhalt, unbegrenzt, nur oben geschwärzt                           | 03 I6           | `audit-log.interceptor.ts:76`, `:115-120`; `files.controller.ts:51`                      |
| S3-05 | Verweise auf Datensätze fremder Mandanten (Vorfall, Verbesserung)                                             | 05 I4, 04 Sugg. | `incidents/incidents.service.ts:141`, `:177`, `:238`; `actions.service.ts:59-90`         |
| S3-06 | Jede Datei des Mandanten als Schulungs- oder Kompetenznachweis anheftbar                                      | 06 I2           | `competence/trainings.service.ts:147`; `competence.service.ts:143`                       |
| S3-07 | API-Container kennt die Zugangsdaten des Tabelleneigentümers                                                  | 02 I5           | `docker-compose.yml:20-23`; `kernel/jobs/jobs.service.ts:23`                             |
| S3-08 | Veröffentlichte Ports binden an alle Schnittstellen, in der Entwicklung die Datenbank mit `postgres/postgres` | 07 I10          | `infra/docker/docker-compose.yml:7-11`, `:23-25`; `docker-compose.yml:140-141`           |
| S3-09 | Keine Sicherheits-Header für die Oberfläche, Swagger öffentlich                                               | 01 I9, 07 I9    | `infra/docker/nginx.conf:31-42`; `apps/api/src/app.factory.ts:16`, `:22`                 |
| S3-10 | Dateityp nur nach Angabe des Browsers geprüft; `scan.pdf.exe` als PDF                                         | 03 I3           | `files/files.service.ts:35-40`, `:154-164`                                               |
| S3-11 | Umlaute in Dateinamen werden beim Upload zerstört                                                             | 03 I9           | `files.controller.ts:51` (multer 2.2.0, busboy-Standard `latin1`)                        |
| S3-12 | Erinnerungen werden bei Wiederholung doppelt verschickt                                                       | 05 I6           | `apps/api/src/worker.ts:34-46`; `notifications.controller.ts:28-32`                      |
| S3-13 | Beginnzeitpunkte der Fristen unbegrenzt, erneutes Erfüllen verschiebt den Abschlussbericht                    | 05 I1           | `packages/shared/src/dto.ts:304`, `:314`, `:320`, `:850`; `incidents.service.ts:356-372` |
| S3-14 | Pflichten „unverzüglich“ verschwinden aus allen Listen                                                        | 05 I2           | `incidents/reporting-deadlines.ts:62`, `:118`; `deadlines.service.ts:162`                |
| S3-15 | Auditor kann keinen Vorfall melden                                                                            | 05 I7           | `incidents.controller.ts:55-56`; `permissions.ts:238-246`                                |
| S3-16 | CSV: Zelle mit Komma bleibt ungequotet, in Excel mit Komma-Trennzeichen entsteht eine Formel                  | 03 I5           | `apps/api/src/modules/exports/csv.ts:16-27`                                              |
| S3-17 | Mandant und Nachfolger eines Tokens nur im Prozessspeicher, wachsen unbegrenzt                                | 01 I7           | `auth.service.ts:320-322`, `:377-378`                                                    |
| S3-18 | Entzogene Rechte wirken auf anderen Instanzen erst nach bis zu fünf Minuten                                   | 01 I6           | `permission-cache.service.ts:33-38`; `members.service.ts:149-150`                        |
| S3-19 | `register` und `accept-invite` verraten Konten, Versuche unbegrenzt                                           | 01 I5           | `auth.service.ts:78-82`, `:168-171`                                                      |
| S3-20 | Kalendermonat in UTC: Abschlussbericht am Monatsende bis zu einer Stunde zu spät                              | 05 I5           | `incidents/reporting-deadlines.ts:39-47`                                                 |
| S3-21 | Jeder Mandant kann globale Rollen und SoD-Regeln ändern (nur mit SQL als `isms_app`)                          | 02 I3           | `0001_rls_triggers_views.sql:62-69`; `members.service.ts:168-185`                        |
| S3-22 | Vier-Augen-Trigger mit temporärer Tabelle aushebelbar (nur mit SQL als `isms_app`)                            | 02 I4           | `0001_rls_triggers_views.sql:108`, `:137`; `0005_audit_requirement_rls.sql:12`           |
| S3-23 | Änderungsprotokoll über Kaskaden löschbar und rückdatierbar (nur mit SQL als `isms_app`)                      | 02 I6           | `0000_init.sql:1251-1252`; `0001_rls_triggers_views.sql:194-200`                         |
| S3-24 | Deaktivierte Konten bleiben angemeldet (heute nicht auslösbar)                                                | 01 I3           | `auth.service.ts:127-136`, `:262-279`                                                    |

**Wie die Einträge konkret auftreten:**

- **S3-01:** Ein Tab erneuert R1 zu R2, die Person meldet sich fünf Sekunden später ab. `logout`
  sperrt nur Zeilen mit `revoked_at IS NULL`, R1 hat seinen Zeitpunkt schon von der Rotation. Wer R1
  hat, bekommt in der Gnadenfrist einen neuen, 30 Tage gültigen Token in derselben Familie.
- **S3-02:** `SKIP`, `LOGIN_PATHS` und der Präfix `/api/v1/exports/` vergleichen exakt, Express
  unterscheidet bei Routen nicht. `GET /api/v1/EXPORTS/audit-package.zip` lädt alles herunter und
  hinterlässt keinen Eintrag.
- **S3-03:** Eigene Probe: Nach `auditlog.e2e.test.ts` haben in der Testdatenbank `create` 0 von 3,
  `update` 0 von 2 und `export` 0 von 1 Einträgen eine IP. Nur `login` hat sie (3 von 3), weil die
  Anmeldung `req.ip` selbst früh liest.
- **S3-04:** `redact(req.body)` speichert den Inhalt vor der Zod-Prüfung mit allen unbekannten
  Feldern. Geschwärzt wird nur auf oberster Ebene. Ein Upload mit vielen Textfeldern erzeugt einen
  Eintrag von vielen Megabyte in einer Tabelle, die sich nicht löschen lässt. Dieselbe Ursache
  macht S1-05 möglich.
- **S3-05:** `assetIds`, `processingActivityIds` und die Herkunft einer Verbesserung werden ohne
  Nachschlagen im Mandanten eingefügt. Fremdschlüssel prüfen ohne Zeilensicherheit. Eine
  Datenpanne in A zeigt danach auf eine Verarbeitung aus B, und der Statuscode (201 gegenüber 422)
  verrät, ob eine UUID irgendwo existiert. Inhalte fließen nicht ab.
- **S3-06:** `requireTenantFile` prüft nur den Mandanten. Ein Risk-Owner heftet eine fremde Datei an
  seine eigene Schulung. Der Dateiname wird für alle sichtbar, und die Datei lässt sich nicht mehr
  löschen (409).
- **S3-07:** `x-db-env` gibt `DATABASE_URL_MIGRATOR` an `api`, `worker` und `migrate`, pg-boss
  nutzt es. Wer an die Umgebung der API kommt, hat eine Rolle ohne Zeilensicherheit.
- **S3-08:** Im Café- oder Büro-WLAN meldet sich jeder an der Entwicklungsdatenbank als Superuser an
  und liest im Mailpit jede Erinnerungsmail. Von Docker veröffentlichte Ports umgehen `ufw`.
- **S3-09:** `location /assets/` und `location /` setzen nur `Cache-Control`. Keine CSP, kein
  `frame-ancestors`, kein `nosniff`. `/api/docs` ist im Betrieb erreichbar.
- **S3-10:** Geprüft wird `input.mimetype` aus dem Multipart-Kopf. `scan.pdf.exe` als
  `application/pdf` geht durch und landet im Auditpaket als `15-dateien/<hash>-scan.pdf.exe`.
- **S3-11:** `FileInterceptor` ohne `defParamCharset`. Aus `Prüfbericht.pdf` wird
  `PrÃ¼fbericht.pdf`, in Register, Dateiverzeichnis und ZIP.
- **S3-12:** Ein Job geht alle Mandanten durch, ohne Protokoll der Sendungen. Liefert pg-boss den
  Job nach einem Neustart erneut aus, bekommen die schon bedienten Mandanten die Mail doppelt.
  `digest/send` lässt sich beliebig oft auslösen.
- **S3-13:** `fulfilObligation` lehnt ein zweites Erfüllen nicht ab. Ein zweites Erfüllen der
  72-Stunden-Meldung mit `fulfilledAt: 2030-01-01` schiebt den Abschlussbericht ins Jahr 2030.
- **S3-14:** `gdpr_art34` und `ai_provider_notice` werden mit `dueAt: null` gespeichert und von
  Fristenliste und Fristenmonitor herausgefiltert. Die Pflicht, den Anbieter eines KI-Systems sofort
  zu informieren, steht nur in der Detailansicht.
- **S3-15:** `POST /incidents` verlangt `incident.report` oder `incident.write`, die Rolle Auditor
  hat keins von beiden: 403.
- **S3-16:** Gequotet wird nur bei `"`, `;`, LF und CR, entschärft nur das erste Zeichen.
  `Backup,=1+1` bleibt stehen. Öffnet ein Auditor mit englischem Excel (Trennzeichen Komma) die
  Datei, wird `=1+1` als Formel ausgewertet. Die übrige Datei ist in dieser Einstellung ohnehin
  zerrissen, deshalb begrenzte Wirkung.
- **S3-17:** `tokenTenant` und `lastIssued` wachsen mit jeder Ausstellung und gehen beim Neustart
  verloren. Wer mehreren Mandanten angehört, bekommt danach beim Erneuern ein Token ohne `tid` und
  sieht 403 „Kein Mandant gewählt“.
- **S3-18:** Der Cache vergleicht die `pv` im Token mit der im Cache, nie mit der Datenbank. Die
  Invalidierung läuft lokal und vor dem Commit. Wirkt erst mit mehr als einer Instanz.
- **S3-19:** `register` antwortet bei bekannter Adresse und falschem Kennwort mit 409. Bei einem
  vorhandenen Konto prüft `accept-invite` das Kennwort, mit einem Token, den sich ein Angreifer
  selbst ausstellt. Beides ohne Begrenzung der Versuche.
- **S3-20:** `addMonths` rechnet mit `getUTCDate` und `setUTCMonth`. Meldung am 31.01.2027 um
  00:30 Uhr deutscher Zeit ergibt den 01.03.2027 um 00:30 Uhr statt den 28.02.
- **S3-21 bis S3-23:** Nur mit beliebigem SQL als `isms_app` auslösbar, etwa nach einer
  Einschleusung. Genau dafür sind Zeilensicherheit und Trigger als zweite Linie gedacht:
  - **S3-21:** Die Richtlinien auf `role` und `sod_rule` lassen mit `USING (tenant_id IS NULL OR …)`
    auch `UPDATE` und `DELETE` auf globale Zeilen zu.
  - **S3-22:** `SECURITY DEFINER SET search_path = public` ohne `pg_temp` sucht zuerst im
    temporären Schema.
  - **S3-23:** `audit_log` kaskadiert mit `tenant` und setzt die handelnde Person beim Löschen
    eines Kontos auf NULL.
- **S3-24:** `is_active` wird nur bei der Anmeldung geprüft, nicht bei Erneuerung, Einladung,
  `register` und im Guard. Kein Endpunkt deaktiviert heute ein Konto. Der Fehler wird erst
  auslösbar, wenn jemand ein kompromittiertes Konto sperren will.

## Stufe 4: Oberfläche und Bedienbarkeit

| Nr.   | Befund                                                                     | aus    | Wo                                                                                                       |
| ----- | -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| S4-01 | Ohne Maus lässt sich in 13 Registern kein Datensatz öffnen                 | 07 I2  | z. B. `apps/web/src/pages/Risks.tsx:247`, `Measures.tsx:153`, `Findings.tsx:271`                         |
| S4-02 | Entfernen nur beim Überfahren, ohne Rückfrage; Organigramm löscht Teilbaum | 07 I3  | `EvidenceSection.tsx:155`, `Planning.tsx:503-507` und sieben weitere                                     |
| S4-03 | Seitenfenster sind keine modalen Dialoge                                   | 07 I7  | 13 Stellen, z. B. `Risks.tsx:352`; kein `aria-modal` in `apps/web/src`                                   |
| S4-04 | Seitenfenster drehen bei einem Fehler endlos                               | 07 I4  | z. B. `Risks.tsx:298` mit Anzeige `:355`                                                                 |
| S4-05 | Änderungen und Downloads scheitern still                                   | 07 I5  | `Members.tsx:44-67` (nur `sod-warning` behandelt, `setRoles.error` nie angezeigt), `FileField.tsx:65`    |
| S4-06 | Formularfelder ohne Beschriftung oder nur mit Platzhalter                  | 07 I8  | z. B. `Context.tsx:394`, `Soa.tsx:274`, `Privacy.tsx:941`                                                |
| S4-07 | API-Client wirft bei HTML-Fehlerseite einen englischen `SyntaxError`       | 07 I6  | `apps/web/src/lib/api.ts:86`, `:121`                                                                     |
| S4-08 | Statustexte der Oberfläche weichen von `packages/shared/src/labels.ts` ab  | 07 I11 | `apps/web/src/components/ui.tsx:144`, `:165`; `Incidents.tsx:60-69`; `apps/web/src/lib/labels.ts:73-106` |

**Wie die Einträge konkret auftreten:**

- **S4-01:** `<tr onClick>` ohne `tabIndex` und ohne Schaltfläche. Risiko bewerten oder tragen,
  Maßnahme zuordnen, Feststellung schließen geht nur im Seitenfenster.
- **S4-02:** `hidden … group-hover:inline` nimmt die Schaltfläche aus der Tab-Reihenfolge, auf
  Touch-Geräten gibt es kein Überfahren. Ein versehentlicher Klick in `Planning.tsx:503-507`
  löscht einen Knoten samt allem darunter.
- **S4-03:** Kein Escape, keine Fokusführung, kein `aria-modal`. Der Fokus bleibt in der Seite
  dahinter.
- **S4-04:** `{!d ? <Spinner/> : …}` ohne Blick auf `isError`. Ist der Datensatz gelöscht, dreht es
  endlos.
- **S4-05:** Eine Sperre der Funktionstrennung (409 `sod-violation`) beim Rollenwechsel wird nicht
  angezeigt. Die Auswahl springt ohne Grund zurück. Downloads mit `void downloadFile(...)` scheitern
  bei 403 oder 404 ohne Meldung.
- **S4-06:** Ein Bildschirmleser liest bei Wahrscheinlichkeit und Schwere der DSFA nur „W 3,
  Auswahlfeld“ und „S 3, Auswahlfeld“ ohne Feldnamen.
- **S4-07:** `JSON.parse(text)` ohne Schutz. Beim Neustart der API zeigt die Oberfläche
  `Unexpected token '<'`.
- **S4-08:** `STATUS_LABEL` sagt „Freigegeben“, das Auditpaket für dasselbe Dokument
  „veröffentlicht“. Welcher Begriff gilt, ist fachlich zu entscheiden.

## Tests, die Fehler festschreiben oder nicht scheitern können

Zusammengefasst aus 01 I10, 02 I7, 02 I8, 03 I8, 04 I10, 05 I8, 06 I7 und 06 I8. Nachgeprüft:

| Test                                                                 | Problem                                                                                                                                          | gehört zu                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `apps/api/test/audit-package.e2e.test.ts:308-312`                    | Sucht Klartext im Deflate-Strom. Eigene Probe: Der Text kommt komprimiert nie vor, der Test kann nicht scheitern. Der Kommentar dort ist falsch. | S1-05, Mandantentrennung |
| `packages/db/src/db.test.ts:90-95`                                   | „ist idempotent“ zählt zweimal nach dem Seed.                                                                                                    | Katalog                  |
| `apps/api/test/auth.e2e.test.ts:127-131`                             | „invalidiert alte Tokens sofort“ prüft nur, dass der unveränderte Manager Rechte behält.                                                         | S3-18                    |
| `auth.e2e.test.ts:165-170`                                           | „bereits eingelöst oder unbekannt“ sendet nur einen unbekannten Token.                                                                           | S1-02                    |
| `apps/api/test/audit.e2e.test.ts` (Audit schließen als ISMS-Leitung) | Erwartet 200, schreibt S2-01 fest.                                                                                                               | S2-01                    |
| `audit.e2e.test.ts` (Nachweis lösen nach Bestätigung)                | Erwartet 200, schreibt S2-12 fest.                                                                                                               | S2-12                    |
| `apps/api/test/privacy.e2e.test.ts:346-366`                          | Die DSB setzt die verantwortliche Person selbst weg und gibt dann die Stellungnahme ab.                                                          | S2-13                    |
| `apps/api/test/incidents.e2e.test.ts:202-203`                        | Verlangt, dass `gdpr_art34` im Fristenmonitor fehlt.                                                                                             | S3-14                    |
| `packages/db/src/db.test.ts:99-130`, `apps/api/test/setup.ts:10`     | Zeilensicherheit nur für `asset` geprüft; die App-Verbindung entsteht per Textersetzung und wird bei anderen Zugangsdaten still zum Eigentümer.  | S3-21 bis S3-23          |
| `ai-nis2.e2e.test.ts:255-282`                                        | Vergleicht die KI-Einstufung nur für zufällig vorhandene Zeilen; Web-Kopie ungeprüft.                                                            | Vorbeugung               |
| alle Module                                                          | Kein einziger Test prüft 403 beim Lesen von Datenschutz- oder Kompetenzdaten.                                                                    | S1-05, S2-06             |

Ändert man den Code nach dieser Liste, werden einige dieser Tests rot. Das ist dann richtig so,
sie gehören im selben Zug umgeschrieben.

## Fehlalarme und Teilfehlalarme

Kein Befund ist ganz falsch. Drei sind in einem Teil falsch oder überzeichnet:

| aus          | Was behauptet wurde                                                                                           | Was stimmt                                                                                                                                                                                                                                                                                                                                                                                                                     | Folge                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 03 I4, 07 I1 | `javascript:`-Verweis an Nachweisen kann jede Person mit `measure.write_own` bzw. „auch der Auditor“ anlegen. | Das Schema nimmt `javascript:` an, die Oberfläche rendert es als `href` (`dto.ts:798`, `EvidenceSection.tsx:143-149`). Anlegen kann einen Nachweis aber nur, wer das volle `measure.write` hat (`evidence.service.ts:239-246`), und das hat nur die ISMS-Leitung (`permissions.ts:197`). Auditor und Risk-Owner bekommen 403. `target="_blank"` mit `noopener` verhindert in aktuellen Browsern wahrscheinlich die Ausführung. | Herabgestuft auf Suggestion: echt, aber Täterkreis nur die ISMS-Leitung. |
| 03 I7        | Fehlermeldungen zu 23505/23503 geben Werte „über Mandanten hinweg“ preis.                                     | `problem.filter.ts:57-70` gibt `e.detail` aus. Das enthält aber nur den Schlüsselwert, den der Aufrufer selbst gesendet hat. Fremde Daten fließen nicht ab, es bleibt ein Existenz-Orakel. Richtig ist der zweite Teil: Ein zu großer JSON-Inhalt wird zu 500 statt 413.                                                                                                                                                       | Bleibt Suggestion-nah, nicht in den Stufen 1 bis 3.                      |
| 07 I8        | Die DSFA-Auswahlfelder klingen für einen Bildschirmleser zweimal gleich („3, Auswahlfeld“).                   | Die Optionen heißen „W 3“ und „S 3“ (`Privacy.tsx:941-960`), sind also unterscheidbar, aber ohne Feldnamen kaum verständlich. Der Befund ohne Beschriftung stimmt.                                                                                                                                                                                                                                                             | Bleibt in S4-06, Beispiel berichtigt.                                    |

Bereits in Review 05 widerlegt und dort dokumentiert: Datumswerte in Mails kommen nicht als
JavaScript-Datum, sondern als Zeichenkette `2026-10-11`.

## Doppelungen zwischen den Berichten

| Zusammengefasst in | Berichte                                                 | Gemeinsame Ursache                                                                                       |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| S1-05              | 06 C1, 03 I6                                             | Exporte nur an `report.export` gebunden; der Interceptor speichert den Rohinhalt.                        |
| S2-01              | 02 I2, 04 C3                                             | Abgeschlossenes Audit bleibt änderbar, `closed` ohne Bericht.                                            |
| S2-05              | 02 I1, 05 I3, 06 I4, 06 I5                               | Beim Ändern wird nur der bisherige Eigentümer geprüft, der neue nie; eine Freigabe überlebt den Wechsel. |
| S2-06              | 06 I1, 04 I8                                             | Bestätigung für andere zu weit erlaubt, überschreibbar, ohne Urheberspalte.                              |
| S2-08              | 04 I1, 04 I9 (Teil)                                      | BIA-Schreibwege ohne Rücksetzen und ohne Eigentumsprüfung.                                               |
| S2-16              | 04 I9, 06 S7                                             | Geprüft wird `?? ctx.personId`, gespeichert `?? null`.                                                   |
| S3-05              | 05 I4, 04 (Suggestion)                                   | Fremdschlüssel prüfen ohne Zeilensicherheit; IDs werden nicht im Mandanten nachgeschlagen.               |
| S3-09              | 01 I9, 07 I9                                             | nginx ohne Sicherheits-Header, Swagger öffentlich.                                                       |
| Fehlalarm-Tabelle  | 03 I4, 07 I1                                             | `javascript:`-Verweis.                                                                                   |
| Tests              | 01 I10, 02 I7, 02 I8, 03 I8, 04 I10, 05 I8, 06 I7, 06 I8 | siehe Abschnitt Tests.                                                                                   |

**Wiederkehrende Ursachen**, die mehrere Einträge auf einmal beheben würden:

1. **Compose als Server-Vorlage:** S1-01, S1-08, S3-07, S3-08 und S3-09 entstehen alle aus
   Standardwerten in `docker-compose.yml` und `nginx.conf`. Pflichtvariablen ohne Ersatzwert
   (`${VAR:?…}`), Bindung an `127.0.0.1` und Demodaten nur im eigenen Profil schließen fünf
   Einträge zugleich.
2. **`_own` prüft nur den Zustand vorher:** S2-02, S2-03, S2-05, S2-08, S2-15 und S2-16. Eine
   gemeinsame Regel „wer nur `_own` hat, muss auch nach der Änderung Eigentümer sein und darf nicht
   kaskadierend löschen“ trifft alle.
3. **Freigabe ist ein Status statt eines Vorgangs:** S1-07, S2-07, S2-08, S2-10, S2-11, S2-12 und
   S2-13. Freigaben nur über den eigenen Endpunkt setzen, jede inhaltliche Änderung danach
   zurücksetzen, und in der Datenbank `status = 'verified'` an eine bestätigende Person binden.
4. **Rohinhalt im Protokoll:** S1-05 und S3-04. Das geprüfte Schema-Ergebnis protokollieren und
   beim Lesen nach Recht filtern.
