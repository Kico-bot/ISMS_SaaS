# Demo-Leitfaden: ISO 27001 und NIS2

Ein Ablauf für eine Vorführung von etwa 25 Minuten. Er zeigt, wie NIS2 auf ISO 27001 aufbaut und
dass eine Maßnahme nur einmal gepflegt wird, auch wenn sie Anforderungen aus mehreren
Regelwerken erfüllt. Der EU AI Act kommt am Ende dazu.

**Die Kernaussage in einem Satz:** Wer ISO 27001 umsetzt, hat den größten Teil von NIS2 schon
erledigt, und die Suite zeigt Pflicht für Pflicht, womit, und was darüber hinaus fehlt.

## Vorbereitung

1. Die Suite mit Demodaten starten, wie im [README](../README.md#demo-starten) beschrieben.
2. Vor jeder Vorführung einen **frischen Stand** herstellen, denn die Schritte 6 und 7 ändern
   Daten:

   ```bash
   docker compose down -v && docker compose up -d
   ```

3. Als ISMS-Leitung anmelden: `henrike.sallach@lindenbach.example`, Kennwort
   `demo-passwort-2026-lindenbach`.

Im Demomandanten sind **ISO 27001** (führend), **NIS2** und der **EU AI Act** aktiv. DSGVO und
IT-Grundschutz sind abgeschaltet; ihre Daten sind vorhanden und mit einem Klick zurück
(Schritt 10).

## Ablauf

### 1. Lagebild: drei Programme auf einen Blick (2 Minuten)

- **Wo:** **Start**. Links das Menü mit elf Punkten, gegliedert wie die Norm: Planen, Betreiben,
  Prüfen & verbessern.
- **Zeigen:** die drei Programmkarten. ISO 27001 zeigt den Umsetzungsgrad als Kreisdiagramm
  (erfüllt, teilweise, offen von 123 Normpunkten), NIS2 und EU AI Act ihren Stand; jede Karte
  hat eine Schrittleiste und genau eine Zeile zum aktuellen Schritt. Bei NIS2 steht in Rot
  „Vorrang: 3 Meldefristen laufen“. Darunter „Lage in Zahlen“: acht Kennzahlen wie offene
  Maßnahmen oder Controls ohne Entscheidung, jede ein Link auf die Einträge dahinter. Die
  offenen Aufgaben stehen zugeklappt darunter.
- **Sagen:** Wer nur diese Reihe liest, weiß, wo die Organisation steht und was heute zu tun ist.
  Keine Phase wird von Hand gesetzt, alles ergibt sich aus den Daten.

### 2. Eine Maßnahme, mehrere Regelwerke (2 Minuten)

- **Wo:** Planen, **Risiken & Maßnahmen**, Reiter **Maßnahmen**, dort **„Für mehrere Regelwerke“**: 13 von 16 Maßnahmen
  erfüllen Anforderungen aus mehreren Regelwerken zugleich. Dieselbe Übersicht steht unten im
  Programm NIS2.
- **Beispiel:** „Melde- und Eskalationsprozess für erhebliche Vorfälle“ erfüllt ISO 27001
  A.5.24 bis A.5.26, NIS2 Art. 21 Abs. 2 b) und Art. 23 (§ 32 BSIG) und den AI Act Art. 26 Abs. 5.
- **Sagen:** Das ist ein Prozess, einmal beschrieben, einmal gepflegt. Er zählt in drei
  Regelwerken.

### 3. Programm ISO 27001: der Weg zur Zertifizierung (2 Minuten)

- **Wo:** **Normen**, Reiter **ISO 27001**.
- **Zeigen:** sieben Schritte von Geltungsbereich bis Zertifizierungsreife, „jetzt dran“ ist die
  Gap-Analyse mit genau einer Schaltfläche. Darunter der Ring „Zertifizierungsreife“ mit den zehn
  Kernnachweisen und die Umsetzung je Kapitel.
- **Sagen:** ISO 27001 ist die Grundlage. Der Ring zählt die 123 prüfbaren Punkte der Norm, die
  Kernnachweise sind das, wonach ein Auditor zuerst fragt.
- **Optional:** auf „Gap-Analyse“ klicken. Kapitel für Kapitel, je Normpunkt drei Fragen: Gilt
  das für uns? Womit erfüllen wir es? Wie weit sind wir? Eine Antwort ändert sofort die
  Anwendbarkeitserklärung, ohne dass jemand eine zweite Liste führt.

### 4. Maßnahmen: eine Maßnahme im Detail (2 Minuten)

- **Wo:** Risiken & Maßnahmen, Reiter **Maßnahmen**, dort **„Für mehrere Regelwerke“**, dann **M-0001 „Mehrfaktor-Anmeldung
  für alle administrativen Zugänge“** öffnen.
