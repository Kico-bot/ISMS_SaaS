# Offene Punkte aus der Umsetzung

## T2 (K1): Compose ohne Ersatzwerte für Geheimnisse

**Grund:** Der Plan markiert T2 mit „Erst fragen“. Die Aufgabe ändert das Standardverhalten von
`docker compose up` (Spec, Grenzen: Änderungen am Standardverhalten von Compose).

**Zu entscheiden:** Soll `docker-compose.yml` `JWT_SECRET` und `APP_MASTER_KEY` nur noch als
`${ISMS_JWT_SECRET:?…}` und `${ISMS_APP_MASTER_KEY:?…}` annehmen, sodass `docker compose config`
ohne die beiden Variablen abbricht?

**Zu wissen:** Seit T1 startet die API unter `NODE_ENV=production` nicht mehr mit einem der
Schlüssel aus dem Repository. Ohne `ISMS_JWT_SECRET` und `ISMS_APP_MASTER_KEY` laufen `postgres`,
`migrate` (läuft mit `NODE_ENV=development`) und `web` an, `api` und `worker` brechen beim Start mit
„Ungültige Umgebungskonfiguration: JWT_SECRET: Der Wert steht im Repository …“ ab. T2 würde
denselben Fehler früher und klarer melden. `docs/deployment.md` (Tabelle: „Standard:
Platzhalter“, Schritt 2 „für mehr als eine Vorführung Pflicht“) beschreibt noch den alten Stand und
muss mit T2 angepasst werden.

**Vorbereiteter roter Test** (`apps/api/test/compose.test.ts`):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(join(__dirname, '..', '..', '..', 'docker-compose.yml'), 'utf8');

