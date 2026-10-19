import { P, type Permission } from '@isms/shared';
import { describe, expect, it } from 'vitest';
import { canReadDiff } from './auditlog.service';

const has = (...p: Permission[]) => new Set<Permission>(p);

describe('canReadDiff', () => {
  it('folgt den Leserechten der Routen einer Art', () => {
    expect(canReadDiff(has(P.RISK_READ), 'risks')).toBe(true);
    expect(canReadDiff(has(P.RISK_READ), 'processing-activities')).toBe(false);
    expect(canReadDiff(has(P.PRIVACY_READ), 'processing-activities')).toBe(true);
    // Die Mitgliederliste liest auch, wer den Kontext lesen darf.
    expect(canReadDiff(has(P.CONTEXT_READ), 'members')).toBe(true);
  });

  it('zeigt bei unbekannter Art keinen Inhalt', () => {
    expect(canReadDiff(has(P.RISK_READ, P.AUDITLOG_READ), 'gibt-es-nicht')).toBe(false);
  });
});
