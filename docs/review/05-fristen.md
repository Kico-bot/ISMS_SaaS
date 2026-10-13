# Review 05: Meldefristen, Fristenliste, Erinnerungsmails und Hintergrundprozess

Stand: 11.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

Geprüft wurden:

- `apps/api/src/modules/incidents`, darunter die Fristenrechnung in `reporting-deadlines.ts`
- `apps/api/src/modules/deadlines`
- `apps/api/src/modules/notifications`
- `apps/api/src/kernel/mail`
- `apps/api/src/kernel/jobs`
- `apps/api/src/worker.ts`
- die Tests in `apps/api/test`

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer: Er hat jede Fristregel gegen die Rechtsgrundlage gelesen.
2. Security-Auditor: Er hat seine Befunde mit Testskripten gegen die echte API auf der Testdatenbank
   nachgewiesen, unter anderem mit zwei Mandanten.
3. Test-Engineer: Er hat die Testsuiten ausgeführt und die reinen Fristfunktionen mit Grenzdaten
   aufgerufen.

Jede Rolle kannte die Befunde der vorherigen. Alle Zeilenangaben beziehen sich auf die
TypeScript-Quellen und sind nachgeprüft. Einen Befund des Test-Engineers habe ich mit einer eigenen
Probe widerlegt (siehe Ende). Befunde aus den Reviews 01 bis 04 werden nur erweitert, nicht
wiederholt.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | Daten fließen zwischen Mandanten ab, oder eine gesetzliche Meldefrist kann ohne Warnung verstreichen. Vor einem produktiven Einsatz beheben. |
| Important  | Echter Fehler mit begrenzter Wirkung, oder ein Test, der einen Fehler festschreibt. Bald beheben.                                            |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                                                 |

## Antworten auf die vier Fragen

1. **Stimmt die Berechnung der Meldefristen?**
   - **Im Kern ja.**
     - Stunden werden als echte Stunden gerechnet (`addHours`). Damit bleiben 24 und 72 Stunden
       auch über die Zeitumstellung genau.
     - Wochenenden und Feiertage verlängern nichts. Das ist richtig, denn DSGVO und NIS2 kennen bei
       Stundenfristen keine Verschiebung auf den nächsten Werktag.
     - Der NIS2-Abschlussbericht hängt richtig an der tatsächlichen Meldung, nicht an der Kenntnis.
     - Beim Monatsende wird abgeschnitten, aus dem 31.01. wird der 28.02. und kein März.
   - **Falsch ist dreierlei:**
     - Der Kalendermonat wird in UTC statt in deutscher Zeit gerechnet. Am Monatsende ist der
       Abschlussbericht deshalb zu spät angesetzt (I5).
     - Die Zeitpunkte, an denen eine Frist beginnt, sind nicht begrenzt. Ein Tippfehler verschiebt
       Fristen um Jahre und lässt sich nicht korrigieren (I1).
     - Die Fristenliste macht aus dem genauen Zeitpunkt ein Datum in UTC. Eine verpasste 24-Stunden-
       Frist erscheint dort als „heute fällig“ (C2).
2. **Prüft jede Quelle der Fristenliste das Leserecht?**
   - Ja. Jede der 14 Quellen ist an ihr Leserecht gebunden und filtert nach Mandant.
   - Lesebestätigungen und Schulungen fallen ohne `document.publish` bzw. `training.write` auf die
     eigenen Zeilen zurück, wie in CLAUDE.md beschrieben.
   - Einen Abfluss gibt es nicht. Heute haben alle Systemrollen alle Leserechte, der Filter wirkt
     also erst bei eigenen Rollen.
3. **Kann eine Erinnerungsmail Fristen enthalten, die die Empfängerin nicht sehen darf?**
   - Nein. Jede Person bekommt nur Einträge, deren Eigentümerin sie ist.
   - Umgekehrt kann aber ein Risk-Owner eigenen Text in die Mail einer anderen Person bringen,
     indem er ihr eine Maßnahme zuweist (I3).
   - Und der Postausgang der Mails ist für jeden Mandanten lesbar, auch für fremde (C1).
4. **Mit welcher Rolle läuft der Hintergrundprozess, und setzt er den Mandanten richtig?**
   - pg-boss verbindet sich als Eigentümer `isms_migrator`. Das ist bekannt aus Review 02 I5.
   - Die Mandantendaten liest der Prozess als `isms_app` unter Zeilensicherheit, je Mandant über
     `dbs.tenant(...)`. Das ist richtig.
   - Ein Fehler in einem Mandanten hält die anderen nicht auf.
   - Doppelte Läufe schickt er aber doppelt (I6).

## Critical

### C1 Der Postausgang der Mails ist für jeden Mandanten lesbar, auch für einen frisch registrierten

