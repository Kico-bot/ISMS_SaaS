import { describe, expect, it } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('setzt eine Zelle mit Komma in Anführungszeichen', () => {
    // Englische Tabellenkalkulationen trennen beim Öffnen am Komma; „=1+1“ stünde dann am
    // Anfang einer eigenen Zelle und würde ausgeführt.
    expect(csvCell('Backup,=1+1')).toBe('"Backup,=1+1"');
  });

  it('lässt negative Zahlen als Zahl stehen', () => {
    expect(csvCell(-3)).toBe('-3');
  });

  it('entschärft weiterhin Text, der wie eine Formel beginnt', () => {
    expect(csvCell('=SUMME(A1)')).toBe("'=SUMME(A1)");
    expect(csvCell('-3')).toBe("'-3");
  });
});
