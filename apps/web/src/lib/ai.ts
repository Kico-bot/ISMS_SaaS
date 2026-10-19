/**
 * Einstufung eines KI-Systems — Spiegel von `aiRiskClass` in packages/shared/src/ai.ts und der
 * generierten Spalte `ai_system.risk_class`. Steht hier, weil die Oberfläche nicht aus
 * @isms/shared importiert; das Formular zeigt die Klasse schon beim Ankreuzen. Maßgeblich ist,
 * was die API nach dem Speichern zurückgibt. `packages/shared/src/ai.test.ts` vergleicht beide Kopien über
 * alle Kombinationen der Antworten.
 */
export interface AiAnswers {
  prohibitedPractices: string[];
  annexIiiArea: string | null;
  annexIProduct: boolean;
  art6Exception: boolean;
  emotionOrBiometric: boolean;
  deepfakeOrPublicText: boolean;
  publicService: boolean;
  creditOrInsurance: boolean;
}

export function aiRiskClass(s: AiAnswers): 'prohibited' | 'high' | 'limited' | 'minimal' {
  if (s.prohibitedPractices.length > 0) return 'prohibited';
  if ((s.annexIiiArea && !s.art6Exception) || s.annexIProduct) return 'high';
  if (s.emotionOrBiometric || s.deepfakeOrPublicText) return 'limited';
  return 'minimal';
}

export function aiFriaRequired(s: AiAnswers): boolean {
  return (
    s.prohibitedPractices.length === 0 &&
    !!s.annexIiiArea &&
    !s.art6Exception &&
    s.annexIiiArea !== 'critical_infrastructure' &&
    (s.publicService || s.creditOrInsurance)
  );
}

/** Spiegel von `aiTriggers` in packages/shared/src/ai.ts: löst das System eine Pflicht mit diesem `applies_to` aus? */
export function aiTriggers(scope: string | null, s: AiAnswers): boolean {
  switch (scope) {
    case 'ai_any':
      return true;
    case 'ai_high_risk':
      return aiRiskClass(s) === 'high';
    case 'ai_fria':
      return aiFriaRequired(s);
    case 'ai_biometric':
      return s.emotionOrBiometric;
    case 'ai_deepfake':
      return s.deepfakeOrPublicText;
    default:
      return false;
  }
}

/** Eine Zeile der Begründung: welche Antwort zu welcher Fundstelle führt. */
export interface AiBasis {
  cite: string;
  text: string;
  /** Bestimmt diese Zeile die Risikoklasse? Sonst ist sie eine zusätzliche Pflicht oder ein Hinweis. */
  decides: boolean;
}

const PROHIBITED_ORDER = [
  'manipulation',
  'exploitation_of_vulnerabilities',
  'social_scoring',
  'predictive_policing_profiling',
  'facial_image_scraping',
  'emotion_recognition_work_education',
  'biometric_categorisation_sensitive',
  'realtime_remote_biometric_id',
];
const ANNEX_III_ORDER = [
  'biometrics',
  'critical_infrastructure',
  'education',
  'employment',
  'essential_services',
  'law_enforcement',
  'migration',
  'justice_democracy',
];

/**
 * Spiegel von `aiClassificationBasis` in packages/shared/src/ai.ts.
 * Warum ein System in seiner Klasse landet, Antwort für Antwort mit der Fundstelle im AI Act.
 * Die Zeilen mit `decides` begründen die Klasse; Art. 50 und Art. 27 kommen bei Hochrisiko
 * zusätzlich hinzu, weil sie neben Art. 26 gelten und nicht an seiner Stelle.
 */
export function aiClassificationBasis(s: AiAnswers): AiBasis[] {
  const cls = aiRiskClass(s);
  if (cls === 'prohibited') {
    return [...s.prohibitedPractices]
      .sort((a, b) => PROHIBITED_ORDER.indexOf(a) - PROHIBITED_ORDER.indexOf(b))
      .map((p) => ({
        cite: `Art. 5 Abs. 1 Buchst. ${'abcdefgh'[PROHIBITED_ORDER.indexOf(p)] ?? '?'}`,
        text: 'Verbotene Praxis. Das System darf nicht eingesetzt werden, auch nicht zum Testen im Betrieb.',
        decides: true,
      }));
  }
  const out: AiBasis[] = [];
  if (s.annexIProduct) {
    out.push({
      cite: 'Art. 6 Abs. 1 i. V. m. Anhang I',
      text: 'Sicherheitsbauteil eines Produkts mit EU-Produktvorschriften: Hochrisiko-System.',
      decides: true,
    });
  }
  if (s.annexIiiArea) {
    const nr = ANNEX_III_ORDER.indexOf(s.annexIiiArea) + 1;
    out.push(
      s.art6Exception
        ? {
            cite: 'Art. 6 Abs. 3',
            text: `Einsatzbereich nach Anhang III Nr. ${nr}, aber nur eine vorbereitende oder eng begrenzte Aufgabe ohne erhebliches Risiko: kein Hochrisiko. Die Begründung ist zu dokumentieren.`,
            decides: false,
          }
        : {
            cite: `Art. 6 Abs. 2 i. V. m. Anhang III Nr. ${nr}`,
            text: 'Einsatzbereich nach Anhang III: Hochrisiko-System. Als Betreiber gelten die Pflichten aus Art. 26.',
            decides: true,
          },
    );
  }
  if (s.emotionOrBiometric) {
    out.push({
      cite: 'Art. 50 Abs. 3',
      text: 'Emotionserkennung oder biometrische Kategorisierung: Betroffene sind darüber zu informieren.',
      decides: cls === 'limited',
    });
  }
  if (s.deepfakeOrPublicText) {
    out.push({
      cite: 'Art. 50 Abs. 4',
      text: 'Deepfakes und veröffentlichte Texte zu Themen von öffentlichem Interesse: als KI-erzeugt offenlegen.',
      decides: cls === 'limited',
    });
  }
  if (cls === 'minimal') {
    out.push({
      cite: 'Art. 4, Art. 5',
      text: 'Keine Antwort führt zu einer höheren Klasse: minimales Risiko. Als Betreiber sorgen Sie für die KI-Kompetenz der Beschäftigten und setzen nichts Verbotenes ein.',
      decides: true,
    });
  }
  if (s.annexIiiArea && !s.art6Exception && (s.publicService || s.creditOrInsurance)) {
    if (s.annexIiiArea === 'critical_infrastructure') {
      out.push({
        cite: 'Art. 27 Abs. 1',
        text: 'Kritische Infrastruktur (Anhang III Nr. 2) ist ausgenommen: keine Grundrechte-Folgenabschätzung nötig.',
        decides: false,
      });
    } else {
      if (s.publicService)
        out.push({
          cite: 'Art. 27 Abs. 1',
          text: 'Öffentliche Stelle oder Erbringer öffentlicher Dienste: vor der ersten Verwendung ist eine Grundrechte-Folgenabschätzung durchzuführen.',
          decides: false,
        });
      if (s.creditOrInsurance)
        out.push({
          cite: 'Art. 27 Abs. 1 i. V. m. Anhang III Nr. 5 Buchst. b und c',
          text: 'Kreditwürdigkeit oder Tarife für Lebens- und Krankenversicherungen: vor der ersten Verwendung ist eine Grundrechte-Folgenabschätzung durchzuführen.',
          decides: false,
        });
    }
  }
  return out;
}
