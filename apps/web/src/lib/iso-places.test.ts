import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ISO_PLACES } from './iso-places';

const catalogue = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../packages/catalog/data/iso27001-2022.json'), 'utf8'),
) as { requirements: { ref_code: string; kind: string }[] };
const refs = new Set(catalogue.requirements.map((r) => r.ref_code));

describe('ISO_PLACES', () => {
  it('nennt nur Normpunkte, die es im Katalog gibt', () => {
    expect(Object.keys(ISO_PLACES).filter((k) => !refs.has(k))).toEqual([]);
  });

  it('zeigt für jedes Unterkapitel aus 4 bis 10 ein Register, außer 4.4 (das ganze ISMS)', () => {
    const clauses = catalogue.requirements
      .map((r) => r.ref_code)
      .filter((c) => /^\d+\.\d+(\.\d+)?$/.test(c))
      .filter((c) => !catalogue.requirements.some((r) => r.ref_code.startsWith(`${c}.`)));
    expect(clauses.filter((c) => c !== '4.4' && !ISO_PLACES[c])).toEqual([]);
  });
});