- **Fundstellen:**
  - `apps/api/src/kernel/mail/mail.service.ts:39`: `recent` liegt in einem globalen Dienst für den
    ganzen Prozess, ohne Mandantenbezug.
  - `mail.service.ts:86-87`: `outbox()` gibt die letzten Nachrichten aller Mandanten zurück.
  - `apps/api/src/modules/notifications/notifications.controller.ts:39-42` bietet das unter
    `GET /notifications/outbox` an. Verlangt wird nur `tenant.settings`, und das hat jede
    ISMS-Leitung, also auch jeder, der sich über das öffentliche `register` selbst einen Mandanten
    anlegt.
- **Nachweis** gegen die API:
  1. Carla (Mandant „Probe AG“) verschickt die Erinnerungen.
  2. Olga legt sich den Mandanten „Other AG“ an und ruft den Postausgang ab (200).
  3. Sie erhält Carlas Mail mit Empfängeradresse und vollem Text: „Geheime Massnahme Probe AG
     Firewall-Umbau [M-0001] … ISMS Probe AG“.
- **Wirkung:** Jeder im Internet liest Namen, Adressen und Titel von Risiken, Maßnahmen,
  Feststellungen und Zielen anderer Mandanten.
- **Nebenbefund:** Der Postausgang zeigt nie, was der Hintergrundprozess verschickt, denn der läuft in
  einem eigenen Prozess. Der Kommentar am Endpunkt nennt ihn trotzdem „die einzige Stelle, an der
  sichtbar wird, was die Anwendung verschickt hätte“.
- **Vorschlag:**
  - Den Postausgang in einer Mandantentabelle unter Zeilensicherheit speichern. Dann sieht man auch die
    Mails des Hintergrundprozesses.
  - Mindestens jede Nachricht mit Mandant speichern und danach filtern.

### C2 Meldefristen erreichen niemanden per Mail und erscheinen in der Fristenliste zu spät und zu weit unten

Der Fristenmonitor im Vorfall (`/incidents/obligations`) rechnet richtig. Die Fristenliste
(`/deadlines`) und die Erinnerungsmail, die auf ihr aufbaut, stellen dieselben Fristen aber falsch
dar:

- **Kein Empfänger.**
  - `apps/api/src/modules/deadlines/deadlines.service.ts:159` setzt für Meldefristen
    `NULL::uuid AS "ownerPersonId"`.
  - `apps/api/src/modules/notifications/notifications.service.ts:75` überspringt Zeilen ohne
    Eigentümer.
  - Die bearbeitende Person des Vorfalls (`handler_person_id`) wird nicht genutzt.
  - Folge: Keine NIS2-, DSGVO- oder AI-Act-Frist wird je gemailt. Auch die Ansicht „nur meine“ zeigt
    sie niemandem.
- **Datum statt Zeitpunkt.**
  - `deadlines.service.ts:158` (`ro.due_at::date`), `:115` (`"dueAt" - current_date`) und `:128`
    (überfällig nur bei `daysLeft < 0`) rechnen in Tagen, und zwar in UTC. Die Verbindung setzt keine
    Zeitzone.
  - Nachweis: Kenntnis vor 25 Stunden, die 24-Stunden-Frist ist seit einer Stunde vorbei.
    - `/incidents/obligations` zeigt richtig „überfällig, −1 Stunde“.
    - `/deadlines` zeigt dieselbe Frist als „heute fällig“ (`daysLeft 0`) und zählt sie nicht als
      überfällig.
  - Zwischen 00:00 und 02:00 Uhr deutscher Zeit liegt `current_date` noch auf dem Vortag. Dann ist
    jedes Datum in der Liste um einen Tag verschoben.
- **Kritische Fristen kommen zuletzt.**
  - `deadlines.service.ts:119` sortiert `ORDER BY "dueAt", severity DESC`. Die Stufe ist Text,
    deshalb ist die Reihenfolge `normal`, `high`, `critical`. Nachgeprüft.
  - Am selben Tag stehen Meldefristen hinter allen anderen Einträgen. Die Vorschau der fünf nächsten
    Fristen (`:132`) kann sie ganz abschneiden.
- **Zu langsam.** Die Erinnerung läuft werktags um 07:00 Uhr (`apps/api/src/config/env.ts:63`,
  `apps/api/src/worker.ts:48`). Für eine Frist von 24 Stunden ist das grundsätzlich zu langsam.
  - Beispiel: Ein Vorfall wird am Freitag, 16.10.2026, um 18:00 Uhr als erheblich eingestuft. Die
    Frühwarnung ist am Samstag um 18:00 Uhr fällig, die Meldung am Montag um 18:00 Uhr.
  - Selbst mit Empfänger käme die erste Mail am Montag um 07:00 Uhr.
- **Vorschlag:**
  - Die bearbeitende Person als Eigentümerin der Meldefristen eintragen. Ohne sie die ISMS-Leitung.
  - In der Liste den Zeitpunkt behalten und überfällig mit `now()` bestimmen.
  - Alle Datumsvergleiche in `Europe/Berlin` rechnen.
  - Nach Stufe in fester Reihenfolge sortieren, kritisch zuerst.
  - Beim Einstufen eines Vorfalls (`markSignificant`, `confirmBreach`, `markAiSerious`) sofort eine
    Mail an die bearbeitende Person und an alle mit `incident.write` auslösen, als Job nach dem
    Commit.

