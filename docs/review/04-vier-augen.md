# Review 04: Vier-Augen-Prinzip, abgeschlossene Stände und Schreibrechte

Stand: 11.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

**Geprüft** wurden diese Module unter `apps/api/src/modules/`:

- `documents`
- `audit` (Audits, Feststellungen, Kennzahlen, Managementbewertung)
- `risks`
- `measures`
- `improvement`
- `continuity`

Dazu kamen die Teile, auf die sie sich stützen:

- Nachweise in `modules/files`
- Rechte und Schemas in `packages/shared`
- die Rechteprüfung in `kernel/auth/permission.guard.ts`
- die Trigger in den Migrationen 0001 und 0005
- die Tests in `apps/api/test` und `packages/db`

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer: Er ist jeden schreibenden Endpunkt einzeln durchgegangen.
2. Security-Auditor: Er hat alle Critical-Befunde und seine neuen Befunde gegen die echte API
   nachgewiesen. Dazu hat er Testskripte außerhalb des Repositorys gegen die Testdatenbank
   ausgeführt, mit getrennten Konten für zwei ISMS-Manager, eine Auditorin, einen Risk-Owner und die
   Datenschutzbeauftragte.
3. Test-Engineer: Er hat die betroffenen Testsuiten ausgeführt und geprüft, welche Tests die Fehler
   erkennen würden.

Alle Zeilenangaben sind an den TypeScript-Quellen nachgeprüft. Befunde aus
[Review 01](01-auth-mandantentrennung.md), [Review 02](02-datenbank-rechte.md) und
[Review 03](03-dateien-exporte.md) werden nur erweitert, nicht wiederholt.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | Ein Vier-Augen-Schritt oder ein abgeschlossener Stand lässt sich über die normale API brechen, und das Ergebnis täuscht einen Auditor. Vor einem produktiven Einsatz beheben. |
| Important  | Echter Fehler mit begrenzter Wirkung oder mit Voraussetzungen, oder ein Test, der einen Fehler festschreibt. Bald beheben.                                                    |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                                                                                  |

## Antworten auf die vier Fragen

1. **Lässt sich ein Vier-Augen-Schritt umgehen?** Ja, auf mehreren Wegen:
   - **Freigabe danach aushöhlen:** Jeder Freigabe-Endpunkt prüft die handelnde Person. Andere
     Endpunkte ändern oder löschen den freigegebenen Datensatz aber danach, ohne die Freigabe
     zurückzusetzen. Betroffen sind Auswirkungen und Ressourcen der BIA, Nachweise, Zuordnungen,
     Ändern und Löschen.
   - **Status direkt setzen:** Das geht nach wie vor (Review 02 C1).
   - **Verantwortliche Person tauschen:** Die Freigabe überlebt einen Wechsel vor und nach der
     Freigabe (Review 02 I1), bei der BIA ebenso.
   - **Nichtkonformität ohne Korrekturmaßnahme bestätigen:** Das geht über ein nachträgliches
     Hochstufen (C2).
2. **Lässt sich ein freigegebener oder abgeschlossener Stand nachträglich ändern?**
   - **Fest bleiben:** abgeschlossene Managementbewertungen, bestätigte Feststellungen und einzelne
     Dokumentfassungen.
   - **Änderbar bleiben:**
     - abgeschlossene Audits, einschließlich Umfang und Bericht (C3)
     - freigegebene BIAs (I1)
     - bewusst getragene Risiken mit völlig neuem Inhalt (I3)
     - bestätigte Maßnahmen und Verbesserungen (I4)
     - die Nachweise hinter bestätigten Feststellungen (I5)
   - **Rückgängig machen:** Eine schon veröffentlichte Dokumentfassung lässt sich durch erneute
     Freigabe einer älteren Fassung zurückdrehen (I2).
   - **Ganz löschen:** Eine freigegebene BIA samt Plänen und Übungen lässt sich löschen (C1).
3. **Greift „Schreibrecht nur für Eigenes“ an jedem schreibenden Endpunkt?** Fast überall, aber
   nicht vollständig:
   - `DELETE /processes/:id/bia/resources/:assetId` prüft kein Eigentum.
   - Wer nur Eigenes schreiben darf, kann Datensätze ganz ohne Eigentümer anlegen.
   - Eine deaktivierte Person behält ihre Rechte.

   Siehe I9 und die Tabelle aller Endpunkte.

4. **Darf die Rolle Auditor nur im Modul `audit` schreiben?** Nein:
   - **Verbesserungen:** Sie kann Verbesserungsmaßnahmen jeder Herkunft bestätigen, auch solche aus
     Risiken und Vorfällen.
   - **Managementbewertung und Kennzahlen:** Innerhalb des Moduls `audit` kann sie
     Managementbewertungen anlegen und abschließen sowie Kennzahlenwerte überschreiben.
   - **Nachweise:** Umgekehrt kann sie gerade keine Nachweise anlegen, obwohl CLAUDE.md das
     vorsieht.

   Siehe I7.

## Critical

### C1 Die Eigentümerin eines Prozesses löscht eine freigegebene BIA samt Plänen und Übungen

