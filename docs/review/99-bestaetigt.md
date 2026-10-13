# Bestätigte Befunde aus den Reviews 01 bis 07

Stand: 13.10.2026, Branch `main` (Commit `7672d6f`). Am Code wurde nichts geändert. Seit den
Reviews (Commit `dd4dd4b`) hat sich unter `apps/`, `packages/`, `infra/` und an
`docker-compose.yml` nichts geändert; die Befunde gelten für den aktuellen Stand.

## Vorgehen

1. **Prüfung je Bericht:** Sieben Prüfagenten liefen parallel, einer je Bericht. Jeder hat jeden
   Critical- und Important-Befund am TypeScript- und SQL-Quelltext nachgelesen. Rechte und Rollen
   hat jeder selbst gegen `packages/shared/src/permissions.ts`, den Guard
   (`apps/api/src/kernel/auth/permission.guard.ts:36`) und `can()`
   (`packages/shared/src/policy.ts:23-31`) geprüft, nicht aus dem Bericht übernommen. Wo nötig
   haben die Agenten Proben gefahren:
   - SQL als `isms_app` auf der Testdatenbank, jeweils zurückgerollt
   - Node-Proben zu Streams, archiver, Deflate, busboy und `addMonths`
2. **Urteil je Befund:** bestätigt, herabgestuft oder Fehlalarm, mit einem Satz Begründung.
3. **Zusammenführen im Hauptkontext:** Befunde mit derselben Ursache sind zu einem Eintrag
   zusammengefasst. Die Endstufe habe ich festgelegt, wo sie vom Vorschlag der Agenten abweicht,
   steht der Grund dabei.

## Ergebnis

| Bericht  | geprüft | bestätigt | herabgestuft | Fehlalarm |
| -------- | ------- | --------- | ------------ | --------- |
| 01       | 12      | 5         | 7            | 0         |
| 02       | 9       | 8         | 1            | 0         |
| 03       | 10      | 6         | 4            | 0         |
| 04       | 13      | 9         | 4            | 0         |
| 05       | 10      | 9         | 1            | 0         |
| 06       | 9       | 3         | 6            | 0         |
| 07       | 11      | 8         | 3            | 0         |
| zusammen | 74      | 48        | 26           | 0         |

Kein Befund ist ein Fehlalarm. Herabgestuft heißt: Der Fehler steckt im Code, aber der Kreis der
Täter ist kleiner, er ist nur mit SQL-Zugriff oder heute gar nicht auslösbar, oder die Wirkung ist
geringer als beschrieben. Einzelne falsche Teilaussagen der Berichte stehen am Ende.

Nach dem Zusammenführen bleiben **5 Critical**, **30 Important** und **20 Suggestion**.

**Kennungen:** `K` = Critical, `W` = Important (wichtig), `H` = Suggestion (Hinweis). In der Spalte
„aus“ steht der Ursprungsbefund als Bericht und Kennung, `05 C1` heißt Review 05, Befund C1.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical   | Mandantengrenze fällt, eine gesetzliche Meldefrist geht unter, oder eine einzelne Person fälscht über die API einen Nachweis, für den zwei nötig sind. |
| Important  | Echter, über die API oder den Betrieb auslösbarer Fehler mit begrenzter Wirkung, oder eine zweite Verteidigungslinie, die mit SQL fällt.               |
| Suggestion | Härtung, kleiner Kreis von Tätern, heute nicht auslösbar, oder Bedienbarkeit ohne Datenfolgen.                                                         |

## Critical

| Nr. | Befund                                                                                 | aus          | Ursache                                                           | Wo                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1  | Zugriffstoken für fremde Mandanten fälschbar                                           | 01 C1        | `tid` nicht an `mid` gebunden, Standardschlüssel                  | `apps/api/src/kernel/auth/jwt.guard.ts:35-45`; `permission-cache.service.ts:52-61`; `docker-compose.yml:30-33`; `apps/api/src/config/env.ts:29`                                                              |
| K2  | Postausgang der Mails für jeden Mandanten lesbar                                       | 05 C1        | prozessweiter Speicher ohne Mandant                               | `apps/api/src/kernel/mail/mail.service.ts:39`, `:86-87`; `apps/api/src/modules/notifications/notifications.controller.ts:39-42`                                                                              |
| K3  | Meldefristen ohne Empfänger, als Datum gerechnet, zuletzt sortiert                     | 05 C2        | Meldefrist ohne Eigentümer, Datum statt Zeitpunkt, Textsortierung | `apps/api/src/modules/deadlines/deadlines.service.ts:115`, `:119`, `:128`, `:132`, `:158-159`; `notifications.service.ts:75`                                                                                 |
| K4  | „Bestätigt“, „akzeptiert“, „freigegeben“ als Status direkt setzbar                     | 02 C1        | Freigabe ist ein frei setzbarer Status                            | `packages/shared/src/dto.ts:181`, `:188`, `:233`, `:239`, `:357-358`, `:574-576`; `measures.service.ts:101`, `:128`; `risks.service.ts:114`, `:141`; `actions.service.ts:109-113`; `planning.service.ts:151` |
| K5  | Auditabdeckung ohne Auditor und ohne Bericht erzeugbar, abgeschlossenes Audit änderbar | 02 I2, 04 C3 | Abschluss nicht an Rolle, Bericht und Sperre gebunden             | `apps/api/src/modules/audit/audits.service.ts:108-151` (`:129`, `:142`, `:150`); `packages/shared/src/permissions.ts:205`; `0010_grundschutz_scope.sql:77-94`                                                |

