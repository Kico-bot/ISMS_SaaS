# Review 02: Datenbank, Rechte und Eingabeschemas

Stand: 11.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

**Geprüft** wurden `packages/db` (Schema, alle Migrationen 0000 bis 0017, Seeds) und `packages/shared`
(Rechte, Rollen, Richtlinien-Helfer, Zod-Schemas). Dazu kamen die Tests in `packages/db`,
`packages/shared` und `apps/api/test` sowie die Rollen in `infra/docker/postgres-init.sql` und
`docker-compose.yml`.

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer: Korrektheit, Architektur
2. Security-Auditor: Angriffswege. Er hat jede Behauptung über die Datenbank als App-Rolle
   `isms_app` nachgewiesen, in Transaktionen mit `ROLLBACK`.
3. Test-Engineer: Testabdeckung und Testqualität; er hat alle Testsuiten ausgeführt.

Jede Rolle kannte die Befunde der vorherigen. Alle Zeilenangaben sind am Code nachgeprüft. Befunde
aus [Review 01](01-auth-mandantentrennung.md) werden hier nicht wiederholt, nur dort erweitert, wo
diese Prüfung mehr gefunden hat.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | Eine Zusage der Suite lässt sich über die normale Oberfläche oder API brechen, etwa das Vier-Augen-Prinzip oder die Mandantentrennung. Vor einem produktiven Einsatz beheben. |
| Important  | Echter Fehler mit begrenzter Wirkung, ein Angriffsweg mit Voraussetzungen (etwa SQL-Zugriff als App-Rolle) oder ein Test, der einen Fehler festschreibt. Bald beheben.        |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                                                                                  |

## Antworten auf die vier Fragen

1. **Hat jede Tabelle mit `tenant_id` eine Richtlinie für die Zeilensicherheit?**
   - Ja. Geprüft am SQL und am Katalog der laufenden Datenbank.
   - Alle 60 Mandantentabellen haben die Zeilensicherheit eingeschaltet, mit einer Richtlinie für
     `USING` und `WITH CHECK`. Das gilt auch für die später hinzugekommenen Tabellen
     `audit_requirement` (0005), `tenant_module` (0010), `ai_system` (0015) und `isms_scope` (0017).
   - Die Zwischentabellen ohne `tenant_id` sind über `rls_junction` geschützt.
   - Einzige Ausnahme ist `tenant_membership`, und zwar bewusst (`0001_rls_triggers_views.sql:51`).
   - Ein Test, der das für künftige Tabellen sichert, fehlt (I7).
2. **Lassen sich die Trigger für das Vier-Augen-Prinzip umgehen?**
   - Ja, auf drei Wegen. Die Trigger prüfen nur, wenn die Spalte der handelnden Person gesetzt wird.
   - Den Status „bestätigt“ oder „akzeptiert“ kann man aber direkt setzen, ohne Person (C1).
   - Wechselt der Eigentümer nach der Freigabe, prüft niemand nach (I1).
   - Mit einer temporären Tabelle lässt sich die Prüfung aushebeln (I4).
3. **Sind Rechte, Rollen und Zod-Schemas zu weit gefasst?**
   - Teilweise. Die Patch-Schemas lassen Status zu, die nur über einen Vier-Augen-Schritt entstehen
     dürfen (C1).
   - Der ISMS-Manager kann ein Audit selbst als berichtet abschließen und damit Auditabdeckung
     erzeugen (I2).
   - Die Richtlinie auf `role` und `sod_rule` erlaubt jedem Mandanten, globale Zeilen zu ändern (I3).
   - Mehrere Listen und Zahlen in den Schemas haben keine Obergrenze (Suggestion).
4. **Mit welcher Rolle läuft die API, und kann sie die Zeilensicherheit umgehen?**
   - Die API läuft als `isms_app`: kein Superuser, `NOBYPASSRLS`, Eigentümerin keiner Tabelle, kein
     `CREATE` im Schema.
   - Die Zeilensicherheit kann sie damit nicht direkt umgehen.
   - Aber der API-Container kennt zusätzlich die Zugangsdaten des Tabelleneigentümers
     `isms_migrator`, für den die Zeilensicherheit nicht gilt (I5).
   - Und `isms_app` darf temporäre Tabellen anlegen, was die Trigger angreifbar macht (I4).

## Critical

### C1 Den Status „bestätigt“ oder „akzeptiert“ kann man direkt setzen, ohne zweite Person

