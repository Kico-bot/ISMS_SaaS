# Produkt-Screenshots

Bilder der eigenen Oberfläche für Dokumentation, Angebote und Präsentationen.

Alle Bilder zeigen den Demomandanten **Stadtwerke Lindenbach GmbH**, einen frei
erfundenen regionalen Netzbetreiber (`pnpm db:seed:demo`). Personen, Anlagen,
Vorfälle und Kennzahlen sind erfunden; die Postadressen liegen auf der für
Beispiele reservierten Domain `.example`. Es sind keine echten Kundendaten
enthalten, und das Bildmaterial lässt sich auch nicht auf andere Produkte
zurückführen.

## Neu aufnehmen

```bash
service postgresql start
pnpm db:reset && pnpm db:seed && pnpm db:seed:demo   # frischer Stand
node apps/api/dist/main.js &                          # API auf :3000
pnpm --filter @isms/web dev &                         # Oberfläche auf :5173
pnpm --filter @isms/web screenshots                   # schreibt in diesen Ordner
```

Für einen vollständigen Satz zweimal aufnehmen: zuerst die vollständige Oberfläche
(`VITE_FULL_UI=true` für Oberfläche und Skript), dann frisch säen und die schlanke. Die
Reihenfolge zählt, weil die schlanken Bilder die gleichnamigen der vollständigen ersetzen sollen,
und das frische Säen, weil Bild 48 ein Risiko ändert.

Aufnahme in 1440 × 950 bei doppelter Auflösung (2880 px breit), Listen als
Vollbild, Detailfenster als Ausschnitt. Das Skript steht in
`apps/web/scripts/doku-screenshots.mjs`; wer eine Ansicht ergänzt, ergänzt sie
dort und nicht von Hand, sonst veraltet die Sammlung still.

Die Bilder zeigen die schlanke Oberfläche (Standard). Was dort ausgeblendet ist, nimmt das
Skript nur mit `VITE_FULL_UI=true` auf (Oberfläche und Skript mit dieser Variable starten); in
der Tabelle steht bei diesen Bildern „vollständige Oberfläche“.

## Vorschlag für den Aufbau einer Vorführung

| Nr.   | Bild                                      | Was es zeigt                                                           |
| ----- | ----------------------------------------- | ---------------------------------------------------------------------- |
| 00    | `00-ueberblick`                           | Lagebild: ISO 27001 als Kreisdiagramm, NIS2, AI Act, Kennzahlen        |
| 00e   | `00e-mein-bereich`                        | Mein Bereich (vollständige Oberfläche)                                 |
| 00d   | `00d-gap-analyse`                         | Gap-Analyse je Kapitel: gilt das, womit erfüllt, wie weit              |
| 00a–c | `00a-programm-iso27001`, `00b-…`, `00c-…` | Programmseiten ISO 27001, NIS2 und EU AI Act mit ihren Schritten       |
| 01    | `01-anmeldung`                            | Anmeldung, Mandantenkürzel optional                                    |
| 02    | `02-start-dashboard`                      | Lagebild ganz: Programme, Lage in Zahlen, offene Aufgaben zugeklappt   |
| 03    | `03-fristen`                              | Fristen, über die Kachel im Lagebild (vollständige Oberfläche)         |
| 04b   | `04b-organisation`                        | Planen, Organisation: Geltungsbereich, Themen, Parteien, Ziele         |
| 04–05 | `04-kontext-parteien`, `05-…-ziele`       | Umfeld und Ziele als Unterreiter (vollständige Oberfläche)             |
| 06–08 | `06-…` bis `08-organigramm`               | Einzeln und Organigramm (5.3) (vollständige Oberfläche)                |
| 09–10 | `09-kompetenzmatrix`, `10-…`              | Matrix (vollständige Oberfläche), Team & Schulung mit Schulungsstand   |
| 11    | `11-anforderungen-soa`                    | Anwendbarkeitserklärung als Abfrage, nicht als zweite Liste            |
| 12–13 | `12-massnahmen`, `13-…zuordnung`          | **Kernbild:** eine Maßnahme erfüllt ISO 27001 und NIS2 zugleich        |
| 12b   | `12b-gemeinsame-massnahmen`               | Programm NIS2: Maßnahmen, die mehrere Regelwerke zugleich erfüllen     |
| 14–15 | `14-dokumente`, `15-…`                    | Fassungen, Freigabe ≠ Autor, Lesebestätigungen (7.5)                   |
| 16    | `16-asset-inventar`                       | Werte mit Schutzbedarf (A.5.9, A.5.12)                                 |
| 17–18 | `17-risikoregister-matrix`, `18-…`        | 5×5-Matrix, eine Bewertung „Stand heute“, Häkchen bei Zustimmung       |
| 19–20 | `19-sicherheitsvorfaelle`, `20-…`         | Fristenmonitor NIS2 24 h/72 h/1 Monat und DSGVO Art. 33                |
| 21–22 | `21-notfallplanung`, `22-…`               | Notfallpläne und BIA (vollständige Oberfläche)                         |
| 23–24 | `23-verarbeitungsverzeichnis`, `24`       | Art.-30-Verzeichnis, TOM = ISMS-Maßnahmen (vollständige Oberfläche)    |
| 25–27 | `25-auditprogramm` bis `27-…`             | Audits, Feststellungen, Nachweis an der Abweichung (9.2, 10.2)         |
| 28–30 | `28-…kvp`, `29-kennzahlen`, `30-…`        | Verbesserungen, Kennzahlen (vollständig), Managementbewertung (9.3)    |
| 31–34 | `31-beschaeftigte` bis `34-…`             | Beschäftigte (vollständig), Änderungsprotokoll, Regelwerke, Rollen     |
| 35    | `35-normbezug-kurzhilfe`                  | Das i am Titel: Normbezug und Seitenbeschreibung, kein Normtext        |
| 36    | `36-grundschutz-modellierung`             | IT-Grundschutz (vollständige Oberfläche, fürs Bild zugeschaltet)       |
| 37–38 | `37-nis2-cockpit`, `38-…`                 | NIS2-Pflichten mit BSIG-Fundstelle; Flussdiagramm (vollständig)        |
| 39–40 | `39-ki-register`, `40-…`                  | KI-Register, nur Betreiberpflichten; Einstufung aus Fragen abgeleitet  |
| 41    | `41-ai-act-betreiberpflichten`            | AI-Act-Cockpit: welche Betreiberpflicht womit erfüllt ist              |
| 42    | `42-kontext-geltungsbereich`              | Geltungsbereich als Unterreiter (vollständige Oberfläche)              |
| 43    | `43-abkuerzungen-erklaert`                | Das i erklärt Abkürzungen (vollständige Oberfläche)                    |
| 44    | `44-lieferanten`                          | Lieferanten mit Nachweis, Bewertung und Prüftermin (A.5.19 bis A.5.22) |
| 45    | `45-richtlinie-aus-vorlage`               | Sechs Vorlagen für die ersten Richtlinien (5.2, 5.3, 6.1.2, 7.4 …)     |
| 46    | `46-bewertungsskala`                      | Bedeutung jeder Stufe hinter dem i an der Matrix (Kap. 6.1.2 a)        |
| 47    | `47-zustimmung-verantwortliche`           | Zustimmung zu Behandlung und Restrisiko, hier im Auftrag (Kap. 6.1.3)  |
| 48    | `48-mein-bereich-zustimmung`              | Mein Bereich: ein Risiko wartet auf Zustimmung (vollständige Oberfl.)  |