## Important

### I1 Die Beginnzeitpunkte der Fristen sind unbegrenzt, und Fehler lassen sich nicht korrigieren

- **Fundstellen:**
  - `packages/shared/src/dto.ts:304` (`confirmedAt`), `:314` (`knownAt`), `:320` (`fulfilledAt`)
    und `:850` (Kenntnis beim KI-Vorfall) sind ohne Grenze. Keiner wird gegen den Zeitpunkt der
    Entdeckung geprüft.
  - Eine zweite Einstufung wird abgelehnt (`apps/api/src/modules/incidents/incidents.service.ts:205-211`,
    `:258-263`, `:303-308`). Ein Fehler bei der ersten bleibt also für immer.
  - Das Erfüllen einer schon erfüllten Frist wird nicht abgelehnt (`incidents.service.ts:358-386`).
    Ein zweites Erfüllen der 72-Stunden-Meldung berechnet den Abschlussbericht neu.
- **Nachweis:**
  - Das zweite Erfüllen mit `fulfilledAt: 2030-01-01` wird angenommen. Der Abschlussbericht wandert
    vom 11.11.2026 auf den 01.02.2030.
  - Ein Risk-Owner kann einen Vorfall mit `detectedAt: 2001-01-01` anlegen.
- **Beispiel:** Am 11.10.2026 wird `knownAt: 2027-10-11T08:00Z` eingetragen, ein Tippfehler im Jahr.
  Die Frühwarnung ist dann am 12.10.2027 fällig und liegt außerhalb jedes Horizonts.
- **Vorschlag:**
  - Zeitpunkte höchstens wenige Minuten in der Zukunft zulassen und nicht vor der Entdeckung.
  - Erneutes Erfüllen ablehnen.
  - Einen ausdrücklichen Korrekturweg mit `incident.write` anbieten, der alten und neuen Zeitpunkt in
    der Zeitleiste festhält.

### I2 Pflichten „unverzüglich“ verschwinden aus allen Listen

- **Fundstellen:**
  - `ai_provider_notice` (Art. 26 Abs. 5 AI Act) und `gdpr_art34` werden mit leerem Fälligkeitsdatum
    gespeichert (`apps/api/src/modules/incidents/reporting-deadlines.ts:62`, `:118`).
  - Fristenliste (`deadlines.service.ts:162`) und Fristenmonitor (`incidents.service.ts:409`) filtern
    leere Fälligkeiten heraus.
- **Wirkung:** Die dringendste Pflicht nach einem schweren KI-Vorfall, den Anbieter sofort zu
  informieren, steht nur in der Detailansicht des Vorfalls. Sie ist nicht kritisch gelistet, nicht
  gezählt und wird nicht gemailt.
- **Achtung Test:** `apps/api/test/incidents.e2e.test.ts:202-203` verlangt genau dieses Weglassen
  (siehe I8).
- **Vorschlag:**
  - Als Fälligkeit den auslösenden Zeitpunkt speichern, also „jetzt fällig“, und als „unverzüglich“
    beschriften.
  - Den Zwischenbericht nach NIS2 (`nis2_progress`) weiter weglassen, denn er wird nur auf Anfrage
    fällig.

### I3 Ein Risk-Owner bringt eigenen Text in die offizielle Erinnerungsmail einer anderen Person

- **Fundstellen:**
  - `apps/api/src/modules/measures/measures.service.ts:120` und `:127`: Die Eigentumsprüfung beim
    Ändern gilt dem bisherigen Eigentümer. Der neue Eigentümer wird ungeprüft gespeichert.
  - `apps/api/src/modules/notifications/notifications.service.ts:75` und `:151`: Die Mail geht an den
    Eigentümer und enthält den Titel wörtlich.
- **Nachweis:**
  1. Rita (nur `measure.write_own`) legt die Maßnahme „IT-Hinweis: Postfach läuft ab, neu anmelden
     unter https://evil.example/login“ an.
  2. Sie weist sie Erika zu, einer Person ohne Konto mit Adresse `erika@lieferant.example` (200).
  3. Die Vorschau zeigt die Mail an Erika mit diesem Text, verschickt vom ISMS-Absender des
     Unternehmens.
- **Wirkung:** Phishing über einen vertrauenswürdigen Kanal. Die Mail verrät nicht, wer den Text
  geschrieben hat. Bei Verbesserungen und Risiken dürfte es genauso gehen, das ist nicht geprüft.
- **Vorschlag:**
  - Wer nur `_own` hat, darf den Eigentümer nicht auf andere Personen ändern.
  - Beim Anlegen ist der Eigentümer die Person selbst (vgl. Review 04 I9).
  - In der Mail angeben, wer den Eintrag zuletzt geändert hat.

### I4 Vorfälle lassen sich mit Assets und Verarbeitungen fremder Mandanten verknüpfen

