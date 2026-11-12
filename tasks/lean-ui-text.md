# Schlanke Oberfläche: weniger Text

Gemessen am 12.11.2026 mit dem Demomandanten, angemeldet als ISMS-Leitung, Fenster 1440 × 950.
**Gezählt** werden die Zeichen aller sichtbaren Absätze (`p`) im Inhaltsbereich, die nicht in einer
Tabelle, einem Formular, einer Listenzeile, einem Detailfenster, einem Link oder einem Button
stehen: also Beschreibungen unter dem Titel, Überzeilen, Legenden und erklärende Fließtexte.
Titel, Tabellen und Einträge zählen nicht.

**Vorher** ist der Stand nach Phase A dieses Branches, also schon mit gekürzten Seiten, aber noch
mit allen Texten. **Nachher** ist der Stand nach Phase B.

| Seite               | Zeichen vorher | Zeichen nachher | weniger  |
| ------------------- | -------------- | --------------- | -------- |
| Lagebild            | 229            | 137             | 40 %     |
| ISO 27001           | 253            | 0               | 100 %    |
| NIS2                | 368            | 181             | 51 %     |
| EU AI Act           | 201            | 60              | 70 %     |
| Gap-Analyse         | 205            | 35              | 83 %     |
| NIS2-Cockpit        | 513            | 66              | 87 %     |
| Organisation        | 738            | 572             | 22 %     |
| Risiken             | 195            | 0               | 100 %    |
| Maßnahmen           | 176            | 0               | 100 %    |
| Assets              | 206            | 49              | 76 %     |
| Richtlinien         | 172            | 0               | 100 %    |
| Team & Schulung     | 83             | 0               | 100 %    |
| Vorfälle            | 128            | 0               | 100 %    |
| Audits              | 360            | 147             | 59 %     |
| Feststellungen      | 280            | 94              | 66 %     |
| Managementbewertung | 410            | 110             | 73 %     |
| **Summe**           | **4517**       | **1451**        | **68 %** |

## Was weggefallen ist

- **Seitenkopf:** Überzeile („PLANEN“) und Beschreibung unter dem Titel entfallen auf jeder Seite.
  Die Beschreibung, gekürzt auf höchstens zwei Sätze, steht hinter dem „i“ am Titel, neben dem
  Normbezug. Gelöst zentral in `PageHeader` (`components/ui.tsx`).
- **Normhinweise:** An Formularfeldern, Tabellenspalten, Kacheln und Listenzeilen blendet das
  Stylesheet sie aus (`.lean … .norm-hint` in `styles/index.css`, die Klasse `lean` setzt
  `main.tsx`). Es bleibt der Hinweis an der Überschrift eines Abschnitts.
- **Lagebild:** die Farblegenden über den Kennzahlen und unter den Schrittleisten.
- **Erklärende Absätze**, markiert mit `lean-hide`: „Anteil der anwendbaren Normpunkte …“ (ISO),
  „Verknüpfungen: …“ (Cockpit), die Legende der Auditabdeckung, der Ablauftext der laufenden
  Managementbewertung.
- **Demodaten:** 21 Beschreibungen, Begründungen und Notizen auf ihren ersten Satz gekürzt
  (`apps/api/src/demo-seed.ts`). Geltungsbereich und Titel bleiben, ebenso alle Werte, die
  `test/demo-seed.e2e.test.ts` festschreibt.

## Was bleibt und warum

- **Organisation (572 Zeichen):** fast alles ist der Geltungsbereich selbst, drei Absätze mit den
  Antworten auf „was gehört dazu, woran grenzt es an, was ist ausgenommen“. Das sind Daten, keine
  Erklärung, und ein Auditor liest sie zuerst.
- **Lagebild, NIS2, EU AI Act:** Kennzahlen unter den Programmkarten („3 von 7 Schritten erledigt“,
  „9 von 13 Pflichten erfüllt“) stehen in Absätzen und zählen deshalb mit; sie sind Zahlen, kein
  Fließtext.
- **Audits, Feststellungen, Managementbewertung:** die Abdeckung je Kapitel, die Kacheln der
  Feststellungen und die leeren Zustände („Noch keine abgeschlossene Bewertung“).