- **Fundstellen:**

  | Bereich          | Schema                                                                                                                      | Service                                                                                             |
  | ---------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
  | Maßnahme         | `MeasureDto.status` umfasst `verified`, `MeasurePatchDto = MeasureDto.partial()` (`packages/shared/src/dto.ts:181`, `:188`) | übernommen in `apps/api/src/modules/measures/measures.service.ts:101` (Anlegen) und `:128` (Ändern) |
  | Risiko           | `RiskDto.status` umfasst `accepted`, dazu `RiskPatchDto` (`dto.ts:233`, `:239`)                                             | `apps/api/src/modules/risks/risks.service.ts:114` und `:141`                                        |
  | Verbesserung     | `ActionPatchDto.status` umfasst `verified` (`dto.ts:357-358`)                                                               | `apps/api/src/modules/improvement/actions.service.ts:109-113`                                       |
  | Änderungsplanung | `ChangePlanEntryPatchDto.status` umfasst `approved` (`dto.ts:574-576`)                                                      | `apps/api/src/modules/context/planning.service.ts:151-153`                                          |

- **Warum die Datenbank nicht hilft:** Die Trigger `trg_measure_sod`, `trg_risk_sod` und
  `trg_action_sod` prüfen nur, wenn `verified_by_user_id` bzw. `accepted_by_user_id` gesetzt ist
  (`packages/db/migrations/0001_rls_triggers_views.sql:119-155`). Es gibt keine CHECK-Bedingung, die
  den Status an die handelnde Person bindet.
- **Ablauf eines Angriffs:**
  - Eine Person mit der Rolle Risk-Owner, die nur `measure.write_own` hat, sendet
    `PATCH /measures/:id {"status":"verified"}` auf ihre eigene Maßnahme. Die Maßnahme gilt danach
    als wirksam bestätigt, mit leerer bestätigender Person.
  - Genauso funktioniert `PATCH /actions/:id {"status":"verified"}`.
  - `PATCH /risks/:id {"status":"accepted"}` lässt ein Risiko als bewusst getragen erscheinen, ohne
    Freigabe der Leitung.
  - Bei der Änderungsplanung führt `PATCH {"status":"approved"}` zu einer Freigabe ohne bewertete
    Auswirkung und ohne zweite Person. Das Auditpaket zeigt dann „freigegeben“ mit leerer Spalte
    „Freigegeben durch“ (`package.service.ts:386-397`).
- **Nachweis:**
  - Der Security-Auditor hat `UPDATE measure SET status='verified'` und
    `UPDATE risk SET status='accepted'` als `isms_app` ausgeführt. Beides gelingt.
  - Die Demodaten zeigen den Fehler bereits: Maßnahme M-0009 steht auf `verified`, ohne bestätigende
    Person. Sie entsteht über `measures.create` mit `status: 'verified'` (`apps/api/src/demo-seed.ts:986-990`).
  - Abdeckung, Grundschutz-Check und Kennzahlen zählen sie als erledigt.
- **Vergleich:** Feststellungen machen es richtig. `findings.service.ts:146-152` lehnt
  `status = 'verified'` ab und verweist auf den eigenen Bestätigungsweg.
- **Vorschlag:**
  - Die Status, die eine Freigabe bedeuten, aus den Schemas für Anlegen und Ändern nehmen:
    `verified`, `accepted` und `approved`.
  - Bei Risiken `status` ganz aus dem Schema nehmen. Laut CLAUDE.md setzt ihn nur der Service.
  - Als zweite Linie CHECK-Bedingungen in der Datenbank, zum Beispiel
    `status <> 'verified' OR verified_by_user_id IS NOT NULL`. Bei der Änderungsplanung zusätzlich
    `approved_by_user_id IS DISTINCT FROM created_by_user_id`.
  - Eine Migration, die M-0009 und vergleichbare Zeilen bereinigt.

## Important

### I1 Wechselt der Eigentümer nach der Freigabe, prüft niemand mehr das Vier-Augen-Prinzip

- **Fundstellen:**
  - Die Trigger für Risiko, Maßnahme und Verbesserung prüfen nur, wenn die Spalte der handelnden Person
    geändert wird (`0001_rls_triggers_views.sql:119-155`).
  - `trg_finding_sod` feuert nur bei `UPDATE OF measure_id, raised_by_user_id` (`0001:146`).
  - `trg_finding_verify_sod` prüft nicht nach, wenn sich der Eigentümer der Verbesserung ändert
    (`0005_audit_requirement_rls.sql:10-13`).
  - `assert_distinct_actor` bricht ohne Prüfung ab, wenn kein Eigentümer gesetzt ist (`0001:111`).
  - Die Services setzen eine Freigabe beim Eigentümerwechsel nicht zurück:
    - `risks.service.ts:133-147`
    - `measures.service.ts:127`
    - `actions.service.ts:98-107`
- **Ablauf:** Alice gehört Risiko R.
  1. Sie setzt Bob als Eigentümer.
  2. Sie trägt das Risiko bewusst. Der Trigger vergleicht Alice mit Bob und lässt es zu.
  3. Sie setzt sich wieder als Eigentümerin.

  R ist dann von seiner eigenen Eigentümerin akzeptiert. Dasselbe geht bei der Bestätigung von
  Maßnahmen und Verbesserungen. Ein Datensatz ohne Eigentümer kann von jedem freigegeben und danach
  zugewiesen werden.

