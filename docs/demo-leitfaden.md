# Demo-Leitfaden: ISO 27001 und NIS2

Ein Ablauf für eine Vorführung von etwa 10 Minuten. Er zeigt, wie NIS2 auf ISO 27001 aufbaut und
dass eine Maßnahme nur einmal gepflegt wird, auch wenn sie Anforderungen aus mehreren
Regelwerken erfüllt. Der EU AI Act kommt am Ende kurz dazu. Alle Schritte nutzen nur Seiten, die
die schlanke Oberfläche (Standard) zeigt.

**Die Kernaussage in einem Satz:** Wer ISO 27001 umsetzt, hat den größten Teil von NIS2 schon
erledigt, und die Suite zeigt Pflicht für Pflicht, womit, und was darüber hinaus fehlt.

## Vorbereitung

1. Die Suite mit Demodaten starten, wie im [README](../README.md#demo-starten) beschrieben.
2. Vor jeder Vorführung einen **frischen Stand** herstellen, denn die Schritte 3 und 4 ändern
   Daten:

   ```bash
   docker compose down -v && docker compose up -d
   ```

3. Als ISMS-Leitung anmelden: `henrike.sallach@lindenbach.example`, Kennwort
   `demo-passwort-2026-lindenbach`.

Im Demomandanten sind **ISO 27001** (führend), **NIS2** und der **EU AI Act** aktiv. DSGVO und
IT-Grundschutz sind mit allen Daten angelegt, die schlanke Oberfläche zeigt sie aber nicht
(siehe „Mehr zeigen“ am Ende).

## Einstieg (30 Sekunden)

Auf das Menü zeigen und sagen: **„Start, Normen, Planen, Betreiben, Prüfen.“** Das ist der
Kreislauf der ISO 27001. Planen, Betreiben und Prüfen tragen ihre Register als Reiter über der
Seite; die Einstellungen liegen hinter dem Zahnrad unten neben dem eigenen Namen.

## Ablauf

### 1. Start: das Lagebild (2 Minuten)

- **Zeigen:** die drei Programmkarten. ISO 27001 zeigt den Umsetzungsgrad als Kreisdiagramm
  (erfüllt, teilweise, offen von 123 Normpunkten), NIS2 und EU AI Act ihren Stand; jede Karte
  hat eine Schrittleiste (grün erledigt, gelb als Nächstes, grau offen) und genau eine Zeile zum
  aktuellen Schritt. Bei NIS2 steht in Rot „Vorrang: 3 Meldefristen laufen“. Darunter „Lage in
  Zahlen“: acht Kennzahlen, jede ein Link auf die Einträge dahinter.
- **Sagen:** Wer nur diese Seite liest, weiß, wo die Organisation steht und was heute zu tun ist.
  Keine Phase wird von Hand gesetzt, alles ergibt sich aus den Daten.

### 2. Normen, ISO 27001: der Weg zur Zertifizierung (2 Minuten)

- **Zeigen:** sieben Schritte von Geltungsbereich bis Zertifizierungsreife. Erledigt sind Kontext,
  Gap-Analyse (alle 123 Normpunkte entschieden) und Risiken; „als Nächstes“ steht die Umsetzung.
  Das erste interne Audit läuft, gilt aber erst mit dem Bericht als erledigt. Darunter der Ring
  „Zertifizierungsreife“ mit den zehn Kernnachweisen.
- **Kurz klicken:** „Gap-Analyse“, Kapitel **A.7**: je Normpunkt drei Fragen. Bei Kapitel 7.4 führt
  ein Link direkt zu **Planen, Organisation, Kommunikation & Änderungen**: Jeder Normpunkt mit
  eigenem Register sagt, wo der Nachweis entsteht.

### 3. Planen, Maßnahmen: einmal pflegen, überall erfüllt (2 Minuten)

- **Zeigen:** Filter **„Für mehrere Regelwerke“**, dann **M-0001 „Mehrfaktor-Anmeldung für alle
  administrativen Zugänge“**: erfüllt ISO 27001 A.5.15, A.5.17, A.8.5 und NIS2 Art. 21 Abs. 2 j)
  (§ 30 Abs. 2 Nr. 10 BSIG) zugleich.
- **Tun:** **M-0012 „Schwachstellen- und Patchmanagement für IT und Leittechnik“** auf
  **„Umgesetzt“** setzen.
- **Sagen:** Eine Änderung an einer Stelle: Im Lagebild steht NIS2 jetzt bei 10 von 13, die
  Zertifizierungsreife der ISO 27001 steigt. Niemand pflegt eine zweite Liste.

### 4. Normen, NIS2: Pflicht für Pflicht (3 Minuten)

- **Zeigen:** vier Schritte nach BSI-Gesetz (§ 33, § 30, § 32, § 38), dann **„Pflicht für Pflicht“**:
  die 13 Pflichten des Unternehmens mit BSIG-Paragraf und den ISO-Controls dahinter.
- **Tun:** Zeile **Art. 21 Abs. 2 i)** (Zugriffskontrolle), Stand „indirekt abgedeckt“, öffnen und
  neben **M-0014 „Berechtigungskonzept …“** auf **„Zuordnung übernehmen“** klicken.
- **Sagen:** Keine echte Lücke, nur eine fehlende Verknüpfung, mit einem Klick geschlossen. Und
  was ISO 27001 nicht abdeckt, steht offen da: Art. 27, die Registrierung beim BSI (§ 33 BSIG),
  hat keine ISO-Controls, sondern die eigene Maßnahme M-0015.

### 5. Normen, EU AI Act: das KI-Register (1 Minute)