**K1:**

- **Urteil:** bestätigt.
- **Begründung:** Compose läuft mit `NODE_ENV=production` und einem im Repository veröffentlichten
  Ersatzschlüssel. Der Guard lädt die Rechte über `mid`, übernimmt `tid` aber ungeprüft.
- **So tritt es auf:**
  1. Ein Angreifer registriert sich über `POST /auth/register` einen eigenen Mandanten und ist dort
     ISMS-Leitung.
  2. Er signiert ein Token mit seiner `mid` und der Mandanten-ID des Opfers.
  3. Jede Abfrage läuft unter dem fremden Mandanten, Lesen und Schreiben.
- **Voraussetzungen:** Der Betreiber setzt `ISMS_JWT_SECRET` nicht, und die UUID des Opfers ist
  bekannt.
- **Auch ohne Standardschlüssel:** Die fehlende Bindung von `tid` an `mid` bleibt ein Fehler.

**K2:**

- **Urteil:** bestätigt.
- **Begründung:** `MailService` ist ein globaler Dienst mit einem Array `recent` ohne Mandant.
  `GET /notifications/outbox` gibt es ungefiltert aus und verlangt nur `tenant.settings`. Das hat
  jede ISMS-Leitung, also jeder, der sich über das öffentliche `register` selbst einen Mandanten
  anlegt.
- **So tritt es auf:** Ein frisch registrierter Fremder liest Adressen und Titel von Risiken,
  Maßnahmen und Feststellungen anderer Mandanten.
- **Nebenbefund:** Der Worker hat eine eigene Instanz, seine Mails erscheinen nie im Postausgang.

**K3:**

- **Urteil:** bestätigt.
- **Begründung:** Drei Fehler wirken zusammen:
  - Meldefristen tragen `NULL::uuid AS "ownerPersonId"`, und die Erinnerung überspringt Zeilen ohne
    Eigentümer. Keine NIS2-, DSGVO- oder AI-Act-Frist wird je gemailt.
  - `due_at::date` gegen `current_date` (ohne gesetzte Zeitzone) zeigt eine seit einer Stunde
    verpasste 24-Stunden-Frist als „heute fällig“, nicht als überfällig.
  - `ORDER BY "dueAt", severity DESC` auf Text stellt `critical` hinter `normal`. Die Vorschau der
    fünf nächsten Fristen auf der Startseite (`:132`) kann die Meldefrist abschneiden.
- **Zum Vergleich:** Der Fristenmonitor im Vorfall rechnet richtig mit `now()`.

**K4:**

- **Urteil:** bestätigt.
- **Begründung:** Ein Risk-Owner kommt mit `measure.write_own`, `risk.write_own` und
  `action.write_own` am Guard vorbei. Der Service prüft nur den bisherigen Eigentümer und übernimmt
  `status` aus dem DTO. Die Trigger in `0001_rls_triggers_views.sql:119-155` feuern nur, wenn die
  Spalte der handelnden Person gesetzt wird.
- **Nachweis:** Probe als `isms_app`: `verified`, `accepted` und `approved` mit leerer handelnder
  Person.
- **So tritt es auf:**
  - `PATCH /measures/:id {"status":"verified"}` auf die eigene Maßnahme. Abdeckung, Grundschutz-Check
    und Kennzahlen zählen sie danach als wirksam bestätigt.
  - Die Demodaten tun das selbst: `apps/api/src/demo-seed.ts:986-990` legt M-0009 mit
    `status: 'verified'` an.

**K5:**

- **Urteil:** von den Agenten bestätigt (02 I2) bzw. auf Important herabgestuft (04 C3).
- **Endstufe:** Critical, Entscheidung im Hauptkontext. Eine einzelne Person, und zwar die geprüfte
  Seite, erzeugt den Nachweis des Auditprogramms (ISO 27001 Kap. 9.2), den ein Zertifizierer sehen
  will, ganz ohne Auditor.
- **Begründung:** Die ISMS-Leitung hat `audit.write`. Nur `reported` verlangt einen Bericht
  (`:142`), `closed` nicht. Gesperrt ist nur das Wiedereröffnen (`:129`), Umfang, Termine und Bericht
  bleiben nach dem Abschluss änderbar (`:150`).
- **So tritt es auf, einfachster Weg (Prüfagent 04):** Die ISMS-Leitung legt ein neues Audit mit
  vollem Umfang an und setzt es direkt auf `closed`. `v_audit_coverage` zählt danach alle Kapitel
  als im Zyklus geprüft.

## Important

### Auth und Mandantentrennung

