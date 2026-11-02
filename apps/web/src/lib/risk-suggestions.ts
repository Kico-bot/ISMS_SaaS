/**
 * Vorschläge für „Was könnte passieren?“, je Art des Assets. Ein Anstoß für die Risikoerfassung,
 * kein Katalog: Wer vor einem leeren Feld sitzt, schreibt oft gar nichts. Die Titel sind eigene
 * Formulierungen und lassen sich vor dem Erfassen frei ändern.
 */
export const RISK_SUGGESTIONS: Record<string, string[]> = {
  information: [
    'Vertrauliche Informationen gelangen an Unbefugte',
    'Informationen gehen verloren oder werden verfälscht',
  ],
  process: ['Prozess steht still, wenn eine Schlüsselperson ausfällt', 'Fehler im Ablauf bleiben unbemerkt'],
  application: [
    'Ungepatchte Schwachstelle wird ausgenutzt',
    'Unberechtigter Zugriff über schwache Anmeldung',
    'Anwendung fällt aus',
  ],
  system: [
    'Schadsoftware verschlüsselt das System',
    'Ausfall ohne funktionierende Wiederherstellung',
    'Ungepatchte Schwachstelle wird ausgenutzt',
  ],
  network: ['Unberechtigter Zugang zum Netz', 'Angreifer breitet sich im Netz aus', 'Verbindung fällt aus'],
  hardware: ['Gerät wird gestohlen oder geht verloren', 'Hardwaredefekt ohne Ersatz'],
  site: ['Unbefugter Zutritt', 'Brand oder Wasserschaden', 'Stromausfall'],
  person: ['Schlüsselperson fällt aus', 'Phishing führt zur Preisgabe von Zugangsdaten'],
  supplier: [
    'Dienstleister fällt aus',
    'Sicherheitsvorfall beim Dienstleister',
    'Fernzugriff des Dienstleisters ist nicht kontrolliert',
  ],
  other: ['Ausfall', 'Unbefugter Zugriff'],
};
