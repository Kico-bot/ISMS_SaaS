/**
 * Das Entfernen eines Knotens im Organigramm nimmt den ganzen Teilbaum mit (Kap. 5.3). Wer
 * „Geschäftsführung“ entfernt, löscht damit jede Abteilung darunter; davor fragt die Oberfläche
 * nach und nennt die Zahl (W27).
 */
export interface TreeNode {
  id: string;
  parentId: string | null;
}

/** Zahl aller Knoten unter `id`, über alle Ebenen. Ein Kreis in den Daten zählt jeden Knoten einmal. */
export function countDescendants(nodes: readonly TreeNode[], id: string): number {
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of nodes) {
      if (n.parentId === current && !seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return seen.size - 1;
}

/** Rückfrage vor dem Entfernen, oder `null`, wenn nichts darunter hängt. */
export function removeNodeQuestion(label: string, descendants: number): string | null {
  if (descendants === 0) return null;
  return `„${label}“ samt ${descendants} Knoten darunter entfernen?`;
}
