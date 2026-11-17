# KI-Vorschläge (Projekt für später)

Vorschlag, **nicht umgesetzt**, nicht freigegeben. Festgehalten am 17.11.2026 als Projekt für die
Zukunft. Vor dem Start mit dem Projektinhaber abstimmen; eine neue Abhängigkeit
(`@anthropic-ai/sdk`) braucht seine Freigabe.

## Ziel

Die KI **schlägt vor, sie legt nichts fest.** Wer Assets erfasst hat, bekommt dazu Vorschläge für
Risiken und Maßnahmen; wer eine Richtlinie braucht, bekommt einen Entwurf, der zum eigenen
Unternehmen passt. Übernommen wird jeder Vorschlag einzeln von einer Person, die danach als
Urheber gilt. ISO 27001 verlangt, dass die Organisation ihre Risiken selbst beurteilt (Kap. 6.1.2)
und die Verantwortlichen der Behandlung zustimmen (Kap. 6.1.3 f). „Die KI hat es berechnet“ ist
im Audit keine Antwort.

## Zuerst ohne KI

Ein großer Teil geht mit festen Regeln, reproduzierbar, prüfbar und ohne Datenabfluss:

- Ausbau von `RISK_SUGGESTIONS` (`apps/web/src/lib/risk-suggestions.ts`) zu einer Kette
  Asset-Kategorie, Gefährdung, Annex-A-Controls. Die elementaren Gefährdungen des BSI
  (G 0.1 bis G 0.47) eignen sich als Grundlage.
- „Risiken vorschlagen“ am Asset zuerst auf diesem Katalog bauen. Die KI kommt danach dort dazu,
  wo Text und Kontext gefragt sind.

## Architektur

```
api ──► Tabelle ai_suggestion (unter RLS)
 └─► worker (pg-boss) ──► AiDriver ──► Claude, eigener Server (vLLM, Ollama) oder EU-Anbieter
```

- **Treiber wie beim Mailversand:** `AI_DRIVER` = `off` (Vorgabe, Buttons ausgeblendet),
  `anthropic` (offizielles SDK `@anthropic-ai/sdk`, MIT) oder `openai` (OpenAI-kompatible
  Schnittstelle unter `AI_BASE_URL`, gesprochen von vLLM, Ollama, llama.cpp und deutschen
  Anbietern; nur `fetch`, keine Abhängigkeit). Dazu `AI_MODEL` und der Schlüssel des Kunden.
- **Schnittstelle:** `generate({ system, input, schema, maxTokens })` liefert JSON, das mit Zod
  geprüft ist. Die feste Ausgabeform steckt im Treiber (Claude `output_config.format`, vLLM
  `json_schema`, Ollama `format`).
- **Über den Worker:** Erzeugen dauert auf eigener Hardware 30 Sekunden bis 2 Minuten. Der Klick
  legt einen pg-boss-Auftrag an, die Oberfläche zeigt „Vorschlag wird erstellt“.
- **Tabelle `ai_suggestion`:** Mandant, Art, Bezug, Inhalt, Modell, Zeitpunkt, übernommen oder
  verworfen. Erst beim Übernehmen entsteht ein Risiko, eine Maßnahme oder ein Richtlinienentwurf
  (`risk.source = 'suggestion'`).
- **Prüfung gegen den Katalog:** Jeder Normbezug wird mit `requirement` abgeglichen, ein
  unbekanntes Kürzel fällt weg. Bewertungen (Wahrscheinlichkeit, Auswirkung) werden nicht
  vorbelegt, höchstens als Hinweis mit Begründung.
- **Compose:** optionaler Dienst `llm` im Profil `ai`; ohne Profil bleibt alles wie heute.
- **Tests:** ein Platzhalter-Server mit festen Antworten, die CI braucht keine Grafikkarte.

## Wo die KI läuft

| Variante                                        | Daten bleiben                    | Passt für                              |
| ----------------------------------------------- | -------------------------------- | -------------------------------------- |
| Claude (Start)                                  | beim US-Anbieter, mit AVV        | Entwicklung, Demo, erste Kunden        |
| Claude über AWS Bedrock oder Google Cloud in EU | in der EU                        | Mittelweg ohne eigene Hardware         |
| Gemieteter Server mit Grafikkarte in DE         | beim Hoster in DE, eigener Root  | SaaS-Betrieb, ein Server für viele     |
| Grafikkarte im eigenen Haus                     | im eigenen Netz                  | Kunden mit Rechenzentrum, KRITIS       |
| Deutscher Anbieter offener Modelle              | beim Anbieter in der EU, mit AVV | Kunden ohne Grafikkarte und ohne US-KI |

Wechsel zwischen den Varianten: Konfiguration ändern und neu starten; die eigentliche Arbeit ist
der Qualitätstest mit der Testmappe (0,5 bis 2 Tage), weil kleinere Modelle deutlichere Prompts
brauchen. Darum Prompts kurz, deutsch und eindeutig halten, ohne Kniffe für ein einzelnes Modell.

