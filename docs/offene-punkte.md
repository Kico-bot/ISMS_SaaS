# Offene Punkte

Prüfaufträge und bekannte Lücken, die nicht im Code stehen, aber nicht vergessen werden dürfen.
Erledigte Punkte werden gestrichen, nicht gelöscht — mit Datum und wer es geprüft hat.

## Fachlich zu prüfen

### NIS2 Art. 21 Abs. 2 a)–j) ↔ § 30 Abs. 2 Nr. 1–10 BSIG — Reihenfolge abgleichen

- **Stand:** ungeprüft (angelegt 2026-10-10)
- **Worum es geht:** Jede NIS2-Zeile trägt als zweite Fundstelle den BSIG-Paragrafen (`requirement.alt_ref`).
  Für die zehn Risikomanagementmaßnahmen ist die Zuordnung rein positionell erzeugt: Buchstabe a) → Nr. 1,
  b) → Nr. 2 … j) → Nr. 10 (`NIS2_BSIG` in `packages/catalog/extract/extract.py`). Das stimmt nur, wenn
  § 30 Abs. 2 BSIG (NIS2UmsuCG, in Kraft seit 6.12.2025) die Maßnahmen in derselben Reihenfolge aufzählt wie
  Art. 21 Abs. 2 der Richtlinie.
- **Prüfen:** § 30 Abs. 2 Satz 2 BSIG im Bundesgesetzblatt neben Art. 21 Abs. 2 NIS2 legen, Nr. 1–10 einzeln
  vergleichen. Ebenso die Artikelzuordnungen Art. 20 → § 38, Art. 23 → § 32, Art. 27 → § 33 BSIG.
- **Bei Abweichung:** `NIS2_BSIG` in `extract.py` korrigieren, `python3 packages/catalog/extract/extract.py`
  ausführen, `pnpm --filter @isms/web norm-refs` neu erzeugen, `pnpm db:seed` (idempotent) — die Tests in
  `apps/api/test/ai-nis2.e2e.test.ts` prüfen Nr. 10 und § 32 und sind dann ggf. anzupassen.
- **Wer:** jemand mit Zugriff auf den amtlichen Gesetzestext; die Entwicklungsumgebung erreicht weder
  Bundesgesetzblatt noch EUR-Lex.

### AI Act: Kurztitel und Geltungsbeginn gegen den Verordnungstext

- **Stand:** ungeprüft (angelegt 2026-10-10)
- **Worum es geht:** `packages/catalog/data/eu-ai-act-2024.json` ist von Hand gepflegt, mit eigenen Kurztiteln und
  `applies_from` nach dem AI Omnibus (VO 2026/1744): Art. 4/5 ab 2.2.2025, Art. 50 ab 2.8.2026, Art. 26/27/86 ab
  2.12.2027 (Anhang-I-Produkte 2.8.2028). Ohne Volltext, weil EUR-Lex aus der Umgebung nicht erreichbar war.
- **Prüfen:** Daten und Absatznummern gegen die konsolidierte Fassung; liegt das PDF unter `docs/context/`, kann
  der Volltext der Betreiberpflichten ergänzt werden. Anbieterpflichten gehören auch dann nicht hinein.

## Technisch offen (Phase 2)

- Entra-ID-Provider (OIDC) hinter der vorhandenen Provider-Abstraktion
- Azure-Deployment: Bicep, Storage-Treiber für Azure Blob
- Rate-Limit für Login und Passwort-Zurücksetzen
- Lieferantenmodul, Betroffenenanfragen (DSAR), SIEM-Anbindung
