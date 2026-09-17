/**
 * Schmaler CSV-Schreiber ohne Fremdbibliothek.
 *
 * Zwei Eigenheiten sind Absicht:
 *  - Semikolon als Trennzeichen und ein BOM voran, weil deutsche Excel-Installationen sonst
 *    alles in eine Spalte werfen und Umlaute zerlegen.
 *  - Zellen, die mit =, +, - oder @ beginnen, werden entschärft. Excel und LibreOffice werten
 *    solche Werte als Formel aus; ein Maßnahmentitel aus dem ISMS darf beim Auditor nichts
 *    ausführen (CSV-Injection).
 */

const SEPARATOR = ';';
const BOM = '﻿';

/** Zeichen, die eine Tabellenkalkulation als Formelbeginn liest. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (Array.isArray(value)) text = value.join(', ');
  if (typeof value === 'boolean') text = value ? 'ja' : 'nein';

  if (FORMULA_PREFIXES.some((p) => text.startsWith(p))) text = `'${text}`;
  if (text.includes('"') || text.includes(SEPARATOR) || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(SEPARATOR), ...rows.map((r) => r.map(csvCell).join(SEPARATOR))];
  // CRLF, weil Excel das erwartet.
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Dateiname mit Datum — im Postfach eines Auditors liegen schnell mehrere Stände. */
export function exportFilename(base: string, extension: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