- **Nachweis:** Der Security-Auditor hat bei R-0004 den Eigentümer auf die akzeptierende Person
  gesetzt. Das gelingt, danach sind Eigentümer und akzeptierende Person dieselbe.
- **Einordnung:** Das ist die allgemeine Form des Befunds I8 aus Review 01 (Umhängen einer Person per
  Einladung).
- **Vorschlag:**
  - Die Trigger auch bei einem Wechsel des Eigentümers prüfen lassen, wenn die Freigabe gesetzt ist.
  - Oder: Der Service setzt die Freigabe beim Eigentümerwechsel zurück, so wie eine neue Bewertung
    die Übernahme schon heute aufhebt (`risks.service.ts:180-190`).
  - Freigabe ohne Eigentümer ablehnen.

### I2 Der ISMS-Manager kann Auditabdeckung ohne Auditor und ohne Bericht erzeugen

- **Fundstellen:**
  - `packages/shared/src/permissions.ts:205` gibt `isms_manager` das Recht `AUDIT_WRITE`.
  - `apps/api/src/modules/audit/audits.service.ts:112-150` lässt mit diesem Recht jeden
    `leadAuditorUserId` und die Status `reported` und `closed` zu.
  - Einen Bericht verlangt nur der Übergang zu `reported` (`audits.service.ts:142`). Ein direkter
    Abschluss mit `closed` geht ohne Bericht.
  - Ein abgeschlossenes Audit bleibt änderbar, gesperrt ist nur das Wiedereröffnen
    (`audits.service.ts:129`). Danach lassen sich noch ändern:
    - der Umfang (`requirementIds`),
    - die Termine,
    - der Bericht, den man auch wieder entfernen kann.
  - `v_audit_coverage` zählt jedes Audit mit Status `reported` oder `closed` (`0010_grundschutz_scope.sql:77-96`).
- **Ablauf:** Der ISMS-Manager legt ein Audit an, trägt sich selbst als leitenden Auditor ein und
  setzt `closed` mit allen Anforderungen und dem heutigen Datum. Alle Kapitel gelten danach als im
  Dreijahreszyklus geprüft (ISO 27001 Kap. 9.2.2). CLAUDE.md sagt: Der ISMS-Manager prüft seine
  eigene Arbeit nicht.
- **Vorschlag:**
  - Den Übergang zu `reported` und `closed` nur der leitenden Auditorin erlauben, und nur mit der
    Rolle Auditor.
  - Einen Bericht auch für `closed` verlangen.
  - Berichtete und abgeschlossene Audits bis auf den nächsten Statusschritt sperren, auch in der
    Datenbank.
  - Prüfen, dass `leadAuditorUserId` dem Mandanten angehört.
- **Achtung Tests:** `apps/api/test/audit.e2e.test.ts:148-152` und `:159` lassen genau das als
  ISMS-Manager zu und schreiben den Fehler damit fest (siehe I8).

### I3 Jeder Mandant kann globale Rollen und Regeln zur Funktionstrennung ändern oder löschen

- **Fundstelle:** `packages/db/migrations/0001_rls_triggers_views.sql:62-70`. Die Richtlinien auf
  `role` und `sod_rule` lauten `USING (tenant_id IS NULL OR tenant_id = current_tenant_id())`. In
  PostgreSQL bestimmt `USING` auch, welche Zeilen `UPDATE` und `DELETE` erreichen. `WITH CHECK`
  begrenzt nur die neue Zeile.
- **Nachweis** als `isms_app` aus einem beliebigen Mandantenkontext, jeweils zurückgerollt:

  | Anweisung                                                                 | Ergebnis | Wirkung                                                                  |
  | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
  | `DELETE FROM sod_rule WHERE tenant_id IS NULL`                            | 3 Zeilen | Alle globalen Regeln zur Funktionstrennung sind weg, für alle Mandanten. |
  | `DELETE FROM role WHERE tenant_id IS NULL AND key='dpo'`                  | 1 Zeile  | Die Löschung kaskadiert auf alle Zuordnungen.                            |
  | `UPDATE role SET tenant_id=<T> WHERE key='auditor' AND tenant_id IS NULL` | gelingt  | Die Systemrolle wird in einen Mandanten gezogen.                         |

- **Zweiter Weg:** `members.service.ts:168-185` bevorzugt eine mandanteneigene Rolle mit gleichem
  Schlüssel. Die globalen Regeln zeigen aber auf die IDs der Systemrollen. Eine eigene Zeile
  `role(key='auditor', tenant_id=T)` lässt die Sperre Auditor plus ISMS-Manager still ins Leere
  laufen.
- **Einordnung:** Heute gibt es dafür keinen Weg über die API. Nötig ist SQL-Zugriff als
  `isms_app`, etwa durch eine Einschleusung. Deshalb Important.
