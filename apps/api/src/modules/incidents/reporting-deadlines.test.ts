import { describe, expect, it } from 'vitest';
import { addMonths } from './reporting-deadlines';

/**
 * „Einen Monat nach“ meint den Kalender in Deutschland. In UTC gerechnet landet eine Meldung
 * zwischen 23 und 24 Uhr UTC am Monatsende einen Tag zu spät.
 */
describe('addMonths in deutscher Zeit', () => {
  it('rechnet vom 31.01. kurz nach Mitternacht auf den 28.02.', () => {
    // 2027-01-30T23:30Z ist der 31.01. um 00:30 Uhr deutscher Zeit.
    expect(addMonths(new Date('2027-01-30T23:30:00.000Z'), 1).toISOString()).toBe('2027-02-27T23:30:00.000Z');
  });

  it('behält die Uhrzeit über die Umstellung auf Sommerzeit', () => {
    // 15.03. 11:00 Uhr MEZ → 15.04. 11:00 Uhr MESZ
    expect(addMonths(new Date('2026-03-15T10:00:00.000Z'), 1).toISOString()).toBe('2026-04-15T09:00:00.000Z');
  });

  it('kennt Schaltjahre', () => {
    expect(addMonths(new Date('2028-01-31T11:00:00.000Z'), 1).toISOString()).toBe('2028-02-29T11:00:00.000Z');
  });

  it('rechnet über den Jahreswechsel', () => {
    expect(addMonths(new Date('2026-12-31T08:00:00.000Z'), 1).toISOString()).toBe('2027-01-31T08:00:00.000Z');
  });
});