| Nr. | Befund                                                                  | aus                                   | Ursache                                              | Wo                                                                                                                                                               |
| --- | ----------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Einladung eines fremden Mandanten belegt das Konto mit eigenem Kennwort | 01 C2 (herabgestuft)                  | Einladungstoken nicht an das Konto gebunden          | `apps/api/src/kernel/tenancy/members.service.ts:75-90`, `:128`; `apps/api/src/kernel/auth/auth.service.ts:165-177`                                               |
| W2  | Mitglied ändert eigene Rollen, letzte ISMS-Leitung entfernbar           | 01 I4                                 | `setRoles` kennt die handelnde Person nicht          | `members.service.ts:132-153`; `members.controller.ts:27-32`                                                                                                      |
| W3  | Mandant des Erneuerungstokens nur im Prozessspeicher                    | 01 I7                                 | prozesslokale Maps statt Spalte                      | `auth.service.ts:320-322`, `:371`, `:377-378`; `apps/web/src/lib/api.ts:82`                                                                                      |
| W4  | Guard akzeptiert `_own` für jedes Recht, Services prüfen kein Eigentum  | 01 I2, 04 I9 (Teil 1), 03 (Anmerkung) | `_own`-Rückfall im Guard ohne `assertCan` im Service | `permission.guard.ts:36`; `incidents/playbooks.controller.ts:34-58`; `files.controller.ts:76-79` mit `files.service.ts:107`; `continuity/bia.service.ts:147-156` |

- **W1:**
  - **Urteil:** herabgestuft von Critical.
  - **So tritt es auf:** Mandant B lädt eine Adresse ein, die Mandant A schon eingeladen hat. B
    erhält den Token zurück und setzt damit das Kennwort.
  - **Warum herabgestuft:** Zugang zu Mandant A entsteht nicht, dessen Mitgliedschaft bleibt
    `invited`. Die echte Person kann aber nie mehr annehmen, und ein Zurücksetzen gibt es nicht.
  - **Ausblick:** Zur echten Kontoübernahme wird es, sobald Entra ID Konten über die Adresse
    verknüpft.
- **W2:** bestätigt. Die einzige ISMS-Leitung setzt sich auf „Auditor“, danach hat niemand mehr
  `tenant.members`. Die SoD-Regel verhindert nur, beide Rollen zugleich zu halten, nicht den Wechsel.
- **W3:** bestätigt. Nach jedem Neustart bekommt ein Mitglied mehrerer Mandanten beim stillen
  Erneuern ein Token ohne `tid` und sieht 403. Beide Maps wachsen unbegrenzt.
- **W4:** bestätigt. Ein Risk-Owner kann mit `continuity.write_own` und `measure.write_own`:
  - Ablaufpläne anlegen und aktivieren,
  - jede nicht verknüpfte Datei löschen, auch fremde,
  - Ressourcen aus jeder BIA entfernen.

### Datenbank und Rechte

| Nr. | Befund                                                         | aus   | Ursache                                          | Wo                                                                                                              |
| --- | -------------------------------------------------------------- | ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| W5  | Globale Rollen und SoD-Regeln mit SQL als `isms_app` änderbar  | 02 I3 | Richtlinie `USING` gilt auch für UPDATE/DELETE   | `packages/db/migrations/0001_rls_triggers_views.sql:64-70`, `:194`; `members.service.ts:169-185`                |
| W6  | Vier-Augen-Trigger mit temporärer Tabelle aushebelbar          | 02 I4 | Suchpfad ohne `pg_temp`                          | `0001_rls_triggers_views.sql:108`, `:137`; `0005_audit_requirement_rls.sql:12`; `0010_grundschutz_scope.sql:22` |
| W7  | Änderungsprotokoll über Kaskade löschbar und rückdatierbar     | 02 I6 | Fremdschlüssel kaskadiert in Append-only-Tabelle | `0000_init.sql:1251-1252`; `0001_rls_triggers_views.sql:194`, `:197`                                            |
| W8  | API und Worker kennen die Zugangsdaten des Tabelleneigentümers | 02 I5 | Migrator-Zugang in der Laufzeitumgebung          | `docker-compose.yml:20-23`; `apps/api/src/kernel/jobs/jobs.service.ts:23`; `infra/docker/postgres-init.sql:3-4` |

W5 bis W8 sind nur mit SQL-Zugriff als `isms_app` bzw. mit Zugriff auf die Umgebung des Prozesses
auslösbar. Genau für diesen Fall sind Zeilensicherheit und Trigger als zweite Linie gedacht, deshalb
Important.

- **W5:** bestätigt. Die Probe löschte 3 globale SoD-Regeln und die Rolle `dpo`, mit Wirkung auf
  alle Mandanten.
- **W6:** bestätigt. Die Probe bestätigte F-0001 mit `CREATE TEMP TABLE action` selbst. Der Weg über
  `person` gelingt zusätzlich mit `GRANT SELECT` auf die Temp-Tabelle.
- **W7:** bestätigt. `DELETE FROM tenant` löschte 9 Protokollzeilen, `at = '2020-01-01'` wurde
  angenommen. Löschen eines Kontos scheitert, wenn es anderswo mit RESTRICT verwiesen ist.
- **W8:** bestätigt. `x-db-env` gibt `DATABASE_URL_MIGRATOR` an `api` und `worker`, obwohl nur der
  Worker pg-boss startet. Keine Tabelle hat `FORCE ROW LEVEL SECURITY`.

### Dateien, Exporte, Protokoll