- **Vorschlag:**
  - Getrennte Richtlinien: lesen mit `tenant_id IS NULL OR tenant_id = current_tenant_id()`,
    schreiben nur mit `tenant_id = current_tenant_id()`.
  - Mandanteneigene Kopien von Systemschlüsseln ablehnen, oder die Funktionstrennung über den
    Schlüssel statt über die ID prüfen.

### I4 Mit einer temporären Tabelle lassen sich die Vier-Augen-Trigger aushebeln

- **Fundstellen:**
  - `assert_distinct_actor` und `trg_finding_sod` laufen mit `SECURITY DEFINER SET search_path = public`
    (`0001_rls_triggers_views.sql:108` und `:137`). Ohne `pg_temp` am Ende sucht PostgreSQL zuerst im
    temporären Schema.
  - Die übrigen Triggerfunktionen nennen Tabellen ohne Schema und setzen keinen Suchpfad:
    - `trg_finding_verify_sod`, Tabelle `action` (`0005_audit_requirement_rls.sql:12`)
    - `trg_tenant_module_kind`, Tabelle `requirement` (`0010_grundschutz_scope.sql:22`)
  - `isms_app` hat das Recht `TEMP` auf der Datenbank.
- **Nachweis** als `isms_app`, zurückgerollt:
  - Ohne temporäre Tabelle lehnt die Datenbank die Selbstbestätigung ab (`sod_violation`).
  - Mit `CREATE TEMP TABLE action(...)` bestätigt die Eigentümerin ihre eigene Feststellung F-0001.
  - Mit `CREATE TEMP TABLE person(...)` bestätigt der Eigentümer seine eigene Maßnahme M-0008.
- **Einordnung:** Voraussetzung ist beliebiges SQL als `isms_app`. Gerade für diesen Fall sind die
  Trigger aber als zweite Linie gedacht.
- **Vorschlag:**
  - `SET search_path = pg_catalog, public, pg_temp` für alle Trigger- und Hilfsfunktionen, oder jede
    Tabelle mit Schema nennen.
  - In `infra/docker/postgres-init.sql` das Recht `TEMPORARY` auf den Datenbanken entziehen.

### I5 Der API-Container kennt die Zugangsdaten des Tabelleneigentümers

- **Fundstellen:**
  - `docker-compose.yml:20-23` gibt `DATABASE_URL_MIGRATOR` an alle Dienste, die `x-db-env` einbinden,
    also auch an `api` und `worker`.
  - pg-boss verbindet sich damit (`apps/api/src/kernel/jobs/jobs.service.ts:23`).
  - `isms_migrator` besitzt alle 84 Tabellen. Keine hat `FORCE ROW LEVEL SECURITY`.
  - Beide Passwörter stehen fest im Klartext, in `docker-compose.yml:22-23` und
    `infra/docker/postgres-init.sql:3-4`. Anders als alle anderen Einstellungen sind sie nicht über
    `ISMS_` einstellbar.
- **Wirkung:** Gelangt jemand an die Umgebung des öffentlich erreichbaren API-Prozesses, etwa über
  eine Lücke zur Codeausführung oder ein Protokoll, hat er eine Rolle mit diesen Möglichkeiten:
  - Für sie gilt keine Zeilensicherheit.
  - Sie kann Trigger abschalten.
  - Sie kann das Änderungsprotokoll löschen.
  - Sie kann Richtlinien ändern.
- **Vorschlag:**
  - `DATABASE_URL_MIGRATOR` nur dem Dienst `migrate` geben.
  - pg-boss eine eigene Rolle geben, der nur das Schema `pgboss` gehört.
  - `FORCE ROW LEVEL SECURITY` auf den Mandantentabellen erwägen.
  - Die Passwörter als `ISMS_`-Variablen führen.

### I6 Das Änderungsprotokoll lässt sich über Kaskaden löschen und rückdatieren

- **Fundstellen:**
  - `audit_log.tenant_id` verweist mit `ON DELETE CASCADE` auf `tenant`.
  - `audit_log.actor_user_id` verweist mit `ON DELETE SET NULL` auf `user`
    (`packages/db/migrations/0000_init.sql:1251-1252`).
  - `isms_app` darf in `tenant` und `user` löschen, beide Tabellen haben keine Zeilensicherheit
    (`0001_rls_triggers_views.sql:194`).
- **Nachweis** als `isms_app`, zurückgerollt:
  - Direktes `DELETE FROM audit_log` wird wie gewollt abgelehnt.
  - Aber `DELETE FROM tenant WHERE id=T` löscht alle Protokolleinträge des Mandanten.
  - Das Löschen eines Kontos macht die handelnde Person in seinen Einträgen unkenntlich.
  - Ein Eintrag mit `at='2020-01-01'` und erfundener Person wird angenommen.
- **Einordnung:** Kein API-Weg löscht heute Konten oder Mandanten. CLAUDE.md verspricht aber, dass
  „nicht einmal die ISMS-Leitung ihre Spuren verwischen kann“. Der Test dazu prüft nur direktes
  Ändern und Löschen (`apps/api/test/auditlog.e2e.test.ts:177-189`).
