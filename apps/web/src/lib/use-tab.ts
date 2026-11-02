import { useSearchParams } from 'react-router-dom';

/**
 * Reiter, der in der Adresse steht (`?tab=`). So kann die Gap-Analyse auf den Reiter zeigen, in
 * dem ein Normpunkt erfasst wird, und ein Link auf denselben Reiter wirkt auch, wenn die Seite
 * schon offen ist. `aliases` hält alte Adressen gültig, nachdem Reiter zusammengelegt wurden.
 */
export function useTab<T extends string>(
  allowed: readonly T[],
  fallback: T,
  aliases: Record<string, T> = {},
): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const wanted = (aliases[raw] ?? raw) as T;
  const tab = allowed.includes(wanted) ? wanted : fallback;
  const setTab = (next: T) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  return [tab, setTab];
}