- **Fundstellen:**
  - `apps/api/src/modules/continuity/processes.service.ts:72-78` prüft nur
    `assertCan(ctx, P.CONTINUITY_WRITE, existing)`. Dafür reicht `continuity.write_own`.
  - Die Datenbank löscht in einer Kaskade weiter: `bia.process_id` mit `ON DELETE CASCADE`
    (`packages/db/migrations/0000_init.sql:1202`), weiter zu `continuity_plan.bia_id` (`:1210`) und
    von dort zu Planschritten und Übungen.
- **Nachweis** gegen die API:
  1. Rita (Risk-Owner) legt einen Prozess an und füllt die BIA.
  2. Carla gibt sie frei (201).
  3. Rita löscht den Prozess (204).
  4. Danach liefert `GET …/bia` 404.
- **Wirkung:** Eine Person allein beseitigt einen Datensatz, den eine zweite Person freigegeben hat,
  dazu den aktiven Notfallplan und jede dokumentierte Übung. Übrig bleibt nur die Zeile im
  Änderungsprotokoll.
- **Vorschlag:**
  - Das Löschen ablehnen, solange es eine BIA, einen Plan oder eine Übung gibt, oder nur archivieren.
  - Mindestens das volle `continuity.write` verlangen und keine freigegebenen oder aktiven Stände
    zulassen.

### C2 Eine Nichtkonformität lässt sich ohne wirksame Korrekturmaßnahme schließen und bestätigen

- **Fundstellen:** `apps/api/src/modules/audit/findings.service.ts`
  - `assertClosable` läuft nur, wenn im selben Aufruf `status: 'closed'` geschickt wird
    (`:146-157`).
  - Die Einstufung lässt sich an einer schon geschlossenen Feststellung frei ändern (`:134-145`).
  - `assertClosable` zählt Verbesserungsmaßnahmen jeden Status (`:208-221`), auch offene und
    verworfene.
  - `verify` (`:167-205`) prüft den Status der Maßnahmen gar nicht.
- **Nachweis** gegen die API:
  1. Die Auditorin legt eine Beobachtung an und schließt sie (200).
  2. Sie stuft sie auf Hauptabweichung hoch (200). Die Feststellung ist geschlossen, mit
     0 Maßnahmen.
  3. Die Bestätigung gelingt (201).
- **Wirkung:** ISO 27001 Kap. 10.2 verlangt bei einer Nichtkonformität Korrektur und
  Ursachenbehandlung. Die Suite zeigt eine bestätigte Hauptabweichung ohne jede Korrekturmaßnahme.
- **Vorschlag:**
  - `assertClosable` bei jeder Änderung prüfen, nach der die Feststellung geschlossen ist und keine
    Beobachtung mehr ist.
  - Beim Schließen und bei der Bestätigung verlangen, dass die verknüpften Maßnahmen erledigt oder
    bestätigt sind.

### C3 Ein abgeschlossenes Audit lässt sich nachträglich auf volle Abdeckung umschreiben

Das erweitert Review 02 I2 um einen Nachweis.

- **Fundstellen:**
  - `apps/api/src/modules/audit/audits.service.ts:108-152`. Gesperrt ist nur das Wiedereröffnen
    (`:129`).
  - Umfang (`setScope`, `:150`), Termine und Bericht, auch `reportFileId: null`, bleiben änderbar.
  - Neue Feststellungen lassen sich einem abgeschlossenen Audit zuordnen
    (`findings.service.ts:98-120`).
  - `v_audit_coverage` zählt jedes Audit mit Status berichtet oder abgeschlossen und datiert es nach
    `planned_to` (`0010_grundschutz_scope.sql:77-94`).
- **Nachweis** gegen die API:
  1. Die Auditorin schließt ein Audit über eine Anforderung aus dem Jahr 2023 ab. Im Dreijahreszyklus
     gelten danach 0 Punkte als geprüft.
  2. Carla (ISMS-Managerin, also die geprüfte Seite) setzt danach den Umfang auf alle Anforderungen,
     die Termine auf gestern und den Bericht auf leer (200).
  3. Im Auditprogramm gelten jetzt 123 Punkte als geprüft.
- **Wirkung:** Managementbewertung und Zertifizierungsaudit sehen eine volle Abdeckung des
  Auditprogramms (Kap. 9.2), die nie stattgefunden hat, ohne Bericht.
- **Vorschlag:**
  - Ab „berichtet“ Umfang, Termine, Regelwerk und Bericht sperren, ab „abgeschlossen“ alles.
  - Keine neuen Feststellungen mehr zulassen.
  - Als zweite Linie Trigger auf `audit` und `audit_requirement`.
  - Den Status- und Berichtsschritt der leitenden Auditorin vorbehalten (siehe Review 02 I2).

## Important

### I1 Eine freigegebene BIA bleibt freigegeben, obwohl sich ihr Inhalt ändert

- **Fundstellen:** `apps/api/src/modules/continuity/bia.service.ts`
  - Nur `upsert` setzt die Freigabe zurück (`:98-102`).
  - `setImpact` (`:111-124`), `setResource` (`:127-145`) und `removeResource` (`:147-156`) tun es
    nicht.
  - `removeResource` prüft außerdem kein Eigentum, siehe I9.
  - Ein Eigentümerwechsel am Prozess (`processes.service.ts:53-69`) lässt die BIA unberührt.
  - Für die BIA-Freigabe gibt es keinen Trigger in der Datenbank.
- **Nachweis:** Nach der Freigabe setzt Rita eine kritische Auswirkung nach 2 Stunden (200). Die BIA
  bleibt freigegeben, obwohl die Prüfung jetzt 2 Fehler meldet, die eine Freigabe verhindert hätten.
