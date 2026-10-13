import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Liest `docker-compose.yml` als Text (kein YAML-Parser im Projekt). Geprüft wird, welche Dienste
 * die Zugangsdaten des Tabelleneigentümers bekommen: Die API braucht sie nicht, denn pg-boss
 * startet nur der Worker, und für `isms_migrator` gilt keine Zeilensicherheit.
 */
const compose = readFileSync(join(__dirname, '..', '..', '..', 'docker-compose.yml'), 'utf8');

/** Block eines Dienstes: von `  <name>:` bis zum nächsten Eintrag gleicher Einrückung. */
function service(name: string): string {
  const m = new RegExp(`^  ${name}:\\n((?:(?:    .*)?\\n)*)`, 'm').exec(compose);
  if (!m) throw new Error(`Dienst ${name} fehlt in docker-compose.yml`);
  return m[1]!;
}

/** Anker der Erweiterung, die `DATABASE_URL_MIGRATOR` setzt. */
function migratorAnchor(): string {
  const m = /^x-[\w-]+: &([\w-]+)\n(?:  .*\n)*?  DATABASE_URL_MIGRATOR:/m.exec(compose);
  if (!m) throw new Error('keine Erweiterung mit DATABASE_URL_MIGRATOR gefunden');
  return m[1]!;
}

describe('docker-compose.yml: Migrator-Zugang', () => {
  it('die API bekommt die Zugangsdaten des Tabelleneigentümers nicht', () => {
    const api = service('api');
    expect(api).not.toContain('DATABASE_URL_MIGRATOR');
    expect(api).not.toContain(`*${migratorAnchor()}`);
  });

  it.each(['migrate', 'worker'])('%s bekommt sie, weil er Schema anlegt', (name) => {
    expect(service(name)).toContain(`*${migratorAnchor()}`);
  });
});