| Nr. | Befund                                                                                                        | aus                         | Ursache                                                                  | Wo                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W9  | Lesefehler einer Datei beendet den API-Prozess                                                                | 03 C1 (herabgestuft)        | Stream ohne Fehlerbehandlung, alle Dateien auf einmal offen              | `apps/api/src/modules/files/files.controller.ts:73`; `apps/api/src/modules/exports/package.service.ts:88`, `:184-185`                                            |
| W10 | Auditor liest Verarbeitungsverzeichnis und DSFA ohne `privacy.read`; Protokoll speichert Rohinhalt unbegrenzt | 06 C1 (herabgestuft), 03 I6 | Export nur an `report.export`, Rohinhalt der Anfrage im Protokoll        | `exports.controller.ts:43-53`, `:65-66`; `package.service.ts:84`, `:114`, `:615-652`; `audit-log.interceptor.ts:76`, `:86`, `:115-120`; `files.controller.ts:51` |
| W11 | Exporte und Anmeldungen entgehen dem Protokoll über die Schreibweise des Pfads                                | 03 I1                       | exakter Vergleich von `req.path`                                         | `apps/api/src/kernel/audit-log/audit-log.interceptor.ts:24-30`, `:53`, `:107-108`                                                                                |
| W12 | IP fehlt bei allen Änderungen, hinter nginx stimmt sie nie                                                    | 03 I2                       | `req.ip` erst nach dem Schließen des Sockets gelesen, kein `trust proxy` | `audit-log.interceptor.ts:87`; `apps/api/src/app.factory.ts:10-24`; `infra/docker/nginx.conf:19-24`                                                              |
| W13 | Dateityp nur nach Angabe des Browsers geprüft                                                                 | 03 I3                       | MIME aus dem Multipart-Kopf, keine Endungs- oder Inhaltsprüfung          | `apps/api/src/modules/files/files.service.ts:35-40`, `:154-164`                                                                                                  |
| W14 | Umlaute in Dateinamen werden beim Upload zerstört                                                             | 03 I9                       | multer `defParamCharset` steht auf `latin1`                              | `files.controller.ts:51`                                                                                                                                         |

- **W9:**
  - **Urteil:** herabgestuft von Critical.
  - **Nachweis:** Probe: `pipe` und `archive.append` auf eine fehlende Datei enden beide in
    `uncaughtException`.
  - **Warum herabgestuft:** Eine normale Anfrage löst das nicht aus. Nötig ist ein Wettlauf
    zwischen `stat` und `open` oder ein Betriebsfehler (EACCES, EIO).
  - **Wirkung im Fehlerfall:** Ist eine Datei einmal unlesbar, etwa nach einem Restore, bringt
    jeder Download den Prozess zum Absturz. Compose startet ihn zwar neu, aber jede laufende Anfrage
    aller Mandanten bricht ab.
- **W10:**
  - **Urteil:** herabgestuft von Critical.
  - **Was passiert:** Der Auditor hat `report.export` und `auditlog.read`, aber nicht
    `privacy.read`. Er bekommt trotzdem:
    - beide Verzeichnis-Exporte,
    - im Auditpaket `09-datenschutz`,
    - in `GET /audit-log` den vollen Anfragetext jeder DSFA.
  - **Warum herabgestuft:** Betroffen ist nur diese eine Rolle, die das übrige ISMS ohnehin liest.
    Abfließen können Registerangaben, keine Daten Betroffener.
  - **Gemeinsame Ursache mit 03 I6:** `redact(req.body)` speichert den Inhalt vor der
    Zod-Prüfung, nur oben geschwärzt. Bei Uploads begrenzt multer weder `fields` noch `fieldSize`,
    ein Upload mit vielen Textfeldern erzeugt einen Eintrag von vielen Megabyte in einer Tabelle,
    die sich nicht löschen lässt.
- **W11:** bestätigt. Probe: `/api/v1/RISKS` wird geroutet. `GET /api/v1/EXPORTS/audit-package.zip`
  lädt alles herunter, ohne Eintrag.
- **W12:** bestätigt.
  - In der Testdatenbank haben 0 von 6 Einträgen zu `create`, `update` und `export` eine IP, 3 von 3
    Anmeldungen haben eine.
  - Ursache laut Probe: Der Interceptor liest `req.ip` erst im Callback der Transaktion, dann ist der
    Socket oft geschlossen.
- **W13:** bestätigt. `scan.pdf.exe` als `application/pdf` wird angenommen und geht im Auditpaket
  als `.exe` an den Auditor. U+202E bleibt im Namen. Hochladen darf jede Mandantenrolle.
- **W14:** bestätigt. Die Probe mit busboy ergibt aus `Prüfbericht.pdf` den Namen
  `PrÃ¼fbericht.pdf`.

### Vier-Augen-Prinzip und Schreibrechte

