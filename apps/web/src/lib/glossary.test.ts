import { describe, expect, it } from 'vitest';
import { findAbbreviations } from './glossary';

describe('findAbbreviations', () => {
  it('findet Abkürzungen im Text, jede einmal', () => {
    const found = findAbbreviations('MTPD / RTO / RPO, dazu noch einmal RTO').map((a) => a.abbr);
    expect(found).toEqual(['MTPD', 'RTO', 'RPO']);
  });

  it('erkennt das längere Kürzel zuerst', () => {
    expect(findAbbreviations('§ 30 BSIG').map((a) => a.abbr)).toEqual(['BSIG']);
  });

  it('übersieht Buchstabenfolgen innerhalb von Wörtern', () => {
    expect(findAbbreviations('Mitarbeitende im Betrieb')).toEqual([]);
  });

  it('erkennt Kürzel vor Bindestrich und Ziffern', () => {
    const found = findAbbreviations('IT-Grundschutz und ORP.4 und NIS2').map((a) => a.abbr);
    expect(found).toEqual(['IT', 'ORP', 'NIS2']);
  });
});