- **Fundstellen:**
  - `apps/api/src/modules/incidents/incidents.service.ts:141` und `:177`: `assetIds` werden ohne
    Mandantenprüfung eingefügt.
  - `incidents.service.ts:238`: ebenso `processingActivityIds`.
  - Fremdschlüssel prüfen ohne Zeilensicherheit. Die Richtlinie auf `incident_processing` prüft nur
    den Vorfall (`0001_rls_triggers_views.sql:102`).
- **Nachweis:**
  - Ein Vorfall in Mandant A mit dem Asset von Mandant B: 201. Mit einer zufälligen UUID: 422.
  - Eine Datenpanne in A mit einer Verarbeitung aus B: 201.
- **Wirkung:**
  - Der Statuscode verrät, ob eine UUID irgendwo existiert.
  - Der Eintrag nach Art. 33 zeigt auf eine Verarbeitung, die A nie sehen kann. Das verfälscht den
    Datensatz, der an die Behörde geht.
  - Inhalte fließen nicht ab, die Zeilensicherheit verbirgt die fremden Zeilen.
- **Vorschlag:** Jede ID vor dem Einfügen im eigenen Mandanten nachschlagen. Besser sind
  zusammengesetzte Fremdschlüssel aus Mandant und ID. Denselben Fall gibt es bei der Herkunft von
  Verbesserungen (Review 04).

### I5 Der Kalendermonat wird in UTC gerechnet, am Monatsende ist der Abschlussbericht zu spät angesetzt

- **Fundstelle:** `apps/api/src/modules/incidents/reporting-deadlines.ts:40-47` (`addMonths` mit
  `getUTCDate` und `setUTCMonth`).
- **Nachweis** mit der echten Funktion:
  - Die Meldung erfolgt am 31.01.2027 um 00:30 Uhr deutscher Zeit, also `2027-01-30T23:30Z`.
  - Der Abschlussbericht wird für `2027-02-28T23:30Z` angesetzt, also den **01.03.2027 um 00:30 Uhr**.
  - Nach deutscher Zeit endet „einen Monat nach dem 31.01.“ am 28.02. Die Frist steht damit
    mindestens 30 Minuten zu spät, liest man „gleiche Uhrzeit“, sogar einen Tag.
  - Über die Zeitumstellung hinweg verschiebt sich die Uhrzeit: 10.03.2026 um 11:00 Uhr ergibt den
    10.04.2026 um 12:00 Uhr.
- **Vorschlag:** In `Europe/Berlin` rechnen, etwa mit `Temporal` oder `date-fns-tz`. Fälle mit
  Monatsende kurz nach Mitternacht testen.
- **Rechtlicher Hinweis, nicht geprüft:** Für Tages- und Monatsfristen ließen die Verordnung
  1182/71 und §§ 187 ff. BGB die Frist bis Tagesende oder zum nächsten Werktag laufen. Der Code ist
  strenger, also auf der sicheren Seite. Bei 24 und 72 Stunden verlängert er richtigerweise nichts.

### I6 Die Erinnerungen werden bei Wiederholung doppelt verschickt

- **Fundstellen:**
  - `apps/api/src/worker.ts:34-46` geht alle Mandanten in einem einzigen Job durch, ohne Protokoll
    der Sendungen.
  - pg-boss stellt Jobs mindestens einmal zu, eben nicht genau einmal.
  - `notifications.controller.ts:29-31` lässt `digest/send` beliebig oft auslösen, ohne Grenze.
- **Nachweis:** Zwei Aufrufe von `digest/send` hintereinander erzeugen zwei gleiche Mails.
- **Beispiel:** Ein Neustart um 07:01 Uhr, nachdem die Mandanten A bis M schon gemailt sind. pg-boss
  liefert den Job neu aus, und A bis M bekommen die Mail zweimal. Das betrifft auch externe Personen
  über das SMTP-Relay des Unternehmens.
- **Vorschlag:**
  - Eine Zeile je Mandant und Tag (`digest_run(tenant_id, run_date)`, eindeutig), oder ein Job je
    Mandant mit Schlüssel aus Mandant und Datum.
  - Der manuelle Versand schickt nur an die aufrufende Person, als Zustelltest.

### I7 Die Rolle Auditor kann keinen Vorfall melden, obwohl „melden darf jede Rolle“

- **Fundstellen:**
  - `incident.report` haben ISMS-Manager, Risk-Owner und Datenschutz
    (`packages/shared/src/permissions.ts:209`, `:229`, `:260`), die Auditorin nicht.
  - `POST /incidents` verlangt dieses Recht (`apps/api/src/modules/incidents/incidents.controller.ts`).
- **Nachweis:** Die Auditorin legt einen Vorfall an und bekommt 403.
- **Wirkung:** Wer während eines Audits ein Sicherheitsereignis sieht (A.6.8), kann es in der Suite
  nicht melden. Der Kommentar im Controller und `docs/iso27001-abdeckung.md` behaupten das Gegenteil.
- **Vorschlag:** Jeder Mandantenrolle `incident.report` geben.

### I8 Tests übersehen die Befunde oder verlangen den Fehler

