import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type ProgrammeKey = 'ISO27001' | 'NIS2' | 'EU_AI_ACT';

export interface ProgrammeStep {
  key: string;
  title: string;
  done: boolean;
  detail: string;
  action: string;
  to: string;
}

export interface Programme {
  key: ProgrammeKey;
  name: string;
  active: boolean;
  score: { value: number; of: number; unit: 'pct' | 'count'; label: string };
  steps: ProgrammeStep[];
  current: string | null;
  /** `urgent`: geht dem Weg vor, etwa eine laufende Meldefrist. */
  next: { title: string; to: string; urgent?: boolean } | null;
}

/** Adresse der Programmseite: kurz und lesbar statt des Katalogschlüssels. */
export const PROGRAMME_SLUG: Record<ProgrammeKey, string> = {
  ISO27001: 'iso27001',
  NIS2: 'nis2',
  EU_AI_ACT: 'ai-act',
};

export function useProgrammes(enabled = true) {
  return useQuery({
    queryKey: ['programmes'],
    queryFn: () => api<Programme[]>('/programmes'),
    enabled,
  });
}

/** „20 %“ oder „9 von 13“: so, wie man es laut vorliest. */
export function scoreText(p: Programme): string {
  return p.score.unit === 'pct' ? `${p.score.value} %` : `${p.score.value} von ${p.score.of}`;
}
