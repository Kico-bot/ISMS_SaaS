/*
 * Erzeugt `src/lib/norm-refs.ts` aus den Katalogdaten in `packages/catalog/data`.
 *
 * Die Kurzhilfen in der Oberfläche nennen die Norm, auf die ein Feld einzahlt. Diese Referenzen
 * von Hand zu pflegen hieße, Kapitelnummern und Titel ein zweites Mal zu führen — und die zweite
 * Liste wäre die, die falsch ist. Deshalb werden sie aus demselben Katalog gezogen, aus dem auch
 * die Anforderungen gesät werden: Referenz und Kurztitel, kein Normtext (DIN-Urheberrecht).
 *
 *   node apps/web/scripts/build-norm-refs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '../../../packages/catalog/data');
const outFile = join(here, '../src/lib/norm-refs.ts');

/** Anzeigename je Regelwerk — kürzer als der Katalogname, weil er in eine Zeile passen muss. */
const FRAMEWORK_LABEL = {
  ISO27001: 'ISO 27001:2022',
  BSI_GS: 'IT-Grundschutz',
  BSI_STD200: 'BSI-Standard',
  NIS2: 'NIS2',
  DSGVO: 'DSGVO',
};

/**
 * Welche Referenzen die Oberfläche braucht. Bewusst eine kuratierte Liste: der Katalog hat über
 * tausend Einträge, die Hilfe an einem Formularfeld verträgt genau einen bis drei.
 */
const WANTED = [
  ['iso', 'iso27001-2022.json', ['4.1', '4.2', '4.3', '5.2', '5.3', '6.1.2', '6.1.3', '6.2', '6.3']],
  ['iso', 'iso27001-2022.json', ['7.1', '7.2', '7.3', '7.4', '7.5', '8.2', '8.3', '9.1', '9.2', '9.3']],
  ['iso', 'iso27001-2022.json', ['10.1', '10.2']],
  [
    'iso',
    'iso27001-2022.json',
    [
      'A.5.1',
      'A.5.9',
      'A.5.10',
      'A.5.12',
      'A.5.16',
      'A.5.17',
      'A.5.19',
      'A.5.24',
      'A.5.25',
      'A.5.26',
      'A.5.27',
      'A.5.28',
      'A.5.29',
      'A.5.30',
      'A.5.31',
      'A.5.34',
      'A.5.35',
      'A.6.3',
      'A.8.13',
      'A.8.15',
      'A.8.16',
    ],
  ],
  ['nis2', 'nis2-2022.json', ['Art. 20', 'Art. 21', 'Art. 23']],
  [
    'dsgvo',
    'dsgvo-2016.json',
    [
      'Art. 5',
      'Art. 6',
      'Art. 9',
      'Art. 13',
      'Art. 15',
      'Art. 28',
      'Art. 30',
      'Art. 32',
      'Art. 33',
      'Art. 34',
      'Art. 35',
      'Art. 36',
      'Art. 44',
      'Art. 46',
    ],
  ],
  [
    'bsi',
    'bsi-kompendium-2023.json',
    [
      'ISMS.1',
      'ORP.1',
      'ORP.2',
      'ORP.3',
      'ORP.4',
      'CON.2',
      'CON.3',
      'DER.1',
      'DER.2.1',
      'DER.4',
      'OPS.1.1.5',
    ],
  ],
  ['bsi', 'bsi-standards-200.json', ['200-2', '200-3', '200-4']],
];

/** ISO-Kapitel brauchen das „Kap.“ davor, Anhang A und alle anderen Regelwerke nicht. */
function clauseOf(prefix, refCode) {
  if (prefix === 'iso' && /^\d/.test(refCode)) return `Kap. ${refCode}`;
  return refCode;
}

const entries = new Map();
for (const [prefix, file, codes] of WANTED) {
  const doc = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  const index = new Map(doc.requirements.map((r) => [r.ref_code, r]));
  const label = FRAMEWORK_LABEL[doc.framework.key] ?? doc.framework.key;
  for (const code of codes) {
    const req = index.get(code);
    if (!req) throw new Error(`${file}: Referenz ${code} fehlt im Katalog`);
    entries.set(`${prefix}:${code}`, {
      framework: label,
      clause: clauseOf(prefix, code),
      title: req.title,
    });
  }
}

const body = [...entries]
  .map(
    ([key, v]) =>
      `  '${key}': { framework: '${v.framework}', clause: '${v.clause}', title: ${JSON.stringify(v.title)} },`,
  )
  .join('\n');

writeFileSync(
  outFile,
  `/*
 * Normbezüge für die Kurzhilfen in der Oberfläche.
 *
 * ERZEUGT — nicht von Hand ändern. Quelle: packages/catalog/data, Erzeugung:
 *   node apps/web/scripts/build-norm-refs.mjs
 *
 * Enthalten sind ausschließlich Referenz und Kurztitel. Der Normtext selbst steht bewusst
 * nirgends in der Anwendung (DIN-Urheberrecht) — und eine Kurzhilfe, die eine halbe Seite
 * Normtext aufklappt, liest ohnehin niemand.
 */
export interface NormRef {
  framework: string;
  clause: string;
  title: string;
}

export const NORM_REF = {
${body}
} as const;

export type NormRefKey = keyof typeof NORM_REF;
`,
  'utf8',
);

console.log(`norm-refs: ${entries.size} Referenzen -> ${outFile}`);