- **`apps/api/test/notifications.e2e.test.ts:164-180`:**
  - Der Test legt einen zweiten Mandanten an, ruft dessen Postausgang aber nie ab. Eine Zeile mehr
    hätte C1 gefunden.
  - `:153-155` prüfen den Empfänger im globalen Postausgang. Das klappt nur, weil ein einziger
    Mandant schreibt.
- **`apps/api/test/incidents.e2e.test.ts:202-203`:** Der Test verlangt, dass `gdpr_art34` im
  Fristenmonitor fehlt (I2). Eine Korrektur macht ihn rot. Die Absicht muss neu formuliert werden.
- **`incidents.e2e.test.ts:168-182`:** Der Test zum Monatsende nimmt 12:00 Uhr UTC. Dann liegen UTC
  und deutsche Zeit am selben Tag, und I5 kann gar nicht auffallen.
- **`apps/api/test/deadlines.e2e.test.ts:110-137`:** Der Test prüft Stufe und Titel einer Meldefrist,
  nicht aber Restzeit, Eigentümer und „überfällig“. Genau dort liegt C2.
- **`incidents.e2e.test.ts:141-157`:** Der Test verwendet nur einen plausiblen Erfüllungszeitpunkt.
  Grenzen prüft er keine (I1).
- **Keine Unit-Tests** für `reporting-deadlines.ts`, `MailService`, `JobsService` und `worker.ts`.
  Der Hintergrundprozess ist gar nicht getestet.
- **Abhängigkeit von der Uhr:**
  - `deadlines.e2e.test.ts:23` und `notifications.e2e.test.ts:22` rechnen „heute“ mit der Uhr von
    JavaScript in UTC.
  - Die Datenbank nimmt `current_date` in ihrer eigenen Zeitzone.
  - Bei einer Datenbank in deutscher Zeit, wie bei einer typischen lokalen Installation, scheitern die
    Tests zwischen 22:00 und 24:00 Uhr UTC.
  - Am empfindlichsten ist `notifications.e2e.test.ts:112` und `:115` mit dem genauen Text „seit 4
    Tag(en)“.

## Suggestion

### Vorfälle

- **Zeitleisteneinträge lassen sich fälschen.**
  - `incidents.service.ts:425-433` übernimmt `kind` und `at` aus der Anfrage. `TimelineEntryDto.kind`
    ist ein freier Text (`dto.ts:327`), und `at` hat keine Grenze.
  - Nachweis: ein Eintrag mit der Systemart `nis2`, dem Systemtext und Datum 2001 (201).
  - Die Zeitleiste ist der Beleg für „wann hatten wir Kenntnis“.
  - Vorschlag: Für Handeinträge nur `note` zulassen, den Zeitpunkt der Erfassung getrennt speichern und
    keine Zeitpunkte in der Zukunft annehmen.
- **`markAiSerious` prüft die Risikoklasse nicht** (`incidents.service.ts:309-314`). Art. 26 Abs. 5
  und Art. 73 gelten für Hochrisiko-Systeme. Bei einem System mit minimalem Risiko entsteht trotzdem
  eine kritische Frist nach Art. 73. Das Datum, ab dem Art. 26 gilt (2.12.2027), wird ebenfalls nicht
  berücksichtigt.
- **Kein Ausweg „nicht meldepflichtig“.** Stellt sich ein Vorfall später als nicht erheblich heraus,
  bleiben seine Fristen für immer offen und kritisch. Der einzige Ausweg ist „erfüllt“, und das
  dokumentiert eine Meldung, die es nie gab.
- **Die Datenschutzbeauftragte kann NIS2-Vorfälle einstufen und NIS2-Fristen als erfüllt markieren**
  (`incident.write`). Das ist keine Verletzung der Funktionstrennung. Die NIS2-Meldung ist aber
  Aufgabe von Leitung und ISMS (§ 38 BSIG). Ein eigenes Recht für Behördenmeldungen wäre genauer.

### Fristenliste und Mails

- **`horizonDays=abc` ergibt 500.** Betroffen sind `apps/api/src/modules/deadlines/deadlines.controller.ts:23`
  und `notifications.controller.ts:24` und `:30-31`, alle mit `Number(...)` ohne Prüfung. Nachweis:
  500 an beiden Endpunkten. Besser ein Zod-Schema mit Bereich 1 bis 365.
- **SMTP ohne `requireTLS`** (`apps/api/src/kernel/mail/mail.service.ts:46-52`). nodemailer wechselt
  nur zu TLS, wenn der Server STARTTLS anbietet. Ein Angreifer im Netz kann das Angebot entfernen.
  Dann gehen Zugangsdaten und Inhalte im Klartext. Mit `MAIL_DRIVER=smtp` sollte `requireTLS: true`
  gelten, Ausnahmen nur für einen ausdrücklich benannten Entwicklungshost.
- **Der Log-Treiber schreibt Empfängeradressen ins Server-Log** (`mail.service.ts:60`, `:79`). Das
  sind personenbezogene Daten. Ihre Aufbewahrung gehört ins Verarbeitungsverzeichnis.
