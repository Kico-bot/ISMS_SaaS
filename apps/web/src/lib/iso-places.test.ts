import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ISO_PLACES, isoPlaces } from './iso-places';
import { buildNav, matches, navSections } from './nav';

const catalogue = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../packages/catalog/data/iso27001-2022.json'), 'utf8'),
) as { requirements: { ref_code: string; kind: string }[] };
const refs = new Set(catalogue.requirements.map((r) => r.ref_code));

describe('ISO_PLACES', () => {
  it('nennt nur Normpunkte, die es im Katalog gibt', () => {
    for (const places of [isoPlaces(true), isoPlaces(false)]) {
      expect(Object.keys(places).filter((k) => !refs.has(k))).toEqual([]);
    }
  });

  it('zeigt für jedes Unterkapitel aus 4 bis 10 ein Register, außer 4.4 (das ganze ISMS)', () => {
    const clauses = catalogue.requirements
      .map((r) => r.ref_code)
      .filter((c) => /^\d+\.\d+(\.\d+)?$/.test(c))
      .filter((c) => !catalogue.requirements.some((r) => r.ref_code.startsWith(`${c}.`)));
    for (const places of [isoPlaces(true), isoPlaces(false), ISO_PLACES]) {
      expect(clauses.filter((c) => c !== '4.4' && !places[c])).toEqual([]);
    }
  });

  it('beide Varianten belegen dieselben Normpunkte', () => {
    expect(Object.keys(isoPlaces(true)).sort()).toEqual(Object.keys(isoPlaces(false)).sort());
  });

  it('zeigt im schlanken Modus nie auf einen ausgeblendeten Reiter', () => {
    const tabs = navSections(buildNav(true)).flatMap((s) => s.tabs);
    // Schlank haben Organisation und Team & Schulung keine Unterreiter mehr.
    const pageTabs: Record<string, readonly string[]> = { '/context': [], '/competence': [] };
    const hidden = Object.entries(isoPlaces(true)).flatMap(([ref, places]) =>
      places
        .filter((p) => {
          const [path = '', query = ''] = p.to.split('?');
          if (!tabs.some((t) => matches(t, path, query ? `?${query}` : '') >= 2)) return true;
          const tab = new URLSearchParams(query).get('tab');
          return tab !== null && !(pageTabs[path] ?? []).includes(tab);
        })
        .map((p) => `${ref} → ${p.to}`),
    );
    expect(hidden).toEqual([]);
  });

  it('schlank: Notfallplan und Kommunikation bei Richtlinien, Änderungen bei Maßnahmen, KVP bei Feststellungen', () => {
    const lean = isoPlaces(true);
    const to = (ref: string) => lean[ref]!.map((p) => p.to);
    expect(to('A.5.29')).toEqual(['/documents']);
    expect(to('A.5.30')).toEqual(['/documents']);
    expect(to('7.4')).toEqual(['/documents']);
    expect(to('6.3')).toEqual(['/measures']);
    expect(to('10.1')).toEqual(['/findings']);
  });
});

describe('docs/iso27001-abdeckung.md', () => {
  const doc = readFileSync(resolve(__dirname, '../../../../docs/iso27001-abdeckung.md'), 'utf8');
  const row = (ref: string) => doc.split('\n').find((l) => l.startsWith(`| ${ref} `)) ?? '';

  it('nennt bei jedem Normpunkt dieselben Sprungziele wie die Gap-Analyse (schlank)', () => {
    const missing = Object.entries(isoPlaces(true)).flatMap(([ref, places]) =>
      places.filter((p) => !row(ref).includes(p.label)).map((p) => `${ref}: ${p.label}`),
    );
    expect(missing).toEqual([]);
  });
});
