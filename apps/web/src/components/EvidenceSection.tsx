import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { api, downloadFile, uploadFile } from '../lib/api';
import { ErrorNote, Spinner } from './ui';

interface Evidence {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  collectedAt: string;
  validUntil: string | null;
  expired: boolean | null;
  fileId: string | null;
  filename: string | null;
  mime: string | null;
  sizeBytes: number | null;
}

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const size = (b: number | null) =>
  b == null ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

/**
 * Nachweise einer Maßnahme. Ein Nachweis ist eine Datei oder ein Verweis — und er hat eine
 * Gültigkeit, weil ein Beleg von vorgestern den heutigen Stand nicht belegt.
 */
/**
 * Nachweise hängen an zwei Stellen: an einer Maßnahme belegen sie die Umsetzung, an einer
 * Feststellung die Behebung. Dieselbe Oberfläche, nur ein anderer Anker — deshalb `scope`
 * statt zweier fast gleicher Komponenten.
 */
export function EvidenceSection({
  scope = 'measure',
  anchorId,
  writable,
}: {
  scope?: 'measure' | 'finding';
  anchorId: string;
  writable: boolean;
}) {
  const basePath = `/evidence/${scope}/${anchorId}`;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [pendingFile, setPendingFile] = useState<{ id: string; filename: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: ['evidence', scope, anchorId],
    queryFn: () => api<Evidence[]>(basePath),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['evidence', scope, anchorId] });
    void qc.invalidateQueries({ queryKey: ['evidence'] });
  };
  const create = useMutation({
    mutationFn: async (dto: Record<string, unknown>) => {
      const evidence = await api<{ id: string }>('/evidence', { method: 'POST', body: JSON.stringify(dto) });
      return api(basePath, {
        method: 'POST',
        body: JSON.stringify({ evidenceId: evidence.id }),
      });
    },
    onSuccess: () => {
      refresh();
      setAdding(false);
      setPendingFile(null);
    },
  });
  const unlink = useMutation({
    mutationFn: (evidenceId: string) => api(`${basePath}/${evidenceId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const rows = list.data ?? [];
  const expired = rows.filter((e) => e.expired).length;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">
          Nachweise ({rows.length})
          {expired > 0 && (
            <span className="ml-2 text-xs font-normal text-level-critical">{expired} abgelaufen</span>
          )}
        </h3>
        {writable && (
          <button type="button" className="btn-ghost py-0.5 text-xs" onClick={() => setAdding(!adding)}>
            {adding ? 'Abbrechen' : 'Nachweis hinzufügen'}
          </button>
        )}
      </div>

      <ErrorNote error={list.error ?? create.error ?? unlink.error ?? uploadError} />

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">
          {scope === 'finding'
            ? 'Noch kein Nachweis. Ohne Beleg bleibt offen, woran man gesehen hat, dass die Abweichung behoben ist.'
            : 'Noch kein Nachweis. Ohne Beleg ist der Umsetzungsstand eine Behauptung.'}
        </p>
      ) : (
        <ul className="mb-3 space-y-1">
          {rows.map((e) => (
            <li
              key={e.id}
              className={clsx(
                'group rounded border px-3 py-2',
                e.expired ? 'border-red-200 bg-red-50' : 'border-slate-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{e.title}</p>
                  {e.description && <p className="mt-0.5 text-xs text-slate-500">{e.description}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    erhoben {date(e.collectedAt)}
                    {e.validUntil && (
                      <span className={clsx('ml-2', e.expired && 'font-medium text-level-critical')}>
                        {e.expired ? 'abgelaufen am' : 'gültig bis'} {date(e.validUntil)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {e.fileId && e.filename && (
                    <button
                      type="button"
                      className="btn-ghost py-0.5 text-xs"
                      onClick={() => void downloadFile(e.fileId!, e.filename!)}
                      title={`${e.filename} · ${size(e.sizeBytes)}`}
                    >
                      Datei
                    </button>
                  )}
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-700 underline"
                    >
                      Verweis
                    </a>
                  )}
                  {writable && (
                    <button
                      type="button"
                      className="hidden text-slate-400 underline hover:text-slate-700 group-hover:inline"
                      onClick={() => unlink.mutate(e.id)}
                    >
                      Lösen
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {writable && adding && (
        <form
          className="space-y-2 rounded-md border border-dashed border-slate-300 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')).trim(),
              description: String(f.get('description') || '') || null,
              url: String(f.get('url') || '') || null,
              fileId: pendingFile?.id ?? null,
              validUntil: String(f.get('validUntil') || '') || null,
            });
          }}
        >
          <input
            name="title"
            required
            minLength={3}
            className="input"
            placeholder="Was belegt der Nachweis?"
            autoFocus
          />
          <input
            name="description"
            className="input"
            placeholder="Kurze Einordnung, z. B. Umfang der Stichprobe"
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="evidenceUrl">
                Verweis (falls keine Datei)
              </label>
              <input
                id="evidenceUrl"
                name="url"
                type="url"
                className="input"
                placeholder="https://intranet.example/…"
              />
            </div>
            <div>
              <label className="label" htmlFor="validUntil">
                Gültig bis
              </label>
              <input id="validUntil" name="validUntil" type="date" className="input w-auto" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={async (ev) => {
                const file = ev.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setUploadError(null);
                try {
                  const uploaded = await uploadFile(file);
                  setPendingFile({ id: uploaded.id, filename: uploaded.filename });
                } catch (err) {
                  setUploadError(err);
                } finally {
                  setUploading(false);
                  ev.target.value = '';
                }
              }}
            />
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? 'Lädt hoch …' : 'Datei wählen'}
            </button>
            {pendingFile && (
              <span className="text-xs text-slate-600">
                {pendingFile.filename}
                <button
                  type="button"
                  className="ml-2 text-slate-400 underline"
                  onClick={() => setPendingFile(null)}
                >
                  entfernen
                </button>
              </span>
            )}
            <button type="submit" className="btn-primary ml-auto py-1 text-xs" disabled={create.isPending}>
              Nachweis aufnehmen
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Zulässig sind PDF, Bilder, Text und Office-Dokumente bis 25 MB. Dateien werden stets als Anhang
            ausgeliefert, nie im Browser gerendert.
          </p>
        </form>
      )}
    </section>
  );
}
