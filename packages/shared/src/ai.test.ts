import { describe, expect, it } from 'vitest';
// Die Oberfläche importiert nicht aus @isms/shared und führt deshalb eine Kopie der Regel. Der
// relative Pfad ist nur für Vitest: Tests sind vom Build und von der Typprüfung dieses Pakets
// ausgenommen (tsconfig.json), die Web-Datei hat keine eigenen Importe.
import * as web from '../../../apps/web/src/lib/ai';
import { aiFriaRequired, type AiClassificationInput, aiRiskClass } from './ai';
import { AI_ANNEX_III_AREAS, AI_PROHIBITED_PRACTICES } from './enums';

const FLAGS = [
  'annexIProduct',
  'art6Exception',
  'emotionOrBiometric',
  'deepfakeOrPublicText',
  'publicService',
  'creditOrInsurance',
] as const;

/** Jede Kombination der Antworten: ohne und mit verbotener Praxis, jeder Bereich, jede Ja/Nein-Antwort. */
function truthTable(): Required<AiClassificationInput>[] {
  const rows: Required<AiClassificationInput>[] = [];
  for (const prohibitedPractices of [[], [AI_PROHIBITED_PRACTICES[0]]]) {
    for (const annexIiiArea of [null, ...AI_ANNEX_III_AREAS]) {
      for (let bits = 0; bits < 1 << FLAGS.length; bits++) {
        const flags = Object.fromEntries(FLAGS.map((f, i) => [f, (bits & (1 << i)) !== 0])) as Record<
          (typeof FLAGS)[number],
          boolean
        >;
        rows.push({ prohibitedPractices, annexIiiArea, ...flags });
      }
    }
  }
  return rows;
}

describe('KI-Einstufung: Kopie der Oberfläche', () => {
  const rows = truthTable();

  it('deckt alle Kombinationen ab', () => {
    expect(rows).toHaveLength(2 * (AI_ANNEX_III_AREAS.length + 1) * 2 ** FLAGS.length);
    // Jede Stufe kommt vor, sonst prüfte die Tabelle einen Zweig nicht.
    expect(new Set(rows.map(aiRiskClass))).toEqual(new Set(['prohibited', 'high', 'limited', 'minimal']));
    expect(new Set(rows.map(aiFriaRequired))).toEqual(new Set([true, false]));
  });

  it('rechnet die Risikoklasse in shared und web gleich', () => {
    const differ = rows.filter(
      (r) => aiRiskClass(r) !== web.aiRiskClass({ ...r, prohibitedPractices: [...r.prohibitedPractices] }),
    );
    expect(differ).toEqual([]);
  });

  it('rechnet die Pflicht zur Grundrechte-Folgenabschätzung in shared und web gleich', () => {
    const differ = rows.filter(
      (r) =>
        aiFriaRequired(r) !== web.aiFriaRequired({ ...r, prohibitedPractices: [...r.prohibitedPractices] }),
    );
    expect(differ).toEqual([]);
  });
});
