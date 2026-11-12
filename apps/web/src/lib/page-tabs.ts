/**
 * Unterreiter der Seiten Organisation und Team & Schulung, in beiden Varianten. Steht getrennt
 * von den Seiten, damit der Test der Sprungziele prüfen kann, dass jedes `?tab=` im schlanken
 * Modus einen sichtbaren Reiter trifft.
 */
export const CONTEXT_FULL_TABS = [
  'scope',
  'environment',
  'objectives',
  'org',
  'communication',
  'changes',
] as const;
/** Schlank: kein Organigramm, Kommunikation und Änderungen teilen sich einen Unterreiter. */
export const CONTEXT_LEAN_TABS = ['scope', 'environment', 'objectives', 'exchange'] as const;
export type ContextTab = (typeof CONTEXT_FULL_TABS)[number] | (typeof CONTEXT_LEAN_TABS)[number];

export const COMPETENCE_FULL_TABS = ['persons', 'matrix', 'profiles', 'trainings'] as const;
/** Schlank: nur Beschäftigte und Schulungen; Matrix und Profile bleiben in der vollen Oberfläche. */
export const COMPETENCE_LEAN_TABS = ['persons', 'trainings'] as const;
export type CompetenceTab = (typeof COMPETENCE_FULL_TABS)[number];
