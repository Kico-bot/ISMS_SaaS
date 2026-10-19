import { describe, expect, it } from 'vitest';
import * as web from '../../../apps/web/src/lib/ai';
import { aiClassificationBasis, type AiClassificationInput, aiRiskClass, aiTriggers } from './ai';
import { AI_ANNEX_III_AREAS, AI_PROHIBITED_PRACTICES, REQUIREMENT_SCOPES } from './enums';

const none: Required<AiClassificationInput> = {
  prohibitedPractices: [],
  annexIiiArea: null,
  annexIProduct: false,
  art6Exception: false,
  emotionOrBiometric: false,
  deepfakeOrPublicText: false,
  publicService: false,
  creditOrInsurance: false,
};
const cites = (s: Partial<AiClassificationInput>) =>
  aiClassificationBasis({ ...none, ...s }).map((b) => b.cite);

describe('KI-Einstufung: Begründung mit Fundstelle', () => {
  it('nennt für ein unauffälliges System Art. 4 und Art. 5 als einzige Pflichten', () => {
    expect(cites({})).toEqual(['Art. 4, Art. 5']);
  });

  it('nennt jede verbotene Praxis mit ihrem Buchstaben in Art. 5 Abs. 1', () => {
    expect(cites({ prohibitedPractices: ['social_scoring', 'realtime_remote_biometric_id'] })).toEqual([
      'Art. 5 Abs. 1 Buchst. c',
      'Art. 5 Abs. 1 Buchst. h',
    ]);
  });

  it('begründet Hochrisiko mit Art. 6 und der Nummer aus Anhang III', () => {
    expect(cites({ annexIiiArea: 'employment' })).toEqual(['Art. 6 Abs. 2 i. V. m. Anhang III Nr. 4']);
    expect(cites({ annexIProduct: true })).toEqual(['Art. 6 Abs. 1 i. V. m. Anhang I']);
  });

  it('nennt die Ausnahme nach Art. 6 Abs. 3 statt Hochrisiko', () => {
    expect(cites({ annexIiiArea: 'employment', art6Exception: true })).toEqual([
      'Art. 6 Abs. 3',
      'Art. 4, Art. 5',
    ]);
  });

  it('nennt Art. 50 auch neben Hochrisiko, weil die Transparenzpflicht zusätzlich gilt', () => {
    expect(cites({ annexIiiArea: 'biometrics', emotionOrBiometric: true })).toEqual([
      'Art. 6 Abs. 2 i. V. m. Anhang III Nr. 1',
      'Art. 50 Abs. 3',
    ]);
    expect(cites({ deepfakeOrPublicText: true })).toEqual(['Art. 50 Abs. 4']);
  });

  it('begründet die Grundrechte-Folgenabschätzung und die Ausnahme für kritische Infrastruktur', () => {
    expect(cites({ annexIiiArea: 'essential_services', creditOrInsurance: true })).toContain(
      'Art. 27 Abs. 1 i. V. m. Anhang III Nr. 5 Buchst. b und c',
    );
    expect(cites({ annexIiiArea: 'education', publicService: true })).toContain('Art. 27 Abs. 1');
    expect(cites({ annexIiiArea: 'critical_infrastructure', publicService: true })).toEqual([
      'Art. 6 Abs. 2 i. V. m. Anhang III Nr. 2',
      'Art. 27 Abs. 1',
    ]);
    expect(
      aiClassificationBasis({ ...none, annexIiiArea: 'critical_infrastructure', publicService: true })[1]
        .text,
    ).toMatch(/keine Grundrechte-Folgenabschätzung/);
  });

  it('kennt für jede Praxis und jeden Bereich eine Fundstelle', () => {
    for (const p of AI_PROHIBITED_PRACTICES)
      expect(cites({ prohibitedPractices: [p] })[0]).toMatch(/Buchst\. [a-h]$/);
    for (const a of AI_ANNEX_III_AREAS)
      expect(cites({ annexIiiArea: a })[0]).toMatch(/Anhang III Nr\. [1-8]$/);
  });

  it('markiert, was die Risikoklasse bestimmt', () => {
    expect(aiRiskClass({ ...none, prohibitedPractices: ['manipulation'] })).toBe('prohibited');
    expect(aiClassificationBasis({ ...none, prohibitedPractices: ['manipulation'] })[0].decides).toBe(true);
    expect(aiClassificationBasis(none)[0].decides).toBe(true);
    const exception = aiClassificationBasis({ ...none, annexIiiArea: 'employment', art6Exception: true });
    expect(exception.map((b) => b.decides)).toEqual([false, true]);
    const both = aiClassificationBasis({ ...none, annexIiiArea: 'biometrics', emotionOrBiometric: true });
    expect(both.map((b) => b.decides)).toEqual([true, false]);
  });
});

describe('KI-Einstufung: Begründung und Pflichten in der Oberfläche', () => {
  const rows: Required<AiClassificationInput>[] = [];
  const flags = [
    'annexIProduct',
    'art6Exception',
    'emotionOrBiometric',
    'deepfakeOrPublicText',
    'publicService',
    'creditOrInsurance',
  ] as const;
  for (const prohibitedPractices of [[], ['manipulation'], ['social_scoring', 'facial_image_scraping']])
    for (const annexIiiArea of [null, ...AI_ANNEX_III_AREAS])
      for (let bits = 0; bits < 1 << flags.length; bits++)
        rows.push({
          ...none,
          prohibitedPractices,
          annexIiiArea,
          ...Object.fromEntries(flags.map((f, i) => [f, (bits & (1 << i)) !== 0])),
        });

  it('liefert in shared und web dieselbe Begründung', () => {
    const differ = rows.filter(
      (r) =>
        JSON.stringify(aiClassificationBasis(r)) !==
        JSON.stringify(web.aiClassificationBasis({ ...r, prohibitedPractices: [...r.prohibitedPractices] })),
    );
    expect(differ).toEqual([]);
  });

  it('löst in shared und web dieselben Pflichten aus', () => {
    const differ = rows.flatMap((r) =>
      REQUIREMENT_SCOPES.filter(
        (scope) =>
          aiTriggers(scope, r) !==
          web.aiTriggers(scope, { ...r, prohibitedPractices: [...r.prohibitedPractices] }),
      ).map((scope) => ({ scope, r })),
    );
    expect(differ).toEqual([]);
  });
});