- **Zeigen:** den Hinweis „Diese Maßnahme erfüllt 4 Anforderungen in 2 Regelwerken zugleich“
  und die Liste: ISO 27001 A.5.15, A.5.17, A.8.5 und NIS2 Art. 21 Abs. 2 j) mit der deutschen
  Fundstelle § 30 Abs. 2 Nr. 10 BSIG. Darunter, ausgegraut, die Bausteine aus dem abgeschalteten
  IT-Grundschutz: Die Zuordnung bleibt gespeichert.
- **Sagen:** Status, Verantwortliche, Nachweise: alles einmal, hier.

### 5. Programm NIS2: NIS2 auf ISO 27001 abgebildet (4 Minuten)

- **Wo:** **Normen**, Reiter **NIS2**: vier Schritte nach BSI-Gesetz (§ 33, § 30, § 32, § 38), oben der
  rote Hinweis auf die laufenden Meldefristen. Dann **„Pflicht für Pflicht“** öffnen.
- **Zeigen:** die 13 Pflichten, die ein Unternehmen nach NIS2 selbst erfüllen muss, jede mit
  BSIG-Paragraf. Oben die Zahlen: 9 erfüllt, 1 indirekt abgedeckt, 3 in Arbeit, 0 offen. In der
  Spalte ISO 27001 sind die Controls grün, an denen eine umgesetzte Maßnahme hängt.
- **Sagen:** Für jede NIS2-Pflicht sieht man, welche ISO-Controls dazugehören und welche
  Maßnahmen sie erfüllen. Gelbe Hinweise zeigen, wo NIS2 über ISO 27001 hinausgeht, etwa bei der
  persönlichen Verantwortung der Geschäftsleitung (§ 38 BSIG).
- **Optional:** Reiter „Flussdiagramm“ für das Gesamtbild.

### 6. Live: einmal pflegen, überall erfüllt (3 Minuten)

- **Wo:** Risiken & Maßnahmen, Reiter **Maßnahmen**, **M-0012 „Schwachstellen- und Patchmanagement für IT und Leittechnik“**.
  Status: In Umsetzung. Sie hängt an ISO 27001 A.8.8 und A.8.32 und an NIS2 Art. 21 Abs. 2 e).
- **Tun:** Status auf **„Umgesetzt“** setzen.
- **Zeigen:** Im Lagebild steht NIS2 jetzt bei 10 von 13, im Programm ISO 27001 steigt die
  Zertifizierungsreife, weil A.8.8 und A.8.32 als erfüllt zählen. Unter „Pflicht für Pflicht“
  steht Art. 21 Abs. 2 e) auf „erfüllt“.
- **Sagen:** Eine Änderung an einer Stelle, und beide Regelwerke sind aktuell. Niemand pflegt
  eine zweite Liste.

### 7. Live: eine fehlende Zuordnung mit einem Klick schließen (2 Minuten)

- **Wo:** Normen, Reiter **NIS2**, „Pflicht für Pflicht“, Zeile **Art. 21 Abs. 2 i)** (Zugriffskontrolle, § 30 Abs. 2 Nr. 9
  BSIG), Stand „indirekt abgedeckt“. Zeile anklicken.
- **Zeigen:** Direkt zugeordnet ist nichts. Aber das umgesetzte Berechtigungskonzept hängt an den
  passenden ISO-Controls A.5.15, A.5.18, A.6.1 und A.6.5.
- **Tun:** neben **M-0014 „Berechtigungskonzept …“** auf **„Zuordnung übernehmen“** klicken.
- **Sagen:** Keine echte Lücke, nur eine fehlende Verknüpfung. Die Suite erkennt sie über die
  hinterlegte Zuordnung von ISO 27001 zu NIS2 und schließt sie mit einem Klick.

### 8. Was ISO 27001 nicht abdeckt (1 Minute)

- **Zeigen:** Art. 27, Registrierung beim BSI (§ 33 BSIG): keine ISO-Controls, dafür die eigene
  Maßnahme M-0015, geplant. Ebenso die Hinweise zu Art. 20 und Art. 23.
- **Sagen:** Die Suite verschweigt nicht, was über ISO 27001 hinausgeht.

### 9. EU AI Act: das KI-Register (3 Minuten)

- **Wo:** **Normen**, Reiter **EU AI Act**: vier Schritte, „jetzt dran“ sind die offenen Prüfpunkte. Dann
  **KI-Register** und dort **„Vorauswahl von Bewerbungen“** öffnen.
- **Zeigen:** die Einstufung über Fragen, „Hochrisiko“ mit Begründung und Fundstelle
  (Art. 6 Abs. 2 i. V. m. Anhang III Nr. 4) und die Betreiberpflichten, die daraus folgen.
- **Verknüpfung:** M-0016 „Menschliche Aufsicht und Betriebsanleitung für Hochrisiko-KI“
  erfüllt AI Act Art. 26 Abs. 1 und 2 und ISO 27001 A.5.37. Die Sensibilisierung M-0004 deckt
  zugleich die KI-Kompetenz nach Art. 4 ab.

