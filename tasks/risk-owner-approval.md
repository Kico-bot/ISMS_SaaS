# Zustimmung des Risikoeigentümers (Kap. 6.1.3 f)

**Variante A freigegeben und umgesetzt.** Abweichungen vom Vorschlag stehen am Ende.

## Ausgangslage

ISO 27001 verlangt in Kap. 6.1.3 f, dass die Risikoeigentümer dem Behandlungsplan zustimmen und
das verbleibende Risiko akzeptieren. Die Suite kennt heute nur eine Zustimmung: „Risiko bewusst
tragen“. Sie gibt immer die Leitung, nie die Person, der das Risiko gehört. Das erzwingen drei
Stellen:

- der Dienst (`RisksService.accept`, Recht `risk.accept`),
- der Trigger aus Migration 0001: `assert_distinct_actor(accepted_by_user_id, owner_person_id,
'Restrisiko-Übernahme')`,
- der Trigger `trg_risk_approval_actor` aus Migration 0019 und die Prüfung beim Wechsel des
  Eigentümers aus Migration 0026.

Das verhindert, dass jemand sein eigenes Risiko kleinredet und selbst abzeichnet. Was fehlt, ist
der Nachweis, dass die verantwortliche Person mit Plan und Restrisiko einverstanden ist.

## Variante A: zwei Unterschriften (empfohlen)

Die Zustimmung des Eigentümers kommt **zusätzlich** zur Übernahme durch die Leitung.

- **Ablauf:** Die verantwortliche Person bestätigt „Behandlungsplan und Restrisiko einverstanden“.
  Liegt das Risiko über der Schwelle oder wird es bewusst getragen, entscheidet danach die Leitung
  wie heute.
- **Vier-Augen-Regeln:** bleiben unverändert. Neu ist eine Regel in umgekehrter Richtung: Die
  Zustimmung des Eigentümers gibt **nur** der Eigentümer selbst, also der Nutzer, der zur Person in
  `owner_person_id` gehört. Neuer Trigger `assert_same_actor` neben `assert_distinct_actor`.
- **Eigentümer ohne Konto:** Viele Verantwortliche melden sich nie an. Dann trägt die ISMS-Leitung
  die Zustimmung ein, mit Pflichtangabe „wie erteilt“ (zum Beispiel „per E-Mail vom 3.12.“) und
  optional einer Datei als Beleg. Gespeichert wird, wer sie eingetragen hat.
- **Schema:** Spalten an `risk`: `owner_agreed_at`, `owner_agreed_by_user_id`,
  `owner_agreement_note`, `owner_agreement_file_id` und `owner_agreement_snapshot` (Bewertung,
  Behandlung und Maßnahmen zum Zeitpunkt der Zustimmung, wie bei der Übernahme). Eine Migration,
  kein neues Modul.
- **Gültigkeit:** Die Zustimmung entfällt, sobald sich Bewertung, Behandlungsoption oder die
  verknüpften Maßnahmen ändern, genau wie heute die Übernahme. Eine Überprüfung, die dieselben
  Werte bestätigt, lässt sie stehen.
- **Oberfläche:** In der Detailansicht des Risikos ein Abschnitt „Zustimmung der
  Verantwortlichen“ mit einem Button für die Person selbst. In der Liste ein kleines Häkchen.
  Unter Mein Bereich ein Hinweis „2 Risiken warten auf Ihre Zustimmung“ (nur volle Oberfläche).
- **Zertifizierungsreife:** Der Kernnachweis „behandelte Risiken“ zählt ein Risiko über der
  Schwelle erst, wenn der Eigentümer zugestimmt hat.
- **Demodaten:** Bastian Olwig stimmt R-0001 und R-0004 zu; R-0003 wartet noch auf Aurel Timm,
  damit die Vorführung den offenen Zustand zeigt. R-0004 bleibt von der Leitung getragen.
- **Auditpaket:** `04-risiken/risikoregister.csv` bekommt die Spalten „Zustimmung der
  Verantwortlichen am“, „eingetragen durch“ und „wie erteilt“; die Datei landet unter
  `15-dateien/` mit ihrem Bezug.