## Hardware und Kosten (Stand November 2026, vor Entscheidung prüfen)

| Grafikspeicher | Modelle                                    | Gemietet (Hetzner)       | Gekauft            |
| -------------- | ------------------------------------------ | ------------------------ | ------------------ |
| 20 bis 24 GB   | 14B gut, 24B bis 30B komprimiert           | etwa 184 bis 234 €/Monat | etwa 3.000–4.000 € |
| 48 GB          | 32B in guter Qualität, mehrere Nutzer      | etwa 1.000 €/Monat       | etwa 10.000 €      |
| 96 GB          | 70B-Klasse, für ein ISMS überdimensioniert | 889 bis 1.499 €/Monat    | über 12.000 €      |

- Modelle mit gutem Deutsch und freizügiger Lizenz: Qwen3 (14B, 32B), Mistral Small, Soofi S,
  Aleph Alpha Kolibri 1. Vor dem Kauf zwei oder drei an der Testmappe vergleichen.
- Strom bei eigener Hardware: etwa 30 bis 65 € im Monat im Dauerbetrieb.
- Claude Opus 5.5: grob 10 Cent je Richtlinienentwurf, bei typischer Nutzung 10 bis 20 € im Monat.
- Ein ISMS ruft die KI selten auf. Für einen einzelnen Kunden lohnt eigene Hardware aus
  Datenschutzgründen, nicht aus Kostengründen; im SaaS-Betrieb teilt sich ein Server viele
  Mandanten.

## Einsatzorte nach Nutzen

1. Richtlinienentwurf aus Vorlage plus Kontext (Geltungsbereich, Branche, Größe, Rollen, Systeme,
   Lieferanten, vorhandene Maßnahmen, aktive Regelwerke).
2. Risiken und Maßnahmen je Asset vorschlagen, vorhandene Maßnahmen zuerst.
3. Vorhandene Dokumente einlesen und Normpunkten zuordnen (Gap-Analyse beim Einstieg).
4. Nachweise prüfen: deckt die Datei die Maßnahme ab, fehlt ein Gültigkeitsdatum.
5. Vorfälle einordnen und Meldetexte für 24 h und 72 h entwerfen (Fristen bleiben fest berechnet).
6. Begründungen für ausgeschlossene Annex-A-Controls formulieren.
7. Fließtext der Managementbewertung aus den berechneten Eingaben a) bis g).
8. Assetliste aus Excel importieren und Spalten zuordnen.
9. Interviewfragen für das interne Audit, Auswertung von Lieferantenfragebögen, Schulungsquiz.

Vorher müssen feststehen: Geltungsbereich, Organisation (Branche, Größe, NIS2-Einstufung,
Standorte), Geschäftsprozesse mit Kritikalität, Assets mit Schutzbedarf, Lieferanten und
Cloud-Dienste, vorhandene Maßnahmen, interessierte Parteien, frühere Vorfälle.

## Risiken und Gegenmittel

- **Erfundene Inhalte:** Ausgabe nur als Auswahl aus dem Katalog, Prüfung gegen `requirement`.
- **Blindes Übernehmen:** einzeln übernehmen, keine Bewertung vorbelegen, Zustimmung der
  Verantwortlichen bleibt Pflicht.
- **Datenschutz:** standardmäßig aus; nur Kategorien und Schutzbedarf senden, keine Namen und
  Adressen; kein Training auf Kundendaten, Protokollierung der Eingaben aus.
- **KI-Dienst im eigenen Betrieb:** nur im internen Compose-Netz (vLLM und Ollama haben keine
  Anmeldung), Modell aus offizieller Quelle mit Prüfsumme.
- **Untergeschobene Anweisungen in Dokumenten:** die KI erzeugt nur Vorschläge, nie Aktionen.
- **DIN-Urheberrecht:** im Prompt nur Kürzel und Kurztitel, Normtext wird nie gespeichert.
- **EU AI Act:** die Suite wird selbst ein KI-System, Kunden sind Betreiber (Art. 4); Kennzeichnung
  erzeugter Texte nach Art. 50 prüfen. Die Suite trägt sich ins eigene KI-Register ein.

## Stufen und Aufwand

1. Katalog Asset-Kategorie, Gefährdung, Controls und „Risiken vorschlagen“ ohne KI.
2. Treiber (`off`, `anthropic`, `openai`), Worker-Auftrag, `ai_suggestion`, Katalogprüfung,
   Platzhalter-Server: 2 bis 3 Tage. KI-Vorschläge am Asset: 2 Tage. Richtlinienentwurf:
   1 bis 2 Tage. Compose-Profil, INSTALLATION.md, Eintrag im KI-Register: 1 Tag.
   Testmappe mit 15 bis 20 Aufgaben aus dem Demomandanten zusammen mit der ersten Funktion.
3. Dokumente einlesen und Nachweise prüfen.
