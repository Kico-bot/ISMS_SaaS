/**
 * Ein gespeicherter Verweis wird nur mit http oder https zum Link. Ein `javascript:`-Verweis
 * liefe beim Anklicken im Ursprung der Anwendung, mit Zugriff auf die Sitzung. Die API nimmt
 * solche Werte nicht mehr an, ältere Einträge können sie aber noch tragen.
 */
export function externalHref(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
