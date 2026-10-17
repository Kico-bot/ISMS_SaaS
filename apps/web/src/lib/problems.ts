import { ApiError } from './api';

/**
 * Die Funktionstrennung kennt zwei Stufen: „warn“ lässt sich bewusst bestätigen, „block“ nicht.
 * Die Mitgliederverwaltung fragt bei der Warnung nach; jede andere Ablehnung muss mit ihrer
 * Begründung sichtbar werden, statt dass die Auswahl ohne Grund zurückspringt (W28).
 */
export function isSodWarning(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    String((err.body as { type?: unknown } | null)?.type).endsWith('/sod-warning')
  );
}

/** Der Fehler zum Anzeigen, oder `null`, wenn es die bestätigbare Warnung ist. */
export function unlessSodWarning(err: unknown): unknown {
  return err && !isSodWarning(err) ? err : null;
}
