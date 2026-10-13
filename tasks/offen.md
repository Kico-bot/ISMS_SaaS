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