- **Vorschlag:**
  - Beide Fremdschlüssel auf `ON DELETE RESTRICT` setzen.
  - `isms_app` das Löschen in `tenant` und `user` entziehen.
  - Einen Trigger, der `at := now()` erzwingt.

### I7 Kein Test sichert die Zeilensicherheit und die Datenbankrolle ab

- **Was fehlt:**
  - Kein Test prüft, ob jede Tabelle mit `tenant_id` Zeilensicherheit und eine Richtlinie hat.
  - `packages/db/src/db.test.ts:99-130` prüft das nur für `asset`. Seit Migration 0010 muss jede
    neue Tabelle die Richtlinie von Hand bekommen.
  - Die Standardrechte (`0001_rls_triggers_views.sql:200`) machen jede neue Tabelle sofort für die App
    beschreibbar.
  - Kein Test prüft, dass die API als `isms_app` ohne `BYPASSRLS` und ohne eigene Tabellen läuft.
  - `db.test.ts:16` und `apps/api/test/setup.ts:10` erzeugen die App-Verbindung durch
    Textersetzung. Andere Zugangsdaten in `DATABASE_URL_TEST` machen daraus still den Eigentümer, für
    den die Zeilensicherheit nicht gilt. Die Tests blieben trotzdem grün.
- **Vorschlag:** Je ein Test über den Systemkatalog in `db.test.ts`:
  - Jede Tabelle mit `tenant_id` hat Zeilensicherheit und eine Richtlinie mit `USING` und
    `WITH CHECK`. Ausnahmen stehen auf einer ausdrücklichen Liste.
  - `current_user` ist `isms_app`, `rolbypassrls` und `rolsuper` sind falsch, und die Rolle besitzt
    keine Tabelle.

  Dieselbe Prüfung gehört als Selbsttest in den Start der API.

### I8 Tests schreiben Fehler fest oder können nicht scheitern

- **`apps/api/test/audit.e2e.test.ts:148-152` und `:159`:** Der ISMS-Manager setzt `reported` und
  `closed`, und der Test erwartet 200. Damit ist I2 als gewolltes Verhalten festgeschrieben. Eine
  Korrektur bricht diese Tests.
- **`apps/api/test/demo-seed.e2e.test.ts:82-101`:** Der Test prüft nur, dass handelnde Person und
  Eigentümer verschieden sind. Freigaben ohne handelnde Person übersieht er, deshalb fällt M-0009
  nicht auf.
- **`packages/db/src/db.test.ts:90-95`:** „ist idempotent“ zählt zweimal nach dem Seed und kann nie
  scheitern (schon in Review 01 genannt).
- **`db.test.ts:141-153`:** Der Trigger-Test prüft nur `trg_risk_sod` und nur beim Einfügen. Für die
  Trigger von Maßnahme, Verbesserung und Feststellung gibt es keinen Test in der Datenbank. Die
  Bestätigung einer Maßnahme (`/measures/:id/verify`) ruft kein Test auf.
- **`apps/api/test/auditlog.e2e.test.ts:177-189`:** `TRUNCATE` und der Weg über Kaskaden (I6) fehlen.

## Suggestion

### Rechte und Rollen

- **Die Services prüfen das Vier-Augen-Prinzip bei Risiko, Maßnahme und Verbesserung nicht selbst.**
  Es gibt keinen Vergleich von handelnder Person und Eigentümer in `risks.service.ts:212-245`,
  `measures.service.ts:143-155` und `actions.service.ts:124-145`. CLAUDE.md verlangt die Prüfung im
  Service und in der Datenbank. Heute schützt nur der Trigger, und der ist umgehbar (C1, I1, I4).
- **Der ISMS-Manager hat `measure.verify` und `action.verify`** (`permissions.ts:198`, `:207`).
  Fremde Maßnahmen darf er bestätigen, die Trigger verhindern nur die eigenen. Ob das mit „prüft
  nicht die eigene Arbeit“ vereinbar ist, sollte entschieden und mit einem Test festgehalten werden.
- **Die Rolle Datenschutz hat mandantenweit `DOCUMENT_WRITE` und `INCIDENT_WRITE`**
  (`permissions.ts:258-259`). Das ist weiter, als CLAUDE.md beschreibt. Freigaben brauchen weiter
  den ISMS-Manager, deshalb ist es vertretbar. Eine Begrenzung auf Datenschutzdokumente wäre
  genauer.
- **Beim Anlegen prüft der Service einen anderen Eigentümer, als er speichert.**
  - `risks.service.ts:100` prüft `dto.ownerPersonId ?? ctx.personId`, `:113` speichert
    `dto.ownerPersonId ?? null`.
  - Ebenso `measures.service.ts:89` und `:100`.
  - Eine Person mit `write_own` legt so einen Datensatz ohne Eigentümer an, den sie danach nicht mehr
    bearbeiten kann und der unter die Lücke ohne Eigentümer aus I1 fällt.

