import { describe, expect, it } from 'vitest';
import { countDescendants, removeNodeQuestion } from './org-tree';

const nodes = [
  { id: 'gf', parentId: null },
  { id: 'it', parentId: 'gf' },
  { id: 'netz', parentId: 'it' },
  { id: 'ot', parentId: 'it' },
  { id: 'hr', parentId: 'gf' },
  { id: 'extern', parentId: null },
];

describe('Organigramm: Teilbaum entfernen (W27)', () => {
  it('zählt alle Knoten darunter, nicht nur die direkten', () => {
    expect(countDescendants(nodes, 'gf')).toBe(4);
    expect(countDescendants(nodes, 'it')).toBe(2);
    expect(countDescendants(nodes, 'netz')).toBe(0);
  });

  it('läuft bei einem Kreis in den Daten nicht endlos', () => {
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(countDescendants(loop, 'a')).toBe(1);
  });

  it('fragt nur bei Unterknoten nach und nennt deren Zahl', () => {
    expect(removeNodeQuestion('Netzleitstelle', 0)).toBeNull();
    expect(removeNodeQuestion('IT', 1)).toBe('„IT“ samt 1 Knoten darunter entfernen?');
    expect(removeNodeQuestion('Geschäftsführung', 4)).toBe(
      '„Geschäftsführung“ samt 4 Knoten darunter entfernen?',
    );
  });
});