- **Die Prüfung auf `_own` in der Fristenliste ist toter Code** (`deadlines.service.ts:75`). Sie
  fragt `${recht}_own` ab, aber kein Leserecht hat eine solche Variante.
- **CLAUDE.md sagt: „niemand bekommt etwas gemailt, das er nicht ohnehin sehen könnte“.** Personen
  ohne Konto werden bewusst gemailt (`notifications.service.ts:154-170`). Sie bekommen nur Titel
  ihrer eigenen Einträge. Das ist vertretbar, sollte aber so formuliert sein.
- **Deaktivierte Konten bekommen weiter Mails.** Die Erinnerung filtert nur `person.is_active`
  (`notifications.service.ts:163`), nicht das Konto. Das gehört zu Review 01 I3.

## Quellen der Fristenliste und ihre Rechteprüfung

Alle in `apps/api/src/modules/deadlines/deadlines.service.ts`. Die Prüfung steht in `:73-78`. Jede
Quelle filtert nach Mandant und läuft unter Zeilensicherheit in `dbs.tenant(...)`.

| Quelle                       | Zeilen     | Geprüftes Recht    | Eigene Zeilen ohne Recht | Urteil                                        |
| ---------------------------- | ---------- | ------------------ | ------------------------ | --------------------------------------------- |
| Meldefristen                 | `:142-163` | `incident.read`    | nein                     | Recht in Ordnung, Darstellung falsch (C2, I2) |
| Feststellungen               | `:165-174` | `audit.read`       | nein                     | in Ordnung                                    |
| Verbesserungen               | `:176-183` | `action.read`      | nein                     | in Ordnung                                    |
| Maßnahmen                    | `:185-193` | `measure.read`     | nein                     | in Ordnung                                    |
| Risiko-Wiedervorlage         | `:195-203` | `risk.read`        | nein                     | in Ordnung                                    |
| Ablauf einer Risikoübernahme | `:206-214` | `risk.read`        | nein                     | in Ordnung                                    |
| Dokumentprüfung              | `:216-223` | `document.read`    | nein                     | in Ordnung                                    |
| Nachweise                    | `:225-232` | `measure.read`     | nein                     | in Ordnung                                    |
| Notfallübungen               | `:234-242` | `continuity.read`  | nein                     | in Ordnung                                    |
| Ziele                        | `:244-251` | `context.read`     | nein                     | in Ordnung                                    |
| Audits                       | `:253-260` | `audit.read`       | nein                     | in Ordnung                                    |
| Lesebestätigungen            | `:263-276` | `document.publish` | ja                       | in Ordnung, wie in CLAUDE.md                  |
| Schulungen                   | `:278-289` | `training.write`   | ja                       | in Ordnung, wie in CLAUDE.md                  |
| Kompetenznachweise           | `:291-300` | `competence.read`  | nein                     | in Ordnung                                    |

## Regeln für die Meldefristen

| Pflicht                         | Beginn                                                                                                                                                                | Im Code                                               | Rechtsgrundlage                                                     | Urteil                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| DSGVO Art. 33                   | bestätigte Kenntnis der Datenpanne, sonst jetzt (`incidents.service.ts:204`)                                                                                          | plus 72 echte Stunden (`reporting-deadlines.ts:54`)   | 72 Stunden nach Kenntnis, keine Verlängerung                        | richtig; Beginn unbegrenzt (I1)                                                       |
| DSGVO Art. 34                   | wie oben                                                                                                                                                              | ohne Datum (`:62`)                                    | unverzüglich, nur bei hohem Risiko                                  | richtig, aber unsichtbar (I2)                                                         |
| NIS2 Frühwarnung                | Kenntnis (`incidents.service.ts:264`)                                                                                                                                 | plus 24 Stunden (`:76`)                               | 24 Stunden nach Kenntnis (Art. 23 Abs. 4 a, § 32 BSIG)              | richtig, auch über die Zeitumstellung                                                 |
| NIS2 Meldung                    | Kenntnis                                                                                                                                                              | plus 72 Stunden (`:72`)                               | 72 Stunden nach Kenntnis                                            | richtig                                                                               |
| NIS2 Zwischenbericht            | entfällt                                                                                                                                                              | ohne Datum (`:88`)                                    | nur auf Anfrage                                                     | richtig                                                                               |
| NIS2 Abschlussbericht           | geplant: Frist der Meldung plus 1 Monat (`:95`); nach Erfüllung: tatsächliche Meldung plus 1 Monat (`incidents.service.ts:375-385`, `reporting-deadlines.ts:106-108`) | Kalendermonat, am Monatsende abgeschnitten (`:40-47`) | einen Monat nach der Meldung (Art. 23 Abs. 4 d)                     | Bezug richtig; Monat in UTC (I5); verschiebbar durch erneutes Erfüllen (I1)           |
| AI Act Art. 26 Abs. 5, Anbieter | Kenntnis                                                                                                                                                              | ohne Datum (`:118`)                                   | unverzüglich                                                        | richtig, aber unsichtbar (I2); ohne Prüfung auf Hochrisiko                            |
| AI Act Art. 73, Behörde         | Kenntnis                                                                                                                                                              | 15, 2 oder 10 mal 24 Stunden (`:110`, `:124`)         | 15 Tage; 2 Tage bei kritischer Infrastruktur; 10 Tage bei Todesfall | richtig, strenger als Tageszählung. „Weitverbreitete Verletzung“ ist nicht auswählbar |