| Nr. | Befund                                                                                                                                            | aus                                | Ursache                                               | Wo                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W15 | Eigentümerwechsel und Verknüpfungsziel bei `_own` ungeprüft; Freigabe überlebt den Wechsel                                                        | 02 I1, 05 I3, 06 I4                | `_own` prüft nur den Zustand vorher                   | `measures.service.ts:120`, `:127`; `risks.service.ts:133-147`; `actions.service.ts:101`; `assets.service.ts:128`, `:150`, `:180-181`; `0001_rls_triggers_views.sql:111`, `:121`, `:130`, `:146`, `:150`                  |
| W16 | Löschen unter `_own` entfernt freigegebene Datensätze per Kaskade                                                                                 | 04 C1 (herabgestuft), 06 I3        | Kaskade beim Löschen mit `_own`                       | `continuity/processes.service.ts:72-78`; `assets/assets.service.ts:136-143`; `0000_init.sql:1159-1160`, `:1169`, `:1202`, `:1206`, `:1210`, `:1219`, `:1246`                                                             |
| W17 | Freigabe bleibt stehen, obwohl sich der Inhalt ändert                                                                                             | 04 I1, 04 I3, 04 I4, 04 I5         | Freigabe wird bei Inhaltsänderung nicht zurückgesetzt | `continuity/bia.service.ts:111-156`; `risks.service.ts:132-157`, `:299-308`; `measures.service.ts:112-167`, `:176-232`; `actions.service.ts:92-119`; `files/evidence.service.ts:66-89`, `:167-191`                       |
| W18 | Freigabe und Abschluss ohne Zustandsfolge                                                                                                         | 04 I2, 04 I6, 04 C2 (herabgestuft) | fehlende Zustandsmaschine                             | `documents/documents.service.ts:166-221`; `continuity/plans.service.ts:69-103`, `:105-123`, `:169-200`; `audit/findings.service.ts:134-157`, `:167-205`, `:208-221`                                                      |
| W19 | Bestätigungen für andere: Schulung durch jede Rolle, Lesebestätigung durch die DSB, überschreibbar, ohne Urheber                                  | 06 I1, 04 I8                       | Leserecht bzw. zu breites Recht öffnet Schreibweg     | `competence/competence.controller.ts:177-179`; `trainings.service.ts:139`, `:148-153`; `documents.service.ts:306-315`; `0000_init.sql:209-216`                                                                           |
| W20 | Rollenzuschnitt Auditor: bestätigt Verbesserungen jeder Herkunft, schreibt Managementbewertungen, kann keinen Nachweis und keinen Vorfall anlegen | 04 I7, 05 I7                       | Rechtekatalog zu grob bzw. zu eng                     | `packages/shared/src/permissions.ts:238-246`; `actions.service.ts:125-147`; `audit/audit.controller.ts:156`, `:162`, `:190`; `files.controller.ts:95-96`; `evidence.service.ts:239-246`; `incidents.controller.ts:54-56` |
| W21 | Geprüft wird der Aufrufer als Eigentümer, gespeichert `null`                                                                                      | 04 I9 (Teil 2)                     | Prüfwert und gespeicherter Wert weichen ab            | `risks.service.ts:100/113`; `measures.service.ts:89/100`; `actions.service.ts:61/80`; `processes.service.ts:36/45`; `assets.service.ts:91/108`                                                                           |

- **W15:** bestätigt. Daraus folgen drei Wege:
  - **Selbstfreigabe:** Eigentümer wegsetzen, freigeben, zurücksetzen. Die Probe zeigte R-0002
    danach als von der eigenen Eigentümerin akzeptiert.
  - **Phishing:** Ein Risk-Owner schreibt einen Link in den Titel einer Maßnahme und weist sie einer
    externen Person zu. Die Erinnerungsmail geht vom ISMS-Absender an diese Person.
  - **Asset:** Eigentümer auf eine beliebige Person oder `null` setzen, eine Abhängigkeit auf ein
    fremdes Asset legen. Eine Route zum Lösen fehlt.
- **W16:**
  - **06 I3 (bestätigt):** Ein Risk-Owner löscht sein Asset, und es verschwindet aus fremden
    Risiken, aus einer freigegebenen BIA (die freigegeben bleibt) und aus Verarbeitungen.
  - **04 C1 (herabgestuft von Critical):** Das Löschen des eigenen Prozesses nimmt BIA, Plan und
    Übungen mit. Herabgestuft, weil die Löschung sichtbar und protokolliert ist und im Mandanten
    bleibt.
- **W17:** bestätigt. Die Freigabe bleibt stehen, obwohl sich der Inhalt ändert:
  - **BIA:** nach `setImpact`, `setResource` und `removeResource`.
  - **Risikoübernahme:** nach Änderung von Titel, Assets und Maßnahmen.
  - **Bestätigte Maßnahme:** lässt sich ändern, neu zuordnen (hebt die Abdeckung der SoA), löschen
    und erneut bestätigen.
  - **Nachweis hinter einer bestätigten Feststellung:** lässt sich ändern, löschen und lösen.
- **W18:**
  - **04 I2 und I6 (bestätigt):** Eine nie eingereichte oder ältere Dokumentfassung wird
    freigegeben und wieder aktuell. Ein Notfallplan wird auf einer Entwurf-BIA mit „nicht bestanden“
    aktiv.
  - **04 C2 (herabgestuft von Critical):** Eine Beobachtung wird geschlossen und danach zur
    Hauptabweichung hochgestuft, mit 0 Maßnahmen, und bestätigt. Herabgestuft, weil nur die
    Auditorin `finding.write` hat: Die geprüfte Seite kommt so nicht durch.