- **Ablauf über den Eigentümer:**
  1. Eigentümer wegsetzen.
  2. Freigeben.
  3. Eigentümer zurücksetzen.
- **Vorschlag:**
  - Eine gemeinsame Funktion, die die Freigabe zurücksetzt, aus allen vier Schreibwegen und beim
    Eigentümerwechsel aufrufen.
  - Einen Trigger „freigebende Person ist nicht Eigentümer des Prozesses“ ergänzen.

### I2 Dokumentfreigabe ohne Prüfung des Zustands: Entwürfe ohne Prüfung, alte Fassungen zurück

- **Fundstellen:** `apps/api/src/modules/documents/documents.service.ts`
  - `approve` (`:184-221`) gibt jede Fassung frei: nie eingereicht, schon freigegeben oder älter als
    die aktuelle.
  - Dabei überschreibt es Freigabe- und Veröffentlichungszeitpunkt der Fassung (`:209`) und setzt
    `currentVersionId` auf diese Fassung.
  - `submitForReview` (`:166-177`) ändert die Fassung nur über ihre ID. Es prüft weder das Dokument
    noch, ob eine Zeile getroffen wurde.
- **Nachweis:**
  - Ein zweiter ISMS-Manager gibt eine nie eingereichte Fassung 1.0 frei. Sie ist sofort
    veröffentlicht (201).
  - Nach Freigabe von 2.0 gibt er 1.0 erneut frei (201). Das Dokument zeigt wieder 1.0 als aktuell.
- **Positiv:** Die Freigabe durch den Autor verhindert die CHECK-Bedingung
  `document_version_four_eyes_chk` zuverlässig. Den Inhalt einer Fassung ändert kein Endpunkt.
- **Vorschlag:**
  - Freigabe nur für eingereichte, noch nicht freigegebene Fassungen.
  - Freigabe- und Veröffentlichungszeitpunkt nur einmal schreibbar.
  - `submitForReview` auf das Dokument beschränken und die getroffene Zeile prüfen.

### I3 Eine Risikoübernahme überlebt das vollständige Umschreiben des Risikos

- **Fundstellen:** `apps/api/src/modules/risks/risks.service.ts`
  - `update` (`:128-160`) lässt Titel, Beschreibung, Art, Behandlung, Wiedervorlage und Assets ändern,
    ohne die Übernahme zu prüfen.
  - Ebenso das Lösen von Maßnahmen (`:299-308`).
  - Nur eine neue Bewertung mit anderen Werten hebt die Übernahme auf (`:182-192`).
  - Der Schnappschuss der Übernahme (`:234-242`) enthält nur die Zahlen.
- **Nachweis** gegen die API:
  1. Rita legt das Risiko „Druckerpapier geht aus“ an, bewertet es mit 1 mal 1, verknüpft ein Asset
     und eine Maßnahme.
  2. Carla trägt es bewusst.
  3. Rita ändert den Titel in „Ransomware auf der Netzleittechnik“ und entfernt Asset und Maßnahme
     (200 und 204).
  4. Das Risiko bleibt bewusst getragen, mit dem alten, niedrigen Schnappschuss.
- **Wirkung:** Eine Entscheidung der Leitung (Kap. 6.1.3, 8.3) wandert auf ein ganz anderes,
  schweres Risiko.
- **Vorschlag:**
  - Bei einem getragenen Risiko jede inhaltliche Änderung ablehnen, oder die Übernahme dabei
    zurücksetzen.
  - Titel, Beschreibung, Assets und Maßnahmen in den Schnappschuss aufnehmen.
  - Beim Aufheben der Übernahme auch die Begründung leeren (`:181-192`).

### I4 Bestätigte Maßnahmen und Verbesserungen bleiben änderbar, löschbar und neu zuordenbar

- **Fundstellen:**
  - `apps/api/src/modules/improvement/actions.service.ts:92-119`: Die Eigentümerin einer bestätigten
    Verbesserung kann `effectivenessResult` überschreiben. Das ist die Aussage der bestätigenden
    Person (`:141`). Sie kann auch den Status zurücksetzen. Die bestätigende Person bleibt
    eingetragen und steht danach unter einem Text, den sie nie geschrieben hat.
  - `apps/api/src/modules/measures/measures.service.ts:112-140` sowie die Zuordnungen
    (`:176-232`): Der Inhalt einer bestätigten Maßnahme lässt sich ändern, und sie lässt sich neuen
    Anforderungen zuordnen. Diese gelten dann in Anwendbarkeitserklärung und Cockpit als erfüllt.
  - Ebenso lässt sich eine bestätigte Maßnahme löschen (`:156-167`). Die Kaskade entfernt dabei die
    Verweise aus Feststellungen, Nachweisen und Zuordnungen.
  - `measures.verify` (`:143-154`) verlangt keinen Status. Eine erst geplante Maßnahme lässt sich
    bestätigen, und eine zweite Bestätigung überschreibt die erste.
- **Vorschlag:**
  - Bestätigte Datensätze sperren, oder bei jeder inhaltlichen Änderung oder Zuordnung zurück auf
    „umgesetzt“ setzen und die Bestätigung leeren, wie bei der BIA.
  - Das Löschen bestätigter Maßnahmen ablehnen.
  - Bestätigung nur aus dem Status „umgesetzt“ zulassen.

