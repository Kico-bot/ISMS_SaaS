import { useRef, useState } from 'react';
import { downloadFile, uploadFile } from '../lib/api';

/**
 * Eine einzelne angehängte Datei — Auditbericht, Sitzungsprotokoll, Zertifikat, Richtlinie
 * als PDF. Der Upload läuft sofort, das Formular trägt danach nur noch die Datei-Id; so
 * bleibt der Ablauf derselbe wie beim Nachweisregister.
 */
export function FileField({
  value,
  filename,
  onChange,
  label = 'Datei',
  hint,
  disabled,
}: {
  value: string | null;
  filename?: string | null;
  onChange: (file: { id: string; filename: string } | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          className="hidden"
          onChange={async (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              const uploaded = await uploadFile(file);
              onChange({ id: uploaded.id, filename: uploaded.filename });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Der Upload ist fehlgeschlagen');
            } finally {
              setBusy(false);
              ev.target.value = '';
            }
          }}
        />
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Lädt hoch …' : value ? 'Andere Datei' : 'Datei wählen'}
        </button>
        {value && filename && (
          <>
            <button
              type="button"
              className="text-xs text-brand-700 underline"
              onClick={() => void downloadFile(value, filename)}
            >
              {filename}
            </button>
            {!disabled && (
              <button
                type="button"
                className="text-xs text-slate-400 underline hover:text-slate-700"
                onClick={() => onChange(null)}
              >
                entfernen
              </button>
            )}
          </>
        )}
        {!value && hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