- **W19:** bestätigt.
  - `POST /trainings/:id/complete` verlangt nur `training.read`, also kann jede Rolle für jede
    Person mit beliebigem Datum bestätigen und eine Bestätigung überschreiben.
  - Lesebestätigungen für andere erlaubt `document.write`, das auch die DSB hat. Die Fristenliste
    nimmt dafür `document.publish`.
- **W20:** bestätigt, in drei Teilen:
  - Die Auditorin hat `action.verify` ohne Bezug zur Herkunft.
  - Mit `audit.write` legt sie Managementbewertungen an und überschreibt Kennzahlenwerte.
  - `POST /evidence` verlangt im Guard `measure.write`, das sie nicht hat. `POST /incidents`
    verlangt `incident.report`, das sie nicht hat, obwohl Controller-Kommentar und
    `docs/iso27001-abdeckung.md:116` „melden darf jede Rolle“ sagen.
- **W21:** bestätigt.
  - Ein Risk-Owner legt eine Maßnahme ohne `ownerPersonId` an (201) und kann sie danach nicht mehr
    bearbeiten.
  - `assert_distinct_actor` steigt bei leerem Eigentümer ohne Prüfung aus.

### Fristen

| Nr. | Befund                                                                         | aus                    | Ursache                                                                       | Wo                                                                                                                                       |
| --- | ------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| W22 | Vorfälle und Verbesserungen verweisen auf Datensätze fremder Mandanten         | 05 I4, 04 (Suggestion) | IDs nicht im eigenen Mandanten nachgeschlagen, Fremdschlüssel prüfen ohne RLS | `apps/api/src/modules/incidents/incidents.service.ts:141`, `:177`, `:238`; `actions.service.ts:59-90`; `0001_rls_triggers_views.sql:102` |
| W23 | Beginnzeitpunkte unbegrenzt, erneutes Erfüllen verschiebt den Abschlussbericht | 05 I1                  | Zeitpunkte ohne Grenze, Erfüllen nicht idempotent                             | `packages/shared/src/dto.ts:304`, `:314`, `:320`, `:850`; `incidents.service.ts:358-386`                                                 |
| W24 | Pflichten „unverzüglich“ fehlen in Liste, Monitor und Mail                     | 05 I2                  | Fälligkeit `null` wird herausgefiltert                                        | `apps/api/src/modules/incidents/reporting-deadlines.ts:62`, `:118`; `deadlines.service.ts:162`; `incidents.service.ts:409`               |
| W25 | Erinnerungen werden bei Wiederholung doppelt verschickt                        | 05 I6                  | Job nicht idempotent                                                          | `apps/api/src/worker.ts:34-46`; `notifications.controller.ts:28-33`                                                                      |

- **W22:** bestätigt.
  - Assets verknüpft schon ein Risk-Owner mit `incident.report`, Verarbeitungen die Rollen mit
    `incident.write`.
  - Folge: Der Datensatz für die Behörde zeigt auf eine Verarbeitung, die der Mandant nie sehen
    kann. Der Statuscode verrät, ob eine UUID existiert. Inhalte fließen nicht ab.
- **W23:** bestätigt. Ein zweites Erfüllen der 72-Stunden-Meldung mit `fulfilledAt: 2030-01-01`
  schiebt den Abschlussbericht ins Jahr 2030. Fehler bei der Einstufung lassen sich nie korrigieren.
- **W24:** bestätigt. `ai_provider_notice` und `gdpr_art34` stehen nur in der Detailansicht des
  Vorfalls.
- **W25:** bestätigt. pg-boss 11 stellt einen Job nach Absturz oder nach 15 Minuten Laufzeit erneut
  zu (`retry_limit 2`, `expire_seconds 900`). Die schon bedienten Mandanten werden doppelt gemailt.

### Oberfläche

| Nr. | Befund                                                                     | aus   | Ursache                                      | Wo                                                                                                                                                  |
| --- | -------------------------------------------------------------------------- | ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| W26 | Ohne Maus lässt sich in 13 Registern kein Datensatz öffnen                 | 07 I2 | klickbare `<tr>` statt Schaltfläche          | z. B. `apps/web/src/pages/Risks.tsx:247`, `Measures.tsx:153`, `Findings.tsx:271`                                                                    |
| W27 | Entfernen nur beim Überfahren, ohne Rückfrage; Organigramm löscht Teilbaum | 07 I3 | `hidden group-hover:inline`, keine Rückfrage | `apps/web/src/components/EvidenceSection.tsx:155`; `Planning.tsx:503-507` und sieben weitere                                                        |
| W28 | Änderungen und Dateidownloads scheitern still                              | 07 I5 | kein globales `onError`, `void downloadFile` | `apps/web/src/pages/Members.tsx:57`; `Incidents.tsx:395`, `:403`, `:408`; `Continuity.tsx:482`, `:1079`; `apps/web/src/components/FileField.tsx:65` |
| W29 | Seitenfenster sind keine modalen Dialoge                                   | 07 I7 | Seitenfenster je Seite von Hand gebaut       | 13 Stellen, z. B. `Risks.tsx:352`; kein `aria-modal` in `apps/web/src`                                                                              |

- **W26:** bestätigt. Risiko bewerten oder tragen, Maßnahme zuordnen, Feststellung schließen geht
  nur im Seitenfenster. Das verstößt gegen WCAG 2.1.1 (Stufe A).
