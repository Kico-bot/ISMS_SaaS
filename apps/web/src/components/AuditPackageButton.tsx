import { useState } from 'react';
import { downloadExport } from '../lib/api';
import { useAuth } from '../lib/auth-context';

/**
 * Der gesamte Datenbestand als ZIP. Gedacht für den Termin, in dem jemand sagt „zeigen Sie mir
 * Ihr ISMS“ — eine Datei statt zwanzig Einzelausleitungen.
 *
 * Das Erzeugen dauert, weil alle Register abgefragt und die Nachweisdateien mitgepackt werden;
 * deshalb sagt der Knopf, dass etwas passiert, statt still zu wirken.
 */
export function AuditPackageButton() {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can('report.export')) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        title="Alle Register als CSV, die Anwendbarkeitserklärung und das Verarbeitungsverzeichnis als Dokument, dazu die hinterlegten Nachweisdateien"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await downloadExport('/exports/audit-package.zip');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Das Paket konnte nicht erzeugt werden');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Paket wird erzeugt …' : 'Auditpaket herunterladen'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
