# @isms/catalog — Framework-Kataloge

Globale, mandantenunabhängige Kataloge, die per `pnpm db:seed` idempotent in die Tabellen
`framework`, `requirement` und `requirement_crosswalk` eingespielt werden.

| Datei | Quelle (`docs/context/`) | Inhalt | Volltext |
|---|---|---|---|
| `iso27001-2022.json` | DIN EN ISO/IEC 27001:2024-01 | Kap. 4–10 (Klauseln) + Anhang A (93 Controls, 4 Domänen) | **nein** — nur Referenz + Kurztitel (DIN-Urheberrecht) |
| `bsi-kompendium-2023.json` | IT-Grundschutz-Kompendium Ed. 2023 | 10 Schichten, 111 Bausteine, ~1 800 Anforderungen mit Level B/S/H | Titel |
| `bsi-standards-200.json` | BSI-Standards 200-1…4 | Kapitelreferenzen, die die Zuordnungstabelle nennt | Titel |
| `nis2-2022.json` | Richtlinie (EU) 2022/2555 | 46 Artikel; Art. 20–23 mit Volltext; Art. 21 Abs. 2 a–j als Einzelanforderungen | teilweise |
| `dsgvo-2016.json` | VO (EU) 2016/679 | 99 Artikel; Art. 5–39 mit Volltext | teilweise |
| `crosswalk-iso-bsi-ed6.json` | BSI-Zuordnungstabelle 6. Edition | ISO-Klausel/Control → BSI-Baustein/-Anforderung/-Standard-Kapitel (~700 Zuordnungen) | — |
| `crosswalk-curated.json` | manuell gepflegt | ISO ↔ NIS2 Art. 20–23 / 21 (2) a–j ↔ DSGVO Art. 5, 25, 28, 30, 32–35, 37, 39, 44 | — |

## Neu extrahieren

```bash
pip install pypdf            # einmalig
pnpm --filter @isms/catalog extract
```

Das Skript `extract/extract.py` prüft Plausibilitäten (z. B. genau 93 Annex-A-Controls, 10 Buchstaben in
NIS2 Art. 21 Abs. 2) und bricht bei Abweichungen ab. Die JSON-Dateien sind eingecheckt, damit Seeds
reproduzierbar und im Review sichtbar sind.

## Relationen im Crosswalk

- `partial` — Ziel ist eine einzelne BSI-Anforderung (`ORP.4.A8`): deckt einen Teil des ISO-Controls ab.
- `supports` — Ziel ist ein Baustein, ein Standard-Kapitel oder ein Gesetzesartikel: thematisch zugeordnet.
- `equivalent` — reserviert für 1:1-Zuordnungen (derzeit nur bei Versionsmigrationen genutzt).

Der Crosswalk ist gerichtet gespeichert und wird über die DB-View `v_crosswalk` in beide Richtungen abgefragt.
