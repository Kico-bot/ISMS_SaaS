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