### I5 Die Nachweise hinter bestätigten Feststellungen und Maßnahmen bleiben änderbar

- **Fundstellen:** `apps/api/src/modules/files/evidence.service.ts`
  - Zeilen 66-80: Ändern eines Nachweises, auch Austausch der Datei.
  - Zeilen 82-90: Löschen. Die Kaskade entfernt die Verknüpfung zur Feststellung oder Maßnahme.
  - `linkFinding` und `unlinkFinding` (`:167-192`) prüfen den Status der Feststellung nicht. Sie
    akzeptieren `AUDIT_WRITE`, also auch den ISMS-Manager als geprüfte Seite.
- **Wirkung:**
  - Die geprüfte Seite kann den Beleg einer bestätigten Feststellung entfernen oder austauschen.
  - Das Versprechen „SHA-256 zeigt, dass der Beleg unverändert ist“ hilft nicht, wenn der Nachweis
    nach der Bestätigung auf eine andere Datei zeigt.
- **Vorschlag:** Ändern, Löschen und Lösen ablehnen, solange der Nachweis an einer bestätigten
  Feststellung oder Maßnahme hängt. Für Korrekturen einen neuen Nachweis anlegen.

### I6 Die Eigentümerin aktiviert allein einen Notfallplan auf einer nicht freigegebenen, fehlerhaften BIA

- **Fundstellen:** `apps/api/src/modules/continuity/plans.service.ts`
  - `create` (`:69-99`) verlangt nur, dass es eine BIA gibt, egal in welchem Status.
  - `update` (`:105-123`) prüft vor „aktiv“ nur, ob es eine Übung gab (`:109`).
  - `recordExercise` (`:169-201`) bestätigt die Eigentümerin selbst, und jedes Ergebnis zählt, auch
    „nicht bestanden“.
- **Nachweis:** Rita (nur `continuity.write_own`) geht so vor:
  1. Prozess anlegen.
  2. BIA mit Widersprüchen anlegen.
  3. Plan anlegen.
  4. Übung mit „nicht bestanden“ eintragen.
  5. Plan aktiv setzen (200).

  Die BIA steht dabei auf Entwurf, mit 2 Fehlern.

- **Wirkung:** Die vierfach geprüfte BIA-Freigabe hat keinen Einfluss darauf, was als Notfallplan
  gilt.
- **Vorschlag:**
  - Aktivierung, besser schon das Anlegen, nur bei freigegebener BIA erlauben.
  - Für die Aktivierung eine bestandene Übung oder eine zweite Person verlangen.
  - Übungen mit Datum in der Zukunft ablehnen. Heute schieben sie die nächste Fälligkeit um Jahre
    hinaus.

### I7 Die Rolle Auditor schreibt außerhalb der Feststellungen, kann aber keine Nachweise anlegen

- **Fundstellen:**
  - **Verbesserungen jeder Herkunft:** `packages/shared/src/permissions.ts:243` gibt der Auditorin
    `ACTION_VERIFY`. `actions.service.ts:125-147` prüft die Herkunft nicht. Die Auditorin bestätigt
    damit Verbesserungen aus Risiken, Vorfällen und Managementbewertungen. Nachweis: Bestätigung
    einer Verbesserung aus einem Risiko (201).
  - **Managementbewertung und Kennzahlen:** Mit `AUDIT_WRITE` legt sie Managementbewertungen an und
    schließt sie ab (`audit.controller.ts:156`, `:162`). Das sind Entscheidungen der Leitung nach
    Kap. 9.3.3. Sie kann auch Kennzahlen anlegen und Werte erfassen (`:190`, `:196`, `:207`). Ein
    Upsert überschreibt dabei still einen früheren Wert (`kpis.service.ts:117-134`). Nachweis:
    Anlegen einer Managementbewertung (201).
  - **Keine Nachweise:** `POST /evidence` verlangt `MEASURE_WRITE` (`files.controller.ts`). Die
    Auditorin bekommt 403. CLAUDE.md sagt aber: `measure.write` **oder** `finding.write`. Der Zweig für
    `FINDING_WRITE` in `assertEvidenceWriter` (`evidence.service.ts:239-246`) wird nie erreicht. Auch
    Risk-Owner können keine Nachweise für ihre eigenen Maßnahmen anlegen.
- **Keine Schreibrechte hat die Auditorin** auf Risiken, Maßnahmen, Dokumente, Notfallplanung und
  Anwendbarkeitserklärung. Sie hat kein `_own`-Recht, deshalb öffnet die `_own`-Ausnahme im Guard
  für sie nichts.
- **Vorschlag:**
  - `ACTION_VERIFY` für die Auditorin auf Verbesserungen mit `findingId` beschränken.
  - `audit.write` aufteilen in Auditprogramm, Managementbewertung (nur Leitung) und Kennzahlen.
  - Erfasste Kennzahlenwerte nur ergänzen, nie überschreiben.
  - `POST`, `PATCH` und `DELETE /evidence` mit `MEASURE_WRITE` **oder** `FINDING_WRITE` freigeben.

### I8 Lesebestätigungen für andere: zu weit erlaubt, überschreibbar, ohne Angabe, wer es war

