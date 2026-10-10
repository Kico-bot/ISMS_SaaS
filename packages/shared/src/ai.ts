import type { AiAnnexIiiArea, AiRiskClass, RequirementScope } from './enums';

/**
 * Einstufung eines KI-Systems nach dem AI Act — dieselbe Regel wie die generierten Spalten
 * `ai_system.risk_class` und `fria_required` (Migration 0014). Sie steht hier ein zweites Mal,
 * damit das Formular die Klasse schon beim Ankreuzen zeigt; ein Test prüft, dass beide gleich
 * rechnen.
 */
export interface AiClassificationInput {
  prohibitedPractices: readonly string[];
  annexIiiArea?: AiAnnexIiiArea | null;
  annexIProduct?: boolean;
  art6Exception?: boolean;
  emotionOrBiometric?: boolean;
  deepfakeOrPublicText?: boolean;
  publicService?: boolean;
  creditOrInsurance?: boolean;
}

export function aiRiskClass(s: AiClassificationInput): AiRiskClass {
  if (s.prohibitedPractices.length > 0) return 'prohibited';
  if ((s.annexIiiArea && !s.art6Exception) || s.annexIProduct) return 'high';
  if (s.emotionOrBiometric || s.deepfakeOrPublicText) return 'limited';
  return 'minimal';
}

/** Art. 27 Abs. 1: öffentliche Stellen und Erbringer öffentlicher Dienste, Kredit und Versicherung — nicht Anhang III Nr. 2. */
export function aiFriaRequired(s: AiClassificationInput): boolean {
  return (
    s.prohibitedPractices.length === 0 &&
    !!s.annexIiiArea &&
    !s.art6Exception &&
    s.annexIiiArea !== 'critical_infrastructure' &&
    (!!s.publicService || !!s.creditOrInsurance)
  );
}

/** Löst ein KI-System eine Betreiberpflicht mit diesem `applies_to` aus? Spiegel von requirement_in_scope(). */
export function aiTriggers(scope: RequirementScope | null, s: AiClassificationInput): boolean {
  switch (scope) {
    case 'ai_any':
      return true;
    case 'ai_high_risk':
      return aiRiskClass(s) === 'high';
    case 'ai_fria':
      return aiFriaRequired(s);
    case 'ai_biometric':
      return !!s.emotionOrBiometric;
    case 'ai_deepfake':
      return !!s.deepfakeOrPublicText;
    default:
      return false;
  }
}
