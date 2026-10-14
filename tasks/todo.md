# Aufgabenliste: Behebung der Review-Befunde

Details, Tests und Abhängigkeiten je Aufgabe stehen in `tasks/plan.md`. Jede Aufgabe beginnt mit
einem Test, der den Fehler vorher nachweist.

## Paket 1: Critical

- [x] T1: Token nur für den Mandanten der Mitgliedschaft (K1)
- [ ] T2: Compose ohne Ersatzwerte für Geheimnisse (K1)
- [x] T3: Postausgang je Mandant (K2)
- [x] T4: Meldefristen mit Empfänger, Zeitpunkt und richtiger Reihenfolge (K3)
- [x] T5: Freigaben nicht als Status setzbar (K4) (teilweise, siehe tasks/offen.md)
- [x] T6: Audit abschließen nur durch die leitende Auditorin mit Bericht (K5)
- [x] T7: Abgeschlossene Audits sperren (K5)
- [ ] **Checkpoint Paket 1**

## Paket 2: Auth und Mandantentrennung

- [x] T8: Guard erlaubt `_own` nur ausdrücklich (W4)
- [x] T9: Einladung bindet das Kennwort an das Konto (W1)
- [x] T10: Keine Änderung der eigenen Rollen, Leitung bleibt erhalten (W2)
- [x] T11: Mandant des Erneuerungstokens in der Datenbank (W3)
- [x] T12: Suggestions Auth (H1 bis H5)
- [ ] **Checkpoint Paket 2**

## Paket 3: Datenbank und Rechte

- [x] T13: Suchpfad mit `pg_temp` in allen Funktionen (W6)
- [x] T14: Globale Rollen und SoD-Regeln nur lesbar (W5) (teilweise, siehe tasks/offen.md)
- [x] T15: Änderungsprotokoll gegen Kaskade und Rückdatierung (W7)
- [x] T16: Migrator-Zugang nur für Migration und Worker (W8) (teilweise, siehe tasks/offen.md)
- [x] T17: Katalogtest für RLS und App-Rolle, Idempotenz (H19-Teil, W30-Teil)
- [ ] **Checkpoint Paket 3**

## Paket 4: Dateien, Exporte, Protokoll

- [x] T18: Verarbeitungsverzeichnis und DSFA nur mit `privacy.read` (W10, Exportteil)
- [x] T19: Protokoll speichert geprüften Inhalt, begrenzt und nach Recht gefiltert (W10, Protokollteil)
- [x] T20: Protokoll ordnet nach Route statt Rohpfad (W11)
- [x] T21: IP im Protokoll (W12)
- [x] T22: Downloads und Auditpaket überstehen Lesefehler (W9, W30-Teil)
- [x] T23: Dateityp nach Endung und Inhalt, Umlaute erhalten (W13, W14)
- [x] T24: Suggestions Dateien und Exporte (H7, H8, H9) (API-Teil; der Komponententest für EvidenceSection folgt mit Paket 8, T45)
- [ ] **Checkpoint Paket 4**

## Paket 5: Vier-Augen-Prinzip und Schreibrechte

- [x] T25: Eigentümerwechsel unter `_own` nur auf sich selbst, Freigabe zurück (W15, Teil Risiko, Maßnahme, Verbesserung)
- [x] T26: Assets unter `_own`: Eigentümer, Verknüpfungsziel, Lösen (W15, Teil Asset)
- [x] T27: Kein kaskadierendes Löschen freigegebener oder fremder Datensätze (W16) (teilweise, siehe tasks/offen.md)
- [x] T28: Freigabe der BIA bei jeder Inhaltsänderung zurück (W17, Teil BIA)
- [x] T29: Getragenes Risiko bei Inhaltsänderung zurück (W17, Teil Risiko)
- [x] T30: Bestätigte Maßnahmen und Verbesserungen fest (W17, Teil Maßnahme und Verbesserung)
- [x] T31: Nachweise hinter bestätigten Datensätzen unveränderlich (W17, Teil Nachweis)
- [x] T32: Dokumentfreigabe mit Zustandsfolge (W18, Teil Dokument)
- [x] T33: Notfallplan aktiv nur auf freigegebener BIA (W18, Teil Notfallplan) (teilweise, siehe tasks/offen.md)
- [x] T34: Nichtkonformität nur mit wirksamer Korrektur schließen (W18, Teil Feststellung)
- [x] T35: Rollenzuschnitt Auditor (W20) (teilweise, siehe tasks/offen.md)
- [x] T36: Beim Anlegen unter `_own` immer selbst Eigentümer (W21)
- [x] T37: Suggestion Vier-Augen (H20)
- [ ] **Checkpoint Paket 5**

## Paket 6: Fristen

- [x] T38: Verknüpfungen nur im eigenen Mandanten (W22)
- [x] T39: Zeitpunkte begrenzt, Erfüllen einmalig, Korrekturweg (W23)
- [x] T40: „Unverzüglich“ erscheint in Liste, Monitor und Mail (W24)
- [x] T41: Erinnerungslauf ohne Doppelversand (W25)
- [x] T42: Suggestion Fristen und Testuhr (H10, W30-Teil)
- [ ] **Checkpoint Paket 6**

## Paket 7: Fachmodule

- [x] T43: Bestätigungen für andere nur mit passendem Recht, nie überschrieben (W19)
- [x] T44: Suggestions Fachmodule (H11, H12, H13, H19-Teil) (teilweise, siehe tasks/offen.md)
- [ ] **Checkpoint Paket 7**

## Paket 8: Oberfläche und Infrastruktur

- [ ] T45: Testbibliotheken für Komponententests
- [ ] T46: Gemeinsames Seitenfenster als Dialog (W29, H14)
- [ ] T47: Datensätze per Tastatur öffnen (W26)
- [x] T48: Entfernen erreichbar und mit Rückfrage (W27) (teilweise, siehe tasks/offen.md)
- [x] T49: Fehler werden sichtbar (W28, H15) (teilweise, siehe tasks/offen.md)
- [x] T50: Suggestions Oberfläche und Infrastruktur (H6, H16, H17, H18) (teilweise, siehe tasks/offen.md)
- [ ] **Checkpoint Paket 8 (Abschluss)**
