# Schlanke Oberfläche, Phase B: Buttons je Seite

Vorschlag, noch nicht umgesetzt. Regel: pro Seite genau ein hervorgehobener Hauptbutton
(`btn-primary`), alles andere wandert in die Detailansicht des Eintrags oder in ein Mehr-Menü.
Es entfällt keine Funktion.

**Grundlage:** Bestandsaufnahme im Code (`apps/web/src/pages/*.tsx`), gezählt sind nur die
Buttons der Listenansicht. Formulare (Anlegen, Abbrechen) und Detailfenster sind bereits die
„Detailansicht“ und bleiben, wie sie sind.

**Neues Bauteil:** ein Mehr-Menü (`MoreMenu` in `components/ui.tsx`, aufgebaut auf `<details>`,
ohne neue Abhängigkeit). Es steht rechts neben dem Hauptbutton, beschriftet „Mehr ▾“.

**Bitte entscheiden (eine Frage):** Organisation und Team & Schulung haben Unterreiter, und
jeder Unterreiter ist ein eigenes Register mit einer eigenen Anlegen-Aktion. Mein Vorschlag:
**ein Hauptbutton je Unterreiter**, nicht je Seite. Sonst wäre etwa „Ziel festlegen“ auf dem
Unterreiter Geltungsbereich zu sehen, wo es nicht hingehört. Die Tabellen unten gehen davon aus.

## Risiken (`/risks`)

| Buttons heute                                                             | Vorschlag                                                                                     | Begründung                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Kopf: „CSV“ (schlicht), „Risiko erfassen“ (hervorgehoben)                 | Hauptbutton **„Risiko erfassen“** bleibt. „CSV“ wandert ins Mehr-Menü als „Als CSV für Excel“ | Erfassen ist die tägliche Aufgabe, der Export eine seltene. Ein Erstnutzer sieht oben nur noch eine Aktion |
| Leer: „Erstes Risiko erfassen“ (hervorgehoben)                            | Bleibt, dafür entfällt im leeren Zustand der Button im Kopf                                   | Sonst stehen zwei gleiche Hauptbuttons auf derselben Seite                                                 |
| Detailfenster: Speichern, Bewertung speichern, bewusst tragen, Behandlung | Unverändert                                                                                   | Ist bereits die Detailansicht                                                                              |

## Maßnahmen (`/measures`)

| Buttons heute                                                         | Vorschlag                                                      | Begründung                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Kopf: „CSV“ (schlicht), „Maßnahme anlegen“ (hervorgehoben)            | Hauptbutton **„Maßnahme anlegen“** bleibt. „CSV“ ins Mehr-Menü | Wie bei Risiken                                                                      |
| Filter: „Alle“, „Für mehrere Regelwerke“ (Segment-Auswahl)            | Bleibt                                                         | Ist eine Ansicht, kein Befehl, und Kern der Vorführung (Schritt 3 im Demo-Leitfaden) |
| Leer: „Erste Maßnahme anlegen“ (hervorgehoben)                        | Bleibt, im leeren Zustand ohne Button im Kopf                  | Kein doppelter Hauptbutton                                                           |
| Detailfenster: Status, „Wirksamkeit bestätigen“, Zuordnung, Nachweise | Unverändert                                                    | Detailansicht                                                                        |

## Richtlinien (`/documents`)

| Buttons heute                                                                                     | Vorschlag                                                                                                                                                                                                              | Begründung                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Kopf: „Dokument anlegen“ (hervorgehoben)                                                          | Bleibt Hauptbutton für Rollen mit Schreibrecht                                                                                                                                                                         | Die ISMS-Leitung legt Richtlinien an                                                                                                            |
| Kasten „Von mir zu lesen“: je Zeile „Öffnen“ (schlicht) und „Kenntnis bestätigen“ (hervorgehoben) | Die ganze Zeile öffnet das Dokument, „Öffnen“ entfällt als eigener Button. „Kenntnis bestätigen“ wird schlicht; hervorgehoben nur, wenn die Rolle kein Schreibrecht hat und es deshalb keinen Hauptbutton im Kopf gibt | Heute stehen bei drei offenen Lesebestätigungen vier Hauptbuttons auf der Seite. Wer nur lesen darf, behält seine eine wichtige Aktion sichtbar |
| Detailfenster: Fassung hochladen, Freigeben, Lesebestätigung anfordern, Entfernen                 | Unverändert                                                                                                                                                                                                            | Detailansicht                                                                                                                                   |

## Team & Schulung (`/competence`)