- **W27:** bestätigt. Per Tastatur und auf Touch-Geräten nicht erreichbar. `window.confirm` gibt es
  nur in `Incidents.tsx:479`.
- **W28:** bestätigt. Eine Sperre der Funktionstrennung beim Rollenwechsel wird verschluckt, die
  Auswahl springt ohne Grund zurück. Exporte fangen Fehler dagegen ab.
- **W29:** bestätigt.
  - Es gibt kein Escape, keine Fokusführung und kein `aria-modal`.
  - Die Aussage im Bericht „Schließen nur per Klick auf den Hintergrund“ stimmt nicht ganz: Nach
    dem Laden gibt es eine Schaltfläche „Schließen“.

### Tests

| Nr. | Befund                                                  | aus                         | Wo                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W30 | Tests schreiben Fehler fest oder können nicht scheitern | 01 I10, 02 I8, 03 I8, 05 I8 | `apps/api/test/audit-package.e2e.test.ts:308-312`; `packages/db/src/db.test.ts:90-95`; `apps/api/test/auth.e2e.test.ts:127-131`, `:165-170`; `apps/api/test/audit.e2e.test.ts:135-139`, `:159`; `apps/api/test/incidents.e2e.test.ts:168-182`, `:202-203`; `apps/api/test/notifications.e2e.test.ts:164-180` |

**W30:** bestätigt.

- **Deflate:** Der Test sucht Klartext im Deflate-Strom. Proben auf Stufe 1, 6 und 9 zeigen: Der
  Text kommt komprimiert nie vor, der Test kann nicht scheitern.
- **Idempotenz:** „ist idempotent“ zählt zweimal nach dem Seed.
- **Audit:** Der Audit-Test erwartet 200, wenn die ISMS-Leitung ein Audit abschließt (K5).
- **Fristen:** Der Fristentest verlangt, dass `gdpr_art34` fehlt (W24). Der Monatsende-Test rechnet
  um 12:00 Uhr UTC und kann den Fehler aus H10 nicht zeigen.
- **Postausgang:** Der zweite Mandant ruft seinen Postausgang nie ab (K2).

## Suggestion

| Nr. | Befund                                                                                              | aus                         | Begründung der Agenten in einem Satz                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Gnadenfrist umgeht Abmelden (`auth.service.ts:214-218`, `:246-249`)                                 | 01 I1                       | Setzt einen gestohlenen älteren Erneuerungstoken aus einem httpOnly-Cookie und ein Abmelden binnen 20 Sekunden voraus.                                              |
| H2  | Deaktivierte Konten bleiben angemeldet (`auth.service.ts:261-270`)                                  | 01 I3                       | Kein Endpunkt setzt `user.is_active = false`; wird Important, sobald es ein Deaktivieren gibt.                                                                      |
| H3  | `register` verrät vorhandene Konten (`auth.service.ts:78-82`)                                       | 01 I5                       | Die Aufzählung ist echt, als Kennwort-Prüfstelle aber nicht schlimmer als `login`, das ebenfalls unbegrenzt ist.                                                    |
| H4  | Rechteentzug wirkt verzögert (`permission-cache.service.ts:34`)                                     | 01 I6                       | Wirkt erst mit mehreren Instanzen; Compose startet eine.                                                                                                            |
| H5  | Einladung hängt eine Person um (`members.service.ts:119-123`)                                       | 01 I8                       | Die ISMS-Leitung kann den Eigentümer ohnehin direkt ändern; die Oberfläche schickt keine `personId`.                                                                |
| H6  | Keine Sicherheits-Header, Swagger öffentlich (`infra/docker/nginx.conf:31-42`, `app.factory.ts:22`) | 01 I9, 07 I9                | Einbetten scheitert am `SameSite=strict`-Cookie und am Token im Speicher; reine Härtung.                                                                            |
| H7  | `javascript:`-Verweis an Nachweisen (`dto.ts:798`, `EvidenceSection.tsx:143-149`)                   | 03 I4, 07 I1                | Anlegen kann nur die ISMS-Leitung, Auditor und Risk-Owner bekommen 403; `noopener` verhindert die Ausführung im eigenen Ursprung wahrscheinlich.                    |
| H8  | CSV-Zelle mit Komma (`exports/csv.ts:16-27`)                                                        | 03 I5                       | Nur in der letzten Spalte, ohne `"`, beim Doppelklick in englischem Excel; Tabs werden schon entschärft.                                                            |
| H9  | 413 wird 500, Datenbank-Detail in Fehlermeldungen (`problem.filter.ts:57-81`)                       | 03 I7                       | `detail` enthält nur eigene Werte; global eindeutige Spalten werden vorher mit eigener 409 geprüft.                                                                 |
| H10 | Kalendermonat in UTC (`reporting-deadlines.ts:40-47`)                                               | 05 I5                       | Tritt nur bei Meldung zwischen 22 und 24 Uhr UTC am Monatsende auf, 30 bis 90 Minuten zu spät.                                                                      |
| H11 | Fremde Datei als Schulungsnachweis anheftbar (`trainings.service.ts:147`)                           | 06 I2                       | Dateinamen sieht jede Rolle ohnehin über `GET /files`; die Löschsperre lässt sich mit `evidenceFileId: null` lösen.                                                 |
| H12 | DSFA-Stellungnahme ohne Zustandsprüfung (`dpia.service.ts:147`, `:154`)                             | 06 I5                       | `privacy.write` hat nur die DSB; jeder Weg ist eine Selbstumgehung der Rolle, die die Stellungnahme ohnehin abgibt.                                                 |
| H13 | Demodaten in Compose voreingestellt (`docker-compose.yml:74-75`, `demo-seed.ts:99`, `:119`)         | 06 I6                       | Die Demokonten erreichen nur den erfundenen Mandanten, und `deployment.md` nennt den Schalter viermal.                                                              |
| H14 | Seitenfenster drehen bei Fehler endlos (z. B. `Risks.tsx:355`)                                      | 07 I4                       | Bedienfehler ohne Datenfolge.                                                                                                                                       |
| H15 | API-Client wirft englischen `SyntaxError` (`apps/web/src/lib/api.ts:86`, `:121`)                    | 07 I6                       | Nur bei HTML-Fehlerseiten des Proxys.                                                                                                                               |
| H16 | Felder ohne Beschriftung (z. B. `Soa.tsx:274`, `Privacy.tsx:941`)                                   | 07 I8                       | Platzhalter liefern nach accname einen Namen; echte Lücken sind nur die Auswahllisten in Tabellen.                                                                  |
| H17 | Ports an allen Schnittstellen (`infra/docker/docker-compose.yml:11`, `docker-compose.yml:141`)      | 07 I10                      | Die Entwicklungsdatenbank hält nur Entwicklungsdaten; auf dem Server muss 8080 erreichbar sein.                                                                     |
| H18 | Statustexte weichen von `packages/shared/src/labels.ts` ab (`ui.tsx:165`)                           | 07 I11                      | Uneinheitliche Begriffe zwischen Bildschirm und Auditpaket, keine Datenfolge.                                                                                       |
| H19 | Testlücken ohne heutigen Fehler                                                                     | 02 I7, 04 I10, 06 I7, 06 I8 | Kein Katalogtest für RLS und App-Rolle, Tests mit festgeschriebenem Fehlverhalten aus 04, kein Lese-403 für Datenschutz, KI-Paritätstest nur über zufällige Zeilen. |
| H20 | Deaktivierte Personen behalten `_own` (`auth.service.ts:289-295`)                                   | 04 I9 (Teil 3)              | Der Zugang hängt an der Mitgliedschaft; eine Person zu deaktivieren ist kein Offboarding.                                                                           |