### 10. Weitere Regelwerke zuschalten (1 Minute)

- **Wo:** **Einstellungen**, Reiter **Regelwerke** (unten im Menü).
- **Zeigen:** DSGVO und IT-Grundschutz sind abgeschaltet, deshalb fehlen ihre Reiter unter
  **Normen**. Ein Klick schaltet sie zu: Der Reiter DSGVO bringt das Verarbeitungsverzeichnis,
  der Reiter IT-Grundschutz die Modellierung, und alle Zuordnungen sind sofort wieder da.

### 11. Optional: Sicht der Verantwortlichen

Abmelden, als `bastian.olwig@lindenbach.example` anmelden: **Start**, Reiter **Mein Bereich**, zeigt nur seine
offenen Maßnahmen, Risiken und Assets. „+ Risiko erfassen“ am Asset schlägt passende Risiken vor
und trägt ihn gleich als Risk-Owner ein.

### 12. Optional: Sicht der Auditorin

Abmelden, als `corinna.feldt@lindenbach.example` anmelden: dieselben Daten, aber nur lesend;
ändern darf sie Audits und Feststellungen.

## Die Verknüpfungen der Demo auf einen Blick

| Nr.    | Maßnahme                                   | ISO 27001                    | NIS2 (BSIG)                                  | AI Act            |
| ------ | ------------------------------------------ | ---------------------------- | -------------------------------------------- | ----------------- |
| M-0001 | Mehrfaktor-Anmeldung                       | A.5.15, A.5.17, A.8.5        | Art. 21 Abs. 2 j) (§ 30 Abs. 2 Nr. 10)       |                   |
| M-0003 | Sicherungskonzept 3-2-1                    | A.8.13                       | Art. 21 Abs. 2 c) (Nr. 3)                    |                   |
| M-0004 | Sensibilisierung, Phishing-Simulationen    | 7.3, A.6.3                   | Art. 20 (§ 38), Art. 21 Abs. 2 g) (Nr. 7)    | Art. 4            |
| M-0005 | Zentrale Protokollierung                   | A.8.15, A.8.16               | Art. 21 Abs. 2 b) (Nr. 2)                    | Art. 26 Abs. 6    |
| M-0006 | Anforderungen an Fernwartungsdienstleister | A.5.19, A.5.21               | Art. 21 Abs. 2 d) (Nr. 4)                    |                   |
| M-0007 | Notfallhandbuch Netzleitstelle             | A.5.29, A.5.30               | Art. 21 Abs. 2 c) (Nr. 3)                    |                   |
| M-0008 | Melde- und Eskalationsprozess              | A.5.24, A.5.25, A.5.26       | Art. 21 Abs. 2 b) (Nr. 2), Art. 23 (§ 32)    | Art. 26 Abs. 5    |
| M-0009 | Verschlüsselung                            | A.8.24                       | Art. 21 Abs. 2 h) (Nr. 8)                    |                   |
| M-0010 | Leitlinie und Methode der Risikoanalyse    | 5.2, 6.1.2, 6.1.3, A.5.1     | Art. 21 Abs. 2 a) (Nr. 1)                    |                   |
| M-0011 | Geschäftsleitung billigt und überwacht     | 5.1, 9.3                     | Art. 20 (§ 38)                               |                   |
| M-0012 | Schwachstellen- und Patchmanagement        | A.8.8, A.8.32                | Art. 21 Abs. 2 e) (Nr. 5)                    |                   |
| M-0013 | Wirksamkeit messen                         | 9.1, 9.2                     | Art. 21 Abs. 2 f) (Nr. 6)                    |                   |
| M-0014 | Berechtigungskonzept                       | A.5.15, A.5.18, A.6.1, A.6.5 | Art. 21 Abs. 2 i) (Nr. 9), erst in Schritt 7 |                   |
| M-0015 | Registrierung beim BSI                     |                              | Art. 27 (§ 33)                               |                   |
| M-0016 | Menschliche Aufsicht für Hochrisiko-KI     | A.5.37                       |                                              | Art. 26 Abs. 1, 2 |

Die Zuordnung von NIS2-Buchstaben zu den Nummern in § 30 Abs. 2 BSIG ist positionell und noch
nicht am Gesetzestext geprüft, siehe [offene Punkte](offene-punkte.md).

## Wenn etwas anders aussieht

- **Andere Zahlen im Lagebild oder unter „Pflicht für Pflicht“:** Es wurde schon geklickt. Frischen Stand
  herstellen (siehe Vorbereitung).
- **„Zuordnung übernehmen“ erscheint zweimal:** Die erste Schaltfläche gehört zur
  Mehrfaktor-Anmeldung, die über A.5.15 ebenfalls passt. Für die Geschichte das
  Berechtigungskonzept nehmen.