- **Fundstellen:**
  - `apps/api/src/modules/documents/documents.service.ts:306` lässt eine Bestätigung für andere zu,
    wenn die Person `document.write` hat. Das hat auch die Datenschutzbeauftragte.
  - Die Fristenliste behandelt dagegen `document.publish` als dieses Recht.
  - Das Speichern (`:310-315`) prüft nicht, ob schon bestätigt wurde, und überschreibt den
    ursprünglichen Zeitpunkt.
  - Die Tabelle `acknowledgement` hat keine Spalte, wer bestätigt hat (`0000_init.sql:209-216`).
- **Nachweis:** Die Datenschutzbeauftragte bestätigt für Rita und für den Auditor (je 201).
- **Wirkung:** Nachweise zur Sensibilisierung (Kap. 7.3, A.6.3) lassen sich für jede Person
  erzeugen. Sie sehen aus wie eigene Bestätigungen.
- **Vorschlag:**
  - Für fremde Bestätigungen `document.publish` verlangen.
  - Die Spalte `confirmed_by_user_id` ergänzen, mit Pflichtvermerk, etwa „Papierformular vom …“.
  - Eine bestehende Bestätigung nie überschreiben.

### I9 „Schreibrecht nur für Eigenes“ hat drei Lücken

- **`removeResource` prüft kein Eigentum.** `bia.service.ts:147-156` ruft kein `assertCan`. Der
  Guard lässt `continuity.write_own` durch (`permission.guard.ts:36`, Review 01 I2). Jeder Risk-Owner
  entfernt Ressourcen aus jeder BIA.
- **Datensätze ohne Eigentümer.** Geprüft wird `dto.ownerPersonId ?? ctx.personId`, gespeichert
  `dto.ownerPersonId ?? null`:

  | Service                | Prüfung | Speichern |
  | ---------------------- | ------- | --------- |
  | `risks.service.ts`     | `:100`  | `:113`    |
  | `measures.service.ts`  | `:89`   | `:100`    |
  | `actions.service.ts`   | `:61`   | `:80`     |
  | `processes.service.ts` | `:36`   | `:45`     |

  Nachweis: Rita legt Maßnahme und Risiko ohne Eigentümer an (201). Danach kann sie sie nicht mehr
  bearbeiten (403). Datensätze ohne Eigentümer umgehen außerdem die Vier-Augen-Prüfung in der
  Datenbank (`0001_rls_triggers_views.sql:111`).

- **Deaktivierte Personen behalten ihre Rechte.**
  - `auth.service.ts:289-295` ermittelt die Person ohne `is_active`.
  - Nachweis: Carla deaktiviert Rita. Rita meldet sich neu an und ändert ihr Risiko (200).
  - Deaktivierte Personen lassen sich auch weiter als Eigentümer eintragen.
- **Vorschlag:**
  - `removeResource` wie die anderen BIA-Schreibwege prüfen.
  - Wer nur `_own` hat, wird beim Anlegen immer selbst Eigentümer. Leere Eigentümer bei Risiko,
    Maßnahme und Verbesserung ablehnen.
  - Nur aktive Personen auflösen und als Eigentümer zulassen.

### I10 Tests schreiben Fehler als gewolltes Verhalten fest

