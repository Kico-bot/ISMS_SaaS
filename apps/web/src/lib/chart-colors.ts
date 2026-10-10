/**
 * Farben für die Diagramme. Recharts nimmt keine CSS-Klassen, deshalb stehen die Werte hier
 * als Konstanten — dieselben wie in `tailwind.config.js`. Zwei Stellen, eine Wahrheit: wer die
 * Markenfarbe ändert, ändert sie hier mit, sonst fällt genau ein Diagramm aus der Reihe.
 */
export const CHART = {
  brand: '#1f5892',
  brandSoft: '#2f6fae',
  accent: '#128f7d',
  grid: '#e2e8f0',
  axis: '#475569',
  muted: '#94a3b8',
  target: '#cbd5e1',
} as const;

/** Stand einer Pflicht im Cockpit — Tabelle (Badges) und Flussdiagramm (Knoten) sprechen dieselbe Farbe. */
export const COVERAGE_COLOR: Record<string, string> = {
  covered: '#15803d',
  in_progress: '#b45309',
  indirect: '#2f6fae',
  open: '#b91c1c',
  not_applicable: '#94a3b8',
  linked: '#94a3b8',
};