Doppelte Pflichten verhindert ein eindeutiger Index auf Vorfall und Pflicht
(`packages/db/src/schema/operations.ts:184`). `due_at` ist ein Zeitpunkt mit Zeitzone (`:176`).

## Hintergrundprozess: Rolle und Mandant

| Frage                         | Antwort                                                                                                            | Beleg                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Läuft nur mit `JOBS_ENABLED`? | ja, sonst beendet er sich                                                                                          | `apps/api/src/worker.ts:22-25`                                  |
| Rolle für pg-boss             | `DATABASE_URL_MIGRATOR`, sonst `DATABASE_URL`, eigenes Schema `pgboss`                                             | `apps/api/src/kernel/jobs/jobs.service.ts:23-29` (Review 02 I5) |
| Rolle für Mandantendaten      | `isms_app` über `DATABASE_URL`                                                                                     | `apps/api/src/kernel/db/db.service.ts:23`                       |
| Liste der Mandanten           | `dbs.platform()`, ohne Mandantenkontext                                                                            | `notifications.service.ts:58-63`                                |
| Daten je Mandant              | `dbs.tenant(tenantId)` unter Zeilensicherheit, Kontakte zusätzlich mit Mandant und `is_active`                     | `deadlines.service.ts:110`, `notifications.service.ts:156-169`  |
| Fehler in einem Mandanten     | eigenes `try/catch` je Mandant, die anderen laufen weiter                                                          | `worker.ts:36-44`                                               |
| Zeitplan                      | `DIGEST_CRON`, Standard werktags 07:00, Zeitzone `Europe/Berlin`, übersteht Neustarts                              | `worker.ts:48`, `apps/api/src/config/env.ts:63`                 |
| Doppelte Ausführung           | mehrere Worker teilen sich einen Zeitplan, die API startet keine Jobs. Doppelte Mails bei erneuter Zustellung (I6) | `worker.ts`, `jobs.service.ts`                                  |
| Beenden                       | `SIGTERM` und `SIGINT` stoppen pg-boss geordnet und schließen SMTP                                                 | `worker.ts:51-57`, `jobs.service.ts:36-38`                      |

## Testlauf

| Datei                       | Tests | Ergebnis  |
| --------------------------- | ----- | --------- |
| `incidents.e2e.test.ts`     | 18    | bestanden |
| `ai-nis2.e2e.test.ts`       | 18    | bestanden |
| `deadlines.e2e.test.ts`     | 7     | bestanden |
| `notifications.e2e.test.ts` | 5     | bestanden |

Keiner der Befunde C1 bis I7 wird erkannt. Die Tests laufen in UTC, ohne gesetzte Zeitzone, auch im
CI.

## Fehlende Tests nach Priorität