## Abweichungen von den Vorschlägen der Prüfagenten

- **K5 (02 I2, 04 C3):** Die Agenten schlugen Important vor. Endstufe Critical, siehe K5.
- **04 I9:** Der Befund ist in drei Teile zerlegt: W4 (`removeResource` ohne Eigentumsprüfung), W21
  (Eigentümer `null`) und H20 (deaktivierte Personen).
- **06 C1 und 03 I6:** Beide sind in W10 zusammengefasst, weil der Protokollteil von 06 C1 dieselbe
  Ursache hat wie 03 I6.

## Falsche Teilaussagen in den Berichten

| Bericht      | Aussage                                                                                    | Was stimmt                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03 I4, 07 I1 | Einen `javascript:`-Verweis kann anlegen, wer `measure.write_own` hat, „auch der Auditor“. | Nur volles `measure.write`, also nur die ISMS-Leitung. Der Auditor scheitert am Guard, der Risk-Owner an `assertEvidenceWriter` (`can()` ohne Datensatz). |
| 03 I5        | Tabs sollten auch entschärft werden.                                                       | Schon umgesetzt (`csv.ts:16`); nur der Kopfkommentar nennt sie nicht.                                                                                     |
| 03 I7        | Fehlermeldungen geben Werte über Mandanten hinweg preis.                                   | `detail` nennt nur eigene Werte; `email` und `slug` werden vorher eigens geprüft.                                                                         |
| 06 I6        | Der Schalter `ISMS_SEED_DEMO` steht nur in `docs/deployment.md:230`.                       | Er steht auch in `:90`, `:101` und `:122`.                                                                                                                |
| 07 I7        | Schließen nur per Klick auf den Hintergrund.                                               | Nach dem Laden gibt es eine Schaltfläche „Schließen“.                                                                                                     |
| 07 I8        | Die DSFA-Auswahlfelder klingen gleich („3, Auswahlfeld“).                                  | Sie heißen „W 3“ und „S 3“. Context.tsx:397, :401, Competence.tsx:795 und Privacy.tsx:1083 sind Auswahllisten ohne Namen, nicht Felder mit Platzhalter.   |
| 01 I1        | Neu ausgestellte Geschwister-Token überleben das Abmelden.                                 | Sie werden beim Abmelden mitgesperrt; nur der ältere, schon ersetzte Token wird in der Gnadenfrist erneut akzeptiert.                                     |

Falsche Zeilennummern haben die Agenten ebenfalls gemeldet. Alle sind gering (ein bis drei Zeilen
daneben oder Bereichsgrenzen), keine zeigt auf falschen Code. Die Belegstellen in diesem Dokument
sind die berichtigten.
