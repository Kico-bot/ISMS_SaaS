import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reiter, der sich über `?tab=` direkt öffnen lässt. So kann die Gap-Analyse auf den Reiter
 * zeigen, in dem ein Normpunkt erfasst wird, statt nur auf die Seite.
 */
export function useTab<T extends string>(allowed: readonly T[], fallback: T) {
  const [params] = useSearchParams();
  const wanted = params.get('tab') as T | null;
  return useState<T>(wanted && allowed.includes(wanted) ? wanted : fallback);
}
