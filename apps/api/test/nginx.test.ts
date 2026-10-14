import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * H6: Sicherheits-Header der ausgelieferten Oberfläche. Die API setzt ihre eigenen (helmet);
 * die statischen Dateien liefert nginx, und dort fehlten sie.
 *
 * Eine Eigenheit von nginx: Ein `location` mit eigenem `add_header` erbt keinen `add_header` von
 * außen. Deshalb muss jeder solche Block die Sicherheits-Header selbst tragen, sonst verliert
 * genau die Seite sie, für die jemand nur `Cache-Control` ergänzen wollte.
 */
const conf = readFileSync(join(__dirname, '..', '..', '..', 'infra', 'docker', 'nginx.conf'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/#.*$/, ''))
  .join('\n');

/** `location`-Blöcke samt Rumpf; die Datei schachtelt keine Blöcke darin. */
const locations = [...conf.matchAll(/location\s+(\S+)\s*\{([^}]*)\}/g)].map((m) => ({
  path: m[1]!,
  body: m[2]!,
}));

function header(body: string, name: string): string | undefined {
  const m = new RegExp(`add_header\\s+${name}\\s+"([^"]*)"\\s+always;`, 'i').exec(body);
  return m?.[1];
}

const REQUIRED = ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options'];

describe('nginx.conf: Sicherheits-Header (H6)', () => {
  it('liest die Blöcke der Konfiguration', () => {
    expect(locations.map((l) => l.path)).toEqual(expect.arrayContaining(['/api/', '/assets/', '/']));
  });

  it('verrät die nginx-Version nicht', () => {
    expect(conf).toMatch(/^\s*server_tokens\s+off;/m);
  });

  it('die Oberfläche selbst trägt die Header', () => {
    const root = locations.find((l) => l.path === '/');
    expect(root?.body).toContain('add_header');
  });

  const withOwnHeaders = locations.filter((l) => l.body.includes('add_header'));

  it.each(withOwnHeaders.map((l) => [l.path, l.body] as const))(
    '%s wiederholt jeden Sicherheits-Header mit always',
    (_path, body) => {
      for (const name of REQUIRED) expect(header(body, name), name).toBeDefined();
      expect(header(body, 'X-Content-Type-Options')).toBe('nosniff');
      expect(header(body, 'X-Frame-Options')).toBe('DENY');
      expect(header(body, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    },
  );

  it.each(withOwnHeaders.map((l) => [l.path, l.body] as const))(
    '%s: die CSP verbietet Einbetten, fremde Skripte und Plugins',
    (_path, body) => {
      const csp = (header(body, 'Content-Security-Policy') ?? '').split(';').map((d) => d.trim());
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp.join(';')).not.toContain('unsafe-eval');
    },
  );

  it('alle Blöcke mit eigenem add_header tragen dieselbe CSP', () => {
    const policies = new Set(withOwnHeaders.map((l) => header(l.body, 'Content-Security-Policy')));
    expect(policies.size).toBe(1);
  });
});