### Datenbank

- **Plattformtabellen sind aus jedem Mandantenkontext lesbar und schreibbar.** Aus einem fremden
  Mandantenkontext liefert `person` 0 Zeilen, aber:
  - `user`: 5 Zeilen, alle mit Passwort-Hash
  - `refresh_token`: 85 Zeilen
  - `tenant`
  - `tenant_membership`

  Zusätzlich prüft `AuditDto.leadAuditorUserId` (`dto.ts:414`) nur den Fremdschlüssel auf `user`, das
  keinen Mandanten kennt. Erweiterung zu Review 01.

- **Andere Freigaben haben keine Absicherung in der Datenbank.** Das betrifft die Freigabe der BIA,
  die Stellungnahme zur Folgenabschätzung und das Einfrieren der Managementbewertung.
  `management_review.inputs` einer abgeschlossenen Bewertung lässt sich als `isms_app` ändern.
- **`isms_app` darf jede Funktion ausführen** (`0001_rls_triggers_views.sql:196`), auch
  `assert_distinct_actor`. Direkt aufgerufen verrät diese Funktion über Mandanten hinweg, welche
  Person zu welchem Konto gehört. Für interne Hilfsfunktionen das Ausführungsrecht entziehen.
- **Die Standardrechte geben jeder künftigen Tabelle volle Schreibrechte für die App**
  (`0001:200-201`). Rechte besser je Migration ausdrücklich vergeben.
- **Keine Absicherung beim Start**, falls `DATABASE_URL` doch auf den Eigentümer zeigt
  (`apps/api/src/config/env.ts:28`). Siehe Selbsttest in I7.

### Fachliche Prüfungen

- **Ein aktives Verarbeitungsverzeichnis lässt sich ungültig machen.**
  `apps/api/src/modules/privacy/processing.service.ts:138` prüft nach Art. 30 nur, wenn `status`
  mitgeschickt wird. `PATCH {legalBasis: null}` auf einen aktiven Eintrag bleibt aktiv. Das
  KI-Register macht es richtig (`ai-systems.service.ts:118`): Dort wird immer geprüft, wenn das
  Ergebnis aktiv ist.
- **Die Übernahme eines Risikos hat keine Fristgrenze.** `AcceptRiskDto.validUntil` (`dto.ts:261`)
  nimmt jedes Datum an, auch eines in der Vergangenheit oder `9999-12-31`. Eine Übernahme bis 9999
  erscheint nie als ablaufend. Vorschlag: zwischen morgen und höchstens 36 Monaten.

### Zod-Schemas

- **Listen ohne Obergrenze:**
  - `RiskDto.assetIds` (`dto.ts:235`)
  - `IncidentDto.assetIds` (`:294`)
  - `ConfirmBreachDto.processingActivityIds` (`:308`)
  - `AcknowledgementRequestDto.personIds` (`:400`)
  - `AuditDto.requirementIds` (`:416`)
  - `SecurityObjectiveDto.requirementIds` (`:544`)
  - `CompetenceProfileDto.requirements` (`:605`)
  - Zuweisungen in `:621` und `:638`
- **Zahlen ohne Obergrenze:** `effortDays` und `costEur` (`dto.ts:184-185`), `KpiDto.target`
  (`:466`), `KpiValueDto.value` (`:478`), Werte der Risikoquantifizierung.
- **Wirkung:** Ausnutzbar ist das nur bis zur Grenze für die Größe einer Anfrage. Es führt aber zu
  Fehlern 500 oder sehr großen Einfügungen.
- **`ListQuery.sort` (`dto.ts:279`)** wird nirgends gelesen und kann entfallen.

### Tests

- **`packages/shared/src/policy.test.ts:15-27`:**
  - Drei Fälle für den Kern der Rechteprüfung.
  - `actionsFor` (`policy.ts:34`) fehlt.
  - Der Schutz für Person und Eigentümer, die beide leer sind (`policy.ts:27`), fehlt.
- **Rollenmatrix:** Kein Test hält die Zuordnung von Rollen zu Rechten gegen die Regeln aus CLAUDE.md
  fest. Ebenso wenig prüft einer, dass die gesäten Rechte genau `SYSTEM_ROLES` entsprechen.
- **Zeilensicherheit:** Nur `asset` ist getestet, und nur Lesen und Einfügen. Ändern und Löschen
  über Mandanten hinweg sowie Zwischentabellen fehlen.

## Zeilensicherheit im Überblick

Stand im Katalog der laufenden Datenbank. Alle Tabellen gehören `isms_migrator`, keine erzwingt die
Zeilensicherheit auch für den Eigentümer (`FORCE`).

