import { describe, expect, it } from 'vitest';

/**
 * W27: Entfernen-Schaltflächen, die erst beim Überfahren mit der Maus erscheinen, sind per
 * Tastatur und auf Touch-Geräten nicht erreichbar. `hidden` nimmt sie aus der Tab-Reihenfolge;
 * `opacity-0` lässt sie darin, und `focus:opacity-100` zeigt sie, sobald der Fokus dort steht.
 *
 * Ein Komponententest folgt mit den Testbibliotheken (T45); bis dahin prüft dieser Test den
 * Quelltext, damit keine neue Stelle mit `group-hover:inline` dazukommt.
 */
const sources = import.meta.glob(['../**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function hits(pattern: RegExp): string[] {
  return Object.entries(sources).flatMap(([file, text]) =>
    text
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => pattern.test(line))
      .map(({ i }) => `${file}:${i + 1}`),
  );
}

describe('Entfernen-Schaltflächen (W27)', () => {
  it('liest den Quelltext der Oberfläche', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it('versteckt keine Schaltfläche per hidden bis zum Überfahren', () => {
    expect(hits(/group-hover:(inline|block|flex)/)).toEqual([]);
  });

  it('zeigt eine erst beim Überfahren sichtbare Schaltfläche auch bei Fokus', () => {
    const reveal = hits(/group-hover:opacity-100/);
    expect(reveal.length).toBeGreaterThan(0);
    const withoutFocus = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.includes('group-hover:opacity-100') && !line.includes('focus:opacity-100'))
        .map(({ i }) => `${file}:${i + 1}`),
    );
    expect(withoutFocus).toEqual([]);
  });
});
