/**
 * Schlanke Fassung: ISO 27001 und NIS2 stehen im Mittelpunkt. Was beide nicht brauchen, ist
 * ausgeblendet, nicht gelöscht: Daten, API und Tests bleiben, und `true` blendet eine Funktion
 * wieder ein. Grundlage ist die Analyse vom 9. November 2026 (was ISO 27001 als dokumentierte
 * Information verlangt, bleibt; alles andere muss sich rechtfertigen).
 */
export const FEATURES = {
  /** Regelwerke neben ISO 27001 und NIS2: weder im Menü noch in den Einstellungen zu finden. */
  euAiAct: false,
  dsgvo: false,
  grundschutz: false,
  /** Organisation & Kontext: Register, die ISO 27001 nicht als eigene Aufzeichnung verlangt (5.3, 6.3, 7.4). */
  orgChart: false,
  communicationPlan: false,
  changePlanning: false,
  /** Personen & Schulung: Kompetenzprofile und Qualifikationsmatrix (7.2 verlangt den Nachweis, keine Matrix). */
  competenceMatrix: false,
  /** Kennzahlenregister: die Zahlen stehen im Lagebild und in der Managementbewertung. */
  kpis: false,
  /** Mein Bereich: überschneidet sich mit dem Lagebild. */
  myArea: false,
  /** Flussdiagramm im Cockpit: die Tabelle zeigt dasselbe. */
  cockpitFlow: false,
} as const;

export type Feature = keyof typeof FEATURES;

const FRAMEWORK_FEATURE: Record<string, Feature> = {
  EU_AI_ACT: 'euAiAct',
  DSGVO: 'dsgvo',
  BSI_GS: 'grundschutz',
  BSI_STD200: 'grundschutz',
};

/** Darf dieses Regelwerk in der Oberfläche erscheinen? ISO 27001 und NIS2 immer. */
export const frameworkAvailable = (key: string): boolean => {
  const feature = FRAMEWORK_FEATURE[key];
  return feature ? FEATURES[feature] : true;
};