describe('docker-compose.yml: Geheimnisse', () => {
  it.each(['JWT_SECRET', 'APP_MASTER_KEY'])('verlangt ISMS_%s ohne Ersatzwert', (name) => {
    expect(compose).toMatch(new RegExp(`${name}: \\$\\{ISMS_${name}:\\?[^}]+\\}`));
    expect(compose).not.toMatch(new RegExp(`\\$\\{ISMS_${name}:-`));
  });
});
```

## T5 (K4): Freigaben nicht als Status setzbar, Rest

Erledigt (Commit „fix(approvals) … (T5, K4)“): DTOs lehnen `verified` (Maßnahme, KVP-Maßnahme),
`accepted` (Risiko) und `approved` (Änderungsplanung) beim Anlegen und Ändern mit 400 ab, die
Services prüfen dasselbe noch einmal, und Migration `0019_approval_actor.sql` legt einen Trigger
an, der den Freigabestatus ohne handelnde Person ablehnt. Der Demo-Seed bestätigt M-0009 über
`measures.verify` durch die ISMS-Leitung; die Oberfläche hat dafür eine Schaltfläche
„Wirksamkeit bestätigen“ an der Maßnahme, die Statusauswahl bietet „Verifiziert“ nicht mehr an.

Offen, weil eine Entscheidung nötig ist:

1. **Bereinigung vorhandener Zeilen (offene Frage 1 der Spec):** Zeilen, die heute schon
   `verified`, `accepted` oder `approved` ohne handelnde Person tragen, sind unverändert. Der Trigger
   prüft nur neue Zeilen und Wechsel in den Freigabestatus, deshalb bleiben solche Zeilen
   bearbeitbar. Zu entscheiden: auf den Vorstatus zurücksetzen (`implemented`, `assessed`,
   `planned`, im Protokoll vermerkt) oder nur markieren. Danach kann der Trigger durch einen
   CHECK ergänzt werden, zum Beispiel
   `CHECK (status <> 'verified' OR verified_by_user_id IS NOT NULL)` mit `VALIDATE CONSTRAINT`
   nach der Bereinigung. Abfrage zum Zählen:

   ```sql
   SELECT 'measure' AS t, count(*) FROM measure WHERE status = 'verified' AND verified_by_user_id IS NULL
   UNION ALL SELECT 'action', count(*) FROM "action" WHERE status = 'verified' AND verified_by_user_id IS NULL
   UNION ALL SELECT 'risk', count(*) FROM risk WHERE status = 'accepted' AND accepted_by_user_id IS NULL
   UNION ALL SELECT 'change_plan_entry', count(*) FROM change_plan_entry
     WHERE status = 'approved' AND approved_by_user_id IS NULL;
   ```

2. **`status` ganz aus dem Risiko-DTO nehmen (Plan T5, Spec K4 „Bei Risiken setzt nur der
   Service den Status“):** Nicht umgesetzt, weil es heute erlaubtes Verhalten wegnimmt. Es gibt
   keinen eigenen Weg, ein Risiko auf `monitored` oder `closed` zu setzen, und `treated` setzt der
   Service nur beim ersten Verknüpfen einer Maßnahme ohne Behandlungsart. Der Demo-Seed legt
   „Unbefugter Zugriff auf Kundenstammdaten“ mit `status: 'treated'` an; ohne Statusfeld stünde
   das Risiko danach auf `assessed`, die Demodaten änderten sich. Zu entscheiden: ob und über
   welche Endpunkte (etwa „schließen“, „überwachen“) der Service diese Status setzt, bevor das
   Feld entfällt.

## T6 (K5): Rechtekatalog für den Auditabschluss

Erledigt ohne Änderung am Rechtekatalog: `reported` und `closed` setzt nur, wer als
`leadAuditorUserId` eingetragen ist und die Rolle mit dem Schlüssel `auditor` trägt (403 sonst),
beide Schritte verlangen einen Bericht, und die Leitung muss Mitglied des Mandanten sein (404).
Die Oberfläche bietet „Leitung des Audits“ zur Auswahl an und zeigt „Bericht abgeben“ und „Audit
abschließen“ nur der leitenden Auditorin.

Offen, weil eine Entscheidung nötig ist:

1. **Offene Frage 2 der Spec:** `audit.write` aufteilen (Auditprogramm planen, Abschluss,
   Managementbewertung)? Heute hängt die Prüfung am Rollenschlüssel `auditor`. Eine
   mandanteneigene Rolle mit anderem Schlüssel kann deshalb nie abschließen, auch wenn sie
   fachlich eine Auditorenrolle ist. Mit einem eigenen Recht (etwa `audit.conclude`) entfiele
   der Rollenschlüssel in `audits.service.ts` (`isAuditor`).
2. **Vorhandene Audits:** Audits, die die ISMS-Leitung vor dieser Änderung selbst auf `reported`
   oder `closed` gesetzt hat, zählen weiter auf die Abdeckung (`v_audit_coverage`). Ob sie
   zurückgesetzt oder markiert werden, ist dieselbe Art Entscheidung wie die Bereinigung bei T5.

## T14 (W5): Mandanteneigene Kopien von Systemrollen

Erledigt (Migration `0023_global_rows_read_only.sql`): Auf `role` und `sod_rule` lesen Mandanten
globale und eigene Zeilen, schreiben aber nur eigene. `DELETE FROM sod_rule WHERE tenant_id IS NULL`
und `UPDATE role SET tenant_id = … WHERE tenant_id IS NULL` erreichen als `isms_app` keine Zeile mehr.

Offen, weil eine Entscheidung nötig ist: Der Plan verlangt zusätzlich, dass
`members.service.resolveRoles` mandanteneigene Kopien eines Systemschlüssels ablehnt. Das geht über
das Zielverhalten W5 der Spec hinaus und nimmt eine heute vorgesehene Möglichkeit weg: Der Code sagt
ausdrücklich „mandantenspezifische Kopie gewinnt gegenüber der Systemrolle“, `countActiveLeads` zählt
Kopien mit, und der Test „lehnt eine Änderung ab, nach der keine aktive ISMS-Leitung bleibt“
(`apps/api/test/auth.e2e.test.ts`) arbeitet mit einer mandanteneigenen Rolle `dpo`. Einen API-Weg,
Kopien anzulegen, gibt es heute nicht; sie entstehen nur per SQL, und `isms_app` darf weiterhin eigene
Rollen mit beliebigem Schlüssel anlegen.

Zu entscheiden (Vorschlag aus `docs/review/02`, I3), eins von beiden:

1. Kopien eines Systemschlüssels ablehnen (`resolveRoles` wirft, etwa 409), dann auch
   `countActiveLeads` und die Prüfung `isAuditor` in `audits.service.ts` nur auf Systemrollen
   stützen; oder ein Unique-Index bzw. CHECK, der Mandantenrollen mit Systemschlüssel verbietet.
2. Kopien behalten, aber die Funktionstrennung (`SodService.check`) über den Rollenschlüssel statt
   über die Rollen-ID prüfen, damit eine eigene `auditor`-Zeile die globale Sperre Auditor plus
   ISMS-Leitung nicht umgeht.
