import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const root = join(__dirname, '..', '..', '..', '..');

/** Ersatzwert aus `docker-compose.yml` bzw. Wert aus `.env.example` für eine Variable. */
function composeFallback(name: string): string | undefined {
  const text = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
  return new RegExp(`\\$\\{ISMS_${name}:-([^}]+)\\}`).exec(text)?.[1];
}
function exampleValue(name: string): string {
  const text = readFileSync(join(root, '.env.example'), 'utf8');
  return new RegExp(`^${name}=(.*)$`, 'm').exec(text)![1]!;
}

const base = {
  DATABASE_URL: 'postgres://x@localhost/x',
  JWT_SECRET: 'ein-eigener-schluessel-der-lang-genug-ist-123456',
  APP_MASTER_KEY: 'ein-eigener-master-key-123456789',
};

describe('loadEnv: Schlüssel aus dem Repository', () => {
  it('startet in Produktion mit eigenen Schlüsseln', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).not.toThrow();
  });

  it('verweigert in Produktion den JWT-Schlüssel aus docker-compose.yml', () => {
    // Fällt der Ersatzwert in Compose weg (T2), bleibt der bisherige Wert gesperrt.
    const key = composeFallback('JWT_SECRET') ?? 'docker-compose-entwicklungsschluessel-bitte-ersetzen';
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: key })).toThrow(/JWT_SECRET/);
  });

  it('verweigert in Produktion den Hauptschlüssel aus docker-compose.yml', () => {
    const key = composeFallback('APP_MASTER_KEY') ?? 'ZG9ja2VyLWNvbXBvc2UtbWFzdGVyLWtleS0zMmJ5dGVz';
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', APP_MASTER_KEY: key })).toThrow(/APP_MASTER_KEY/);
  });

  it('verweigert in Produktion die Schlüssel aus .env.example', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: exampleValue('JWT_SECRET') }),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', APP_MASTER_KEY: exampleValue('APP_MASTER_KEY') }),
    ).toThrow(/APP_MASTER_KEY/);
  });

  it('lässt die Schlüssel aus dem Repository in der Entwicklung zu', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'development', JWT_SECRET: exampleValue('JWT_SECRET') }),
    ).not.toThrow();
  });
});
