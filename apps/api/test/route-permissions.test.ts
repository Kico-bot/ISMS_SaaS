import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jeder Endpunkt braucht eine bewusste Entscheidung über den Zugang: ein Recht
 * (`@RequirePermission`/`@RequireAllPermissions`) oder `@Public`. Ohne beides lässt der
 * Rechte-Guard jede angemeldete Person durch. Das ist nur bei den Endpunkten unten gewollt, die
 * ausschließlich eigene Daten zeigen oder selbst je Datensatz filtern. Wer einen neuen Endpunkt
 * ohne Recht anlegt, muss ihn hier mit Begründung eintragen, sonst schlägt dieser Test fehl.
 */
const OPEN_TO_EVERY_SIGNED_IN_USER: Record<string, string> = {
  'kernel/auth/auth.controller.ts POST switch-tenant': 'prüft die Mitgliedschaft im Ziel-Mandanten',
  'kernel/auth/auth.controller.ts GET me': 'zeigt nur die eigene Sitzung',
  'modules/deadlines/deadlines.controller.ts GET ': 'filtert jede Quelle nach dem Leserecht',
  'modules/deadlines/deadlines.controller.ts GET summary': 'filtert jede Quelle nach dem Leserecht',
  'modules/programmes/programmes.controller.ts GET my-area': 'liefert nur Einträge der eigenen Person',
};

const SRC = join(__dirname, '..', 'src');

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllers(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Endpunkte ohne Recht und ohne @Public, als „Datei METHODE pfad“. */
function unguarded(): string[] {
  const found: string[] = [];
  for (const file of controllers(SRC)) {
    const src = readFileSync(file, 'utf8');
    const classGuarded =
      /@(RequirePermission|RequireAllPermissions|Public)\([^)]*\)\s*(@\w+\([^)]*\)\s*)*export class/.test(
        src,
      );
    const methods = src.matchAll(/((?:\s*@\w+\((?:[^()]|\([^()]*\))*\))+)\s*(?:async\s+)?\w+\s*\(/g);
    for (const [, decorators] of methods) {
      const route = /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/.exec(decorators!);
      if (!route) continue;
      if (classGuarded || /@(RequirePermission|RequireAllPermissions|Public)\(/.test(decorators!)) continue;
      found.push(`${relative(SRC, file)} ${route[1]!.toUpperCase()} ${route[2] ?? ''}`);
    }
  }
  return found.sort();
}

describe('Zugang zu jedem Endpunkt ist entschieden', () => {
  it('findet die Controller', () => {
    expect(controllers(SRC).length).toBeGreaterThan(10);
  });

  it('kein Endpunkt ist ohne Recht offen, außer den begründeten Ausnahmen', () => {
    expect(unguarded()).toEqual(Object.keys(OPEN_TO_EVERY_SIGNED_IN_USER).sort());
  });
});
