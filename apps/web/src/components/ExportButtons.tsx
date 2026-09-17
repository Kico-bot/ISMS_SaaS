import { useState } from 'react';
import { downloadExport, printExport } from '../lib/api';
import { useAuth } from '../lib/auth-context';

/**
 * Ausleitung eines Registers. Zwei Wege, weil Auditoren beides verlangen: die Tabelle zum
 * Weiterrechnen (CSV) und das unterschriebene Dokument (Druck → „Als PDF sichern“).
 * Ohne das Recht `report.export` wird gar nichts angezeigt.
 */
export function ExportButtons({
  csvPath,
  documentPath,
  label = 'Register',
}: {
  csvPath: string;
  documentPath?: string;
  label?: string;
}) {
  const { can } = useAuth();
  const [busy, setBusy] = useState<'csv' | 'doc' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!can('report.export')) return null;

  const run = async (kind: 'csv' | 'doc') => {
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'csv' ? downloadExport(csvPath) : printExport(documentPath!));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Ausleitung ist fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy !== null}
          onClick={() => void run('csv')}
          title={`${label} als CSV für Excel`}
        >
          {busy === 'csv' ? 'Erzeuge …' : 'CSV'}
        </button>
        {documentPath && (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy !== null}
            onClick={() => void run('doc')}
            title={`${label} als druckfertiges Dokument (im Druckdialog „Als PDF sichern“)`}
          >
            {busy === 'doc' ? 'Erzeuge …' : 'PDF drucken'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
