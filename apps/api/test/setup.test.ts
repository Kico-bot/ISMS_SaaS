import { describe, expect, it } from 'vitest';
import { APP_URL, MIGRATOR_URL, assertAppRole } from './setup';

/**
 * `APP_URL` entsteht per Textersetzung aus `DATABASE_URL_TEST`. Stehen dort andere Zugangsdaten,
 * bleibt die Ersetzung wirkungslos, und alle API-Tests liefen still als Tabelleneigentümer, also
 * ohne Zeilensicherheit. Die Prüfung beim Start verhindert das.
 */
describe('Testumgebung', () => {
  it('lehnt eine App-Verbindung ab, die nicht als isms_app läuft', async () => {
    await expect(assertAppRole(MIGRATOR_URL)).rejects.toThrow(/isms_app/);
  });

  it('nimmt die richtige App-Verbindung an', async () => {
    await expect(assertAppRole(APP_URL)).resolves.toBeUndefined();
  });
});
