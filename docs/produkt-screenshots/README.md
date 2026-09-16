# Produkt-Screenshots

Bilder der eigenen Oberfläche für Dokumentation, Angebote und Präsentationen.
Nicht zu verwechseln mit `docs/screenshots/` — dort liegen fremde Referenzbilder,
die nur als Gestaltungsanregung gedient haben und nirgends veröffentlicht werden.

Alle Bilder zeigen den Demomandanten **Nordlicht Energiewerke GmbH**, einen frei
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

Aufnahme in 1440 × 950 bei doppelter Auflösung (2880 px breit), Listen als
Vollbild, Detailfenster als Ausschnitt. Das Skript steht in
`apps/web/scripts/doku-screenshots.mjs`; wer eine Ansicht ergänzt, ergänzt sie
dort und nicht von Hand — sonst veraltet die Sammlung still.

## Vorschlag für den Aufbau einer Vorführung

| Nr.   | Bild                                | Was es zeigt                                                             |
| ----- | ----------------------------------- | ------------------------------------------------------------------------ |
| 01    | `01-anmeldung`                      | Anmeldung, Mandantenkürzel optional                                      |
| 02    | `02-start-dashboard`                | Lage auf einen Blick: Abdeckung je Regelwerk, Reifegrad, offene Fristen  |
| 03    | `03-wiedervorlage`                  | jede datierte Pflicht des ISMS an einer Stelle                           |
| 04–05 | `04-kontext-parteien`, `05-…-ziele` | Kontext (Kap. 4) und Sicherheitsziele (Kap. 6.2)                         |
| 06–08 | `06-…` bis `08-organigramm`         | Kommunikationsplan (7.4), Änderungsplanung (6.3), Organigramm (5.3)      |
| 09–10 | `09-kompetenzmatrix`, `10-…`        | Soll-Ist-Lücke je Person (7.2) und Schulungen (7.3)                      |
| 11    | `11-anforderungen-soa`              | Anwendbarkeitserklärung als Abfrage, nicht als zweite Liste              |
| 12–13 | `12-massnahmen`, `13-…zuordnung`    | **Kernbild:** eine Maßnahme erfüllt ISO 27001, IT-Grundschutz und NIS2   |
| 14–15 | `14-dokumentenlenkung`, `15-…`      | Fassungen, Freigabe ≠ Autor, Lesebestätigungen (7.5)                     |
| 16    | `16-asset-inventar`                 | Werte mit Schutzbedarf (A.5.9, A.5.12)                                   |
| 17–18 | `17-risikoregister-matrix`, `18-…`  | 5×5-Matrix, inhärent/residual, Behandlung und Akzeptanz im Vier-Augen-P. |
| 19–20 | `19-sicherheitsvorfaelle`, `20-…`   | Fristenmonitor NIS2 24 h/72 h/1 Monat und DSGVO Art. 33                  |
| 21–22 | `21-geschaeftsfortfuehrung`, `22-…` | BIA am Geschäftsprozess mit Prüfregeln (A.5.29/A.5.30)                   |
| 23–24 | `23-verarbeitungsverzeichnis`, `24` | Art.-30-Verzeichnis, TOM = ISMS-Maßnahmen (Art. 32)                      |
| 25–27 | `25-auditprogramm` bis `27-…`       | Audits, Feststellungen, Nachweis an der Abweichung (9.2, 10.2)           |
| 28–30 | `28-…kvp`, `29-kennzahlen`, `30-…`  | Korrekturmaßnahmen, Kennzahlen (9.1), Managementbewertung (9.3)          |
| 31–34 | `31-beschaeftigte` bis `34-…`       | Personen, Änderungsprotokoll, Regelwerke aktivieren, Rollen und SoD      |
| 35    | `35-normbezug-kurzhilfe`            | Kurzhilfe am Feld: Regelwerk, Kapitel, Kurztitel — kein Normtext         |
