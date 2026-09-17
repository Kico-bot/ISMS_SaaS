/**
 * Druckfertige Dokumente ohne Fremdbibliothek: HTML mit Druck-Stylesheet, das der Browser
 * über „Drucken → Als PDF sichern“ zu einem PDF macht. Das kostet keine Lizenz, keinen
 * Headless-Browser auf dem Server und liefert trotzdem ein Dokument, das ein Auditor annimmt.
 *
 * Sämtliche Werte stammen aus Mandantendaten und werden deshalb ausnahmslos maskiert.
 */

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface DocumentMeta {
  title: string;
  tenantName: string;
  subtitle?: string;
  /** Kurze Einordnung unter der Überschrift — etwa der Normbezug. */
  note?: string;
}

/**
 * Tabelle mit Kopfzeile; jede Zelle wird maskiert.
 *
 * `widths` (Prozentwerte) ist kein Schmuck: ein Register wird je Kapitel in eine eigene Tabelle
 * gesetzt, und ohne feste Spaltenbreiten richtet der Browser jede davon nach ihrem eigenen
 * Inhalt aus — die Spalten springen dann von Kapitel zu Kapitel.
 */
export function htmlTable(headers: string[], rows: unknown[][], widths?: number[]): string {
  const cols = widths
    ? `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
    : '';
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(Array.isArray(c) ? c.join(', ') : c)}</td>`).join('')}</tr>`,
    )
    .join('\n');
  const layout = widths ? ' class="fixed"' : '';
  return `<table${layout}>${cols}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderDocument(meta: DocumentMeta, body: string): string {
  const generated = new Date().toLocaleString('de-DE');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.tenantName)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; font-size: 9.5pt; margin: 0; padding: 16px; }
  header { border-bottom: 2px solid #1f5892; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 15pt; margin: 0 0 2px; }
  .sub { color: #475569; font-size: 9pt; }
  .note { margin: 10px 0 14px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #cbd5e1; color: #334155; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.fixed { table-layout: fixed; }
  td { overflow-wrap: anywhere; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .03em; color: #475569; border-bottom: 1px solid #94a3b8; padding: 4px 6px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  h2 { font-size: 11pt; margin: 18px 0 6px; break-after: avoid; }
  footer { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 6px; color: #64748b; font-size: 8pt; }
  .hint { margin-bottom: 14px; padding: 8px 10px; border: 1px dashed #cbd5e1; color: #475569; font-size: 8.5pt; }
  @media print { .hint { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<p class="hint">Zum Speichern als PDF: Drucken (Strg&nbsp;+&nbsp;P) und als Ziel „Als PDF sichern“ wählen.</p>
<header>
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="sub">${escapeHtml(meta.tenantName)}${meta.subtitle ? ` · ${escapeHtml(meta.subtitle)}` : ''} · Stand ${escapeHtml(generated)}</p>
</header>
${meta.note ? `<p class="note">${escapeHtml(meta.note)}</p>` : ''}
${body}
<footer>Erzeugt aus dem ISMS am ${escapeHtml(generated)}. Der Stand entspricht den zu diesem Zeitpunkt gepflegten Daten.</footer>
</body>
</html>`;
}