- **Zeigen:** **KI-Register**, **„Vorauswahl von Bewerbungen“**: Einstufung über Fragen,
  „Hochrisiko“ mit Fundstelle (Art. 6 Abs. 2 i. V. m. Anhang III Nr. 4) und die
  Betreiberpflichten daraus.

### 6. Prüfen: Audits und Managementbewertung (30 Sekunden)

- **Zeigen:** **Prüfen, Audits**: das laufende interne Audit über die umgesetzten Bereiche;
  **Managementbewertung**: die Eingaben a) bis g) kommen aus den Daten, niemand tippt sie ab.

### Optional: Sicht der Auditorin

Abmelden, als `corinna.feldt@lindenbach.example` anmelden: dieselben Daten, aber nur lesend;
ändern darf sie Audits und Feststellungen. Das Menü zeigt nur, wofür die Rolle ein Leserecht hat.

### Mehr zeigen

Die schlanke Oberfläche blendet Register aus, löscht aber nichts. Wer DSGVO, IT-Grundschutz,
Kennzahlen, Organigramm, Qualifikationsmatrix oder die BIA vorführen will, baut mit
`ISMS_FULL_UI=true` (Compose) oder `VITE_FULL_UI=true` (Entwicklung) die vollständige Oberfläche.

## Die Verknüpfungen der Demo auf einen Blick

| Nr.    | Maßnahme                                   | ISO 27001                                     | NIS2 (BSIG)                                  | AI Act            |
| ------ | ------------------------------------------ | --------------------------------------------- | -------------------------------------------- | ----------------- |
| M-0001 | Mehrfaktor-Anmeldung                       | A.5.15, A.5.17, A.8.5                         | Art. 21 Abs. 2 j) (§ 30 Abs. 2 Nr. 10)       |                   |
| M-0003 | Sicherungskonzept 3-2-1                    | A.8.13                                        | Art. 21 Abs. 2 c) (Nr. 3)                    |                   |
| M-0004 | Sensibilisierung, Phishing-Simulationen    | 7.3, A.6.3                                    | Art. 20 (§ 38), Art. 21 Abs. 2 g) (Nr. 7)    | Art. 4            |
| M-0005 | Zentrale Protokollierung                   | A.8.15, A.8.16                                | Art. 21 Abs. 2 b) (Nr. 2)                    | Art. 26 Abs. 6    |
| M-0006 | Anforderungen an Fernwartungsdienstleister | A.5.19 bis A.5.23                             | Art. 21 Abs. 2 d) (Nr. 4)                    |                   |
| M-0007 | Notfallhandbuch Netzleitstelle             | A.5.29, A.5.30                                | Art. 21 Abs. 2 c) (Nr. 3)                    |                   |
| M-0008 | Melde- und Eskalationsprozess              | A.5.24 bis A.5.28, A.6.8                      | Art. 21 Abs. 2 b) (Nr. 2), Art. 23 (§ 32)    | Art. 26 Abs. 5    |
| M-0009 | Verschlüsselung                            | A.8.24                                        | Art. 21 Abs. 2 h) (Nr. 8)                    |                   |
| M-0010 | Leitlinie und Methode der Risikoanalyse    | 5.2, 6.1, 8.2, 8.3, A.5.1                     | Art. 21 Abs. 2 a) (Nr. 1)                    |                   |
| M-0011 | Geschäftsleitung billigt und überwacht     | 5.1, A.5.4                                    | Art. 20 (§ 38)                               |                   |
| M-0012 | Schwachstellen- und Patchmanagement        | A.8.8, A.8.32                                 | Art. 21 Abs. 2 e) (Nr. 5)                    |                   |
| M-0013 | Wirksamkeit messen                         | 9.1, 9.2, A.5.35, A.5.36                      | Art. 21 Abs. 2 f) (Nr. 6)                    |                   |
| M-0014 | Berechtigungskonzept                       | A.5.15 bis A.5.18, A.6.1, A.6.5, A.8.2, A.8.3 | Art. 21 Abs. 2 i) (Nr. 9), erst in Schritt 7 |                   |
| M-0015 | Registrierung beim BSI                     |                                               | Art. 27 (§ 33)                               |                   |
| M-0016 | Menschliche Aufsicht für Hochrisiko-KI     | A.5.37                                        |                                              | Art. 26 Abs. 1, 2 |

Dazu kommen M-0017 bis M-0031: Maßnahmen nach Themen, die die übrigen Normpunkte der ISO 27001
abdecken, etwa „ISMS-Rahmen“ (Kap. 4, 6.2), „Jährliche Managementbewertung“ (9.3, in Arbeit),
„Physische Sicherheit von Netzleitstelle und Serverraum“ (A.7, in Arbeit) oder „Sichere
Beschaffung und Abnahme von Software“ (A.8.25 ff., geplant). Ausgeschlossen sind nur A.7.9,
A.8.4 und A.8.28, jeweils mit Begründung.

Die Zuordnung von NIS2-Buchstaben zu den Nummern in § 30 Abs. 2 BSIG ist positionell und noch
nicht am Gesetzestext geprüft, siehe [offene Punkte](offene-punkte.md).

## Wenn etwas anders aussieht

- **Andere Zahlen im Lagebild oder unter „Pflicht für Pflicht“:** Es wurde schon geklickt. Frischen Stand
  herstellen (siehe Vorbereitung).
- **„Zuordnung übernehmen“ erscheint zweimal:** Die erste Schaltfläche gehört zur
  Mehrfaktor-Anmeldung, die über A.5.15 ebenfalls passt. Für die Geschichte das
  Berechtigungskonzept nehmen.
