/**
 * Schlanke Oberfläche: fünf Menüpunkte, nur die Register, die eine Vorführung zu ISO 27001 und
 * NIS2 braucht. Ausgeblendet heißt nicht gelöscht: Alle Routen, Endpunkte und
 * Daten bleiben, und mit `VITE_FULL_UI=true` beim Build erscheint die vollständige Oberfläche.
 */
export const LEAN = import.meta.env.VITE_FULL_UI !== 'true';

/** Überzeile der Seiten aus Kap. 9 und 10: im schlanken Menü heißt der Punkt nur „Prüfen“. */
export const CHECK_GROUP = LEAN ? 'Prüfen' : 'Prüfen & verbessern';

/** Regelwerke, die die schlanke Oberfläche nie zeigt, auch wenn sie aktiv sind. */
export const LEAN_HIDDEN_FRAMEWORKS: readonly string[] = ['EU_AI_ACT', 'DSGVO', 'BSI_GS', 'BSI_STD200'];