| Test                                           | Was er festschreibt                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/audit.e2e.test.ts:484-489`      | Der Nachweis wird von der schon bestätigten Feststellung F-0001 gelöst, erwartet wird 200 (I5).                                           |
| `audit.e2e.test.ts:467-471`                    | Der Nachweis „der Auditorin“ wird als ISMS-Managerin angelegt, weil die Auditorin es nicht darf (I7).                                     |
| `apps/api/test/documents.e2e.test.ts:239-246`  | „Nachtragen“ überschreibt in Wahrheit Ritas vorhandene Bestätigung (I8).                                                                  |
| `apps/api/test/continuity.e2e.test.ts:379-387` | „Pflege ihres eigenen Prozesses“ legt einen Prozess ohne Eigentümer an (I9) und lässt die Eigentümerin ihre Übung selbst bestätigen (I6). |
| `audit.e2e.test.ts:177-201`                    | Neue Feststellungen werden einem schon abgeschlossenen Audit zugeordnet (C3).                                                             |
| `audit.e2e.test.ts:242-294`                    | Geschlossen und bestätigt wird mit einer Maßnahme, die nur erledigt, nie bestätigt ist (C2).                                              |
| `apps/api/test/incidents.e2e.test.ts:355-374`  | Eine Verbesserung ohne Eigentümer wird von der Anlegenden selbst bestätigt. Das Vier-Augen-Prinzip ist dort leer erfüllt.                 |
| `apps/api/test/risks.e2e.test.ts:163-167`      | Der Risk-Owner verknüpft eine fremde Maßnahme mit seinem Risiko. Vielleicht gewollt, dann aber als bewusste Entscheidung festhalten.      |

Ändert man den Code, scheitern diese Tests. Das ist dann richtig so. Sie sollten im selben Zug
umgeschrieben werden.

## Suggestion

- **Die Services prüfen das Vier-Augen-Prinzip bei Risiko, Maßnahme und Verbesserung nicht selbst.**
  Betroffen sind `risks.service.ts:216-250`, `measures.service.ts:143-154`,
  `actions.service.ts:125-147` und das Anlegen von Feststellungen (`findings.service.ts:98-120`).
  CLAUDE.md verlangt Service und Datenbank. Die Trigger sind umgehbar (Review 02 I1 und I4), deshalb
  wäre die zweite Prüfung im Service mehr als Kosmetik.
- **Herkunft einer Verbesserung wird nicht gegen den Mandanten geprüft.** `actions.service.ts:59-90`
  übernimmt `findingId`, `riskId`, `incidentId` und `reviewId` ungeprüft. Fremdschlüssel prüfen ohne
  Zeilensicherheit. Nachweis: Eine Verbesserung in Mandant A verweist auf ein Risiko in Mandant B
  (201). Sichtbar wird das fremde Risiko dadurch nicht. Innerhalb eines Mandanten lässt sich eine
  Verbesserung an jede Feststellung hängen, zusammen mit C2 wird so jede Nichtkonformität
  schließbar. Je Herkunft im Mandanten nachschlagen und sonst 404 geben.
- **Die geprüfte Seite bestimmt, welche Auditorin bestätigen darf.** Ein ISMS-Manager kann die
  Auditorin als Eigentümerin einer Verbesserung zur Feststellung eintragen. Danach scheitert ihre
  Bestätigung mit 409 (Nachweis). Als Eigentümer keine Person mit Auditorrolle und nicht die Person
  zulassen, die die Feststellung erhoben hat.
- **Die Übernahme eines Risikos nimmt ein Ablaufdatum in der Vergangenheit an und ignoriert den
  Status „geschlossen“** (`risks.service.ts:216-250`). Siehe auch Review 02 zur Obergrenze.
- **`DELETE /files/:id` ohne Eigentumsprüfung** (`files.service.ts:107-126`), bekannt aus Review 01
  I2. Hier relevant, weil damit nicht verknüpfte Uploads der Auditorin gelöscht werden können.
- **`demo-seed.e2e.test.ts:82-101` prüft 3 von 7 Vier-Augen-Regeln.** Bestätigungen von Maßnahme,
  Verbesserung und Feststellung, BIA-Freigabe und Stellungnahme zur Folgenabschätzung fehlen. Geprüft
  wird außerdem gegen den heutigen Eigentümer.
- **Mehrere Tests heißen anders, als sie prüfen.**
  - `risks.e2e.test.ts:205-212` heißt Funktionstrennung, prüft aber ein fehlendes Recht.
  - `incidents.e2e.test.ts:355` bestätigt eine Verbesserung ohne Eigentümer.
  - `audit.e2e.test.ts:260-283` trifft die Prüfung im Service zuerst, der Trigger wird nie
    nachgewiesen.
- **Die Testdateien hängen innerhalb der Datei aneinander.** Gemeinsame IDs und Zustände liegen über
  `it`-Blöcke hinweg. Ein einzeln gestarteter Test scheitert. `beforeAll` je `describe` würde jeden
  Fall für sich lauffähig machen.

## Schreibende Endpunkte und Eigentumsprüfung

Rechte `_own` haben: Risk-Owner für Asset, Risiko, Maßnahme, Verbesserung und Notfallplanung,
Datenschutz für Verbesserung. Der Guard lässt `${p}_own` für jedes Recht `p` durch.

| Modul       | Endpunkt                                                                              | Recht                              | Eigentumsprüfung im Service                                         | Urteil                         |
| ----------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| documents   | `POST /documents`, `POST /documents/:id/versions`, `POST /documents/:id/requirements` | `document.write`                   | entfällt (kein `_own`)                                              | in Ordnung                     |
| documents   | `POST …/versions/:v/submit`                                                           | `document.write`                   | keine Prüfung von Dokument und Zeile                                | I2                             |
| documents   | `POST …/versions/:v/approve`                                                          | `document.approve`                 | Autor ist nicht Freigebender                                        | ohne Zustandsprüfung (I2)      |
| documents   | `POST /documents/acknowledgements/:c/confirm`                                         | `document.read`                    | selbst, oder `document.write` für andere                            | I8                             |
| audit       | `POST /audits`, `PATCH /audits/:id`                                                   | `audit.write`                      | keine                                                               | C3, Review 02 I2               |
| audit       | `POST /findings`, `PATCH /findings/:id`                                               | `finding.write`                    | Trigger: Erheber ist nicht Eigentümer der Maßnahme                  | C2                             |
| audit       | `POST /findings/:id/verify`                                                           | `finding.verify`                   | Eigentümer der Maßnahmen ist nicht Bestätiger (Service und Trigger) | C2                             |
| audit       | `POST /management-reviews`, `…/:id/close`                                             | `audit.write`                      | keine                                                               | I7                             |
| audit       | `POST /kpis`, `…/:id/values`, `/kpis/refresh`                                         | `audit.write`                      | keine                                                               | I7                             |
| risks       | `POST /risks`                                                                         | `risk.write`                       | prüft `dto ?? ctx.personId`, speichert `?? null`                    | I9                             |
| risks       | `PATCH /risks/:id`                                                                    | `risk.write`                       | nur aktueller Eigentümer, neuer ungeprüft                           | I3, Review 02                  |
| risks       | `POST /risks/:id/assessments`, `PATCH …/quantification`                               | `risk.write`                       | aktueller Eigentümer                                                | in Ordnung                     |
| risks       | `POST /risks/:id/accept`                                                              | `risk.accept`                      | keine im Service, nur Trigger                                       | Suggestion                     |
| risks       | `POST`, `DELETE /risks/:id/measures`                                                  | `risk.write`                       | Eigentümer des Risikos                                              | Übernahme bleibt (I3)          |
| measures    | `POST /measures`                                                                      | `measure.write`                    | prüft `dto ?? ctx.personId`, speichert `?? null`                    | I9                             |
| measures    | `PATCH`, `DELETE /measures/:id`, Zuordnungen                                          | `measure.write`                    | aktueller Eigentümer                                                | bestätigte änderbar (I4)       |
| measures    | `POST /measures/:id/verify`                                                           | `measure.verify`                   | keine im Service, nur Trigger                                       | I4                             |
| improvement | `POST /actions`                                                                       | `action.write`                     | prüft `dto ?? ctx.personId`, Herkunft ungeprüft                     | I9, Suggestion                 |
| improvement | `PATCH /actions/:id`                                                                  | `action.write`                     | aktueller Eigentümer                                                | bestätigte änderbar (I4)       |
| improvement | `POST /actions/:id/verify`                                                            | `action.verify`                    | keine im Service, nur Trigger                                       | I7                             |
| continuity  | `POST /processes`                                                                     | `continuity.write`                 | prüft `dto ?? ctx.personId`, speichert `?? null`                    | I9                             |
| continuity  | `PATCH /processes/:id`                                                                | `continuity.write`                 | aktueller Eigentümer                                                | setzt BIA nicht zurück (I1)    |
| continuity  | `DELETE /processes/:id`                                                               | `continuity.write`                 | aktueller Eigentümer                                                | **C1**                         |
| continuity  | `PUT …/bia`                                                                           | `continuity.write`                 | Eigentümer des Prozesses                                            | in Ordnung, setzt zurück       |
| continuity  | `PUT …/bia/impacts`, `PUT …/bia/resources`                                            | `continuity.write`                 | Eigentümer des Prozesses                                            | setzt nicht zurück (I1)        |
| continuity  | `DELETE …/bia/resources/:assetId`                                                     | `continuity.write`                 | **keine**                                                           | I9                             |
| continuity  | `POST …/bia/approve`                                                                  | `continuity.write` (voll)          | Eigentümer ist nicht Freigebender                                   | in Ordnung, ohne Trigger       |
| continuity  | `POST /processes/:id/plans`, Planänderung, Schritte, Übungen                          | `continuity.write`                 | Eigentümer des Prozesses                                            | Aktivierung ohne Freigabe (I6) |
| files       | `POST`, `PATCH`, `DELETE /evidence`                                                   | `measure.write`                    | `can()` ohne Ressource, deshalb scheitert `_own`                    | I7                             |
| files       | `POST`, `DELETE /evidence/finding/…`                                                  | `finding.write` oder `audit.write` | keine, kein Status                                                  | I5                             |

## Schreibrechte der Rolle Auditor

| Recht            | Wirkt auf                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.write`    | Audits; außerdem Managementbewertungen anlegen und abschließen, Kennzahlen anlegen und Werte erfassen, Nachweise an Feststellungen hängen und lösen, Dateien hochladen |
| `finding.write`  | Feststellungen; Nachweise an Feststellungen hängen und lösen; Dateien hochladen. Nicht `POST /evidence` (I7)                                                           |
| `finding.verify` | nur `POST /findings/:id/verify`                                                                                                                                        |
| `action.verify`  | `POST /actions/:id/verify` für Verbesserungen **jeder** Herkunft (I7)                                                                                                  |
| `report.export`  | Exporte (lesend, schreibt nur einen Protokolleintrag)                                                                                                                  |