| Prio       | Schützt vor                                | Datei                                                             | Art                      | Uhr                                                                                  | Kern des Tests                                                                                                                                  |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | C1                                         | `notifications.e2e.test.ts`                                       | E2E                      | keine                                                                                | Mandant A verschickt, Mandant B liest den Postausgang: leer. Und umgekehrt.                                                                     |
| Critical   | C2                                         | `deadlines.e2e.test.ts`                                           | E2E                      | Kenntnis = jetzt minus 25 Stunden                                                    | Verpasste 24-Stunden-Frist ist in `/deadlines` überfällig und wird gezählt. Sie steht vor anderen Einträgen desselben Tags.                     |
| Critical   | C2                                         | `notifications.e2e.test.ts`, `deadlines.e2e.test.ts`              | E2E                      | Kenntnis = jetzt minus 1 Stunde                                                      | Bearbeitende Person des Vorfalls bekommt die Meldefrist in der Vorschau und in „nur meine“.                                                     |
| Critical   | I5, Zeitumstellung, Schaltjahr, Wochenende | neu: `apps/api/src/modules/incidents/reporting-deadlines.test.ts` | Unit                     | feste Zeitpunkte, Prüfung in `Europe/Berlin` über `Intl`                             | Fälle: `2027-01-30T23:30Z`, 31.01.2028, 29.02.2028, 28. und 29.03.2026, 24. und 25.10.2026, Freitag 16:00 Uhr UTC ohne Verschiebung auf Montag. |
| Critical   | I1                                         | `incidents.e2e.test.ts`, neu: `packages/shared/src/dto.test.ts`   | E2E und Unit             | `vi.setSystemTime('2026-10-11T12:00Z')` im Unit-Test                                 | Erneutes Erfüllen, Erfüllung 2030 oder vor der Kenntnis, Kenntnis in der Zukunft: 400, Abschlussbericht unverändert.                            |
| Critical   | I2                                         | `incidents.e2e.test.ts` (Zeilen 202-203 umschreiben)              | E2E                      | feste Zeitpunkte                                                                     | Art. 34 und Anbieterinfo nach AI Act erscheinen in Monitor und Fristenliste als kritisch und sofort fällig.                                     |
| Important  | I3                                         | Maßnahmen- oder Mail-Tests                                        | E2E                      | keine                                                                                | Risk-Owner weist eigene Maßnahme einer anderen Person zu: 403.                                                                                  |
| Important  | I4                                         | `incidents.e2e.test.ts`                                           | E2E                      | keine                                                                                | Asset oder Verarbeitung eines fremden Mandanten: dieselbe Antwort wie bei einer zufälligen UUID.                                                |
| Important  | I6                                         | `notifications.e2e.test.ts`, Unit-Test für die Logik des Workers  | E2E und Unit             | `vi.useFakeTimers()`, `setSystemTime('2026-10-12T05:00Z')`                           | Zweiter Lauf am selben Tag verschickt nichts. Ein scheiternder Mandant hält die anderen nicht auf.                                              |
| Important  | I7                                         | `ai-nis2.e2e.test.ts`, `policy.test.ts`                           | E2E und Unit             | keine                                                                                | Auditorin, Datenschutz und Risk-Owner legen einen Vorfall an: 201.                                                                              |
| Important  | Uhr der Tests                              | alle Tests mit `inDays`                                           | E2E                      | Zeitzone der Datenbank im Setup auf UTC setzen oder „heute“ aus `current_date` lesen | Kein Versatz um einen Tag zwischen 22:00 und 24:00 Uhr UTC.                                                                                     |
| Suggestion | KI-Vorfall                                 | `ai-nis2.e2e.test.ts`                                             | E2E                      | feste Zeitpunkte                                                                     | System mit minimalem Risiko: kein Art. 73.                                                                                                      |
| Suggestion | Zeitleiste                                 | `incidents.e2e.test.ts`                                           | E2E                      | Zeitpunkte relativ zur Entdeckung                                                    | Systemart oder Datum in der Zukunft: 400.                                                                                                       |
| Suggestion | Eingaben                                   | `deadlines.e2e.test.ts`, `notifications.e2e.test.ts`              | E2E                      | keine                                                                                | `horizonDays` mit `abc`, `0`, `-5`, `9999`: 400 oder Begrenzung, nie 500.                                                                       |
| Suggestion | SMTP                                       | neu: `apps/api/src/kernel/mail/mail.service.test.ts`              | Unit, nodemailer gemockt | keine                                                                                | Mit SMTP gilt `requireTLS: true`. `sendAll` zählt Fehler. Der Postausgang hält höchstens 50 Nachrichten.                                        |
| Suggestion | Abdeckung                                  | `deadlines.e2e.test.ts`                                           | E2E                      | `inDays`                                                                             | Jede der 14 Quellen einmal befüllen. Eine eigene Rolle ohne `incident.read` sieht keine Meldefristen.                                           |

## Was gut gelöst ist

- **Fristenrechnung:** Sie steht in einem reinen Modul (`reporting-deadlines.ts`), mit den
  Rechtsgrundlagen im Kommentar. Der NIS2-Abschlussbericht hängt richtig an der Meldung und wird bei
  der tatsächlichen Meldung neu berechnet.
- **Stundenfristen:** Sie sind echte Stunden, damit auch über die Zeitumstellung genau. Das Abschneiden
  am Monatsende ist getestet.
- **Einstufung:** Ein zweites Einstufen wird abgelehnt, laufende Fristen lassen sich so nicht
  verlängern. Doppelte Pflichten verhindert ein eindeutiger Index. Einstufen und Erfüllen verlangen
  `incident.write`, das allgemeine Melderecht reicht dafür nicht.
- **Fristenliste:** Sie scheitert sicher, Quelle für Quelle. Der Rückfall auf eigene Zeilen
  entspricht der Funktionstrennung und ist getestet (`deadlines.e2e.test.ts:182`).
- **Mails und Worker:** Mails sind reiner Text, Adressen stammen aus einem geprüften E-Mail-Feld, und
  der Betreff enthält nur Zahlen. Der Worker trennt Fehler je Mandant und je Nachricht. Ohne SMTP geht
  nichts hinaus.

## Widerlegt

Der Test-Engineer meldete, das Fälligkeitsdatum komme als JavaScript-Datum an und erscheine in der
Mail als „Thu Oct 15 2026 00:00:00 GMT+0000 …“. Eine eigene Probe über `withTenant` und
`tx.execute` zeigt das Gegenteil: drizzle liefert `current_date` als Text (`2026-10-11`). Die Mail
zeigt also ein sauberes Datum. Der Befund ist nicht aufgenommen.

Die Nachweise des Security-Auditors liefen gegen die Testdatenbank `isms_test`. Die
Entwicklungsdatenbank ist unberührt.
