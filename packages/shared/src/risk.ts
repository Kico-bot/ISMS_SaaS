import type { RiskLevel } from './enums';

/** Schwellen der 5×5-Matrix (Score = Likelihood × Impact, 1..25). Mandanten können sie in `risk_matrix_config` überschreiben. */
export interface RiskThresholds {
  /** Score ≤ low → 'low' */
  low: number;
  /** Score ≤ medium → 'medium' */
  medium: number;
  /** Score ≤ high → 'high', darüber 'critical' */
  high: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = { low: 4, medium: 9, high: 14 };

export const DEFAULT_LIKELIHOOD_LABELS = [
  'Selten',
  'Unwahrscheinlich',
  'Möglich',
  'Wahrscheinlich',
  'Fast sicher',
];
export const DEFAULT_IMPACT_LABELS = ['Vernachlässigbar', 'Gering', 'Moderat', 'Erheblich', 'Katastrophal'];

/**
 * Was jede Stufe bedeutet (Kap. 6.1.2 a): eigene Worte mit Beispielen, damit zwei Personen
 * dasselbe Risiko gleich bewerten. Je Mandant in den Einstellungen änderbar; die Schwellen
 * 4, 9 und 14 bleiben fest.
 */
export const DEFAULT_LIKELIHOOD_DESCRIPTIONS = [
  'Seltener als alle zehn Jahre; bei uns und in der Branche bisher nicht vorgekommen.',
  'Etwa alle fünf bis zehn Jahre; in der Branche bekannt, bei uns noch nicht.',
  'Etwa alle ein bis fünf Jahre; ist bei uns oder vergleichbaren Betrieben schon passiert.',
  'Etwa einmal im Jahr; ähnliche Vorfälle gab es zuletzt mehrfach.',
  'Mehrmals im Jahr oder bereits im Gange.',
];
export const DEFAULT_IMPACT_DESCRIPTIONS = [
  'Schaden unter 10.000 €, Ausfall unter einer Stunde, niemand außerhalb merkt es.',
  'Schaden bis 50.000 €, Ausfall bis vier Stunden, einzelne Kundinnen oder Kunden betroffen.',
  'Schaden bis 250.000 €, Ausfall bis ein Tag, Meldung an eine Behörde möglich.',
  'Schaden bis 1 Mio. €, Ausfall bis eine Woche, Meldepflicht und öffentliche Aufmerksamkeit.',
  'Schaden über 1 Mio. €, Ausfall länger als eine Woche oder Gefahr für Leib und Leben.',
];

export function riskLevel(
  score: number | null | undefined,
  t: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskLevel | null {
  if (score == null) return null;
  if (score <= t.low) return 'low';
  if (score <= t.medium) return 'medium';
  if (score <= t.high) return 'high';
  return 'critical';
}
