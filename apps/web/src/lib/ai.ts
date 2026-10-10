/**
 * Einstufung eines KI-Systems — Spiegel von `aiRiskClass` in packages/shared/src/ai.ts und der
 * generierten Spalte `ai_system.risk_class`. Steht hier, weil die Oberfläche nicht aus
 * @isms/shared importiert; das Formular zeigt die Klasse schon beim Ankreuzen. Maßgeblich ist,
 * was die API nach dem Speichern zurückgibt.
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