| Tabellen                                                                | Zeilensicherheit | Richtlinie                                                        | Quelle                  |
| ----------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- | ----------------------- |
| 53 Fachtabellen mit `tenant_id` (Asset bis Training)                    | ein              | `tenant_id = current_tenant_id()` für Lesen und Schreiben         | `0001:45-59` (Schleife) |
| `tenant_framework`                                                      | ein              | wie oben                                                          | `0001`                  |
| `role`, `sod_rule`                                                      | ein              | lesen: global oder eigener Mandant; **schreiben: ebenso** (I3)    | `0001:62-70`            |
| `audit_log`                                                             | ein              | `IS NOT DISTINCT FROM`; Ändern, Löschen, Leeren entzogen          | `0001`, `0001:197`      |
| `audit_requirement`                                                     | ein              | über `rls_junction`                                               | `0005`                  |
| `tenant_module`                                                         | ein              | wie oben                                                          | `0010:14-16`            |
| `ai_system`                                                             | ein              | wie oben                                                          | `0015:13-15`            |
| `isms_scope`                                                            | ein              | wie oben                                                          | `0017`                  |
| 13 Zwischentabellen ohne `tenant_id`                                    | ein              | `rls_junction`: Elterndatensatz sichtbar (nur eine Seite geprüft) | `0001:83-102`           |
| `tenant_membership`                                                     | **aus**          | keine, bewusst                                                    | `0001:51`               |
| `tenant`, `user`, `refresh_token`, `membership_role`, `role_permission` | aus              | keine; App darf lesen und schreiben                               | Plattformtabellen       |
| `framework`, `requirement`, `requirement_crosswalk`, `permission`       | aus              | keine; App darf nur lesen                                         | `0001:199`              |

## Rolle und Rechte der API in der Datenbank

| Eigenschaft                                      | Wert                                                                                                     | Beleg                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Rolle                                            | `isms_app`                                                                                               | `docker-compose.yml:22`, `apps/api/test/setup.ts:10` |
| Superuser, `BYPASSRLS`, `CREATEROLE`, `CREATEDB` | nein                                                                                                     | `infra/docker/postgres-init.sql:4`, Katalog          |
| Mitglied anderer Rollen                          | nein                                                                                                     | Katalog                                              |
| Eigentümerin von Tabellen                        | keine                                                                                                    | Katalog: alle 84 gehören `isms_migrator`             |
| `CREATE` im Schema `public`                      | nein                                                                                                     | Katalog                                              |
| `TEMP` auf der Datenbank                         | **ja**                                                                                                   | Katalog, Grundlage für I4                            |
| Tabellenrechte                                   | Lesen, Einfügen, Ändern, Löschen auf allem, außer: Katalog nur Lesen, `audit_log` nur Lesen und Einfügen | `0001_rls_triggers_views.sql:194-199`                |
| Funktionen                                       | darf alle ausführen                                                                                      | `0001:196`                                           |
| Standardrechte für neue Tabellen                 | Lesen, Einfügen, Ändern, Löschen                                                                         | `0001:200-201`                                       |
| Mandantenkontext                                 | `set_config('app.tenant_id', …, true)`, nur für die Transaktion                                          | `packages/db/src/client.ts:22-29`                    |

**Ergebnis:** `isms_app` kann die Zeilensicherheit nicht abschalten oder umgehen. Ohne Mandanten
sieht sie keine Mandantenzeilen. Die Schwachstellen liegen daneben:

- Plattformtabellen ohne Zeilensicherheit
- die Richtlinie auf `role` und `sod_rule` (I3)
- temporäre Tabellen (I4)
- die Zugangsdaten des Eigentümers im API-Container (I5)

## Fehlende Tests nach Priorität

