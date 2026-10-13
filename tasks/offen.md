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