| Buttons heute                                                                                                    | Vorschlag                                                                                       | Begründung                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Über den Unterreitern, Kasten „Ihre offenen Schulungen“: je Zeile „Teilnahme bestätigen“ (hervorgehoben)         | Schlicht statt hervorgehoben                                                                    | Steht auf jedem Unterreiter und konkurriert dort mit dem Hauptbutton               |
| Unterreiter Beschäftigte: „Person erfassen“ (hervorgehoben); je Zeile „Austreten“ bzw. „Reaktivieren“ (Textlink) | **„Person erfassen“** bleibt Hauptbutton. Die Textlinks wandern in ein Mehr-Menü je Zeile („⋯“) | Austreten ist selten und folgenreich, es soll nicht in jeder Zeile im Blick stehen |
| Unterreiter Schulungen: „Schulung anlegen“ (hervorgehoben); Detailfenster mit Zuweisen, Abschließen, Nachweis    | **„Schulung anlegen“** bleibt Hauptbutton, Detailfenster unverändert                            | Schon heute ein Hauptbutton                                                        |

## Vorfälle (`/incidents`)

| Buttons heute                                                                              | Vorschlag   | Begründung                                                           |
| ------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------- |
| Kopf: „Vorfall melden“ (hervorgehoben); Fristenmonitor und Tabelle: ganze Zeile klickbar   | Unverändert | Erfüllt die Regel schon: eine Aktion, alles Weitere im Detailfenster |
| Detailfenster: „Als Datenpanne bestätigen“, „Als erheblich einstufen“, KI-Vorfall, Fristen | Unverändert | Detailansicht                                                        |

## Organisation (`/context`)

| Buttons heute                                                                                                                                                         | Vorschlag                                                                                                                                                                                                                                                    | Begründung                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geltungsbereich: „Bearbeiten“ (schlicht)                                                                                                                              | **„Bearbeiten“** wird Hauptbutton, solange der Geltungsbereich leer ist heißt er „Geltungsbereich festlegen“                                                                                                                                                 | Die einzige Aktion des Unterreiters; für einen neuen Mandanten ist sie der erste Schritt                                                                                        |
| Umfeld & Parteien: sechs „+ Thema“ (schlicht, je PESTLE-Dimension), im Formular „Aufnehmen“ (hervorgehoben), „Partei erfassen“ (hervorgehoben), je Partei „Entfernen“ | Hauptbutton **„Eintrag erfassen“** mit Auswahl im Formular: Thema (mit Dimension) oder interessierte Partei. Die sechs „+ Thema“ entfallen als Buttons, die Dimension wählt man im Formular. „Entfernen“ ins Mehr-Menü je Zeile                              | Heute zwei Hauptbuttons und sechs Nebenbuttons auf einem Unterreiter. Ein Einstieg genügt, die Auswahl Thema oder Partei ist die eigentliche Entscheidung                       |
| Ziele: „Ziel festlegen“ (hervorgehoben)                                                                                                                               | Unverändert                                                                                                                                                                                                                                                  | Schon heute ein Hauptbutton                                                                                                                                                     |
| Kommunikation & Änderungen: „Eintrag hinzufügen“ und „Änderung planen“ (beide schlicht); je Änderung „Details“, „Freigeben“, „Starten“, „Erledigt“                    | Hauptbutton **„Änderung planen“**; „Kommunikation hinzufügen“ bleibt schlicht in der Überschrift des Abschnitts Kommunikation. „Freigeben“, „Starten“, „Erledigt“ wandern in die aufgeklappten Details der Änderung, die genau den nächsten Schritt anbieten | Eine geplante Änderung mit Vier-Augen-Freigabe ist der Vorgang, den ein Auditor sehen will (Kap. 6.3); Kommunikation wird selten gepflegt. Drei Statusknöpfe je Zeile sind Lärm |

## Audits (`/audits`)

| Buttons heute                                                                     | Vorschlag                                                                 | Begründung                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Kopf: „Audit planen“ (hervorgehoben); Tabelle: Link zum Bericht je Audit          | Hauptbutton bleibt. Der Berichtslink wandert ins Detailfenster des Audits | Die Liste beantwortet „welche Audits gibt es, in welchem Stand“; der Bericht gehört zum einzelnen Audit |
| Detailfenster: genau ein nächster Schritt (starten, Bericht abgeben, abschließen) | Unverändert                                                               | Erfüllt die Regel schon                                                                                 |

## Was sich nicht ändert

Keine Funktion entfällt, keine Berechtigung ändert sich, kein Endpunkt, keine Demodaten. Die
vollständige Oberfläche (`VITE_FULL_UI=true`) bekommt dieselben Änderungen nicht automatisch;
Vorschlag: die Buttons nur im schlanken Modus umstellen, damit die volle Oberfläche wie in
Phase A unverändert bleibt.
