import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { isSodWarning, unlessSodWarning } from './problems';

const problem = (status: number, type: string) =>
  new ApiError(status, 'Funktionstrennung', 'Auditor + ISMS-Manager: prüft eigene Arbeit', { type });

describe('Funktionstrennung beim Rollenwechsel (W28)', () => {
  const warning = problem(409, 'https://isms.example/problems/sod-warning');
  const violation = problem(409, 'https://isms.example/problems/sod-violation');

  it('erkennt nur die bestätigbare Warnung', () => {
    expect(isSodWarning(warning)).toBe(true);
    expect(isSodWarning(violation)).toBe(false);
    expect(isSodWarning(problem(400, 'https://isms.example/problems/sod-warning'))).toBe(false);
    expect(isSodWarning(new Error('kaputt'))).toBe(false);
    expect(isSodWarning(null)).toBe(false);
  });

  it('lässt eine Sperre als Fehler durch, damit sie mit Begründung angezeigt wird', () => {
    expect(unlessSodWarning(violation)).toBe(violation);
    expect(unlessSodWarning(warning)).toBeNull();
    expect(unlessSodWarning(null)).toBeNull();
  });
});