- **Tests:** Zustimmung nur durch den Eigentümer oder als Eintrag mit Beleg; Rücksetzen bei neuer
  Bewertung; Trigger mit direkter Verbindung als App-Rolle; Kernnachweis.

## Variante B: der Eigentümer trägt kleine Risiken selbst

Unterhalb einer Grenze akzeptiert die verantwortliche Person das Restrisiko selbst, darüber die
Leitung.

- **Ablauf:** Bis 9 Punkte (mittel) bestätigt die verantwortliche Person „Risiko bewusst tragen“;
  ab 10 Punkten nur die Leitung.
- **Vier-Augen-Regeln:** Der Trigger `assert_distinct_actor` für die Restrisiko-Übernahme wird
  abhängig von der Punktzahl. Das schwächt eine Regel, die CLAUDE.md und das Auditpaket heute
  ausdrücklich nennen („nie durch die Person, der das Risiko gehört“). `risikokriterien.csv` und
  die Vorlage zur Risikomethode müssten das ändern.
- **Schema:** keine neue Spalte; geändert werden die Trigger aus den Migrationen 0001, 0019
  und 0026 (neue Migration, die bestehenden bleiben unangetastet).
- **Demodaten:** R-0002 (6 Punkte) würde vom Eigentümer getragen.
- **Auditpaket:** Spalte „Getragen durch“ unterscheidet Eigentümer und Leitung.
- **Nachteil:** Die Zustimmung zum **Behandlungsplan** ist damit nicht abgedeckt, nur das Tragen.
  Für Risiken mit Maßnahmen fehlt sie weiter.

## Empfehlung

**Variante A.** Sie erfüllt beide Teile von Kap. 6.1.3 f (Plan und Restrisiko), lässt die
Funktionstrennung unberührt, die die Suite in Dienst und Datenbank verankert hat, und ein Auditor
sieht beide Unterschriften getrennt. Sie kostet eine Migration, einen Trigger, einen Abschnitt in
der Detailansicht und drei Spalten im Auditpaket. Variante B ist kleiner, ändert aber eine
Grundregel und deckt den Behandlungsplan nicht ab.

## Umsetzung (Variante A)

- **Schema:** Migration 0031 legt die fünf Spalten an, Migration 0032 den Trigger
  `trg_risk_owner_agreement`. Statt eines allgemeinen `assert_same_actor` prüft er beides an einer
  Stelle: Hat die verantwortliche Person ein Konto, muss sie selbst zustimmen; hat sie keines, muss
  die Angabe „wie erteilt“ gefüllt sein. Wechselt die verantwortliche Person, entfällt die Zustimmung.
- **Endpunkt:** `POST /risks/:id/owner-agreement` mit `note` und `fileId`. Für eine Person ohne Konto
  braucht es volles `risk.write`, also die ISMS-Leitung, nicht die Rolle Risk-Owner.
- **Gültigkeit:** Neue Bewertungswerte, eine andere Behandlung, eine verknüpfte oder gelöste Maßnahme
  heben die Zustimmung auf. Eine Überprüfung mit denselben Werten lässt sie stehen.
- **Zertifizierungsreife:** Ein Risiko über 14 Punkten zählt erst mit Zustimmung als behandelt.
  Zusätzlich die abgeleitete Aufgabe „Hohe Risiken ohne Zustimmung der Verantwortlichen“, damit ein
  offener Kernnachweis immer eine passende Aufgabe hat.
- **Auditpaket:** Neben den drei Spalten eine vierte „Beleg der Zustimmung“ mit dem Dateinamen; die
  Datei selbst liegt unter `15-dateien/`. Bei eigener Zustimmung steht unter „wie erteilt“
  „selbst in der Anwendung“.
- **Demodaten:** wie vorgeschlagen; R-0002 trägt die ISMS-Leitung für Wenzel ein (per E-Mail).
- **Tests:** `apps/api/test/risk-owner-agreement.e2e.test.ts` und ein Fall im Demotest.