## Testlauf

| Suite                                                                                  | Tests | Ergebnis  |
| -------------------------------------------------------------------------------------- | ----- | --------- |
| `documents`, `audit`, `risks`, `mapping`, `incidents`, `continuity`, `demo-seed` (E2E) | 131   | bestanden |
| `packages/db`                                                                          | 10    | bestanden |
| `packages/shared`                                                                      | 3     | bestanden |

Keiner der Befunde C1 bis I9 wird von einem Test erkannt. Gar nicht getestet sind:

- die Bestätigung von Maßnahmen (`POST /measures/:id/verify` ruft kein Test auf)
- die Trigger für Maßnahme, Verbesserung und das Erheben von Feststellungen
- das Löschen von Prozessen
- jeder Schreibversuch der Auditorin außerhalb von Feststellungen

Die Nachweise des Security-Auditors haben die Testdatenbank `isms_test` neu aufgesetzt. Die
Entwicklungsdatenbank ist unberührt.

## Fehlende Tests nach Priorität

| Prio       | Schützt vor                              | Datei                                                           | Rollen                           | Kern des Tests                                                                                                                                                                           |
| ---------- | ---------------------------------------- | --------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | C1                                       | `continuity.e2e.test.ts`                                        | Risk-Owner, ISMS-Manager         | Prozess mit freigegebener BIA, aktivem Plan und Übung löschen: 409 oder 403, alle Zeilen bleiben.                                                                                        |
| Critical   | C2                                       | `audit.e2e.test.ts`                                             | Auditorin                        | Geschlossene Beobachtung auf Hauptabweichung hochstufen: 400. Bestätigung mit nur offener oder verworfener Maßnahme: 400.                                                                |
| Critical   | C3                                       | `audit.e2e.test.ts` (Zeilen 177-201 umschreiben)                | ISMS-Manager, Auditorin          | Abgeschlossenes Audit: Umfang, Termine, Bericht ändern ergibt 409, Abdeckung bleibt gleich. Neue Feststellung zum abgeschlossenen Audit: abgelehnt.                                      |
| Critical   | I5                                       | `audit.e2e.test.ts` (Zeilen 457-490 aufteilen)                  | Auditorin, ISMS-Manager          | Nachweis einer bestätigten Feststellung lösen, ändern oder löschen: 409. An offener Feststellung weiter erlaubt.                                                                         |
| Critical   | I4                                       | neu: `improvement.e2e.test.ts`, `measures.e2e.test.ts`          | Risk-Owner, zweiter ISMS-Manager | Bestätigte Verbesserung oder Maßnahme ändern, löschen oder neu zuordnen: 409. Bestätigung einer geplanten Maßnahme: 400.                                                                 |
| Critical   | Vier-Augen bei Maßnahme und Verbesserung | dieselben Dateien                                               | zwei ISMS-Manager                | Eigentümerin bestätigt selbst: 409. Andere Person: 201. Bisher gibt es dafür keinen einzigen Test.                                                                                       |
| Critical   | I2                                       | `documents.e2e.test.ts`                                         | Autor, zweiter ISMS-Manager      | Nie eingereichte Fassung freigeben: 409. Ältere Fassung erneut freigeben: 409, aktuelle Fassung bleibt.                                                                                  |
| Important  | I1                                       | `continuity.e2e.test.ts`                                        | ISMS-Manager, Risk-Owner         | Nach Freigabe Auswirkungen, Ressourcen oder Eigentümer ändern: BIA ist wieder Entwurf.                                                                                                   |
| Important  | Eigentümerwechsel                        | `risks`, `continuity`, `audit` und `packages/db/src/db.test.ts` | zwei ISMS-Manager                | Eigentümer nach Freigabe auf die freigebende Person setzen: 409 oder Freigabe aufgehoben. In der Datenbank: `sod_violation`.                                                             |
| Important  | I3                                       | `risks.e2e.test.ts`                                             | ISMS-Manager, Risk-Owner         | Getragenes Risiko inhaltlich ändern oder Maßnahme lösen: Übernahme aufgehoben oder 409.                                                                                                  |
| Important  | I6                                       | `continuity.e2e.test.ts`                                        | Risk-Owner                       | Plan auf BIA im Entwurf aktiv setzen: 409.                                                                                                                                               |
| Important  | I7                                       | `audit.e2e.test.ts` und je Modul                                | Auditorin                        | Managementbewertung, Kennzahlen, Dokumente, Risiken, Maßnahmen, Prozesse, Verbesserungen anlegen oder ändern: 403. Verbesserung aus einem Risiko bestätigen: 403. Nachweis anlegen: 201. |
| Important  | I8                                       | `documents.e2e.test.ts` (Zeilen 239-246 umschreiben)            | Datenschutz                      | Bestätigung für andere: 403 oder mit Vermerk, wer es war. Vorhandene Bestätigung erneut bestätigen: 409, Zeitpunkt bleibt.                                                               |
| Important  | I9                                       | `risks`, `measures`, `improvement`, `continuity`                | Risk-Owner                       | Je schreibendem Endpunkt auf fremden Datensatz: 403. Anlegen ohne Eigentümer: Eigentümer ist die Person selbst. Deaktivierte Person: 403.                                                |
| Important  | Trigger                                  | `packages/db/src/db.test.ts`                                    | App-Rolle                        | Je ein direkter SQL-Test für `trg_measure_sod`, `trg_action_sod`, `trg_finding_sod`, `trg_finding_verify_sod` und die CHECK-Bedingung der Dokumentfreigabe, auch beim Ändern.            |
| Suggestion | Herkunft                                 | `improvement.e2e.test.ts`                                       | zwei Mandanten                   | Verbesserung mit Herkunft aus fremdem Mandanten: 404.                                                                                                                                    |
| Suggestion | Demo                                     | `demo-seed.e2e.test.ts`                                         | Migrator                         | Alle sieben Vier-Augen-Regeln gegen die Daten prüfen.                                                                                                                                    |

