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