| Prio       | Schützt vor              | Datei                                                                   | Verbindung | Kern des Tests                                                                                                                                                                                                   |
| ---------- | ------------------------ | ----------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | C1                       | neu: `apps/api/test/sod-status.e2e.test.ts` oder bestehende E2E-Dateien | API        | `verified`, `accepted` und `approved` über Anlegen oder Ändern führen zu 400, der Status bleibt.                                                                                                                 |
| Critical   | C1                       | `packages/db/src/db.test.ts`                                            | App-Rolle  | Einfügen mit `status='verified'` ohne bestätigende Person scheitert an einer CHECK-Bedingung.                                                                                                                    |
| Critical   | C1                       | `apps/api/test/demo-seed.e2e.test.ts`                                   | Migrator   | Keine Zeile mit Freigabestatus ohne handelnde Person. Scheitert heute an M-0009.                                                                                                                                 |
| Critical   | I1                       | `db.test.ts`                                                            | App-Rolle  | Eigentümer nach Freigabe auf die freigebende Person setzen ergibt `sod_violation`, für Risiko, Maßnahme und Verbesserung. Dasselbe mit leerem Eigentümer bei der Freigabe.                                       |
| Critical   | I4                       | `db.test.ts`                                                            | App-Rolle  | Leere temporäre Tabelle `action` anlegen, dann Selbstbestätigung: weiterhin `sod_violation`. Dazu eine Katalogprüfung, dass `isms_app` kein `TEMP` hat.                                                          |
| Critical   | I3                       | `db.test.ts`                                                            | App-Rolle  | Ändern und Löschen globaler Zeilen in `role`, `sod_rule` und `role_permission` trifft 0 Zeilen oder scheitert.                                                                                                   |
| Critical   | I7                       | `db.test.ts`                                                            | Migrator   | Jede Tabelle mit `tenant_id` hat Zeilensicherheit und eine Richtlinie, mit Ausnahmeliste. Die Menge der Tabellen ohne Zeilensicherheit entspricht einer festen Liste.                                            |
| Critical   | I7                       | `db.test.ts` und API-Start                                              | App-Rolle  | `current_user = 'isms_app'`, kein `BYPASSRLS`, kein Superuser, keine eigenen Tabellen.                                                                                                                           |
| Important  | I6                       | `apps/api/test/auditlog.e2e.test.ts`                                    | App-Rolle  | `TRUNCATE`, Löschen von Mandant oder Konto und rückdatiertes Einfügen werden abgelehnt oder ändern das Protokoll nicht.                                                                                          |
| Important  | I2                       | `audit.e2e.test.ts` (`:148-152` und `:159` umschreiben)                 | API        | ISMS-Manager setzt `reported` oder `closed`: 403. Abschluss ohne Bericht: 400. Abgeschlossenes Audit ändern: 409.                                                                                                |
| Important  | Plattformtabellen        | `db.test.ts`                                                            | App-Rolle  | Aus Mandant B sind Konten, Token und Mitgliedschaften von A nicht lesbar.                                                                                                                                        |
| Important  | Rollenmatrix             | neu: `packages/shared/src/permissions.test.ts`                          | Unit       | Plattform-Admin ohne Mandantenrechte. Auditor schreibt nur Audits, Feststellungen und bestätigt Verbesserungen. Risk-Owner nur `_own`. Jedes `write_own` hat ein `write`. Sperren für Auditor plus ISMS-Manager. |
| Important  | Gesäte Rechte            | `db.test.ts`                                                            | Migrator   | `role_permission` der Systemrollen entspricht genau `SYSTEM_ROLES`, `sod_rule` genau `SOD_RULES`.                                                                                                                |
| Important  | Verarbeitungsverzeichnis | `apps/api/test/privacy.e2e.test.ts`                                     | API        | Aktiven Eintrag ungültig ändern: 400 oder zurück auf Entwurf, nie aktiv und ungültig.                                                                                                                            |
| Important  | Bestätigung              | `apps/api/test/mapping.e2e.test.ts`                                     | API        | Eigentümer bestätigt eigene Maßnahme oder Verbesserung: 409. Wird heute nirgends aufgerufen.                                                                                                                     |
| Suggestion | Übernahmefrist           | `risks.e2e.test.ts`                                                     | API        | `validUntil` in der Vergangenheit oder in 2099: 400.                                                                                                                                                             |
| Suggestion | Zod-Grenzen              | neu: `packages/shared/src/dto.test.ts`                                  | Unit       | Listen mit 10.001 Einträgen und Zahlen wie `1e308` werden abgelehnt.                                                                                                                                             |
| Suggestion | Trigger                  | `db.test.ts`                                                            | App-Rolle  | Je Trigger Einfügen, Ändern der handelnden Person und Ändern des Eigentümers, als Tabelle von Fällen.                                                                                                            |

## Was gut gelöst ist

- **Zeilensicherheit:** Sie ist für alle Mandantentabellen vollständig und einheitlich, auch in den
  späteren Migrationen. Ohne Mandant sieht die App nichts.
- **Rollentrennung:** `isms_app` hat kein `BYPASSRLS`, besitzt nichts und darf nichts anlegen. Kataloge
  und Rechtekatalog sind für die App nur lesbar. Das Änderungsprotokoll ist gegen direktes Ändern
  und Löschen gesperrt.
- **Dokumentenfreigabe:** Freigabe nicht durch den Autor ist als CHECK-Bedingung umgesetzt
  (`0000_init.sql:306`). Kein Weg kommt daran vorbei.
- **Keine Mass Assignment:** Die Services übernehmen bei Änderungen nur ausdrücklich genannte Felder.
  `tenantId`, Nummern, Ersteller, Freigebende und eingefrorene Eingaben lassen sich über HTTP nicht
  setzen.
- **Rechte-Seed:** Er gleicht die Rechte exakt ab, mit Hinzufügen und Entfernen, und erhöht die
  Rechteversion (`packages/db/src/seed/rbac.ts:41-61`).

## Hinweis zu den Nachweisen

Der Security-Auditor hat seine Nachweise als `isms_app` in der Entwicklungsdatenbank ausgeführt, jede
Anweisung in einer zurückgerollten Transaktion. Es sind keine Daten geändert. Zwei zurückgerollte
Einfügungen haben Nummern der Sequenz `audit_log_id_seq` verbraucht. Der nächste echte
Protokolleintrag dort hat deshalb eine Lücke in der Nummerierung.