## Was gut gelöst ist

- **Managementbewertung:** Eine abgeschlossene Bewertung ist wirklich eingefroren. Es gibt keinen
  Änderungsweg, die Eingaben sind mit Zeitpunkt und Person festgehalten, ein zweiter Abschluss wird
  abgelehnt.
- **Feststellungen:** Die Bestätigung prüft die Funktionstrennung im Service und im Trigger. Der
  Status „bestätigt“ ist über Ändern nicht setzbar, und eine bestätigte Feststellung lässt sich nicht
  mehr bearbeiten.
- **Dokumente:** Freigabe nicht durch den Autor erzwingt eine CHECK-Bedingung. Kein Endpunkt ändert
  eine einzelne Fassung.
- **Notfallpläne und Risiken:** Ein Plan wird erst nach einer Übung aktiv, und nur die neueste
  Übung bestimmt die nächste Fälligkeit. Eine neue Risikobewertung mit anderen Werten hebt die
  Übernahme auf.
- **Mandanten und Personen:** Die Zeilensicherheit hält. Die Verbesserung mit fremder Herkunft macht
  das fremde Risiko in keinem Mandanten sichtbar. Je Mandant ist ein Konto nur einer Person
  zugeordnet (`person_tenant_user_uq`), der Trick mit zwei Personen für ein Konto geht nicht.
